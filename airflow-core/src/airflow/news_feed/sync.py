# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""Fetch remote news sources and store their entries as news items (``airflow news-feed sync``)."""

from __future__ import annotations

import ipaddress
import logging
import re
import socket
from dataclasses import dataclass
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from typing import TYPE_CHECKING
from urllib.parse import urljoin, urlsplit
from uuid import UUID
from xml.etree import ElementTree

import httpx
from sqlalchemy import select

from airflow import __version__ as airflow_version
from airflow._shared.timezones import timezone
from airflow.configuration import conf
from airflow.models.news_feed import MAX_STORED_ENTRIES_PER_SOURCE, NewsItem, NewsSource
from airflow.news_feed.policy import is_remote_allowed, is_source_allowed

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Sequence

    from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

MAX_FEED_BYTES = 5 * 1024 * 1024
TITLE_MAX_LENGTH = 250
SUMMARY_MAX_LENGTH = 1000
EXTERNAL_ID_MAX_LENGTH = 500
FETCH_TIMEOUT_SECONDS = 15.0
FETCHED_ENTRY_PRIORITY = "P2"
ATOM_NS = "{http://www.w3.org/2005/Atom}"
_BLOCK_TAGS = frozenset(
    {"br", "p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre"}
)
_IGNORED_TAGS = frozenset({"script", "style", "nav", "footer", "header", "aside"})
_HORIZONTAL_SPACE = re.compile(r"[^\S\n]+")


class NewsFeedFetchError(Exception):
    """A remote news source could not be fetched or understood."""


@dataclass(frozen=True)
class FeedEntry:
    """One entry of a remote source, reduced to plain text."""

    external_id: str
    title: str
    summary: str | None
    url: str | None
    published_at: datetime | None


@dataclass(frozen=True)
class SyncResult:
    """Outcome of syncing one source."""

    source: NewsSource
    entries: int
    error: str | None


def _resolve_host(hostname: str) -> list[str]:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise NewsFeedFetchError(f"Host could not be resolved: {hostname}") from exc
    return [str(info[4][0]) for info in infos]


def check_feed_url(url: str, *, resolve: Callable[[str], Iterable[str]] | None = None) -> None:
    """
    Refuse a URL that is not http(s) or whose host resolves to a non-public address.

    The sync runs inside the deployment, so a source pointing at a loopback, private or link-local
    address could otherwise be used to read internal services. The check precedes the request; a DNS
    answer changing between the two is not covered.
    """
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise NewsFeedFetchError(f"URL must start with http:// or https:// and name a host: {url}")
    addresses = list((resolve or _resolve_host)(parts.hostname))
    if not addresses:
        raise NewsFeedFetchError(f"Host could not be resolved: {parts.hostname}")
    for address in addresses:
        if not ipaddress.ip_address(address).is_global:
            raise NewsFeedFetchError(f"Host resolves to a non-public address: {parts.hostname}")


def fetch_feed_text(
    url: str,
    *,
    transport: httpx.BaseTransport | None = None,
    resolve: Callable[[str], Iterable[str]] | None = None,
) -> str:
    """Download a source, refusing redirects, error statuses and bodies above the size cap."""
    check_feed_url(url, resolve=resolve)
    headers = {
        "User-Agent": f"Apache Airflow {airflow_version} news-feed-sync",
        "Accept": "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.8",
    }
    chunks: list[bytes] = []
    size = 0
    try:
        with (
            httpx.Client(
                follow_redirects=False, timeout=FETCH_TIMEOUT_SECONDS, transport=transport, headers=headers
            ) as client,
            client.stream("GET", url) as response,
        ):
            if response.is_redirect:
                location = response.headers.get("location", "")
                raise NewsFeedFetchError(
                    f"Redirects are not followed; the source answered {response.status_code}"
                    + (f" pointing at {location}; use that URL instead" if location else "")
                )
            if response.status_code != 200:
                raise NewsFeedFetchError(f"The source answered HTTP {response.status_code}")
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > MAX_FEED_BYTES:
                    raise NewsFeedFetchError(f"The source is larger than {MAX_FEED_BYTES} bytes")
                chunks.append(chunk)
            encoding = response.encoding or "utf-8"
    except httpx.HTTPError as exc:
        raise NewsFeedFetchError(f"The source could not be fetched: {exc}") from exc
    return b"".join(chunks).decode(encoding, errors="replace")


class _TextExtractor(HTMLParser):
    """Collect the text of an HTML fragment, with block boundaries turned into spaces."""

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _IGNORED_TAGS:
            self._ignored_depth += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in _IGNORED_TAGS and self._ignored_depth > 0:
            self._ignored_depth -= 1
        elif tag in _BLOCK_TAGS:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self._ignored_depth == 0:
            self.parts.append(data)


def _collapse(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def strip_html(value: str | None) -> str | None:
    """Reduce HTML to plain text; remote content is never rendered as markup."""
    if not value:
        return None
    extractor = _TextExtractor()
    extractor.feed(value)
    extractor.close()
    text = _collapse("".join(extractor.parts))
    return text or None


def _truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 3].rstrip() + "..."


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(text)
        except (TypeError, ValueError, IndexError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _http_url(value: str | None, base_url: str) -> str | None:
    if not value:
        return None
    resolved = urljoin(base_url, value.strip())
    return resolved if urlsplit(resolved).scheme in ("http", "https") else None


def _element_text(element: ElementTree.Element | None) -> str | None:
    if element is None:
        return None
    text = "".join(element.itertext()).strip()
    return text or None


def _build_entry(
    *,
    external_id: str | None,
    title: str | None,
    summary: str | None,
    url: str | None,
    published_at: datetime | None,
) -> FeedEntry | None:
    clean_title = strip_html(title)
    identifier = (external_id or url or "").strip()
    if not clean_title or not identifier:
        return None
    clean_summary = strip_html(summary)
    return FeedEntry(
        external_id=identifier[:EXTERNAL_ID_MAX_LENGTH],
        title=_truncate(clean_title, TITLE_MAX_LENGTH),
        summary=_truncate(clean_summary, SUMMARY_MAX_LENGTH) if clean_summary else None,
        url=url,
        published_at=published_at,
    )


def _atom_entry(entry: ElementTree.Element, base_url: str) -> FeedEntry | None:
    link = None
    for link_element in entry.findall(f"{ATOM_NS}link"):
        if link_element.get("rel", "alternate") == "alternate" and link_element.get("href"):
            link = link_element.get("href")
            break
    if link is None:
        first_link = entry.find(f"{ATOM_NS}link")
        link = first_link.get("href") if first_link is not None else None
    url = _http_url(link, base_url)
    return _build_entry(
        external_id=_element_text(entry.find(f"{ATOM_NS}id")) or url,
        title=_element_text(entry.find(f"{ATOM_NS}title")),
        summary=_element_text(entry.find(f"{ATOM_NS}summary"))
        or _element_text(entry.find(f"{ATOM_NS}content")),
        url=url,
        published_at=_parse_datetime(
            _element_text(entry.find(f"{ATOM_NS}published")) or _element_text(entry.find(f"{ATOM_NS}updated"))
        ),
    )


def _rss_item(item: ElementTree.Element, base_url: str) -> FeedEntry | None:
    url = _http_url(_element_text(item.find("link")), base_url)
    return _build_entry(
        external_id=_element_text(item.find("guid")) or url,
        title=_element_text(item.find("title")),
        summary=_element_text(item.find("description")),
        url=url,
        published_at=_parse_datetime(_element_text(item.find("pubDate"))),
    )


def _parse_xml_feed(text: str, base_url: str) -> list[FeedEntry]:
    if re.search(r"<!(?:DOCTYPE|ENTITY)\b", text, re.IGNORECASE):
        raise NewsFeedFetchError("Feeds with a DOCTYPE or entity declarations are refused")
    try:
        root = ElementTree.fromstring(text)
    except ElementTree.ParseError as exc:
        raise NewsFeedFetchError(f"The feed is not well-formed XML: {exc}") from exc
    if root.tag == f"{ATOM_NS}feed":
        entries = (_atom_entry(entry, base_url) for entry in root.iter(f"{ATOM_NS}entry"))
    elif root.tag == "rss" and root.find("channel") is not None:
        entries = (_rss_item(item, base_url) for item in root.iter("item"))
    else:
        raise NewsFeedFetchError("The feed is neither Atom nor RSS")
    return [entry for entry in entries if entry is not None]


class _DatedSectionsParser(HTMLParser):
    """
    Read a page made of dated ``<h1 id="...">`` headings, as the Apache Airflow announcements page.

    Each heading whose text is a date starts a section; the text up to the next heading is its body.
    """

    def __init__(self) -> None:
        super().__init__()
        self.sections: list[tuple[str | None, list[str], list[str]]] = []
        self._in_heading = False
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _IGNORED_TAGS:
            self._ignored_depth += 1
        elif tag == "h1":
            self._in_heading = True
            self.sections.append((dict(attrs).get("id"), [], []))
        elif tag in _BLOCK_TAGS and self.sections:
            self.sections[-1][2].append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in _IGNORED_TAGS and self._ignored_depth > 0:
            self._ignored_depth -= 1
        elif tag == "h1":
            self._in_heading = False
        elif tag in _BLOCK_TAGS and self.sections:
            self.sections[-1][2].append("\n")

    def handle_data(self, data: str) -> None:
        if self._ignored_depth > 0 or not self.sections:
            return
        section = self.sections[-1]
        (section[1] if self._in_heading else section[2]).append(data)


def _parse_heading_date(heading: str) -> datetime | None:
    for date_format in ("%B %d, %Y", "%d %B %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(heading, date_format).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _parse_dated_sections(text: str, base_url: str) -> list[FeedEntry]:
    parser = _DatedSectionsParser()
    parser.feed(text)
    parser.close()
    entries: list[FeedEntry] = []
    for section_id, heading_parts, body_parts in parser.sections:
        heading = _collapse("".join(heading_parts))
        published_at = _parse_heading_date(heading)
        if section_id is None or published_at is None:
            continue
        # Each block of the section is a line; the first one is the title, as on the announcements page.
        lines = [
            line
            for line in (_HORIZONTAL_SPACE.sub(" ", raw).strip() for raw in "".join(body_parts).split("\n"))
            if line
        ]
        entry = _build_entry(
            external_id=f"{base_url}#{section_id}",
            title=lines[0] if lines else heading,
            summary=" ".join(lines),
            url=f"{base_url}#{section_id}",
            published_at=published_at,
        )
        if entry is not None:
            entries.append(entry)
    return entries


def parse_feed(text: str, base_url: str) -> list[FeedEntry]:
    """Parse an Atom or RSS document, or a page of dated sections, into entries."""
    head = text.lstrip("\ufeff \t\r\n")[:200].lower()
    if head.startswith(("<?xml", "<feed", "<rss")):
        return _parse_xml_feed(text, base_url)
    entries = _parse_dated_sections(text, base_url)
    if not entries:
        raise NewsFeedFetchError(
            "No entries were found: the source is neither a feed nor a page of dated sections"
        )
    return entries


def select_sources_to_sync(session: Session, *, source_ids: Sequence[str] | None = None) -> list[NewsSource]:
    """
    Return the enabled sources the deployment settings allow, optionally limited to the given ids.

    Nothing is fetched while the news feed is turned off, nor for a source the settings disallow.
    """
    if not conf.getboolean("api", "news_feed_enabled") or not is_remote_allowed():
        return []
    statement = select(NewsSource).where(NewsSource.enabled.is_(True)).order_by(NewsSource.label)
    if source_ids:
        statement = statement.where(NewsSource.id.in_([UUID(source_id) for source_id in source_ids]))
    return [
        source
        for source in session.scalars(statement)
        if is_source_allowed(label=source.label, url=source.url)
    ]


def is_due(source: NewsSource, now: datetime) -> bool:
    """Whether the source's sync interval has passed since its last fetch (or it was never fetched)."""
    return (
        source.last_fetched_at is None
        or source.last_fetched_at + timedelta(minutes=source.sync_interval_minutes) <= now
    )


def _expires_at(published_at: datetime, ttl_days: int | None) -> datetime | None:
    return None if ttl_days is None else published_at + timedelta(days=ttl_days)


def _store_entries(session: Session, source: NewsSource, entries: Sequence[FeedEntry], now: datetime) -> None:
    """Upsert the newest ``max_entries`` entries of the feed, then drop stored ones beyond that."""
    limit = min(source.max_entries, MAX_STORED_ENTRIES_PER_SOURCE)
    entries = sorted(entries, key=lambda entry: entry.published_at or now, reverse=True)[:limit]
    existing = {
        item.external_id: item
        for item in session.scalars(select(NewsItem).where(NewsItem.source_id == source.id))
    }
    seen: set[str] = set()
    for entry in entries:
        if entry.external_id in seen:
            continue
        seen.add(entry.external_id)
        item = existing.get(entry.external_id)
        if item is None:
            item = NewsItem(
                source_id=source.id,
                external_id=entry.external_id,
                author=source.label,
                priority=FETCHED_ENTRY_PRIORITY,
            )
            session.add(item)
            existing[entry.external_id] = item
        item.title = entry.title
        item.body = entry.summary
        item.url = entry.url
        item.published_at = entry.published_at or now
        item.fetched_at = now
    # The TTL may have changed since the last run, so every stored entry gets its expiry recomputed.
    for item in existing.values():
        item.expires_at = _expires_at(item.published_at, source.ttl_days)
    source.trim_stored_entries(session=session)


def sync_news_sources(
    *,
    session: Session,
    sources: Sequence[NewsSource],
    now: datetime | None = None,
    transport: httpx.BaseTransport | None = None,
    resolve: Callable[[str], Iterable[str]] | None = None,
) -> list[SyncResult]:
    """
    Fetch each source and bring its stored entries in line with the feed.

    A source that fails keeps its stored entries and records the error; the others are unaffected.
    """
    now = now or timezone.utcnow()
    results: list[SyncResult] = []
    for source in sources:
        try:
            entries = parse_feed(
                fetch_feed_text(source.url, transport=transport, resolve=resolve), source.url
            )
        except NewsFeedFetchError as exc:
            log.warning("News source %s (%s) could not be synced: %s", source.label, source.url, exc)
            source.last_fetched_at = now
            source.last_fetch_error = str(exc)[:2000]
            results.append(SyncResult(source=source, entries=0, error=str(exc)))
            continue
        _store_entries(session, source, entries, now)
        source.last_fetched_at = now
        source.last_fetch_error = None
        results.append(SyncResult(source=source, entries=len(entries), error=None))
    session.flush()
    return results
