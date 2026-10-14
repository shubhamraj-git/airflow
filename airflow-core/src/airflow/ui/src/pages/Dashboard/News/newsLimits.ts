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

import { MAX_NEWS_ENTRIES } from "src/constants/newsFeed";

import type { NewsEntry } from "./types";

const PRIORITY_RANK: Record<NewsItemPriority, number> = { P0: 0, P1: 1, P2: 2 };

const byPriorityThenNewest = (entries: Array<NewsEntry>): Array<NewsEntry> =>
  [...entries].sort((left, right) => {
    const rank = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];

    return rank === 0 ? Date.parse(right.publishedAt) - Date.parse(left.publishedAt) : rank;
  });

type SelectNewsEntriesParams = {
  readonly internal: Array<NewsEntry>;
  readonly maxTotal?: number;
  readonly remote: Array<NewsEntry>;
};

/**
 * Build the home page list: internal items fill it first (by priority, then newest first, up to
 * `maxTotal`), remote entries only take the remaining places, and the result is sorted by priority
 * and then newest first. When the list is full, the remote entries are the ones left out.
 */
export const selectNewsEntries = ({
  internal,
  maxTotal = MAX_NEWS_ENTRIES,
  remote,
}: SelectNewsEntriesParams): Array<NewsEntry> => {
  const internalEntries = byPriorityThenNewest(internal).slice(0, maxTotal);
  const remoteEntries = byPriorityThenNewest(remote).slice(0, maxTotal - internalEntries.length);

  return byPriorityThenNewest([...internalEntries, ...remoteEntries]);
};
