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
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NewsItemResponse } from "openapi/requests/types.gen";

import { Wrapper } from "src/utils/Wrapper";

import { NewsItemsTable } from "./NewsItemsTable";

const mocks = vi.hoisted(() => {
  const config: Record<string, unknown> = {};

  return { config, useNewsFeedServiceGetNewsItems: vi.fn() };
});

vi.mock("openapi/queries", () => ({
  useNewsFeedServiceGetNewsItems: mocks.useNewsFeedServiceGetNewsItems,
}));

vi.mock("src/queries/useConfig", () => ({
  useConfig: (key: string) => mocks.config[key],
}));

vi.mock("./EditNewsItemButton", () => ({ default: () => undefined }));
vi.mock("./DeleteNewsItemButton", () => ({ default: () => undefined }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    // eslint-disable-next-line id-length
    t: (key: string) => key,
  }),
}));

const item: NewsItemResponse = {
  author: null,
  body: null,
  created_at: "2026-10-01T00:00:00.000Z",
  created_by: "admin",
  expires_at: null,
  fetched_at: null,
  id: "item-1",
  priority: "P2",
  published_at: "2026-10-14T12:00:00.000Z",
  source_id: null,
  title: "Maintenance window",
  updated_at: "2026-10-01T00:00:00.000Z",
  url: null,
};

const renderTable = (items: Array<NewsItemResponse> | undefined, isLoading = false) => {
  mocks.useNewsFeedServiceGetNewsItems.mockReturnValue({
    data: items === undefined ? undefined : { news_items: items, total_entries: items.length },
    error: null,
    isLoading,
  });

  return render(<NewsItemsTable />, { wrapper: Wrapper });
};

describe("NewsItemsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config = {
      news_feed_allow_public_airflow_feeds: true,
      news_feed_allow_remote_sources: true,
      news_feed_enabled: true,
    };
  });

  it("explains the feature instead of an empty table while no item exists", () => {
    renderTable([]);

    const emptyState = screen.getByTestId("news-feed-empty-state");

    expect(emptyState).toHaveTextContent("newsFeed.emptyState.title");
    expect(emptyState).toHaveTextContent("newsFeed.emptyState.addHint");
    expect(emptyState).toHaveTextContent("newsFeed.emptyState.publicFeedsHint");
    expect(emptyState).not.toHaveTextContent("newsFeed.emptyState.disabledHint");
    expect(screen.queryByTestId("table-list")).not.toBeInTheDocument();
  });

  it.each([
    {
      config: { news_feed_allow_public_airflow_feeds: true, news_feed_allow_remote_sources: false },
      name: "remote sources",
    },
    {
      config: { news_feed_allow_public_airflow_feeds: false, news_feed_allow_remote_sources: true },
      name: "the public feeds",
    },
  ])(
    "skips the public feed hint when $name are disallowed and says when the feature is off",
    ({ config }) => {
      mocks.config = { ...config, news_feed_enabled: false };

      renderTable([]);

      const emptyState = screen.getByTestId("news-feed-empty-state");

      expect(emptyState).not.toHaveTextContent("newsFeed.emptyState.publicFeedsHint");
      expect(emptyState).toHaveTextContent("newsFeed.emptyState.disabledHint");
    },
  );

  it("shows the table once an item exists", () => {
    renderTable([item]);

    expect(screen.getByTestId("table-list")).toHaveTextContent("Maintenance window");
    expect(mocks.useNewsFeedServiceGetNewsItems).toHaveBeenCalledWith(
      expect.objectContaining({ remote: false }),
    );
    expect(screen.queryByTestId("news-feed-empty-state")).not.toBeInTheDocument();
  });

  it("does not flash the explanation while the items are still loading", () => {
    renderTable(undefined, true);

    expect(screen.queryByTestId("news-feed-empty-state")).not.toBeInTheDocument();
  });
});
