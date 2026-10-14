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
import type { NewsSourceBody, NewsSourcePatchBody, NewsSourceResponse } from "openapi/requests/types.gen";

import {
  BUILT_IN_NEWS_SOURCES,
  DEFAULT_MAX_ENTRIES_PER_SOURCE,
  DEFAULT_SOURCE_TTL_DAYS,
  DEFAULT_SYNC_INTERVAL_MINUTES,
} from "src/constants/newsFeed";

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

export type RemoteSourceFormValues = {
  customMaxEntries: number;
  customSyncMinutes: number;
  customTtlDays: number;
  enabled: boolean;
  label: string;
  maxEntriesPreset: MaxEntriesPreset;
  /** The stored row; absent for a source added in the dialog. */
  rowId?: string;
  syncPreset: SyncIntervalPreset;
  ttlPreset: SourceTtlPreset;
  url: string;
};

export type RemoteSourcesFormValues = { sources: Array<RemoteSourceFormValues> };

export type RemoteSourcePatch = { id: string; requestBody: NewsSourcePatchBody; updateMask: Array<string> };

export type RemoteSourceChanges = {
  creates: Array<NewsSourceBody>;
  deletes: Array<string>;
  patches: Array<RemoteSourcePatch>;
};

/** URLs that belong to the public Apache Airflow feeds, managed by their own control. */
export const BUILT_IN_URLS: ReadonlySet<string> = new Set(
  BUILT_IN_NEWS_SOURCES.flatMap((source) => [source.url, ...(source.legacyUrls ?? [])]),
);

export const toRemoteSourceValues = (row: NewsSourceResponse): RemoteSourceFormValues => {
  const ttlPreset = matchTtlPreset(row.ttl_days);
  const syncPreset = matchSyncIntervalPreset(row.sync_interval_minutes);
  const maxEntriesPreset = matchMaxEntriesPreset(row.max_entries);

  return {
    customMaxEntries: maxEntriesPreset === "custom" ? row.max_entries : DEFAULT_MAX_ENTRIES_PER_SOURCE,
    customSyncMinutes: syncPreset === "custom" ? row.sync_interval_minutes : DEFAULT_SYNC_INTERVAL_MINUTES,
    customTtlDays:
      ttlPreset === "custom" ? (row.ttl_days ?? DEFAULT_SOURCE_TTL_DAYS) : DEFAULT_SOURCE_TTL_DAYS,
    enabled: row.enabled,
    label: row.label,
    maxEntriesPreset,
    rowId: row.id,
    syncPreset,
    ttlPreset,
    url: row.url,
  };
};

export const buildRemoteSourceValues = (rows: Array<NewsSourceResponse>): RemoteSourcesFormValues => ({
  sources: rows.map((row) => toRemoteSourceValues(row)),
});

/** A source added in the dialog starts enabled, with the default TTL, sync interval and maximum. */
export const newRemoteSourceValues = (): RemoteSourceFormValues => ({
  customMaxEntries: DEFAULT_MAX_ENTRIES_PER_SOURCE,
  customSyncMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
  customTtlDays: DEFAULT_SOURCE_TTL_DAYS,
  enabled: true,
  label: "",
  maxEntriesPreset: "10",
  syncPreset: "60",
  ttlPreset: "30",
  url: "",
});

export const isAnyRemoteSourceEnabled = (values: RemoteSourcesFormValues): boolean =>
  values.sources.some((source) => source.enabled);

/** Turn the form into the creates, patches and deletes that bring the stored rows in line with it. */
export const toRemoteSourceChanges = (
  values: RemoteSourcesFormValues,
  rows: Array<NewsSourceResponse>,
): RemoteSourceChanges => {
  const keptIds = new Set(values.sources.map((source) => source.rowId));
  const changes: RemoteSourceChanges = {
    creates: [],
    deletes: rows.filter((row) => !keptIds.has(row.id)).map((row) => row.id),
    patches: [],
  };

  for (const source of values.sources) {
    const label = source.label.trim();
    const url = source.url.trim();
    const ttlDays = computeTtlDays(source.ttlPreset, source.customTtlDays);
    const syncIntervalMinutes = computeSyncIntervalMinutes(source.syncPreset, source.customSyncMinutes);
    const maxEntries = computeMaxEntries(source.maxEntriesPreset, source.customMaxEntries);
    const row = rows.find((candidate) => candidate.id === source.rowId);

    if (row === undefined) {
      changes.creates.push({
        enabled: source.enabled,
        label,
        max_entries: maxEntries,
        sync_interval_minutes: syncIntervalMinutes,
        ttl_days: ttlDays,
        url,
      });
    } else {
      const requestBody: NewsSourcePatchBody = {};
      const updateMask: Array<string> = [];

      if (row.label !== label) {
        requestBody.label = label;
        updateMask.push("label");
      }
      if (row.url !== url) {
        requestBody.url = url;
        updateMask.push("url");
      }
      if (row.enabled !== source.enabled) {
        requestBody.enabled = source.enabled;
        updateMask.push("enabled");
      }
      if (row.max_entries !== maxEntries) {
        requestBody.max_entries = maxEntries;
        updateMask.push("max_entries");
      }
      if (row.sync_interval_minutes !== syncIntervalMinutes) {
        requestBody.sync_interval_minutes = syncIntervalMinutes;
        updateMask.push("sync_interval_minutes");
      }
      if (row.ttl_days !== ttlDays) {
        requestBody.ttl_days = ttlDays;
        updateMask.push("ttl_days");
      }
      if (updateMask.length > 0) {
        changes.patches.push({ id: row.id, requestBody, updateMask });
      }
    }
  }

  return changes;
};

export const hasRemoteSourceChanges = (changes: RemoteSourceChanges): boolean =>
  changes.creates.length > 0 || changes.deletes.length > 0 || changes.patches.length > 0;
