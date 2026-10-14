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

from datetime import timedelta
from uuid import UUID, uuid4

import pytest
import time_machine
from sqlalchemy import select

from airflow._shared.timezones import timezone
from airflow.models.news_feed import NewsItem, NewsSource
from airflow.utils.session import NEW_SESSION, provide_session

from tests_common.test_utils.config import conf_vars
from tests_common.test_utils.db import clear_db_news_feed
from tests_common.test_utils.logs import check_last_log

pytestmark = pytest.mark.db_test

NOW = timezone.datetime(2026, 10, 14, 12, 0, 0)
UNKNOWN_ID = uuid4()


@provide_session
def _create_news_items(*, session=NEW_SESSION) -> dict[str, UUID]:
    """Create one item per visibility state; returns their ids by state."""
    items = {
        "active": NewsItem(
            title="Active",
            author="Platform team",
            priority="P1",
            body="**Tonight** at 22:00 UTC",
            url="https://example.com/active",
            published_at=NOW - timedelta(days=1),
            expires_at=NOW + timedelta(days=6),
            created_by="admin",
        ),
        "indefinite": NewsItem(title="Indefinite", priority="P0", published_at=NOW - timedelta(days=3)),
        "expired": NewsItem(
            title="Expired", published_at=NOW - timedelta(days=10), expires_at=NOW - timedelta(days=1)
        ),
        "scheduled": NewsItem(title="Scheduled", published_at=NOW + timedelta(days=1)),
    }
    session.add_all(items.values())
    session.flush()
    return {state: item.id for state, item in items.items()}


@provide_session
def _create_news_sources(*, session=NEW_SESSION) -> dict[str, UUID]:
    sources = {
        "apache": NewsSource(
            url="https://airflow.apache.org/blog/index.xml", label="Apache Airflow", enabled=True, ttl_days=30
        ),
        "mirror": NewsSource(url="https://mirror.internal/feed.xml", label="Internal mirror", enabled=False),
    }
    session.add_all(sources.values())
    session.flush()
    return {key: source.id for key, source in sources.items()}


class TestNewsFeedEndpoint:
    @pytest.fixture(autouse=True)
    def setup(self) -> None:
        clear_db_news_feed()

    def teardown_method(self) -> None:
        clear_db_news_feed()


class TestGetNewsItems(TestNewsFeedEndpoint):
    @time_machine.travel(NOW, tick=False)
    def test_returns_only_active_items_newest_first(self, test_client):
        _create_news_items()
        response = test_client.get("/newsItems")
        assert response.status_code == 200
        body = response.json()
        assert body["total_entries"] == 2
        assert [item["title"] for item in body["news_items"]] == ["Active", "Indefinite"]
        active = body["news_items"][0]
        assert active["author"] == "Platform team"
        assert active["priority"] == "P1"
        assert active["body"] == "**Tonight** at 22:00 UTC"
        assert active["url"] == "https://example.com/active"
        assert active["created_by"] == "admin"
        assert timezone.parse(active["expires_at"]) == NOW + timedelta(days=6)

    @pytest.mark.parametrize(
        ("query_params", "expected_titles"),
        [
            pytest.param({}, ["Scheduled", "Active", "Indefinite", "Expired"], id="default_order"),
            pytest.param(
                {"order_by": "title"}, ["Active", "Expired", "Indefinite", "Scheduled"], id="order_by"
            ),
            pytest.param({"limit": 2, "offset": 1}, ["Active", "Indefinite"], id="pagination"),
            pytest.param(
                {"order_by": ["priority", "-published_at"]},
                ["Indefinite", "Active", "Scheduled", "Expired"],
                id="priority_then_newest",
            ),
        ],
    )
    @time_machine.travel(NOW, tick=False)
    def test_include_inactive(self, test_client, query_params, expected_titles):
        _create_news_items()
        response = test_client.get("/newsItems", params={"include_inactive": True, **query_params})
        assert response.status_code == 200
        body = response.json()
        assert body["total_entries"] == 4
        assert [item["title"] for item in body["news_items"]] == expected_titles

    def test_should_respond_401(self, unauthenticated_test_client):
        response = unauthenticated_test_client.get("/newsItems")
        assert response.status_code == 401

    def test_reading_needs_only_authentication(self, unauthorized_test_client):
        """The feed is home page content, so a user with no role at all can still read it."""
        response = unauthorized_test_client.get("/newsItems")
        assert response.status_code == 200
        assert response.json() == {"news_items": [], "total_entries": 0}


class TestGetNewsItemsFromSources(TestNewsFeedEndpoint):
    @staticmethod
    @provide_session
    def _create_fetched_items(*, session=NEW_SESSION) -> None:
        enabled = NewsSource(url="https://on.example.com/feed.xml", label="On", enabled=True, ttl_days=30)
        disabled = NewsSource(url="https://off.example.com/feed.xml", label="Off", enabled=False, ttl_days=30)
        session.add_all([enabled, disabled])
        session.flush()
        session.add_all(
            [
                NewsItem(
                    title="From on",
                    source_id=enabled.id,
                    external_id="on-1",
                    fetched_at=NOW,
                    published_at=NOW - timedelta(hours=2),
                ),
                NewsItem(
                    title="From off",
                    source_id=disabled.id,
                    external_id="off-1",
                    fetched_at=NOW,
                    published_at=NOW - timedelta(hours=3),
                ),
                NewsItem(title="Manual", published_at=NOW - timedelta(hours=1)),
            ]
        )

    @pytest.mark.parametrize(
        ("query_params", "expected_titles"),
        [
            pytest.param({}, ["Manual", "From on"], id="active_hides_disabled_sources"),
            pytest.param({"remote": True}, ["From on"], id="remote_only"),
            pytest.param({"remote": False}, ["Manual"], id="manual_only"),
            pytest.param(
                {"include_inactive": True}, ["Manual", "From on", "From off"], id="inactive_lists_all"
            ),
        ],
    )
    @time_machine.travel(NOW, tick=False)
    def test_filters(self, test_client, query_params, expected_titles):
        self._create_fetched_items()
        response = test_client.get("/newsItems", params=query_params)
        assert response.status_code == 200
        body = response.json()
        assert [item["title"] for item in body["news_items"]] == expected_titles
        assert body["total_entries"] == len(expected_titles)

    @time_machine.travel(NOW, tick=False)
    def test_response_carries_the_source(self, test_client):
        self._create_fetched_items()
        response = test_client.get("/newsItems", params={"remote": True})
        (item,) = response.json()["news_items"]
        assert item["source_id"] is not None
        assert timezone.parse(item["fetched_at"]) == NOW


class TestNewsFeedSettingsEnforcement(TestNewsFeedEndpoint):
    """The deployment settings are enforced by the API, not only by the UI."""

    @staticmethod
    @provide_session
    def _create_entries(*, session=NEW_SESSION) -> dict[str, UUID]:
        public = NewsSource(
            url="https://airflow.apache.org/blog/index.xml", label="Apache Airflow blog", enabled=True
        )
        custom = NewsSource(url="https://status.example.com/feed.xml", label="Status page", enabled=True)
        session.add_all([public, custom])
        session.flush()
        items = {
            "manual": NewsItem(title="Manual", published_at=NOW - timedelta(hours=1)),
            "public": NewsItem(
                title="From public",
                source_id=public.id,
                external_id="p-1",
                published_at=NOW - timedelta(hours=2),
            ),
            "custom": NewsItem(
                title="From custom",
                source_id=custom.id,
                external_id="c-1",
                published_at=NOW - timedelta(hours=3),
            ),
        }
        session.add_all(items.values())
        session.flush()
        return {key: item.id for key, item in items.items()}

    @pytest.mark.parametrize(
        ("settings", "expected_titles"),
        [
            pytest.param({}, ["Manual", "From public", "From custom"], id="everything_allowed"),
            pytest.param(
                {("api", "news_feed_allow_public_airflow_feeds"): "False"},
                ["Manual", "From custom"],
                id="public_feeds_disallowed",
            ),
            pytest.param(
                {("api", "news_feed_allow_remote_sources"): "False"},
                ["Manual"],
                id="remote_sources_disallowed",
            ),
        ],
    )
    @time_machine.travel(NOW, tick=False)
    def test_listing_leaves_out_entries_the_settings_disallow(self, test_client, settings, expected_titles):
        self._create_entries()
        with conf_vars(settings):
            for params in ({}, {"include_inactive": True}):
                response = test_client.get("/newsItems", params=params)
                assert response.status_code == 200
                assert [item["title"] for item in response.json()["news_items"]] == expected_titles

    @pytest.mark.parametrize(
        ("settings", "item", "expected_status"),
        [
            pytest.param(
                {("api", "news_feed_allow_public_airflow_feeds"): "False"},
                "public",
                404,
                id="public_entry_hidden",
            ),
            pytest.param(
                {("api", "news_feed_allow_public_airflow_feeds"): "False"},
                "custom",
                200,
                id="custom_entry_kept",
            ),
            pytest.param(
                {("api", "news_feed_allow_remote_sources"): "False"}, "custom", 404, id="remote_entry_hidden"
            ),
            pytest.param(
                {("api", "news_feed_allow_remote_sources"): "False"}, "manual", 200, id="manual_item_kept"
            ),
        ],
    )
    @time_machine.travel(NOW, tick=False)
    def test_single_entry_of_a_disallowed_source_is_not_found(
        self, test_client, settings, item, expected_status
    ):
        ids = self._create_entries()
        with conf_vars(settings):
            response = test_client.get(f"/newsItems/{ids[item]}")
        assert response.status_code == expected_status

    @pytest.mark.parametrize(
        ("settings", "payload", "expected_status"),
        [
            pytest.param(
                {("api", "news_feed_allow_remote_sources"): "False"},
                {"url": "https://status.example.com/feed.xml", "label": "Status", "enabled": False},
                403,
                id="any_source_when_remote_disallowed",
            ),
            pytest.param(
                {("api", "news_feed_allow_public_airflow_feeds"): "False"},
                {"url": "https://mirror.internal/blog.xml", "label": "Apache Airflow blog", "enabled": True},
                403,
                id="enabled_public_feed_by_label",
            ),
            pytest.param(
                {("api", "news_feed_allow_public_airflow_feeds"): "False"},
                {"url": "https://airflow.apache.org/blog/index.xml", "label": "Blog", "enabled": True},
                403,
                id="enabled_public_feed_by_url",
            ),
            pytest.param(
                {("api", "news_feed_allow_public_airflow_feeds"): "False"},
                {"url": "https://airflow.apache.org/blog/index.xml", "label": "Apache Airflow blog"},
                201,
                id="disabled_public_feed",
            ),
            pytest.param(
                {("api", "news_feed_allow_public_airflow_feeds"): "False"},
                {"url": "https://status.example.com/feed.xml", "label": "Status", "enabled": True},
                201,
                id="enabled_custom_source",
            ),
        ],
    )
    def test_creating_a_source_follows_the_settings(self, test_client, settings, payload, expected_status):
        with conf_vars(settings):
            response = test_client.post("/newsSources", json=payload)
        assert response.status_code == expected_status
        if expected_status == 403:
            assert "news_feed_allow" in response.json()["detail"]

    @pytest.mark.parametrize(
        ("settings", "target", "payload", "expected_status"),
        [
            pytest.param(
                {("api", "news_feed_allow_remote_sources"): "False"},
                "custom",
                {"enabled": True},
                403,
                id="enabling_when_remote_disallowed",
            ),
            pytest.param(
                {("api", "news_feed_allow_remote_sources"): "False"},
                "custom",
                {"enabled": False},
                200,
                id="disabling_when_remote_disallowed",
            ),
            pytest.param(
                {("api", "news_feed_allow_public_airflow_feeds"): "False"},
                "public",
                {"enabled": True},
                403,
                id="enabling_public_feed",
            ),
            pytest.param(
                {("api", "news_feed_allow_public_airflow_feeds"): "False"},
                "public",
                {"ttl_days": 7},
                200,
                id="editing_disabled_public_feed",
            ),
            pytest.param(
                {("api", "news_feed_allow_public_airflow_feeds"): "False"},
                "custom",
                {"enabled": True, "label": "Apache Airflow blog"},
                403,
                id="relabelling_into_an_enabled_public_feed",
            ),
            pytest.param(
                {("api", "news_feed_allow_public_airflow_feeds"): "False"},
                "custom",
                {"enabled": True},
                200,
                id="enabling_custom_source",
            ),
        ],
    )
    def test_updating_a_source_follows_the_settings(
        self, test_client, session, settings, target, payload, expected_status
    ):
        sources = {
            "public": NewsSource(
                url="https://airflow.apache.org/blog/index.xml", label="Apache Airflow blog", enabled=False
            ),
            "custom": NewsSource(
                url="https://status.example.com/feed.xml", label="Status page", enabled=False
            ),
        }
        session.add_all(sources.values())
        session.commit()
        source_id = sources[target].id

        with conf_vars(settings):
            response = test_client.patch(f"/newsSources/{source_id}", json=payload)

        assert response.status_code == expected_status
        session.expire_all()
        stored = session.get(NewsSource, source_id)
        if expected_status == 403:
            assert "news_feed_allow" in response.json()["detail"]
            assert stored.enabled is False
            assert stored.label == sources[target].label
        else:
            assert stored.enabled is payload.get("enabled", False)


class TestGetNewsItem(TestNewsFeedEndpoint):
    @time_machine.travel(NOW, tick=False)
    def test_should_respond_200(self, test_client):
        ids = _create_news_items()
        response = test_client.get(f"/newsItems/{ids['expired']}")
        assert response.status_code == 200
        assert response.json()["title"] == "Expired"

    def test_should_respond_404(self, test_client):
        response = test_client.get(f"/newsItems/{UNKNOWN_ID}")
        assert response.status_code == 404
        assert response.json()["detail"] == f"The News Item with id: `{UNKNOWN_ID}` was not found"

    def test_should_respond_401(self, unauthenticated_test_client):
        response = unauthenticated_test_client.get(f"/newsItems/{UNKNOWN_ID}")
        assert response.status_code == 401


class TestPostNewsItem(TestNewsFeedEndpoint):
    @time_machine.travel(NOW, tick=False)
    def test_should_respond_201(self, test_client, session):
        response = test_client.post(
            "/newsItems",
            json={
                "title": "Maintenance window",
                "author": " Platform team ",
                "body": "The scheduler restarts at 22:00 UTC.",
                "url": "https://example.com/maintenance",
                "expires_at": (NOW + timedelta(days=7)).isoformat(),
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["title"] == "Maintenance window"
        assert body["author"] == "Platform team"
        assert body["priority"] == "P2"
        assert body["body"] == "The scheduler restarts at 22:00 UTC."
        assert body["url"] == "https://example.com/maintenance"
        assert body["created_by"] == "test"
        assert timezone.parse(body["published_at"]) == NOW
        assert timezone.parse(body["expires_at"]) == NOW + timedelta(days=7)
        stored = session.scalar(select(NewsItem).where(NewsItem.id == UUID(body["id"])))
        assert stored.title == "Maintenance window"
        check_last_log(session, dag_id=None, event="post_news_item", logical_date=None)

    @time_machine.travel(NOW, tick=False)
    def test_published_at_and_expiry_can_be_set(self, test_client):
        response = test_client.post(
            "/newsItems",
            json={
                "title": "Scheduled",
                "published_at": (NOW + timedelta(days=1)).isoformat(),
                "expires_at": (NOW + timedelta(days=2)).isoformat(),
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert timezone.parse(body["published_at"]) == NOW + timedelta(days=1)
        assert timezone.parse(body["expires_at"]) == NOW + timedelta(days=2)

    @pytest.mark.parametrize(
        "payload",
        [
            pytest.param({"title": ""}, id="empty_title"),
            pytest.param({"title": "x" * 251}, id="title_too_long"),
            pytest.param({"title": "Title", "author": " "}, id="blank_author"),
            pytest.param({"title": "Title", "author": "x" * 251}, id="author_too_long"),
            pytest.param({"title": "Title", "priority": "P3"}, id="unknown_priority"),
            pytest.param({"title": "Title", "url": "ftp://example.com/feed"}, id="url_scheme"),
            pytest.param({"title": "Title", "url": "example.com"}, id="url_without_scheme"),
            pytest.param({"title": "Title", "published_at": "2026-10-14T12:00:00"}, id="naive_datetime"),
            pytest.param({"title": "Title", "unknown": 1}, id="extra_field"),
        ],
    )
    def test_should_respond_422(self, test_client, payload):
        response = test_client.post("/newsItems", json=payload)
        assert response.status_code == 422

    @time_machine.travel(NOW, tick=False)
    def test_expiry_before_publication_responds_400(self, test_client):
        response = test_client.post(
            "/newsItems",
            json={"title": "Title", "expires_at": (NOW - timedelta(hours=1)).isoformat()},
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "expires_at must be after published_at"

    def test_should_respond_401(self, unauthenticated_test_client):
        response = unauthenticated_test_client.post("/newsItems", json={"title": "Title"})
        assert response.status_code == 401

    def test_should_respond_403(self, unauthorized_test_client):
        response = unauthorized_test_client.post("/newsItems", json={"title": "Title"})
        assert response.status_code == 403


class TestPatchNewsItem(TestNewsFeedEndpoint):
    @time_machine.travel(NOW, tick=False)
    def test_update_mask_limits_the_change(self, test_client, session):
        ids = _create_news_items()
        response = test_client.patch(
            f"/newsItems/{ids['active']}",
            params={"update_mask": ["title"]},
            json={"title": "Renamed", "body": "ignored"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["title"] == "Renamed"
        assert body["body"] == "**Tonight** at 22:00 UTC"
        check_last_log(session, dag_id=None, event="patch_news_item", logical_date=None)

    @time_machine.travel(NOW, tick=False)
    def test_priority_can_be_raised_but_not_nulled(self, test_client):
        ids = _create_news_items()
        response = test_client.patch(f"/newsItems/{ids['active']}", json={"priority": "P0"})
        assert response.status_code == 200
        assert response.json()["priority"] == "P0"
        response = test_client.patch(f"/newsItems/{ids['active']}", json={"priority": None})
        assert response.status_code == 422

    def test_null_author_clears_it(self, test_client):
        ids = _create_news_items()
        response = test_client.patch(f"/newsItems/{ids['active']}", json={"author": None})
        assert response.status_code == 200
        assert response.json()["author"] is None

    def test_null_expiry_makes_the_item_indefinite(self, test_client, session):
        ids = _create_news_items()
        response = test_client.patch(f"/newsItems/{ids['active']}", json={"expires_at": None})
        assert response.status_code == 200
        assert response.json()["expires_at"] is None
        assert session.scalar(select(NewsItem.expires_at).where(NewsItem.id == ids["active"])) is None

    @time_machine.travel(NOW, tick=False)
    def test_null_title_responds_422(self, test_client):
        ids = _create_news_items()
        response = test_client.patch(f"/newsItems/{ids['active']}", json={"title": None})
        assert response.status_code == 422

    @time_machine.travel(NOW, tick=False)
    def test_expiry_before_publication_responds_400(self, test_client):
        ids = _create_news_items()
        response = test_client.patch(
            f"/newsItems/{ids['active']}", json={"expires_at": (NOW - timedelta(days=2)).isoformat()}
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "expires_at must be after published_at"

    def test_should_respond_404(self, test_client):
        response = test_client.patch(f"/newsItems/{UNKNOWN_ID}", json={"title": "Title"})
        assert response.status_code == 404

    def test_should_respond_401(self, unauthenticated_test_client):
        response = unauthenticated_test_client.patch(f"/newsItems/{UNKNOWN_ID}", json={"title": "Title"})
        assert response.status_code == 401

    def test_should_respond_403(self, unauthorized_test_client):
        response = unauthorized_test_client.patch(f"/newsItems/{UNKNOWN_ID}", json={"title": "Title"})
        assert response.status_code == 403


class TestDeleteNewsItem(TestNewsFeedEndpoint):
    @time_machine.travel(NOW, tick=False)
    def test_should_respond_204(self, test_client, session):
        ids = _create_news_items()
        response = test_client.delete(f"/newsItems/{ids['active']}")
        assert response.status_code == 204
        assert session.scalar(select(NewsItem).where(NewsItem.id == ids["active"])) is None
        assert session.scalar(select(NewsItem).where(NewsItem.id == ids["expired"])) is not None
        check_last_log(session, dag_id=None, event="delete_news_item", logical_date=None)

    def test_should_respond_404(self, test_client):
        response = test_client.delete(f"/newsItems/{UNKNOWN_ID}")
        assert response.status_code == 404

    def test_should_respond_401(self, unauthenticated_test_client):
        response = unauthenticated_test_client.delete(f"/newsItems/{UNKNOWN_ID}")
        assert response.status_code == 401

    def test_should_respond_403(self, unauthorized_test_client):
        response = unauthorized_test_client.delete(f"/newsItems/{UNKNOWN_ID}")
        assert response.status_code == 403


class TestGetNewsSources(TestNewsFeedEndpoint):
    def test_should_respond_200(self, test_client):
        _create_news_sources()
        response = test_client.get("/newsSources")
        assert response.status_code == 200
        body = response.json()
        assert body["total_entries"] == 2
        assert [source["label"] for source in body["news_sources"]] == ["Apache Airflow", "Internal mirror"]
        apache = body["news_sources"][0]
        assert apache["url"] == "https://airflow.apache.org/blog/index.xml"
        assert apache["enabled"] is True
        assert apache["ttl_days"] == 30

    def test_order_by_enabled(self, test_client):
        _create_news_sources()
        response = test_client.get("/newsSources", params={"order_by": "-enabled"})
        assert response.status_code == 200
        assert [source["label"] for source in response.json()["news_sources"]] == [
            "Apache Airflow",
            "Internal mirror",
        ]

    def test_should_respond_401(self, unauthenticated_test_client):
        response = unauthenticated_test_client.get("/newsSources")
        assert response.status_code == 401

    def test_reading_needs_only_authentication(self, unauthorized_test_client):
        """Every user's browser fetches the enabled sources, so listing them needs no role."""
        response = unauthorized_test_client.get("/newsSources")
        assert response.status_code == 200


class TestPostNewsSource(TestNewsFeedEndpoint):
    def test_should_respond_201_with_defaults(self, test_client, session):
        response = test_client.post(
            "/newsSources",
            json={"url": "https://airflow.apache.org/blog/index.xml", "label": "Apache Airflow"},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["url"] == "https://airflow.apache.org/blog/index.xml"
        assert body["label"] == "Apache Airflow"
        assert body["enabled"] is False
        assert body["ttl_days"] == 30
        assert body["sync_interval_minutes"] == 60
        assert body["max_entries"] == 10
        assert body["created_by"] == "test"
        assert session.scalar(select(NewsSource).where(NewsSource.id == UUID(body["id"]))) is not None
        check_last_log(session, dag_id=None, event="post_news_source", logical_date=None)

    def test_null_ttl_keeps_every_entry(self, test_client):
        response = test_client.post(
            "/newsSources", json={"url": "https://example.com/feed.xml", "label": "Mirror", "ttl_days": None}
        )
        assert response.status_code == 201
        assert response.json()["ttl_days"] is None

    def test_duplicate_url_responds_409(self, test_client):
        _create_news_sources()
        response = test_client.post(
            "/newsSources", json={"url": "https://airflow.apache.org/blog/index.xml", "label": "Again"}
        )
        assert response.status_code == 409

    @pytest.mark.parametrize(
        "payload",
        [
            pytest.param({"url": "ftp://example.com/feed.xml", "label": "Mirror"}, id="url_scheme"),
            pytest.param({"url": "https://example.com/feed.xml", "label": ""}, id="empty_label"),
            pytest.param(
                {"url": "https://example.com/feed.xml", "label": "Mirror", "ttl_days": 0}, id="ttl_zero"
            ),
            pytest.param({"label": "Mirror"}, id="missing_url"),
            pytest.param(
                {"url": "https://example.com/feed.xml", "label": "Mirror", "sync_interval_minutes": 4},
                id="sync_interval_below_floor",
            ),
            pytest.param(
                {"url": "https://example.com/feed.xml", "label": "Mirror", "max_entries": 0},
                id="max_entries_zero",
            ),
            pytest.param(
                {"url": "https://example.com/feed.xml", "label": "Mirror", "max_entries": 101},
                id="max_entries_above_ceiling",
            ),
        ],
    )
    def test_should_respond_422(self, test_client, payload):
        response = test_client.post("/newsSources", json=payload)
        assert response.status_code == 422

    def test_should_respond_401(self, unauthenticated_test_client):
        response = unauthenticated_test_client.post(
            "/newsSources", json={"url": "https://example.com/feed.xml", "label": "Mirror"}
        )
        assert response.status_code == 401

    def test_should_respond_403(self, unauthorized_test_client):
        response = unauthorized_test_client.post(
            "/newsSources", json={"url": "https://example.com/feed.xml", "label": "Mirror"}
        )
        assert response.status_code == 403


class TestPatchNewsSource(TestNewsFeedEndpoint):
    def test_enable_and_change_ttl(self, test_client, session):
        ids = _create_news_sources()
        response = test_client.patch(f"/newsSources/{ids['mirror']}", json={"enabled": True, "ttl_days": 7})
        assert response.status_code == 200
        body = response.json()
        assert body["enabled"] is True
        assert body["ttl_days"] == 7
        assert body["label"] == "Internal mirror"
        check_last_log(session, dag_id=None, event="patch_news_source", logical_date=None)

    @pytest.mark.parametrize(
        ("payload", "expect_reset"),
        [
            pytest.param({"url": "https://mirror.internal/other.xml"}, True, id="new_url_resets"),
            pytest.param({"label": "Renamed"}, False, id="other_change_keeps"),
        ],
    )
    def test_url_change_resets_sync_state_and_stored_entries(
        self, test_client, session, payload, expect_reset
    ):
        ids = _create_news_sources()
        source = session.get(NewsSource, ids["apache"])
        source.last_fetched_at = NOW
        source.last_fetch_error = "HTTP 503"
        session.add(NewsItem(title="Fetched", source_id=source.id, external_id="e-1", published_at=NOW))
        session.commit()

        response = test_client.patch(f"/newsSources/{ids['apache']}", json=payload)

        assert response.status_code == 200
        body = response.json()
        stored = session.scalars(select(NewsItem).where(NewsItem.source_id == ids["apache"])).all()
        if expect_reset:
            assert body["last_fetch_error"] is None
            assert body["last_fetched_at"] is None
            assert stored == []
        else:
            assert body["last_fetch_error"] == "HTTP 503"
            assert len(stored) == 1

    @pytest.mark.parametrize(
        ("payload", "expected_status"),
        [
            pytest.param({"sync_interval_minutes": 15}, 200, id="change"),
            pytest.param({"sync_interval_minutes": None}, 422, id="null"),
            pytest.param({"sync_interval_minutes": 1}, 422, id="below_floor"),
        ],
    )
    def test_sync_interval(self, test_client, payload, expected_status):
        ids = _create_news_sources()
        response = test_client.patch(f"/newsSources/{ids['apache']}", json=payload)
        assert response.status_code == expected_status
        if expected_status == 200:
            assert response.json()["sync_interval_minutes"] == 15

    @pytest.mark.parametrize(
        ("max_entries", "expected_titles"),
        [
            pytest.param(2, ["Newest", "Middle"], id="lowering_trims_the_oldest"),
            pytest.param(25, ["Newest", "Middle", "Oldest"], id="raising_keeps_everything"),
        ],
    )
    def test_max_entries_change(self, test_client, session, max_entries, expected_titles):
        ids = _create_news_sources()
        for title, hours_ago in (("Oldest", 3), ("Middle", 2), ("Newest", 1)):
            session.add(
                NewsItem(
                    title=title,
                    source_id=ids["apache"],
                    external_id=title,
                    published_at=NOW - timedelta(hours=hours_ago),
                )
            )
        session.commit()

        response = test_client.patch(f"/newsSources/{ids['apache']}", json={"max_entries": max_entries})

        assert response.status_code == 200
        assert response.json()["max_entries"] == max_entries
        stored = session.scalars(
            select(NewsItem.title)
            .where(NewsItem.source_id == ids["apache"])
            .order_by(NewsItem.published_at.desc())
        ).all()
        assert stored == expected_titles

    def test_null_max_entries_responds_422(self, test_client):
        ids = _create_news_sources()
        response = test_client.patch(f"/newsSources/{ids['apache']}", json={"max_entries": None})
        assert response.status_code == 422

    def test_null_ttl_keeps_every_entry(self, test_client, session):
        ids = _create_news_sources()
        response = test_client.patch(f"/newsSources/{ids['apache']}", json={"ttl_days": None})
        assert response.status_code == 200
        assert response.json()["ttl_days"] is None
        assert session.scalar(select(NewsSource.ttl_days).where(NewsSource.id == ids["apache"])) is None

    def test_update_mask_limits_the_change(self, test_client):
        ids = _create_news_sources()
        response = test_client.patch(
            f"/newsSources/{ids['mirror']}",
            params={"update_mask": ["label"]},
            json={"label": "Renamed", "enabled": True},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["label"] == "Renamed"
        assert body["enabled"] is False

    def test_null_enabled_responds_422(self, test_client):
        ids = _create_news_sources()
        response = test_client.patch(f"/newsSources/{ids['mirror']}", json={"enabled": None})
        assert response.status_code == 422

    def test_duplicate_url_responds_409(self, test_client):
        ids = _create_news_sources()
        response = test_client.patch(
            f"/newsSources/{ids['mirror']}", json={"url": "https://airflow.apache.org/blog/index.xml"}
        )
        assert response.status_code == 409

    def test_should_respond_404(self, test_client):
        response = test_client.patch(f"/newsSources/{UNKNOWN_ID}", json={"enabled": True})
        assert response.status_code == 404

    def test_should_respond_401(self, unauthenticated_test_client):
        response = unauthenticated_test_client.patch(f"/newsSources/{UNKNOWN_ID}", json={"enabled": True})
        assert response.status_code == 401

    def test_should_respond_403(self, unauthorized_test_client):
        response = unauthorized_test_client.patch(f"/newsSources/{UNKNOWN_ID}", json={"enabled": True})
        assert response.status_code == 403


class TestDeleteNewsSource(TestNewsFeedEndpoint):
    def test_should_respond_204(self, test_client, session):
        ids = _create_news_sources()
        response = test_client.delete(f"/newsSources/{ids['apache']}")
        assert response.status_code == 204
        assert session.scalar(select(NewsSource).where(NewsSource.id == ids["apache"])) is None
        assert session.scalar(select(NewsSource).where(NewsSource.id == ids["mirror"])) is not None
        check_last_log(session, dag_id=None, event="delete_news_source", logical_date=None)

    def test_should_respond_404(self, test_client):
        response = test_client.delete(f"/newsSources/{UNKNOWN_ID}")
        assert response.status_code == 404

    def test_should_respond_401(self, unauthenticated_test_client):
        response = unauthenticated_test_client.delete(f"/newsSources/{UNKNOWN_ID}")
        assert response.status_code == 401

    def test_should_respond_403(self, unauthorized_test_client):
        response = unauthorized_test_client.delete(f"/newsSources/{UNKNOWN_ID}")
        assert response.status_code == 403
