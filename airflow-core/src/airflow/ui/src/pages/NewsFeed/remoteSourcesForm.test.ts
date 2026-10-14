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

import {
  buildRemoteSourceValues,
  hasRemoteSourceChanges,
  newRemoteSourceValues,
  toRemoteSourceChanges,
} from "./remoteSourcesForm";

const row = (overrides: Partial<NewsSourceResponse>): NewsSourceResponse => ({
  created_at: "2026-10-01T00:00:00.000Z",
  created_by: "admin",
  enabled: true,
  id: "mirror",
  label: "Internal mirror",
  last_fetch_error: null,
  last_fetched_at: null,
  max_entries: 10,
  sync_interval_minutes: 60,
  ttl_days: 30,
  updated_at: "2026-10-01T00:00:00.000Z",
  url: "https://mirror.internal/feed.xml",
  ...overrides,
});

describe("remote sources form", () => {
  it("starts from the stored rows, keeping their ids", () => {
    expect(buildRemoteSourceValues([row({ ttl_days: 45 })])).toEqual({
      sources: [
        {
          customMaxEntries: 10,
          customSyncMinutes: 60,
          customTtlDays: 45,
          enabled: true,
          label: "Internal mirror",
          maxEntriesPreset: "10",
          rowId: "mirror",
          syncPreset: "60",
          ttlPreset: "custom",
          url: "https://mirror.internal/feed.xml",
        },
      ],
    });
  });

  it("reports no change for an untouched form", () => {
    const rows = [row({})];

    expect(hasRemoteSourceChanges(toRemoteSourceChanges(buildRemoteSourceValues(rows), rows))).toBe(false);
  });

  it("creates added sources, patches changed fields and deletes removed rows", () => {
    const rows = [row({}), row({ id: "gone", label: "Old", url: "https://old.internal/feed.xml" })];
    const [mirror] = buildRemoteSourceValues(rows).sources;

    expect(mirror).toBeDefined();

    const changes = toRemoteSourceChanges(
      {
        sources: [
          {
            ...(mirror ?? newRemoteSourceValues()),
            enabled: false,
            label: " Mirror ",
            maxEntriesPreset: "25",
            syncPreset: "15",
            ttlPreset: "7",
          },
          { ...newRemoteSourceValues(), label: "Team blog", url: " https://blog.internal/atom.xml " },
        ],
      },
      rows,
    );

    expect(changes).toEqual({
      creates: [
        {
          enabled: true,
          label: "Team blog",
          max_entries: 10,
          sync_interval_minutes: 60,
          ttl_days: 30,
          url: "https://blog.internal/atom.xml",
        },
      ],
      deletes: ["gone"],
      patches: [
        {
          id: "mirror",
          requestBody: {
            enabled: false,
            label: "Mirror",
            max_entries: 25,
            sync_interval_minutes: 15,
            ttl_days: 7,
          },
          updateMask: ["label", "enabled", "max_entries", "sync_interval_minutes", "ttl_days"],
        },
      ],
    });
    expect(hasRemoteSourceChanges(changes)).toBe(true);
  });
});
