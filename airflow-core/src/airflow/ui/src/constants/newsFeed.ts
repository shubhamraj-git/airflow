/*!
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import type { NewsItemPriority } from "openapi/requests/types.gen";

export type BuiltInNewsSourceKey = "announcements" | "blog";

export type BuiltInNewsSource = {
  readonly key: BuiltInNewsSourceKey;
  /** Stored as the source's label when an administrator enables it; shown to every user. */
  readonly label: string;
  /** Earlier official URLs; a row still carrying one is this feed and gets the current URL on edit. */
  readonly legacyUrls?: ReadonlyArray<string>;
  /** The official feed; an administrator may store an internal mirror instead. */
  readonly url: string;
};

// The public Apache Airflow feeds offered on the admin page. They are ordinary rows in the
// news_source table once enabled, recognised by their label (the URL may point at a mirror).
export const BUILT_IN_NEWS_SOURCES: ReadonlyArray<BuiltInNewsSource> = [
  // The announcements live on one page of dated sections; its section feed carries no items.
  {
    key: "announcements",
    label: "Apache Airflow announcements",
    legacyUrls: ["https://airflow.apache.org/announcements/index.xml"],
    url: "https://airflow.apache.org/announcements/",
  },
  { key: "blog", label: "Apache Airflow blog", url: "https://airflow.apache.org/blog/index.xml" },
];

type SourceLike = { readonly label: string; readonly url: string };

const belongsTo = (row: SourceLike, source: BuiltInNewsSource): boolean =>
  row.label === source.label || row.url === source.url || (source.legacyUrls?.includes(row.url) ?? false);

export const findBuiltInRow = <T extends SourceLike>(
  rows: Array<T>,
  source: BuiltInNewsSource,
): T | undefined => rows.find((row) => belongsTo(row, source));

export const isBuiltInNewsSourceRow = (row: SourceLike): boolean =>
  BUILT_IN_NEWS_SOURCES.some((source) => belongsTo(row, source));

/** The URL to show for a feed: the stored one, unless it is an outdated official URL. */
export const currentBuiltInUrl = (source: BuiltInNewsSource, row: SourceLike | undefined): string =>
  row === undefined || (source.legacyUrls?.includes(row.url) ?? false) ? source.url : row.url;

// Capacity of the home page News section: internal items fill it first, remote entries get
// whatever is left up to their own cap.
export const MAX_NEWS_ENTRIES = 20;

/** The home page limit from the `news_feed_max_entries` setting; anything but a positive integer falls back to the default. */
export const resolveMaxNewsEntries = (configuredMax: unknown): number =>
  typeof configuredMax === "number" && Number.isInteger(configuredMax) && configuredMax >= 1
    ? configuredMax
    : MAX_NEWS_ENTRIES;
export const NEWS_PREVIEW_COUNT = 5;

export const DEFAULT_SOURCE_TTL_DAYS = 30;
export const DEFAULT_SYNC_INTERVAL_MINUTES = 60;
export const DEFAULT_MAX_ENTRIES_PER_SOURCE = 10;
/** Mirrors the API ceiling: the sync never stores more entries of one source. */
export const MAX_STORED_ENTRIES_PER_SOURCE = 100;
/** Mirrors the API floor, so that a deployment cannot poll a feed host aggressively. */
export const MIN_SYNC_INTERVAL_MINUTES = 5;

/** Shown as the sender of every entry of the public Apache Airflow feeds. */
export const PUBLIC_FEEDS_AUTHOR = "Apache Airflow";

export const NEWS_ITEM_PRIORITIES: ReadonlyArray<NewsItemPriority> = ["P0", "P1", "P2"];
export const DEFAULT_NEWS_ITEM_PRIORITY: NewsItemPriority = "P2";
/** Colour palette of a priority: critical reads as an error, important as a warning, normal stays neutral. */
export const NEWS_ITEM_PRIORITY_COLORS: Record<NewsItemPriority, string | undefined> = {
  P0: "red",
  P1: "orange",
  P2: undefined,
};

/** The sender shown for a stored source: the public feeds read "Apache Airflow", others their label. */
export const resolveSourceLabel = (source: SourceLike): string =>
  isBuiltInNewsSourceRow(source) ? PUBLIC_FEEDS_AUTHOR : source.label;
