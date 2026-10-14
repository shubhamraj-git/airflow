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

from datetime import datetime
from enum import Enum
from typing import Annotated
from uuid import UUID

from pydantic import AfterValidator, AwareDatetime, Field, StringConstraints, model_validator

from airflow.api_fastapi.core_api.base import BaseModel, StrictBaseModel
from airflow.models.news_feed import MAX_STORED_ENTRIES_PER_SOURCE


def _require_http_url(value: str) -> str:
    if not value.lower().startswith(("http://", "https://")):
        raise ValueError("URL must start with http:// or https://")
    return value


NewsItemUrl = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=2000),
    AfterValidator(_require_http_url),
]
NewsItemAuthor = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=250)]


class NewsItemPriority(str, Enum):
    """Priority of a news item; P0 is the most urgent."""

    P0 = "P0"
    P1 = "P1"
    P2 = "P2"


# Floor for a source's sync interval, so that a deployment cannot poll a feed host aggressively.
MIN_SYNC_INTERVAL_MINUTES = 5
# Shorter than a news item URL: the column carries a unique index, which MySQL caps in length.
NewsSourceUrl = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=500),
    AfterValidator(_require_http_url),
]


def _reject_explicit_null(model: StrictBaseModel, fields: tuple[str, ...]) -> None:
    """
    Reject ``null`` for fields that map to non-nullable columns.

    Patch bodies default every field to ``None`` to mean "unchanged", so only a field the
    client actually sent as ``null`` is an error.
    """
    for name in fields:
        if name in model.model_fields_set and getattr(model, name) is None:
            raise ValueError(f"{name} cannot be null")


class NewsItemResponse(BaseModel):
    """News item serializer for responses."""

    id: UUID
    title: str
    author: str | None
    priority: NewsItemPriority
    body: str | None
    url: str | None
    published_at: datetime
    expires_at: datetime | None
    source_id: UUID | None
    fetched_at: datetime | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime


class NewsItemCollectionResponse(BaseModel):
    """News item collection serializer for responses."""

    news_items: list[NewsItemResponse]
    total_entries: int


class NewsItemBody(StrictBaseModel):
    """News item serializer for post bodies."""

    title: str = Field(min_length=1, max_length=250)
    author: NewsItemAuthor | None = Field(
        default=None, description="Who the item is from, such as a team name; ``null`` shows this deployment."
    )
    priority: NewsItemPriority = Field(
        default=NewsItemPriority.P2, description="P0 (critical), P1 (important) or P2 (normal)."
    )
    body: str | None = Field(default=None, description="Markdown body.")
    url: NewsItemUrl | None = None
    published_at: AwareDatetime | None = Field(default=None, description="Defaults to now.")
    expires_at: AwareDatetime | None = Field(default=None, description="``null`` never expires.")


class NewsItemPatchBody(StrictBaseModel):
    """News item serializer for patch bodies."""

    title: str | None = Field(default=None, min_length=1, max_length=250)
    author: NewsItemAuthor | None = None
    priority: NewsItemPriority | None = None
    body: str | None = None
    url: NewsItemUrl | None = None
    published_at: AwareDatetime | None = None
    expires_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_required_fields(self) -> NewsItemPatchBody:
        _reject_explicit_null(self, ("title", "priority", "published_at"))
        return self


class NewsSourceResponse(BaseModel):
    """News source serializer for responses."""

    id: UUID
    url: str
    label: str
    enabled: bool
    ttl_days: int | None
    max_entries: int
    sync_interval_minutes: int
    last_fetched_at: datetime | None
    last_fetch_error: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime


class NewsSourceCollectionResponse(BaseModel):
    """News source collection serializer for responses."""

    news_sources: list[NewsSourceResponse]
    total_entries: int


class NewsSourceBody(StrictBaseModel):
    """News source serializer for post bodies."""

    url: NewsSourceUrl
    label: str = Field(min_length=1, max_length=250)
    enabled: bool = False
    ttl_days: int | None = Field(
        default=30, ge=1, description="Entries older than this many days are not shown; ``null`` keeps all."
    )
    max_entries: int = Field(
        default=10,
        ge=1,
        le=MAX_STORED_ENTRIES_PER_SOURCE,
        description="Only the newest this many entries of the source are kept and shown.",
    )
    sync_interval_minutes: int = Field(
        default=60,
        ge=MIN_SYNC_INTERVAL_MINUTES,
        description="Minutes ``airflow news-feed sync`` waits after a fetch before fetching the source again.",
    )


class NewsSourcePatchBody(StrictBaseModel):
    """News source serializer for patch bodies."""

    url: NewsSourceUrl | None = None
    label: str | None = Field(default=None, min_length=1, max_length=250)
    enabled: bool | None = None
    ttl_days: int | None = Field(default=None, ge=1)
    max_entries: int | None = Field(default=None, ge=1, le=MAX_STORED_ENTRIES_PER_SOURCE)
    sync_interval_minutes: int | None = Field(default=None, ge=MIN_SYNC_INTERVAL_MINUTES)

    @model_validator(mode="after")
    def validate_required_fields(self) -> NewsSourcePatchBody:
        _reject_explicit_null(self, ("url", "label", "enabled", "max_entries", "sync_interval_minutes"))
        return self
