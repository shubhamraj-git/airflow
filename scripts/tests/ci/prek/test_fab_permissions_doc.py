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
"""
Tests for scripts/ci/prek/extract_permissions.py.

Test strategy:
  - Unit tests parse small synthetic code strings, never real route files.
    This makes tests fast, self-contained, and immune to unrelated route changes.
  - Integration tests call extract_all_permissions() against the real
    routes/public directory to guard against regressions when routes change.
  - No snapshot tests: we assert on invariants (no unresolved markers,
    no duplicates, count ≥ known_minimum) rather than exact string equality.

Run with (no Airflow env needed — extractor is stdlib-only):
  uv run --project scripts pytest scripts/tests/ci/prek/test_extract_permissions.py -xvs
"""

from __future__ import annotations

import ast
import sys
import textwrap
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[4]  # scripts/tests/ci/prek → repo root
PREK_DIR = REPO_ROOT / "scripts/ci/prek"

if str(PREK_DIR) not in sys.path:
    sys.path.insert(0, str(PREK_DIR))

import fab_permissions_doc  # noqa: E402
from extract_permissions import (  # noqa: E402
    AUTHENTICATED_PERMISSION,
    AUTHENTICATED_RESOURCE,
    PermissionEntry,
)
from fab_permissions_doc import (  # noqa: E402
    AUTHENTICATED_ONLY,
    _entity_maps,
    _map_key_member,
    fab_permissions_for,
    minimum_role,
)


def parse_expr(code: str) -> ast.expr:
    return ast.parse(code, mode="eval").body


class TestMapKeyMember:
    @pytest.mark.parametrize(
        ("code", "expected"),
        [
            ("AccessView.PLUGINS", "PLUGINS"),
            ("DagAccessEntity.HITL_DETAIL", "HITL_DETAIL"),
            ("NEWS_FEED_MANAGE_ACCESS_VIEW", "NEWS_FEED_MANAGE"),
            ('"literal"', None),
        ],
    )
    def test_member_name(self, code, expected):
        assert _map_key_member(parse_expr(code)) == expected


class TestEntityMaps:
    def test_reads_guarded_assignments_as_well_as_the_dict_literals(self, tmp_path, monkeypatch):
        """Members mapped under a version guard must be documented like the ones in the literal."""
        auth_manager = tmp_path / "fab_auth_manager.py"
        auth_manager.write_text(
            textwrap.dedent(
                """
                _MAP_DAG_ACCESS_ENTITY_TO_FAB_RESOURCE_TYPE = {DagAccessEntity.RUN: (RESOURCE_DAG_RUN,)}
                _MAP_ACCESS_VIEW_TO_FAB_RESOURCE_TYPE = {AccessView.PLUGINS: RESOURCE_PLUGIN}

                if NEWS_FEED_MANAGE_ACCESS_VIEW is not None:
                    _MAP_ACCESS_VIEW_TO_FAB_RESOURCE_TYPE[NEWS_FEED_MANAGE_ACCESS_VIEW] = RESOURCE_NEWS_FEED
                if AIRFLOW_V_3_1_PLUS:
                    _MAP_DAG_ACCESS_ENTITY_TO_FAB_RESOURCE_TYPE[DagAccessEntity.HITL_DETAIL] = (RESOURCE_HITL_DETAIL,)
                """
            )
        )
        monkeypatch.setattr(fab_permissions_doc, "AUTH_MANAGER_PY", auth_manager)

        dag_map, view_map = _entity_maps()

        assert dag_map == {"RUN": ("RESOURCE_DAG_RUN",), "HITL_DETAIL": ("RESOURCE_HITL_DETAIL",)}
        assert view_map == {"PLUGINS": "RESOURCE_PLUGIN", "NEWS_FEED_MANAGE": "RESOURCE_NEWS_FEED"}


class TestAuthenticatedOnlyRoutes:
    def test_any_signed_in_user_is_the_viewer_role(self):
        entry = PermissionEntry(
            full_path="/api/v2/newsItems",
            http_method="GET",
            tag="NewsFeed",
            resource=AUTHENTICATED_RESOURCE,
            required_permission=AUTHENTICATED_PERMISSION,
            source_file="news_feed.py",
        )

        perms = fab_permissions_for(entry)

        assert perms == [AUTHENTICATED_ONLY]
        assert minimum_role(perms) == "Viewer"
