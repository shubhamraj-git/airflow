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
Add news_source and news_item tables for the home page news feed.

Revision ID: b3e9f2a7c4d1
Revises: c71065a1b14f
Create Date: 2026-10-14 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from airflow.utils.sqlalchemy import UtcDateTime

# revision identifiers, used by Alembic.
revision = "b3e9f2a7c4d1"
down_revision = "c71065a1b14f"
branch_labels = None
depends_on = None
airflow_version = "3.5.0"


def upgrade():
    """Create the news_source and news_item tables."""
    op.create_table(
        "news_source",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("label", sa.String(250), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("ttl_days", sa.Integer(), nullable=True),
        sa.Column("max_entries", sa.Integer(), nullable=False),
        sa.Column("sync_interval_minutes", sa.Integer(), nullable=False),
        sa.Column("last_fetched_at", UtcDateTime(timezone=True), nullable=True),
        sa.Column("last_fetch_error", sa.String(2000), nullable=True),
        sa.Column("created_by", sa.String(250), nullable=True),
        sa.Column("created_at", UtcDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", UtcDateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("news_source_pkey")),
        sa.UniqueConstraint("url", name=op.f("news_source_url_uq")),
    )
    op.create_table(
        "news_item",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(250), nullable=False),
        sa.Column("author", sa.String(250), nullable=True),
        sa.Column("priority", sa.String(2), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("url", sa.String(2000), nullable=True),
        sa.Column("published_at", UtcDateTime(timezone=True), nullable=False),
        sa.Column("expires_at", UtcDateTime(timezone=True), nullable=True),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("external_id", sa.String(500), nullable=True),
        sa.Column("fetched_at", UtcDateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(250), nullable=True),
        sa.Column("created_at", UtcDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", UtcDateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("news_item_pkey")),
        sa.ForeignKeyConstraint(
            ["source_id"], ["news_source.id"], name=op.f("news_item_source_id_fkey"), ondelete="CASCADE"
        ),
        sa.UniqueConstraint("source_id", "external_id", name=op.f("news_item_source_external_uq")),
    )
    op.create_index(op.f("idx_news_item_published_at"), "news_item", ["published_at"])


def downgrade():
    """Drop the news_item and news_source tables."""
    op.drop_index(op.f("idx_news_item_published_at"), table_name="news_item")
    op.drop_table("news_item")
    op.drop_table("news_source")
