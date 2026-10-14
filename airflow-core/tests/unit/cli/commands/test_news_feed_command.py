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

from argparse import ArgumentParser
from datetime import timedelta
from typing import TYPE_CHECKING
from unittest import mock

import pytest
from sqlalchemy import select

from airflow._shared.timezones import timezone
from airflow.cli import cli_parser
from airflow.cli.commands import news_feed_command
from airflow.models.news_feed import NewsItem, NewsSource
from airflow.news_feed.sync import NewsFeedFetchError
from airflow.utils.session import provide_session

from tests_common.test_utils.db import clear_db_news_feed

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

pytestmark = pytest.mark.db_test

RSS = """<?xml version="1.0"?>
<rss version="2.0"><channel><title>Status</title>
  <item><title>Maintenance window</title><guid>status-1</guid><link>https://status.example.com/1</link></item>
</channel></rss>
"""


class TestNewsFeedSyncCommand:
    parser: ArgumentParser

    @classmethod
    def setup_class(cls):
        cls.parser = cli_parser.get_parser()

    def setup_method(self):
        clear_db_news_feed()

    def teardown_method(self):
        clear_db_news_feed()

    @provide_session
    def test_syncs_enabled_sources_and_reports(self, capsys, *, session: Session):
        source = NewsSource(
            url="https://status.example.com/feed.xml", label="Status", enabled=True, ttl_days=7
        )
        session.add(source)
        session.commit()

        with mock.patch("airflow.news_feed.sync.fetch_feed_text", return_value=RSS):
            news_feed_command.news_feed_sync(self.parser.parse_args(["news-feed", "sync"]))

        assert "Status: 1 entries" in capsys.readouterr().out
        session.expire_all()
        item = session.scalar(select(NewsItem).where(NewsItem.source_id == source.id))
        assert item is not None
        assert item.title == "Maintenance window"
        stored = session.get(NewsSource, source.id)
        assert stored is not None
        assert stored.last_fetch_error is None

    @provide_session
    def test_exits_with_an_error_when_a_source_fails(self, capsys, *, session: Session):
        source = NewsSource(url="https://broken.example.com/feed.xml", label="Broken", enabled=True)
        session.add(source)
        session.commit()

        with (
            mock.patch(
                "airflow.news_feed.sync.fetch_feed_text",
                side_effect=NewsFeedFetchError("HTTP 503"),
            ),
            pytest.raises(SystemExit, match="1 of 1 news sources failed"),
        ):
            news_feed_command.news_feed_sync(
                self.parser.parse_args(["news-feed", "sync", "--source-id", str(source.id)])
            )

        assert "Broken: FAILED - HTTP 503" in capsys.readouterr().out
        session.expire_all()
        stored = session.get(NewsSource, source.id)
        assert stored is not None
        assert stored.last_fetch_error == "HTTP 503"

    @pytest.mark.parametrize(
        ("extra_args", "expect_fetch"),
        [
            pytest.param([], False, id="not_due_is_skipped"),
            pytest.param(["--force"], True, id="force_fetches"),
        ],
    )
    @provide_session
    def test_skips_sources_whose_interval_has_not_passed(
        self, capsys, extra_args, expect_fetch, *, session: Session
    ):
        source = NewsSource(
            url="https://status.example.com/feed.xml",
            label="Status",
            enabled=True,
            sync_interval_minutes=60,
            last_fetched_at=timezone.utcnow() - timedelta(minutes=10),
        )
        session.add(source)
        session.commit()

        with mock.patch("airflow.news_feed.sync.fetch_feed_text", return_value=RSS) as fetch:
            news_feed_command.news_feed_sync(self.parser.parse_args(["news-feed", "sync", *extra_args]))

        assert fetch.called is expect_fetch
        output = capsys.readouterr().out
        assert ("Status: 1 entries" in output) is expect_fetch
        assert ("No news source is due for a sync." in output) is not expect_fetch

    def test_says_when_there_is_nothing_to_sync(self, capsys):
        news_feed_command.news_feed_sync(self.parser.parse_args(["news-feed", "sync"]))

        assert "No enabled remote news source" in capsys.readouterr().out
