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
import {
  useAuthLinksServiceGetAuthMenus,
  useNewsFeedServiceGetNewsItems,
  useNewsFeedServiceGetNewsSources,
} from "openapi/queries";
import type { NewsItemResponse, NewsSourceResponse } from "openapi/requests/types.gen";

import { isBuiltInNewsSourceRow, resolveMaxNewsEntries, resolveSourceLabel } from "src/constants/newsFeed";
import { useConfig } from "src/queries/useConfig";

import { selectNewsEntries } from "./newsLimits";
import type { NewsEntry } from "./types";

const NEWS_SOURCES_LIMIT = 100;

export type NewsFeedState = {
  readonly canManage: boolean;
  readonly entries: Array<NewsEntry>;
  readonly error: unknown;
  /** Enabled sources whose last sync failed. */
  readonly failedSources: Array<NewsSourceResponse>;
  readonly isEmpty: boolean;
  readonly isLoading: boolean;
  /** Whether the home page shows the section at all (the feature switch); the layout is arranged around it. */
  readonly isVisible: boolean;
};

const toEntry = (item: NewsItemResponse, sourcesById: Map<string, NewsSourceResponse>): NewsEntry => {
  const source = item.source_id === null ? undefined : sourcesById.get(item.source_id);
  const isRemote = item.source_id !== null;
  const author = item.author ?? undefined;

  return {
    body: isRemote ? undefined : (item.body ?? undefined),
    id: item.id,
    kind: isRemote ? "remote" : "local",
    priority: item.priority,
    publishedAt: item.published_at,
    sourceLabel: source === undefined ? author : resolveSourceLabel(source),
    summary: isRemote ? (item.body ?? undefined) : undefined,
    title: item.title,
    url: item.url ?? undefined,
  };
};

/**
 * Items written by administrators and the entries the sync command stored for the enabled remote
 * sources, merged under the home page rules. Nothing is fetched from the internet here.
 */
export const useNewsFeed = (): NewsFeedState => {
  const isEnabled = Boolean(useConfig("news_feed_enabled"));
  const allowRemoteSources = Boolean(useConfig("news_feed_allow_remote_sources"));
  const allowPublicFeeds = Boolean(useConfig("news_feed_allow_public_airflow_feeds"));
  const maxTotal = resolveMaxNewsEntries(useConfig("news_feed_max_entries"));

  const { data: authLinks } = useAuthLinksServiceGetAuthMenus();
  const canManage = authLinks?.authorized_menu_items.includes("News Feed") ?? false;

  const itemsQuery = { limit: maxTotal, orderBy: ["priority", "-published_at"] };
  const {
    data: itemsData,
    error: itemsError,
    isLoading: isLoadingItems,
  } = useNewsFeedServiceGetNewsItems({ ...itemsQuery, remote: false }, undefined, { enabled: isEnabled });
  const {
    data: remoteData,
    error: remoteError,
    isLoading: isLoadingRemote,
  } = useNewsFeedServiceGetNewsItems({ ...itemsQuery, remote: true }, undefined, {
    enabled: isEnabled && allowRemoteSources,
  });
  const { data: sourcesData, isLoading: isLoadingSources } = useNewsFeedServiceGetNewsSources(
    { limit: NEWS_SOURCES_LIMIT },
    undefined,
    { enabled: isEnabled && allowRemoteSources },
  );

  const sources = allowRemoteSources
    ? (sourcesData?.news_sources ?? []).filter(
        (source) => allowPublicFeeds || !isBuiltInNewsSourceRow(source),
      )
    : [];
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  // Entries of a source the settings no longer allow stay stored until the next sync; hide them.
  const remoteItems = allowRemoteSources
    ? (remoteData?.news_items ?? []).filter(
        (item) => item.source_id !== null && sourcesById.has(item.source_id),
      )
    : [];
  const failedSources = sources.filter((source) => source.enabled && source.last_fetch_error !== null);

  const entries = selectNewsEntries({
    internal: (itemsData?.news_items ?? []).map((item) => toEntry(item, sourcesById)),
    maxTotal,
    remote: remoteItems.map((item) => toEntry(item, sourcesById)),
  });
  const isLoading =
    isEnabled && (isLoadingItems || (allowRemoteSources && (isLoadingSources || isLoadingRemote)));
  const error = itemsError ?? remoteError;
  const hasError = error !== null && error !== undefined;
  const isEmpty = !isLoading && entries.length === 0 && failedSources.length === 0 && !hasError;

  return {
    canManage,
    entries,
    error,
    failedSources,
    isEmpty,
    isLoading,
    isVisible: isEnabled,
  };
};
