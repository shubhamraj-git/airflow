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
"""Tables behind the home page news feed: items written by administrators and remote sources."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

import uuid6
from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid, select
from sqlalchemy.orm import Mapped, mapped_column, relationship

from airflow._shared.timezones import timezone
from airflow.models.base import Base
from airflow.utils.sqlalchemy import UtcDateTime

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

# Ceiling for a source's ``max_entries``; the sync never stores more entries of one source.
MAX_STORED_ENTRIES_PER_SOURCE = 100


class NewsItem(Base):
    """A news entry written by an administrator and shown on the home page to every user."""

    __tablename__ = "news_item"

    id: Mapped[UUID] = mapped_column(Uuid(), primary_key=True, default=uuid6.uuid7)
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    # Who the item is from, such as a team name; NULL is shown as this deployment.
    author: Mapped[str | None] = mapped_column(String(250), nullable=True)
    # "P0" (critical), "P1" (important) or "P2" (normal); sorts ahead of the publication time.
    priority: Mapped[str] = mapped_column(String(2), nullable=False, default="P2")
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    published_at: Mapped[datetime] = mapped_column(UtcDateTime, default=timezone.utcnow, nullable=False)
    # NULL never expires.
    expires_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    # Set for entries fetched from a remote source by ``airflow news-feed sync``; the entry's id in
    # its feed is unique per source. Both are NULL for items written by administrators.
    source_id: Mapped[UUID | None] = mapped_column(
        Uuid(), ForeignKey("news_source.id", ondelete="CASCADE"), nullable=True
    )
    external_id: Mapped[str | None] = mapped_column(String(500), nullable=True)
    fetched_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(250), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=timezone.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime, default=timezone.utcnow, onupdate=timezone.utcnow, nullable=False
    )

    source: Mapped[NewsSource | None] = relationship("NewsSource")

    __table_args__ = (
        Index("idx_news_item_published_at", published_at),
        UniqueConstraint("source_id", "external_id", name="news_item_source_external_uq"),
    )

    def __repr__(self) -> str:
        return f"<NewsItem id={self.id!r} title={self.title!r}>"


class NewsSource(Base):
    """A remote Atom or RSS feed that the browser of every user fetches for the home page news section."""

    __tablename__ = "news_source"

    id: Mapped[UUID] = mapped_column(Uuid(), primary_key=True, default=uuid6.uuid7)
    # Short enough for the unique index to fit MySQL's key length limit.
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    label: Mapped[str] = mapped_column(String(250), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Entries older than this many days are not shown; NULL keeps every entry.
    ttl_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Only the newest this many entries of the source are kept, and so shown on the home page.
    max_entries: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    # ``airflow news-feed sync`` skips the source until this many minutes have passed since its last fetch.
    sync_interval_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    # Outcome of the last ``airflow news-feed sync`` run for this source.
    last_fetched_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    last_fetch_error: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(250), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=timezone.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime, default=timezone.utcnow, onupdate=timezone.utcnow, nullable=False
    )

    __table_args__ = (UniqueConstraint("url", name="news_source_url_uq"),)

    def trim_stored_entries(self, *, session: Session) -> None:
        """Delete the stored entries of this source beyond its newest ``max_entries``."""
        session.flush()
        excess = session.scalars(
            select(NewsItem)
            .where(NewsItem.source_id == self.id)
            .order_by(NewsItem.published_at.desc(), NewsItem.id.desc())
            .offset(self.max_entries)
        )
        for item in excess:
            session.delete(item)

    def __repr__(self) -> str:
        return f"<NewsSource id={self.id!r} url={self.url!r} enabled={self.enabled!r}>"
