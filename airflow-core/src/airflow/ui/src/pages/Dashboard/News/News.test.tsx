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
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NewsItemResponse, NewsSourceResponse } from "openapi/requests/types.gen";

import { NEWS_FEED_SEEN_ENTRIES_KEY } from "src/constants/localStorage";
import { Wrapper } from "src/utils/Wrapper";

import { News } from "./News";
import { useNewsFeed } from "./useNewsFeed";

const NewsWithFeed = () => <News feed={useNewsFeed()} />;

const mocks = vi.hoisted(() => {
  const config: Record<string, unknown> = {};

  return {
    config,
    useAuthLinksServiceGetAuthMenus: vi.fn(),
    useNewsFeedServiceGetNewsItems: vi.fn(),
    useNewsFeedServiceGetNewsSources: vi.fn(),
  };
});

vi.mock("openapi/queries", () => ({
  useAuthLinksServiceGetAuthMenus: mocks.useAuthLinksServiceGetAuthMenus,
  useNewsFeedServiceGetNewsItems: mocks.useNewsFeedServiceGetNewsItems,
  useNewsFeedServiceGetNewsSources: mocks.useNewsFeedServiceGetNewsSources,
}));

vi.mock("src/queries/useConfig", () => ({
  useConfig: (key: string) => mocks.config[key],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    // eslint-disable-next-line id-length
    t: (key: string, options?: { count?: number; labels?: string }) => {
      if (key === "news.showAll") {
        return `Show all (${options?.count})`;
      }

      if (key === "news.newCount") {
        return `${options?.count} new`;
      }

      return key === "news.sourceUnreachable" ? `${key}:${options?.labels}` : key;
    },
  }),
}));

const NOW = Date.parse("2026-10-14T12:00:00.000Z");
const MS_PER_DAY = 86_400_000;

const newsItem = (index: number): NewsItemResponse => ({
  author: index === 0 ? "Platform team" : null,
  body: index === 0 ? "**Tonight** at 22:00 UTC" : null,
  created_at: "2026-10-01T00:00:00.000Z",
  created_by: "admin",
  expires_at: null,
  fetched_at: null,
  id: `item-${index}`,
  priority: "P2",
  published_at: new Date(NOW - index * MS_PER_DAY).toISOString(),
  source_id: null,
  title: `Internal ${index}`,
  updated_at: "2026-10-01T00:00:00.000Z",
  url: null,
});

const remoteEntry = (index: number, sourceId = "source-1"): NewsItemResponse => ({
  ...newsItem(index),
  author: "Apache Airflow blog",
  body: `Remote summary ${index}`,
  fetched_at: "2026-10-14T00:00:00.000Z",
  id: `remote-${index}`,
  published_at: new Date(NOW - (index + 0.5) * MS_PER_DAY).toISOString(),
  source_id: sourceId,
  title: `Remote ${index}`,
  url: `https://airflow.apache.org/blog/${index}/`,
});

const apacheSource: NewsSourceResponse = {
  created_at: "2026-10-01T00:00:00.000Z",
  created_by: "admin",
  enabled: true,
  id: "source-1",
  label: "Apache Airflow",
  last_fetch_error: null,
  last_fetched_at: null,
  max_entries: 10,
  sync_interval_minutes: 60,
  ttl_days: 30,
  updated_at: "2026-10-01T00:00:00.000Z",
  url: "https://airflow.apache.org/blog/index.xml",
};

type RenderOptions = {
  canManage?: boolean;
  failedSources?: Array<NewsSourceResponse>;
  items?: Array<NewsItemResponse>;
  remote?: Array<NewsItemResponse>;
  sources?: Array<NewsSourceResponse>;
};

const renderNews = ({
  canManage = false,
  failedSources = [],
  items = [],
  remote = [],
  sources = [],
}: RenderOptions = {}) => {
  mocks.useAuthLinksServiceGetAuthMenus.mockReturnValue({
    data: { authorized_menu_items: canManage ? ["News Feed"] : [] },
  });
  mocks.useNewsFeedServiceGetNewsItems.mockImplementation((params: { remote?: boolean | null }) => {
    const newsItems = params.remote === true ? remote : items;

    return {
      data: { news_items: newsItems, total_entries: newsItems.length },
      error: null,
      isLoading: false,
    };
  });
  const failedIds = new Set(failedSources.map((source) => source.id));
  const allSources = [
    ...sources.map((source) =>
      failedIds.has(source.id) ? { ...source, last_fetch_error: "HTTP 503" } : source,
    ),
    ...failedSources
      .filter((source) => !sources.some((known) => known.id === source.id))
      .map((source) => ({ ...source, last_fetch_error: "HTTP 503" })),
  ];

  mocks.useNewsFeedServiceGetNewsSources.mockReturnValue({
    data: { news_sources: allSources, total_entries: allSources.length },
  });

  return render(<NewsWithFeed />, { wrapper: Wrapper });
};

describe("News", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage.clear();
    mocks.config = {
      news_feed_allow_public_airflow_feeds: true,
      news_feed_allow_remote_sources: true,
      news_feed_enabled: true,
      news_feed_max_entries: 20,
    };
  });

  it("honours the configured maximum, asking the API for no more than that", () => {
    mocks.config = { ...mocks.config, news_feed_max_entries: 2 };

    renderNews({
      items: [newsItem(0), newsItem(1), newsItem(2)],
      remote: [remoteEntry(0)],
      sources: [apacheSource],
    });

    expect(screen.getAllByTestId("news-entry")).toHaveLength(2);
    expect(mocks.useNewsFeedServiceGetNewsItems).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 2 }),
      undefined,
      expect.anything(),
    );
  });

  it("remembers the entries of a first visit without calling any of them new", async () => {
    renderNews({ items: [newsItem(0), newsItem(1)] });

    await waitFor(() =>
      expect(JSON.parse(globalThis.localStorage.getItem(NEWS_FEED_SEEN_ENTRIES_KEY) ?? "[]")).toEqual([
        "item-0",
        "item-1",
      ]),
    );
    expect(screen.queryByTestId("news-new-count")).not.toBeInTheDocument();
  });

  it("counts an entry that arrives after the first render, as after adding it on the admin page", async () => {
    globalThis.localStorage.setItem(NEWS_FEED_SEEN_ENTRIES_KEY, JSON.stringify(["item-1"]));

    const { rerender } = renderNews({ items: [newsItem(1)] });

    expect(screen.queryByTestId("news-new-count")).not.toBeInTheDocument();

    mocks.useNewsFeedServiceGetNewsItems.mockReturnValue({
      data: { news_items: [newsItem(0), newsItem(1)], total_entries: 2 },
      error: null,
      isLoading: false,
    });
    rerender(<NewsWithFeed />);

    expect(await screen.findByTestId("news-new-count")).toHaveTextContent("1 new");
    await waitFor(() =>
      expect(JSON.parse(globalThis.localStorage.getItem(NEWS_FEED_SEEN_ENTRIES_KEY) ?? "[]")).toEqual([
        "item-0",
        "item-1",
      ]),
    );
  });

  it("counts the entries that appeared since the last visit and clears the count on show all", async () => {
    globalThis.localStorage.setItem(NEWS_FEED_SEEN_ENTRIES_KEY, JSON.stringify(["item-1"]));

    renderNews({ items: [newsItem(0), newsItem(1)], remote: [remoteEntry(0)], sources: [apacheSource] });

    expect(await screen.findByTestId("news-new-count")).toHaveTextContent("2 new");
    await waitFor(() =>
      expect(JSON.parse(globalThis.localStorage.getItem(NEWS_FEED_SEEN_ENTRIES_KEY) ?? "[]")).toEqual([
        "item-0",
        "remote-0",
        "item-1",
      ]),
    );

    fireEvent.click(screen.getByRole("button", { name: "Show all (3)" }));

    await waitFor(() => expect(screen.queryByTestId("news-new-count")).not.toBeInTheDocument());
  });

  it("renders nothing when the feature is disabled, even for managers", () => {
    mocks.config = { news_feed_allow_remote_sources: true, news_feed_enabled: false };

    const { container } = renderNews({ canManage: true, items: [newsItem(0)] });

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    { canManage: false, name: "other users" },
    { canManage: true, name: "managers" },
  ])("tells $name that there is no news yet and what will appear there", ({ canManage }) => {
    renderNews({ canManage });

    expect(screen.getByText("news.empty")).toBeInTheDocument();
    expect(screen.getByText("news.emptyUserHint")).toBeInTheDocument();
    if (canManage) {
      expect(screen.getByRole("link", { name: "news.manage" })).toHaveAttribute("href", "/news_feed");
    } else {
      expect(screen.queryByRole("link", { name: "news.manage" })).not.toBeInTheDocument();
    }
  });

  it("merges internal and remote entries newest first and shows every entry in a dialog", async () => {
    renderNews({
      items: [newsItem(0), newsItem(1), newsItem(2), newsItem(3)],
      remote: [remoteEntry(0), remoteEntry(1), remoteEntry(2)],
      sources: [apacheSource],
    });

    expect(screen.getAllByTestId("news-entry").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Internal 0"),
      expect.stringContaining("Remote 0"),
      expect.stringContaining("Internal 1"),
      expect.stringContaining("Remote 1"),
      expect.stringContaining("Internal 2"),
      expect.stringContaining("Remote 2"),
      expect.stringContaining("Internal 3"),
    ]);
    expect(screen.getByText("Tonight")).toBeInTheDocument();
    expect(screen.getByText("Remote summary 0")).toBeInTheDocument();
    expect(screen.getByText("Platform team")).toBeInTheDocument();
    expect(screen.getAllByText("news.source.thisDeployment")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: /readMore/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Remote 0/u })).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.click(screen.getByRole("button", { name: "Show all (7)" }));

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getAllByTestId("news-entry")).toHaveLength(7);
    expect(dialog).toHaveTextContent("at 22:00 UTC");
  });

  it("lets internal items push remote entries out of a full list", () => {
    renderNews({
      items: Array.from({ length: 20 }, (_, index) => newsItem(index)),
      remote: [remoteEntry(0)],
      sources: [apacheSource],
    });

    expect(screen.getAllByTestId("news-entry")).toHaveLength(20);
    expect(screen.queryByText("Remote 0")).not.toBeInTheDocument();
  });

  it("puts a critical item first, marked and coloured by its priority", async () => {
    renderNews({
      items: [newsItem(0), { ...newsItem(1), priority: "P0" }],
      remote: [remoteEntry(0)],
      sources: [apacheSource],
    });

    const cards = await screen.findAllByTestId("news-entry");

    expect(cards[0]).toHaveAttribute("data-priority", "P0");
    expect(cards[0]).toHaveTextContent("Internal 1");
    expect(within(cards[0] as HTMLElement).getByText("P0")).toBeInTheDocument();
    expect(cards[1]).toHaveAttribute("data-priority", "P2");
    expect(within(cards[1] as HTMLElement).queryByText("P2")).not.toBeInTheDocument();
  });

  it.each([
    { expected: "Apache Airflow", failed: [apacheSource], name: "a public feed" },
    {
      expected: "Internal mirror",
      failed: [
        {
          ...apacheSource,
          id: "source-2",
          label: "Internal mirror",
          url: "https://mirror.internal/feed.xml",
        },
      ],
      name: "a custom source by its label",
    },
  ])("warns when $name could not be loaded", ({ expected, failed }) => {
    renderNews({ failedSources: failed, items: [newsItem(0)], sources: failed });

    expect(screen.getByText(`news.sourceUnreachable:${expected}`)).toBeInTheDocument();
  });

  it("ignores entries of the public Apache Airflow feeds when the deployment disallows them, but keeps other sources", () => {
    mocks.config = {
      news_feed_allow_public_airflow_feeds: false,
      news_feed_allow_remote_sources: true,
      news_feed_enabled: true,
    };
    const customSource = {
      ...apacheSource,
      id: "source-2",
      label: "Internal mirror",
      url: "https://mirror.internal/feed.xml",
    };

    renderNews({
      remote: [remoteEntry(0), remoteEntry(1, "source-2")],
      sources: [apacheSource, customSource],
    });

    expect(screen.getAllByTestId("news-entry").map((card) => card.textContent)).toEqual([
      expect.stringContaining("Remote 1"),
    ]);
    expect(screen.getByText("Internal mirror")).toBeInTheDocument();
  });

  it("does not ask for remote entries when the deployment disallows remote sources", () => {
    mocks.config = {
      news_feed_allow_public_airflow_feeds: true,
      news_feed_allow_remote_sources: false,
      news_feed_enabled: true,
    };

    renderNews({ items: [newsItem(0)], remote: [remoteEntry(0)], sources: [apacheSource] });

    expect(mocks.useNewsFeedServiceGetNewsItems).toHaveBeenCalledWith(
      expect.objectContaining({ remote: true }),
      undefined,
      { enabled: false },
    );
    expect(screen.getAllByTestId("news-entry")).toHaveLength(1);
  });
});
