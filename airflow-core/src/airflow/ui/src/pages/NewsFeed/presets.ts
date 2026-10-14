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
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

import { MAX_STORED_ENTRIES_PER_SOURCE, MIN_SYNC_INTERVAL_MINUTES } from "src/constants/newsFeed";

dayjs.extend(utc);

export const ITEM_EXPIRY_PRESETS = ["1d", "7d", "indefinite", "custom"] as const;
export type ItemExpiryPreset = (typeof ITEM_EXPIRY_PRESETS)[number];

const ITEM_PRESET_DAYS = { "1d": 1, "7d": 7 } as const;

type FixedItemExpiryPreset = keyof typeof ITEM_PRESET_DAYS;

const isFixedItemPreset = (preset: ItemExpiryPreset): preset is FixedItemExpiryPreset =>
  preset in ITEM_PRESET_DAYS;

/** The expiry a news item form submits; `undefined` means the item never expires. */
export const computeExpiresAt = (
  publishedAt: string,
  preset: ItemExpiryPreset,
  customDate: string,
): string | undefined => {
  if (preset === "indefinite") {
    return undefined;
  }
  if (preset === "custom") {
    return customDate === "" ? undefined : customDate;
  }

  // UTC arithmetic: a preset is an exact number of days, not a calendar day in the user's zone.
  return dayjs.utc(publishedAt).add(ITEM_PRESET_DAYS[preset], "day").toISOString();
};

/** The preset that reproduces an existing expiry, so an edit form opens on it; `custom` otherwise. */
export const matchExpiryPreset = (
  publishedAt: string,
  expiresAt: string | null | undefined,
): ItemExpiryPreset => {
  if (expiresAt === null || expiresAt === undefined || expiresAt === "") {
    return "indefinite";
  }
  const days = dayjs.utc(expiresAt).diff(dayjs.utc(publishedAt), "day", true);
  const preset = ITEM_EXPIRY_PRESETS.find(
    (candidate) => isFixedItemPreset(candidate) && ITEM_PRESET_DAYS[candidate] === days,
  );

  return preset ?? "custom";
};

export const SOURCE_TTL_PRESETS = ["1", "7", "30", "indefinite", "custom"] as const;
export type SourceTtlPreset = (typeof SOURCE_TTL_PRESETS)[number];

export const TTL_PRESET_LABEL_KEYS: Record<SourceTtlPreset, string> = {
  "1": "newsFeed.presets.oneDay",
  "7": "newsFeed.presets.sevenDays",
  "30": "newsFeed.presets.thirtyDays",
  custom: "newsFeed.presets.custom",
  indefinite: "newsFeed.presets.indefinite",
};

/** The `ttl_days` a source form submits; `null` keeps every entry. */
export const computeTtlDays = (preset: SourceTtlPreset, customDays: number): number | null => {
  if (preset === "indefinite") {
    return null;
  }

  return preset === "custom" ? customDays : Number(preset);
};

export const matchTtlPreset = (ttlDays: number | null | undefined): SourceTtlPreset =>
  ttlDays === null || ttlDays === undefined
    ? "indefinite"
    : (SOURCE_TTL_PRESETS.find((candidate) => candidate === String(ttlDays)) ?? "custom");

export const SYNC_INTERVAL_PRESETS = ["5", "15", "60", "custom"] as const;
export type SyncIntervalPreset = (typeof SYNC_INTERVAL_PRESETS)[number];

export const SYNC_INTERVAL_LABEL_KEYS: Record<SyncIntervalPreset, string> = {
  "5": "newsFeed.presets.fiveMinutes",
  "15": "newsFeed.presets.fifteenMinutes",
  "60": "newsFeed.presets.oneHour",
  custom: "newsFeed.presets.custom",
};

/** The `sync_interval_minutes` a source form submits. */
export const computeSyncIntervalMinutes = (preset: SyncIntervalPreset, customMinutes: number): number =>
  preset === "custom" ? customMinutes : Number(preset);

export const matchSyncIntervalPreset = (minutes: number): SyncIntervalPreset =>
  SYNC_INTERVAL_PRESETS.find((candidate) => candidate === String(minutes)) ?? "custom";

export const isValidSyncMinutes = (minutes: number): boolean =>
  Number.isInteger(minutes) && minutes >= MIN_SYNC_INTERVAL_MINUTES;

export const MAX_ENTRIES_PRESETS = ["5", "10", "25", "50", "custom"] as const;
export type MaxEntriesPreset = (typeof MAX_ENTRIES_PRESETS)[number];

export const MAX_ENTRIES_LABEL_KEYS: Record<MaxEntriesPreset, string> = {
  "5": "newsFeed.presets.fiveEntries",
  "10": "newsFeed.presets.tenEntries",
  "25": "newsFeed.presets.twentyFiveEntries",
  "50": "newsFeed.presets.fiftyEntries",
  custom: "newsFeed.presets.custom",
};

/** The `max_entries` a source form submits. */
export const computeMaxEntries = (preset: MaxEntriesPreset, customEntries: number): number =>
  preset === "custom" ? customEntries : Number(preset);

export const matchMaxEntriesPreset = (entries: number): MaxEntriesPreset =>
  MAX_ENTRIES_PRESETS.find((candidate) => candidate === String(entries)) ?? "custom";

export const isValidMaxEntries = (entries: number): boolean =>
  Number.isInteger(entries) && entries >= 1 && entries <= MAX_STORED_ENTRIES_PER_SOURCE;
