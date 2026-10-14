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
import type { NewsSourceResponse } from "openapi/requests/types.gen";

import {
  BUILT_IN_NEWS_SOURCES,
  currentBuiltInUrl,
  DEFAULT_MAX_ENTRIES_PER_SOURCE,
  DEFAULT_SOURCE_TTL_DAYS,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  findBuiltInRow,
  type BuiltInNewsSource,
  type BuiltInNewsSourceKey,
} from "src/constants/newsFeed";
import type { BuiltInNewsSourceChange } from "src/queries/useApplyBuiltInNewsSources";

import {
  computeMaxEntries,
  computeSyncIntervalMinutes,
  computeTtlDays,
  matchMaxEntriesPreset,
  matchSyncIntervalPreset,
  matchTtlPreset,
  type MaxEntriesPreset,
  type SourceTtlPreset,
  type SyncIntervalPreset,
} from "./presets";

export const HTTP_URL_PATTERN = /^https?:\/\//iu;

export type FeedFormValues = {
  customMaxEntries: number;
  customSyncMinutes: number;
  customTtlDays: number;
  enabled: boolean;
  maxEntriesPreset: MaxEntriesPreset;
  syncPreset: SyncIntervalPreset;
  ttlPreset: SourceTtlPreset;
  url: string;
};

export type PublicFeedsFormValues = Record<BuiltInNewsSourceKey, FeedFormValues>;

const toFormValues = (source: BuiltInNewsSource, rows: Array<NewsSourceResponse>): FeedFormValues => {
  const row = findBuiltInRow(rows, source);
  const ttlDays = row === undefined ? DEFAULT_SOURCE_TTL_DAYS : row.ttl_days;
  const ttlPreset = matchTtlPreset(ttlDays);
  const syncMinutes = row?.sync_interval_minutes ?? DEFAULT_SYNC_INTERVAL_MINUTES;
  const syncPreset = matchSyncIntervalPreset(syncMinutes);
  const maxEntries = row?.max_entries ?? DEFAULT_MAX_ENTRIES_PER_SOURCE;
  const maxEntriesPreset = matchMaxEntriesPreset(maxEntries);

  return {
    customMaxEntries: maxEntriesPreset === "custom" ? maxEntries : DEFAULT_MAX_ENTRIES_PER_SOURCE,
    customSyncMinutes: syncPreset === "custom" ? syncMinutes : DEFAULT_SYNC_INTERVAL_MINUTES,
    customTtlDays: ttlPreset === "custom" ? (ttlDays ?? DEFAULT_SOURCE_TTL_DAYS) : DEFAULT_SOURCE_TTL_DAYS,
    enabled: row?.enabled ?? false,
    maxEntriesPreset,
    syncPreset,
    ttlPreset,
    url: currentBuiltInUrl(source, row),
  };
};

export const buildInitialValues = (rows: Array<NewsSourceResponse>): PublicFeedsFormValues =>
  Object.fromEntries(
    BUILT_IN_NEWS_SOURCES.map((source) => [source.key, toFormValues(source, rows)]),
  ) as PublicFeedsFormValues;

export const isAnyFeedEnabled = (values: PublicFeedsFormValues): boolean =>
  BUILT_IN_NEWS_SOURCES.some((source) => values[source.key].enabled);

/** Opened while every feed is off, the dialog proposes all of them: enabling is what the admin came for. */
export const buildDialogValues = (storedValues: PublicFeedsFormValues): PublicFeedsFormValues =>
  isAnyFeedEnabled(storedValues)
    ? storedValues
    : (Object.fromEntries(
        BUILT_IN_NEWS_SOURCES.map((source) => [source.key, { ...storedValues[source.key], enabled: true }]),
      ) as PublicFeedsFormValues);

/** Whether saving the form would change anything that is stored. */
export const hasChanges = (values: PublicFeedsFormValues, storedValues: PublicFeedsFormValues): boolean =>
  BUILT_IN_NEWS_SOURCES.some((source) => {
    const feed = values[source.key];
    const stored = storedValues[source.key];

    return (
      feed.enabled !== stored.enabled ||
      feed.url.trim() !== stored.url ||
      computeTtlDays(feed.ttlPreset, feed.customTtlDays) !==
        computeTtlDays(stored.ttlPreset, stored.customTtlDays) ||
      computeSyncIntervalMinutes(feed.syncPreset, feed.customSyncMinutes) !==
        computeSyncIntervalMinutes(stored.syncPreset, stored.customSyncMinutes) ||
      computeMaxEntries(feed.maxEntriesPreset, feed.customMaxEntries) !==
        computeMaxEntries(stored.maxEntriesPreset, stored.customMaxEntries)
    );
  });

/**
 * Turn the form into per-feed changes.
 *
 * The TTL, the sync interval and the maximum number of entries are only sent when the admin changed them; the URL always is, so a row still carrying an
 * outdated official URL is brought up to date on save (the hook skips URLs that already match).
 */
export const toChanges = (
  values: PublicFeedsFormValues,
  initialValues: PublicFeedsFormValues,
): Array<BuiltInNewsSourceChange> =>
  BUILT_IN_NEWS_SOURCES.map((source) => {
    const feed = values[source.key];
    const initialFeed = initialValues[source.key];
    const ttlDays = computeTtlDays(feed.ttlPreset, feed.customTtlDays);
    const initialTtlDays = computeTtlDays(initialFeed.ttlPreset, initialFeed.customTtlDays);
    const syncIntervalMinutes = computeSyncIntervalMinutes(feed.syncPreset, feed.customSyncMinutes);
    const initialSyncIntervalMinutes = computeSyncIntervalMinutes(
      initialFeed.syncPreset,
      initialFeed.customSyncMinutes,
    );

    const maxEntries = computeMaxEntries(feed.maxEntriesPreset, feed.customMaxEntries);
    const initialMaxEntries = computeMaxEntries(initialFeed.maxEntriesPreset, initialFeed.customMaxEntries);

    return {
      enabled: feed.enabled,
      ...(maxEntries === initialMaxEntries ? {} : { maxEntries }),
      source,
      ...(ttlDays === initialTtlDays ? {} : { ttlDays }),
      ...(syncIntervalMinutes === initialSyncIntervalMinutes ? {} : { syncIntervalMinutes }),
      url: feed.url.trim(),
    };
  });
