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
import { describe, expect, it } from "vitest";

import {
  computeExpiresAt,
  computeMaxEntries,
  computeSyncIntervalMinutes,
  computeTtlDays,
  isValidMaxEntries,
  matchExpiryPreset,
  matchMaxEntriesPreset,
  matchSyncIntervalPreset,
  matchTtlPreset,
} from "./presets";

const PUBLISHED_AT = "2026-10-14T12:00:00.000Z";

describe("computeExpiresAt", () => {
  it.each([
    ["1d", "2026-10-15T12:00:00.000Z"],
    ["7d", "2026-10-21T12:00:00.000Z"],
  ] as const)("adds the preset days for %s", (preset, expected) => {
    expect(computeExpiresAt(PUBLISHED_AT, preset, "")).toBe(expected);
  });

  it("returns no expiry for indefinite", () => {
    expect(computeExpiresAt(PUBLISHED_AT, "indefinite", "2026-12-01T00:00:00.000Z")).toBeUndefined();
  });

  it.each([
    ["2026-12-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z"],
    ["", undefined],
  ])("passes the custom date %s through", (customDate, expected) => {
    expect(computeExpiresAt(PUBLISHED_AT, "custom", customDate)).toBe(expected);
  });
});

describe("matchExpiryPreset", () => {
  it.each(["1d", "7d", "indefinite"] as const)("round-trips the %s preset", (preset) => {
    expect(matchExpiryPreset(PUBLISHED_AT, computeExpiresAt(PUBLISHED_AT, preset, ""))).toBe(preset);
  });

  it.each([null, undefined, ""])("treats %s as indefinite", (expiresAt) => {
    expect(matchExpiryPreset(PUBLISHED_AT, expiresAt)).toBe("indefinite");
  });

  it("falls back to custom for any other expiry", () => {
    expect(matchExpiryPreset(PUBLISHED_AT, "2026-10-16T15:30:00.000Z")).toBe("custom");
  });
});

describe("source TTL presets", () => {
  it.each([
    ["1", 1],
    ["7", 7],
    ["30", 30],
  ] as const)("computes %s days", (preset, days) => {
    expect(computeTtlDays(preset, 99)).toBe(days);
    expect(matchTtlPreset(days)).toBe(preset);
  });

  it("maps indefinite to null and back", () => {
    expect(computeTtlDays("indefinite", 99)).toBeNull();
    expect(matchTtlPreset(null)).toBe("indefinite");
    expect(matchTtlPreset(undefined)).toBe("indefinite");
  });

  it("uses the custom day count and matches other counts to custom", () => {
    expect(computeTtlDays("custom", 45)).toBe(45);
    expect(matchTtlPreset(45)).toBe("custom");
  });
});

describe("sync interval presets", () => {
  it.each([
    { customMinutes: 90, minutes: 5, preset: "5" as const },
    { customMinutes: 90, minutes: 15, preset: "15" as const },
    { customMinutes: 90, minutes: 60, preset: "60" as const },
    { customMinutes: 90, minutes: 90, preset: "custom" as const },
  ])("maps $minutes minutes to the $preset preset and back", ({ customMinutes, minutes, preset }) => {
    expect(matchSyncIntervalPreset(minutes)).toBe(preset);
    expect(computeSyncIntervalMinutes(preset, customMinutes)).toBe(minutes);
  });
});

describe("max entries presets", () => {
  it.each([
    { customEntries: 7, entries: 5, preset: "5" as const },
    { customEntries: 7, entries: 10, preset: "10" as const },
    { customEntries: 7, entries: 25, preset: "25" as const },
    { customEntries: 7, entries: 50, preset: "50" as const },
    { customEntries: 7, entries: 7, preset: "custom" as const },
  ])("maps $entries entries to the $preset preset and back", ({ customEntries, entries, preset }) => {
    expect(matchMaxEntriesPreset(entries)).toBe(preset);
    expect(computeMaxEntries(preset, customEntries)).toBe(entries);
  });

  it.each([
    { entries: 0, valid: false },
    { entries: 1, valid: true },
    { entries: 100, valid: true },
    { entries: 101, valid: false },
    { entries: 2.5, valid: false },
  ])("treats $entries custom entries as valid: $valid", ({ entries, valid }) => {
    expect(isValidMaxEntries(entries)).toBe(valid);
  });
});
