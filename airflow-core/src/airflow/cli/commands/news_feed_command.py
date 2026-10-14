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
"""News feed commands."""

from __future__ import annotations

from airflow._shared.timezones import timezone
from airflow.news_feed.sync import is_due, select_sources_to_sync, sync_news_sources
from airflow.utils import cli as cli_utils
from airflow.utils.providers_configuration_loader import providers_configuration_loaded
from airflow.utils.session import create_session


@cli_utils.action_cli
@providers_configuration_loaded
def news_feed_sync(args):
    """
    Fetch the enabled remote news sources that are due and store their entries for the home page.

    A source is due once its sync interval has passed since its last fetch; ``--force`` and
    ``--source-id`` fetch the selected sources regardless.
    """
    now = timezone.utcnow()
    with create_session() as session:
        sources = select_sources_to_sync(session, source_ids=args.source_id)
        if not sources:
            print("No enabled remote news source to sync; check the news feed settings and the sources.")
            return
        if not (args.force or args.source_id):
            sources = [source for source in sources if is_due(source, now)]
            if not sources:
                print("No news source is due for a sync.")
                return
        results = sync_news_sources(session=session, sources=sources, now=now)
    failed = [result for result in results if result.error is not None]
    for result in results:
        if result.error is None:
            print(f"{result.source.label}: {result.entries} entries")
        else:
            print(f"{result.source.label}: FAILED - {result.error}")
    if failed:
        raise SystemExit(f"{len(failed)} of {len(results)} news sources failed to sync")
