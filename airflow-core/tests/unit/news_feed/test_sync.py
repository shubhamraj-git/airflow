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
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

import httpx
import pytest
from sqlalchemy import select

from airflow.models.news_feed import NewsItem, NewsSource
from airflow.news_feed import sync as news_feed_sync
from airflow.news_feed.sync import (
    NewsFeedFetchError,
    check_feed_url,
    fetch_feed_text,
    is_due,
    parse_feed,
    select_sources_to_sync,
    strip_html,
    sync_news_sources,
)
from airflow.utils.session import provide_session

from tests_common.test_utils.config import conf_vars
from tests_common.test_utils.db import clear_db_news_feed

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

NOW = datetime(2026, 10, 14, 12, 0, tzinfo=UTC)
BLOG_URL = "https://blog.example.com/index.xml"

ATOM = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example blog</title>
  <entry>
    <title>Airflow &lt;b&gt;3.3&lt;/b&gt; released</title>
    <id>tag:example.com,2026:release-3-3</id>
    <link rel="self" href="https://blog.example.com/self"/>
    <link rel="alternate" href="/airflow-3-3/"/>
    <published>2026-10-10T08:00:00Z</published>
    <content type="html">&lt;p&gt;We are &lt;em&gt;proud&lt;/em&gt; to announce.&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;</content>
  </entry>
  <entry>
    <title>Untitled entry has no id and no link</title>
  </entry>
</feed>
"""

RSS = """<?xml version="1.0"?>
<rss version="2.0"><channel><title>Status</title>
  <item>
    <title>Maintenance window</title>
    <link>javascript:alert(1)</link>
    <guid>status-42</guid>
    <pubDate>Tue, 06 Oct 2026 18:00:00 +0000</pubDate>
    <description>Short &amp; sweet</description>
  </item>
</channel></rss>
"""

ANNOUNCEMENTS = """<!DOCTYPE html>
<html><body><header>Site header</header><main>
<h1 id="october-1-2026">October 1, 2026</h1>
<p>We've just released Apache Airflow 3.3.2</p>
<p>Docs: https://airflow.apache.org/docs/apache-airflow/3.3.2/</p>
<h1 id="intro">Announcements</h1>
<p>Not dated, ignored.</p>
<h1 id="september-17-2026">September 17, 2026</h1>
<p>Airflow Summit talks are online!</p><p>Watch them now.</p>
</main><footer>Footer text</footer></body></html>
"""


def public_resolver(_hostname: str) -> list[str]:
    return ["93.184.216.34"]


class TestParseFeed:
    def test_atom_entries_are_reduced_to_plain_text(self):
        entries = parse_feed(ATOM, BLOG_URL)
        assert len(entries) == 1
        (entry,) = entries
        assert entry.external_id == "tag:example.com,2026:release-3-3"
        assert entry.title == "Airflow 3.3 released"
        assert entry.summary == "We are proud to announce."
        assert entry.url == "https://blog.example.com/airflow-3-3/"
        assert entry.published_at == datetime(2026, 10, 10, 8, tzinfo=UTC)

    def test_rss_items_drop_non_http_links(self):
        (entry,) = parse_feed(RSS, BLOG_URL)
        assert entry.external_id == "status-42"
        assert entry.url is None
        assert entry.summary == "Short & sweet"
        assert entry.published_at == datetime(2026, 10, 6, 18, tzinfo=UTC)

    def test_dated_sections_page(self):
        base_url = "https://airflow.apache.org/announcements/"
        entries = parse_feed(ANNOUNCEMENTS, base_url)
        assert [entry.published_at.date().isoformat() for entry in entries] == ["2026-10-01", "2026-09-17"]
        first, second = entries
        assert first.external_id == f"{base_url}#october-1-2026"
        assert first.url == f"{base_url}#october-1-2026"
        assert first.title == "We've just released Apache Airflow 3.3.2"
        assert first.summary == (
            "We've just released Apache Airflow 3.3.2 Docs: https://airflow.apache.org/docs/apache-airflow/3.3.2/"
        )
        assert second.title == "Airflow Summit talks are online!"
        assert second.summary == "Airflow Summit talks are online! Watch them now."
        assert "Footer" not in second.summary

    @pytest.mark.parametrize(
        "text",
        [
            pytest.param('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><feed/>', id="doctype"),
            pytest.param("<?xml version='1.0'?><feed><entry>", id="malformed"),
            pytest.param("<?xml version='1.0'?><sitemap/>", id="not_a_feed"),
            pytest.param("<html><body><p>No sections</p></body></html>", id="plain_page"),
        ],
    )
    def test_rejected_documents(self, text):
        with pytest.raises(NewsFeedFetchError):
            parse_feed(text, BLOG_URL)

    def test_strip_html_removes_scripts_and_collapses_whitespace(self):
        assert strip_html("<p>One</p>\n<script>x()</script><p> two &amp;  three</p>") == "One two & three"
        assert strip_html("  ") is None


@pytest.mark.parametrize(
    ("last_fetched_minutes_ago", "interval", "expected"),
    [
        pytest.param(None, 60, True, id="never_fetched"),
        pytest.param(59, 60, False, id="within_interval"),
        pytest.param(60, 60, True, id="interval_passed"),
        pytest.param(5, 5, True, id="shortest_interval"),
    ],
)
def test_is_due(last_fetched_minutes_ago, interval, expected):
    source = NewsSource(
        url=BLOG_URL,
        label="Blog",
        sync_interval_minutes=interval,
        last_fetched_at=None
        if last_fetched_minutes_ago is None
        else NOW - timedelta(minutes=last_fetched_minutes_ago),
    )
    assert is_due(source, NOW) is expected


class TestCheckFeedUrl:
    @pytest.mark.parametrize(
        ("url", "addresses"),
        [
            pytest.param("ftp://feeds.example.com/x", ["93.184.216.34"], id="scheme"),
            pytest.param("https://localhost/feed", ["127.0.0.1"], id="loopback"),
            pytest.param("https://intranet/feed", ["10.0.0.5"], id="private"),
            pytest.param("https://metadata/feed", ["169.254.169.254"], id="link_local"),
            pytest.param("https://v6.example.com/feed", ["fd00::1"], id="private_v6"),
            pytest.param("https://nowhere.example.com/feed", [], id="unresolvable"),
        ],
    )
    def test_refuses(self, url, addresses):
        with pytest.raises(NewsFeedFetchError):
            check_feed_url(url, resolve=lambda _hostname: addresses)

    def test_accepts_public_host(self):
        check_feed_url("https://feeds.example.com/x", resolve=public_resolver)


class TestFetchFeedText:
    def test_returns_the_body(self):
        transport = httpx.MockTransport(lambda request: httpx.Response(200, text=RSS))
        assert fetch_feed_text(BLOG_URL, transport=transport, resolve=public_resolver) == RSS

    def test_refuses_redirects_and_names_the_target(self):
        transport = httpx.MockTransport(
            lambda request: httpx.Response(301, headers={"location": "https://blog.example.com/feed.xml"})
        )
        with pytest.raises(NewsFeedFetchError, match="use that URL instead"):
            fetch_feed_text(BLOG_URL, transport=transport, resolve=public_resolver)

    def test_refuses_error_statuses(self):
        transport = httpx.MockTransport(lambda request: httpx.Response(503))
        with pytest.raises(NewsFeedFetchError, match="HTTP 503"):
            fetch_feed_text(BLOG_URL, transport=transport, resolve=public_resolver)

    def test_refuses_oversized_bodies(self, monkeypatch):
        monkeypatch.setattr(news_feed_sync, "MAX_FEED_BYTES", 16)
        transport = httpx.MockTransport(lambda request: httpx.Response(200, text="x" * 64))
        with pytest.raises(NewsFeedFetchError, match="larger than"):
            fetch_feed_text(BLOG_URL, transport=transport, resolve=public_resolver)

    def test_wraps_transport_errors(self):
        def fail(request):
            raise httpx.ConnectError("boom")

        with pytest.raises(NewsFeedFetchError, match="could not be fetched"):
            fetch_feed_text(BLOG_URL, transport=httpx.MockTransport(fail), resolve=public_resolver)


@pytest.mark.db_test
class TestSyncNewsSources:
    @pytest.fixture(autouse=True)
    def clean(self):
        clear_db_news_feed()
        yield
        clear_db_news_feed()

    @staticmethod
    def _sources(session):
        blog = NewsSource(url=BLOG_URL, label="Example blog", enabled=True, ttl_days=7)
        broken = NewsSource(
            url="https://broken.example.com/feed.xml", label="Broken", enabled=True, ttl_days=30
        )
        session.add_all([blog, broken])
        session.flush()
        return blog, broken

    @staticmethod
    def _transport(status_for_broken=503, atom=ATOM):
        def handle(request):
            if request.url.host == "broken.example.com":
                return httpx.Response(status_for_broken)
            return httpx.Response(200, text=atom)

        return httpx.MockTransport(handle)

    @provide_session
    def test_stores_entries_with_expiry_and_records_failures(self, *, session: Session):
        blog, broken = self._sources(session)

        results = sync_news_sources(
            session=session,
            sources=[blog, broken],
            now=NOW,
            transport=self._transport(),
            resolve=public_resolver,
        )

        assert [(result.entries, result.error is None) for result in results] == [(1, True), (0, False)]
        item = session.scalar(select(NewsItem).where(NewsItem.source_id == blog.id))
        assert item is not None
        assert item.title == "Airflow 3.3 released"
        assert item.author == "Example blog"
        assert item.priority == "P2"
        assert item.external_id == "tag:example.com,2026:release-3-3"
        assert item.published_at == datetime(2026, 10, 10, 8, tzinfo=UTC)
        assert item.expires_at == item.published_at + timedelta(days=7)
        assert item.fetched_at == NOW
        assert blog.last_fetched_at == NOW
        assert blog.last_fetch_error is None
        assert broken.last_fetched_at == NOW
        assert "HTTP 503" in broken.last_fetch_error

    @provide_session
    def test_resync_updates_in_place_and_follows_a_changed_ttl(self, *, session: Session):
        blog, _ = self._sources(session)
        sync_news_sources(
            session=session, sources=[blog], now=NOW, transport=self._transport(), resolve=public_resolver
        )
        item_id = session.scalar(select(NewsItem.id).where(NewsItem.source_id == blog.id))

        blog.ttl_days = None
        later = NOW + timedelta(hours=1)
        updated_atom = ATOM.replace("Airflow &lt;b&gt;3.3&lt;/b&gt; released", "Airflow 3.3.1 released")
        sync_news_sources(
            session=session,
            sources=[blog],
            now=later,
            transport=self._transport(atom=updated_atom),
            resolve=public_resolver,
        )

        items = list(session.scalars(select(NewsItem).where(NewsItem.source_id == blog.id)))
        assert [item.id for item in items] == [item_id]
        assert items[0].title == "Airflow 3.3.1 released"
        assert items[0].expires_at is None
        assert items[0].fetched_at == later

    @provide_session
    def test_a_failing_source_keeps_its_stored_entries(self, *, session: Session):
        blog, _ = self._sources(session)
        sync_news_sources(
            session=session, sources=[blog], now=NOW, transport=self._transport(), resolve=public_resolver
        )

        def fail(request):
            return httpx.Response(500)

        sync_news_sources(
            session=session,
            sources=[blog],
            now=NOW + timedelta(hours=1),
            transport=httpx.MockTransport(fail),
            resolve=public_resolver,
        )

        assert session.scalar(select(NewsItem).where(NewsItem.source_id == blog.id)) is not None
        assert "HTTP 500" in blog.last_fetch_error

    @provide_session
    def test_keeps_only_the_newest_max_entries(self, *, session: Session):
        rss = """<?xml version="1.0"?><rss version="2.0"><channel><title>Status</title>
          <item><title>Old</title><guid>old</guid><pubDate>Tue, 06 Oct 2026 08:00:00 +0000</pubDate></item>
          <item><title>New</title><guid>new</guid><pubDate>Thu, 08 Oct 2026 08:00:00 +0000</pubDate></item>
          <item><title>Mid</title><guid>mid</guid><pubDate>Wed, 07 Oct 2026 08:00:00 +0000</pubDate></item>
        </channel></rss>"""
        source = NewsSource(url=BLOG_URL, label="Status", enabled=True, ttl_days=None, max_entries=2)
        session.add(source)
        session.flush()
        transport = httpx.MockTransport(lambda request: httpx.Response(200, text=rss))

        sync_news_sources(
            session=session, sources=[source], now=NOW, transport=transport, resolve=public_resolver
        )

        def stored_titles():
            return session.scalars(
                select(NewsItem.title)
                .where(NewsItem.source_id == source.id)
                .order_by(NewsItem.published_at.desc())
            ).all()

        assert stored_titles() == ["New", "Mid"]

        source.max_entries = 1
        sync_news_sources(
            session=session, sources=[source], now=NOW, transport=transport, resolve=public_resolver
        )

        assert stored_titles() == ["New"]

    @provide_session
    def test_select_sources_honours_the_settings(self, *, session: Session):
        public = NewsSource(
            url="https://airflow.apache.org/blog/index.xml", label="Apache Airflow blog", enabled=True
        )
        mirror = NewsSource(url="https://mirror.internal/feed.xml", label="Mirror", enabled=True)
        disabled = NewsSource(url="https://off.internal/feed.xml", label="Off", enabled=False)
        session.add_all([public, mirror, disabled])
        session.flush()

        assert [source.label for source in select_sources_to_sync(session)] == [
            "Apache Airflow blog",
            "Mirror",
        ]
        assert [source.label for source in select_sources_to_sync(session, source_ids=[str(mirror.id)])] == [
            "Mirror"
        ]
        with conf_vars({("api", "news_feed_allow_public_airflow_feeds"): "False"}):
            assert [source.label for source in select_sources_to_sync(session)] == ["Mirror"]
        with conf_vars({("api", "news_feed_allow_remote_sources"): "False"}):
            assert select_sources_to_sync(session) == []
        with conf_vars({("api", "news_feed_enabled"): "False"}):
            assert select_sources_to_sync(session) == []
        assert isinstance(mirror.id, UUID)
