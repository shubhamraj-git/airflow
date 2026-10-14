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

import { resolveMaxNewsEntries } from "src/constants/newsFeed";

import { selectNewsEntries } from "./newsLimits";
import type { NewsEntry } from "./types";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const MS_PER_DAY = 86_400_000;

const daysAgo = (days: number) => new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();

const entry = (id: string, days: number, kind: NewsEntry["kind"]): NewsEntry => ({
  id,
  kind,
  priority: "P2",
  publishedAt: daysAgo(days),
  title: id,
});

const urgent = (base: NewsEntry, priority: NewsEntry["priority"]): NewsEntry => ({ ...base, priority });

const entries = (kind: NewsEntry["kind"], count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => entry(`${kind}-${index}`, index + offset, kind));

describe("selectNewsEntries", () => {
  it("orders by priority before date, within the internal items and across the merged list", () => {
    const selected = selectNewsEntries({
      internal: [
        entry("normal-new", 0, "local"),
        urgent(entry("critical-old", 5, "local"), "P0"),
        urgent(entry("important", 2, "local"), "P1"),
      ],
      maxTotal: 2,
      remote: [entry("remote-newest", 0, "remote")],
    });

    expect(selected.map(({ id }) => id)).toEqual(["critical-old", "important"]);
    expect(
      selectNewsEntries({
        internal: [urgent(entry("important", 9, "local"), "P1")],
        remote: [entry("remote-newest", 0, "remote")],
      }).map(({ id }) => id),
    ).toEqual(["important", "remote-newest"]);
  });

  it.each([
    { expectedInternal: 0, expectedRemote: 20, internal: 0, remote: 25 },
    { expectedInternal: 15, expectedRemote: 5, internal: 15, remote: 10 },
    { expectedInternal: 20, expectedRemote: 0, internal: 20, remote: 3 },
    { expectedInternal: 20, expectedRemote: 0, internal: 25, remote: 0 },
    { expectedInternal: 3, expectedRemote: 4, internal: 3, remote: 4 },
  ])(
    "$internal internal + $remote remote -> $expectedInternal internal + $expectedRemote remote",
    ({ expectedInternal, expectedRemote, internal, remote }) => {
      const selected = selectNewsEntries({
        internal: entries("local", internal),
        remote: entries("remote", remote),
      });

      expect(selected.filter(({ kind }) => kind === "local")).toHaveLength(expectedInternal);
      expect(selected.filter(({ kind }) => kind === "remote")).toHaveLength(expectedRemote);
    },
  );

  it("keeps the newest entries of each kind and sorts the result newest first", () => {
    // Remote entries are newer than every internal one, yet internal items still fill 15 slots.
    const selected = selectNewsEntries({
      internal: entries("local", 15, 20),
      remote: entries("remote", 12),
    });

    expect(selected.filter(({ kind }) => kind === "remote").map(({ id }) => id)).toEqual(
      Array.from({ length: 5 }, (_, index) => `remote-${index}`),
    );
    expect(selected.map(({ id }) => id)).toEqual(
      [...entries("remote", 5), ...entries("local", 15, 20)].map(({ id }) => id),
    );
    expect(selected.map(({ publishedAt }) => Date.parse(publishedAt))).toEqual(
      selected.map(({ publishedAt }) => Date.parse(publishedAt)).sort((left, right) => right - left),
    );
  });
});

describe("resolveMaxNewsEntries", () => {
  it.each([
    { configured: 20, expected: 20 },
    { configured: 5, expected: 5 },
    { configured: 1, expected: 1 },
    { configured: 0, expected: 20 },
    { configured: "7", expected: 20 },
    { configured: undefined, expected: 20 },
  ])("turns a configured maximum of $configured into $expected", ({ configured, expected }) => {
    expect(resolveMaxNewsEntries(configured)).toBe(expected);
  });
});
