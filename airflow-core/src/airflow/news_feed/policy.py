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
"""Which news sources the deployment settings allow; shared by the REST API and the sync command."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import or_

from airflow.configuration import conf
from airflow.models.news_feed import NewsSource

if TYPE_CHECKING:
    from sqlalchemy.sql.elements import ColumnElement

# Keep in sync with BUILT_IN_NEWS_SOURCES in airflow-core/src/airflow/ui/src/constants/newsFeed.ts. A row
# counts as a public feed by its label (so a mirror URL still counts) or by an official URL.
PUBLIC_AIRFLOW_FEED_LABELS = frozenset({"Apache Airflow announcements", "Apache Airflow blog"})
PUBLIC_AIRFLOW_FEED_URLS = frozenset(
    {
        "https://airflow.apache.org/announcements/",
        "https://airflow.apache.org/announcements/index.xml",
        "https://airflow.apache.org/blog/index.xml",
    }
)


def is_public_airflow_feed(*, label: str, url: str) -> bool:
    """Whether a source with this label and URL is one of the two public Apache Airflow feeds."""
    return label in PUBLIC_AIRFLOW_FEED_LABELS or url in PUBLIC_AIRFLOW_FEED_URLS


def build_public_airflow_feed_condition() -> ColumnElement[bool]:
    """Build the SQL condition that matches the rows of the public Apache Airflow feeds."""
    return or_(NewsSource.label.in_(PUBLIC_AIRFLOW_FEED_LABELS), NewsSource.url.in_(PUBLIC_AIRFLOW_FEED_URLS))


def is_remote_allowed() -> bool:
    """Whether ``[api] news_feed_allow_remote_sources`` allows remote sources at all."""
    return conf.getboolean("api", "news_feed_allow_remote_sources")


def is_public_feeds_allowed() -> bool:
    """Whether the public Apache Airflow feeds are allowed; never while remote sources are not."""
    return is_remote_allowed() and conf.getboolean("api", "news_feed_allow_public_airflow_feeds")


def is_source_allowed(*, label: str, url: str) -> bool:
    """Whether the deployment settings allow a source with this label and URL to be used."""
    if not is_remote_allowed():
        return False
    return is_public_feeds_allowed() or not is_public_airflow_feed(label=label, url=url)
