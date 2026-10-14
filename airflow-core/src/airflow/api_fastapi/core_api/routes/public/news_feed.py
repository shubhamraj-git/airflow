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
from typing import Annotated, cast
from uuid import UUID

from fastapi import Depends, HTTPException, Query, status
from sqlalchemy import delete, or_, select
from sqlalchemy.engine import CursorResult

from airflow._shared.timezones import timezone
from airflow.api_fastapi.auth.managers.models.resource_details import AccessView
from airflow.api_fastapi.common.db.common import SessionDep, paginated_select
from airflow.api_fastapi.common.parameters import QueryLimit, QueryOffset, SortParam
from airflow.api_fastapi.common.router import AirflowRouter
from airflow.api_fastapi.core_api.datamodels.news_feed import (
    NewsItemBody,
    NewsItemCollectionResponse,
    NewsItemPatchBody,
    NewsItemResponse,
    NewsSourceBody,
    NewsSourceCollectionResponse,
    NewsSourcePatchBody,
    NewsSourceResponse,
)
from airflow.api_fastapi.core_api.openapi.exceptions import create_openapi_http_exception_doc
from airflow.api_fastapi.core_api.security import GetUserDep, requires_access_view, requires_authenticated
from airflow.api_fastapi.core_api.services.public.common import BulkService
from airflow.api_fastapi.logging.decorators import action_logging
from airflow.models.news_feed import NewsItem, NewsSource
from airflow.news_feed.policy import (
    build_public_airflow_feed_condition,
    is_public_feeds_allowed,
    is_remote_allowed,
    is_source_allowed,
)

news_feed_router = AirflowRouter(tags=["NewsFeed"])

# Reading the feed is open to every authenticated user: it is home page content. Writing it is
# gated on the admin-by-default ``NEWS_FEED_MANAGE`` view, since what is written reaches everyone.
# The dependencies are spelled out on every route because the permission reference docs are
# generated from the decorators.


def _validate_expiry(published_at: datetime, expires_at: datetime | None) -> None:
    if expires_at is not None and expires_at <= published_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "expires_at must be after published_at")


def _get_news_item(news_item_id: UUID, session: SessionDep) -> NewsItem:
    news_item = session.get(NewsItem, news_item_id)
    if news_item is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"The News Item with id: `{news_item_id}` was not found"
        )
    return news_item


def _ensure_remote_sources_allowed() -> None:
    if not is_remote_allowed():
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Remote news sources are disabled by the [api] news_feed_allow_remote_sources setting.",
        )


def _ensure_source_can_be_enabled(*, label: str, url: str) -> None:
    _ensure_remote_sources_allowed()
    if not is_source_allowed(label=label, url=url):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "The public Apache Airflow feeds are disabled by the [api] news_feed_allow_public_airflow_feeds "
            "setting.",
        )


def _is_hidden_by_settings(news_item: NewsItem) -> bool:
    """Whether the item is an entry of a remote source that the deployment settings disallow."""
    if news_item.source_id is None:
        return False
    source = news_item.source
    return source is None or not is_source_allowed(label=source.label, url=source.url)


def _get_news_source(news_source_id: UUID, session: SessionDep) -> NewsSource:
    news_source = session.get(NewsSource, news_source_id)
    if news_source is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"The News Source with id: `{news_source_id}` was not found"
        )
    return news_source


@news_feed_router.get("/newsItems", dependencies=[Depends(requires_authenticated())])
def get_news_items(
    limit: QueryLimit,
    offset: QueryOffset,
    order_by: Annotated[
        SortParam,
        Depends(
            SortParam(
                ["id", "priority", "published_at", "title", "expires_at", "created_at"], NewsItem
            ).dynamic_depends(default="-published_at")
        ),
    ],
    session: SessionDep,
    include_inactive: bool = False,
    remote: bool | None = None,
) -> NewsItemCollectionResponse:
    """
    Get news items.

    Unless ``include_inactive`` is set, only published, unexpired items are returned, and entries
    fetched from a remote source only while that source is enabled. Entries of sources that the
    ``[api] news_feed_allow_remote_sources`` and ``news_feed_allow_public_airflow_feeds`` settings
    disallow are never returned. ``remote`` limits the result to
    entries fetched from remote sources (``true``) or to items written by administrators (``false``).
    """
    statement = select(NewsItem)
    if not is_remote_allowed():
        statement = statement.where(NewsItem.source_id.is_(None))
    elif not is_public_feeds_allowed():
        public_source_ids = select(NewsSource.id).where(build_public_airflow_feed_condition())
        statement = statement.where(
            or_(NewsItem.source_id.is_(None), NewsItem.source_id.not_in(public_source_ids))
        )
    if remote is True:
        statement = statement.where(NewsItem.source_id.is_not(None))
    elif remote is False:
        statement = statement.where(NewsItem.source_id.is_(None))
    if not include_inactive:
        now = timezone.utcnow()
        statement = statement.outerjoin(NewsSource, NewsItem.source_id == NewsSource.id).where(
            NewsItem.published_at <= now,
            or_(NewsItem.expires_at.is_(None), NewsItem.expires_at > now),
            or_(NewsItem.source_id.is_(None), NewsSource.enabled.is_(True)),
        )
    news_items_select, total_entries = paginated_select(
        statement=statement,
        order_by=order_by,
        offset=offset,
        limit=limit,
        session=session,
    )
    return NewsItemCollectionResponse(
        news_items=[NewsItemResponse.model_validate(item) for item in session.scalars(news_items_select)],
        total_entries=total_entries,
    )


@news_feed_router.get(
    "/newsItems/{news_item_id}",
    responses=create_openapi_http_exception_doc([status.HTTP_404_NOT_FOUND]),
    dependencies=[Depends(requires_authenticated())],
)
def get_news_item(news_item_id: UUID, session: SessionDep) -> NewsItemResponse:
    """Get a news item; an entry of a source the deployment settings disallow is not found."""
    news_item = _get_news_item(news_item_id, session)
    if _is_hidden_by_settings(news_item):
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"The News Item with id: `{news_item_id}` was not found"
        )
    return news_item


@news_feed_router.post(
    "/newsItems",
    status_code=status.HTTP_201_CREATED,
    responses=create_openapi_http_exception_doc([status.HTTP_400_BAD_REQUEST]),
    dependencies=[Depends(requires_access_view(AccessView.NEWS_FEED_MANAGE)), Depends(action_logging())],
)
def post_news_item(body: NewsItemBody, user: GetUserDep, session: SessionDep) -> NewsItemResponse:
    """Create a news item."""
    published_at = body.published_at or timezone.utcnow()
    _validate_expiry(published_at, body.expires_at)
    news_item = NewsItem(
        **body.model_dump(exclude={"published_at"}),
        published_at=published_at,
        created_by=user.get_name(),
    )
    session.add(news_item)
    # Populate the generated id and timestamps for the response.
    session.flush()
    return news_item


@news_feed_router.patch(
    "/newsItems/{news_item_id}",
    responses=create_openapi_http_exception_doc([status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND]),
    dependencies=[Depends(requires_access_view(AccessView.NEWS_FEED_MANAGE)), Depends(action_logging())],
)
def patch_news_item(
    news_item_id: UUID,
    patch_body: NewsItemPatchBody,
    session: SessionDep,
    update_mask: list[str] | None = Query(None),
) -> NewsItemResponse:
    """Update a news item."""
    news_item = _get_news_item(news_item_id, session)
    BulkService.apply_patch_with_update_mask(model=news_item, patch_body=patch_body, update_mask=update_mask)
    _validate_expiry(news_item.published_at, news_item.expires_at)
    return news_item


@news_feed_router.delete(
    "/newsItems/{news_item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=create_openapi_http_exception_doc([status.HTTP_404_NOT_FOUND]),
    dependencies=[Depends(requires_access_view(AccessView.NEWS_FEED_MANAGE)), Depends(action_logging())],
)
def delete_news_item(news_item_id: UUID, session: SessionDep):
    """Delete a news item."""
    affected_count = cast(
        "CursorResult", session.execute(delete(NewsItem).where(NewsItem.id == news_item_id))
    )
    if affected_count.rowcount == 0:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"The News Item with id: `{news_item_id}` was not found"
        )


@news_feed_router.get("/newsSources", dependencies=[Depends(requires_authenticated())])
def get_news_sources(
    limit: QueryLimit,
    offset: QueryOffset,
    order_by: Annotated[
        SortParam,
        Depends(
            SortParam(["id", "label", "url", "enabled", "created_at"], NewsSource).dynamic_depends(
                default="label"
            )
        ),
    ],
    session: SessionDep,
) -> NewsSourceCollectionResponse:
    """Get news sources."""
    news_sources_select, total_entries = paginated_select(
        statement=select(NewsSource),
        order_by=order_by,
        offset=offset,
        limit=limit,
        session=session,
    )
    return NewsSourceCollectionResponse(
        news_sources=[
            NewsSourceResponse.model_validate(source) for source in session.scalars(news_sources_select)
        ],
        total_entries=total_entries,
    )


@news_feed_router.post(
    "/newsSources",
    status_code=status.HTTP_201_CREATED,
    responses=create_openapi_http_exception_doc(
        [status.HTTP_403_FORBIDDEN, status.HTTP_409_CONFLICT]
    ),  # a duplicate URL is turned into 409 by the global exception handler
    dependencies=[Depends(requires_access_view(AccessView.NEWS_FEED_MANAGE)), Depends(action_logging())],
)
def post_news_source(body: NewsSourceBody, user: GetUserDep, session: SessionDep) -> NewsSourceResponse:
    """
    Create a news source.

    Refused with 403 while the deployment settings disallow remote sources, or disallow the public
    Apache Airflow feeds and the new source is one of them and enabled.
    """
    _ensure_remote_sources_allowed()
    if body.enabled:
        _ensure_source_can_be_enabled(label=body.label, url=body.url)
    news_source = NewsSource(**body.model_dump(), created_by=user.get_name())
    session.add(news_source)
    # Populate the generated id and timestamps for the response; also surfaces a duplicate URL here.
    session.flush()
    return news_source


@news_feed_router.patch(
    "/newsSources/{news_source_id}",
    responses=create_openapi_http_exception_doc(
        [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND,
            status.HTTP_409_CONFLICT,
        ]
    ),
    dependencies=[Depends(requires_access_view(AccessView.NEWS_FEED_MANAGE)), Depends(action_logging())],
)
def patch_news_source(
    news_source_id: UUID,
    patch_body: NewsSourcePatchBody,
    session: SessionDep,
    update_mask: list[str] | None = Query(None),
) -> NewsSourceResponse:
    """
    Update a news source.

    A new URL makes the source a different feed: the outcome of the last sync and the entries stored
    from the old URL are dropped, and the next ``airflow news-feed sync`` run fetches the new one.
    Lowering ``max_entries`` deletes the stored entries beyond the newest ones at once. A change that
    would leave a source enabled that the deployment settings disallow is refused with 403;
    disabling such a source is always possible.
    """
    news_source = _get_news_source(news_source_id, session)
    fields_to_update = set(patch_body.model_fields_set)
    if update_mask:
        fields_to_update &= set(update_mask)
    changes = patch_body.model_dump(include=fields_to_update)
    if changes.get("enabled", news_source.enabled):
        _ensure_source_can_be_enabled(
            label=changes.get("label", news_source.label), url=changes.get("url", news_source.url)
        )
    previous_url = news_source.url
    previous_max_entries = news_source.max_entries
    BulkService.apply_patch_with_update_mask(
        model=news_source, patch_body=patch_body, update_mask=update_mask
    )
    if news_source.url != previous_url:
        news_source.last_fetched_at = None
        news_source.last_fetch_error = None
        session.execute(delete(NewsItem).where(NewsItem.source_id == news_source.id))
    elif news_source.max_entries < previous_max_entries:
        news_source.trim_stored_entries(session=session)
    session.flush()
    return news_source


@news_feed_router.delete(
    "/newsSources/{news_source_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=create_openapi_http_exception_doc([status.HTTP_404_NOT_FOUND]),
    dependencies=[Depends(requires_access_view(AccessView.NEWS_FEED_MANAGE)), Depends(action_logging())],
)
def delete_news_source(news_source_id: UUID, session: SessionDep):
    """Delete a news source."""
    affected_count = cast(
        "CursorResult", session.execute(delete(NewsSource).where(NewsSource.id == news_source_id))
    )
    if affected_count.rowcount == 0:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"The News Source with id: `{news_source_id}` was not found"
        )
