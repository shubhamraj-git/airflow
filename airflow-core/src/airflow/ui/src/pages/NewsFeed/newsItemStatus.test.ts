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

import { getNewsItemStatus } from "./newsItemStatus";

const NOW = new Date("2026-10-14T12:00:00.000Z");

describe("getNewsItemStatus", () => {
  it.each([
    ["active", "2026-10-13T12:00:00.000Z", "2026-10-20T12:00:00.000Z"],
    ["active", "2026-10-13T12:00:00.000Z", null],
    ["active", "2026-10-14T12:00:00.000Z", null],
    ["expired", "2026-10-01T12:00:00.000Z", "2026-10-14T12:00:00.000Z"],
    ["scheduled", "2026-10-14T12:00:01.000Z", null],
  ] as const)("is %s for published %s / expires %s", (expected, publishedAt, expiresAt) => {
    expect(getNewsItemStatus({ expires_at: expiresAt, published_at: publishedAt }, NOW)).toBe(expected);
  });
});
