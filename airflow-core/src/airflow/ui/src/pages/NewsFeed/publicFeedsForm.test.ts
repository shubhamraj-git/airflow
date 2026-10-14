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

import type { NewsSourceResponse } from "openapi/requests/types.gen";

import { BUILT_IN_NEWS_SOURCES } from "src/constants/newsFeed";

import { buildDialogValues, buildInitialValues, hasChanges, toChanges } from "./publicFeedsForm";

const [announcements, blog] = BUILT_IN_NEWS_SOURCES;

const blogRow: NewsSourceResponse = {
  created_at: "2026-10-01T00:00:00.000Z",
  created_by: "admin",
  enabled: true,
  id: "blog",
  label: "Apache Airflow blog",
  last_fetch_error: null,
  last_fetched_at: null,
  max_entries: 10,
  sync_interval_minutes: 60,
  ttl_days: 45,
  updated_at: "2026-10-01T00:00:00.000Z",
  url: blog?.url ?? "",
};

describe("public feeds form values", () => {
  it("starts from the stored rows and the defaults for feeds without a row", () => {
    expect(buildInitialValues([blogRow])).toEqual({
      announcements: {
        customMaxEntries: 10,
        customSyncMinutes: 60,
        customTtlDays: 30,
        enabled: false,
        maxEntriesPreset: "10",
        syncPreset: "60",
        ttlPreset: "30",
        url: announcements?.url,
      },
      blog: {
        customMaxEntries: 10,
        customSyncMinutes: 60,
        customTtlDays: 45,
        enabled: true,
        maxEntriesPreset: "10",
        syncPreset: "60",
        ttlPreset: "custom",
        url: blog?.url,
      },
    });
  });

  it("starts from a stored mirror URL, matched by label", () => {
    expect(buildInitialValues([{ ...blogRow, url: "https://mirror.internal/blog.xml" }]).blog.url).toBe(
      "https://mirror.internal/blog.xml",
    );
  });

  it("replaces an outdated official URL with the current one when the feed is saved", () => {
    const legacyRow = {
      ...blogRow,
      enabled: false,
      id: "announcements",
      label: "Apache Airflow",
      url: "https://airflow.apache.org/announcements/index.xml",
    };
    const initialValues = buildInitialValues([legacyRow]);

    expect(initialValues.announcements.url).toBe(announcements?.url);
    // The form starts from the current URL, so saving without edits still updates the stored one.
    expect(toChanges(initialValues, initialValues)[0]).toEqual({
      enabled: false,
      source: announcements,
      url: announcements?.url,
    });
  });

  it("proposes every feed in the dialog only while all of them are off", () => {
    const allOff = buildInitialValues([{ ...blogRow, enabled: false }]);
    const oneOn = buildInitialValues([blogRow]);

    expect(buildDialogValues(allOff)).toEqual({
      announcements: { ...allOff.announcements, enabled: true },
      blog: { ...allOff.blog, enabled: true },
    });
    expect(buildDialogValues(oneOn)).toBe(oneOn);
  });

  it.each([
    { change: {}, expected: false, name: "nothing" },
    {
      change: { url: " https://airflow.apache.org/blog/index.xml " },
      expected: false,
      name: "only surrounding spaces",
    },
    { change: { enabled: false }, expected: true, name: "the enabled state" },
    { change: { url: "https://mirror.internal/blog.xml" }, expected: true, name: "the URL" },
    { change: { ttlPreset: "7" as const }, expected: true, name: "the TTL" },
    { change: { syncPreset: "15" as const }, expected: true, name: "the sync interval" },
    { change: { maxEntriesPreset: "25" as const }, expected: true, name: "the maximum number of entries" },
  ])("detects a change of $name", ({ change, expected }) => {
    const storedValues = buildInitialValues([blogRow]);

    expect(hasChanges({ ...storedValues, blog: { ...storedValues.blog, ...change } }, storedValues)).toBe(
      expected,
    );
  });

  it("sends the TTL and the sync interval only for feeds where they changed and the trimmed URL always", () => {
    const initialValues = buildInitialValues([blogRow]);
    const values = {
      announcements: {
        ...initialValues.announcements,
        enabled: true,
        maxEntriesPreset: "50" as const,
        ttlPreset: "7" as const,
      },
      blog: {
        ...initialValues.blog,
        customSyncMinutes: 90,
        enabled: false,
        syncPreset: "custom" as const,
        url: " https://mirror.internal/blog.xml ",
      },
    };

    expect(toChanges(values, initialValues)).toEqual([
      { enabled: true, maxEntries: 50, source: announcements, ttlDays: 7, url: announcements?.url },
      { enabled: false, source: blog, syncIntervalMinutes: 90, url: "https://mirror.internal/blog.xml" },
    ]);
  });
});
