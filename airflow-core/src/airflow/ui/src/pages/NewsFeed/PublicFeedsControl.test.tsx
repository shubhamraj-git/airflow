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

import type { NewsSourceResponse } from "openapi/requests/types.gen";

import { BUILT_IN_NEWS_SOURCES } from "src/constants/newsFeed";
import { Wrapper } from "src/utils/Wrapper";

import { PublicFeedsControl } from "./PublicFeedsControl";

const mocks = vi.hoisted(() => {
  const config: Record<string, unknown> = {};

  return { apply: vi.fn(), config, useNewsFeedServiceGetNewsSources: vi.fn() };
});

vi.mock("openapi/queries", () => ({
  useNewsFeedServiceGetNewsSources: mocks.useNewsFeedServiceGetNewsSources,
}));

vi.mock("src/queries/useConfig", () => ({
  useConfig: (key: string) => mocks.config[key],
}));

vi.mock("src/queries/useApplyBuiltInNewsSources", () => ({
  useApplyBuiltInNewsSources: () => ({
    apply: mocks.apply,
    error: undefined,
    isPending: false,
    setError: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    // eslint-disable-next-line id-length
    t: (key: string) => key,
  }),
}));

const [announcements, blog] = BUILT_IN_NEWS_SOURCES;

const row = (overrides: Partial<NewsSourceResponse>): NewsSourceResponse => ({
  created_at: "2026-10-01T00:00:00.000Z",
  created_by: "admin",
  enabled: true,
  id: "row",
  label: "Apache Airflow blog",
  last_fetch_error: null,
  last_fetched_at: null,
  max_entries: 10,
  sync_interval_minutes: 60,
  ttl_days: 30,
  updated_at: "2026-10-01T00:00:00.000Z",
  url: blog?.url ?? "",
  ...overrides,
});

const blogRow = row({ id: "blog" });
const announcementsRow = row({
  id: "announcements",
  label: "Apache Airflow announcements",
  url: announcements?.url,
});

const PUBLIC_FEEDS = /newsFeed\.sources\.publicFeeds/u;
const CONSENT_TITLE = "newsFeed.sources.consent.title";
const DISABLE_ALL = "newsFeed.sources.disableAll";
const URL_LABEL = /newsFeed\.form\.url/u;
const EDIT_FEED = "newsFeed.sources.editFeed";

const renderControl = (sources: Array<NewsSourceResponse>) => {
  mocks.useNewsFeedServiceGetNewsSources.mockReturnValue({
    data: { news_sources: sources, total_entries: sources.length },
    error: null,
    isLoading: false,
  });

  return render(<PublicFeedsControl />, { wrapper: Wrapper });
};

const openDialog = async () => {
  fireEvent.click(screen.getByRole("button", { name: PUBLIC_FEEDS }));

  return screen.findByRole("dialog");
};

describe("PublicFeedsControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config = { news_feed_allow_public_airflow_feeds: true, news_feed_allow_remote_sources: true };
  });

  it.each([
    { name: "off", scenario: "with no feed", sources: [] },
    { name: "off", scenario: "with every feed disabled", sources: [row({ ...blogRow, enabled: false })] },
    { name: "on", scenario: "with both feeds", sources: [announcementsRow, blogRow] },
    {
      name: "on",
      scenario: "with one feed",
      sources: [blogRow, row({ ...announcementsRow, enabled: false })],
    },
  ])("shows the public feeds as one button reporting $name $scenario", ({ name, sources }) => {
    renderControl(sources);

    const button = screen.getByRole("button", { name: PUBLIC_FEEDS });

    expect(button).toHaveTextContent(`newsFeed.sources.status.${name}`);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks the button with an error icon when an enabled public feed failed its last sync", () => {
    renderControl([announcementsRow, row({ ...blogRow, last_fetch_error: "HTTP 503" })]);

    const button = screen.getByRole("button", { name: PUBLIC_FEEDS });

    expect(within(button).getByTestId("sync-error-icon")).toHaveTextContent("newsFeed.sources.syncFailed");
  });

  it("recognises a feed stored with a mirror URL by its label", () => {
    renderControl([
      row({ ...blogRow, url: "https://mirror.internal/blog.xml" }),
      row({ ...announcementsRow, url: "https://mirror.internal/announcements.xml" }),
    ]);

    expect(screen.getByRole("button", { name: PUBLIC_FEEDS })).toHaveTextContent(
      "newsFeed.sources.status.on",
    );
  });

  it("proposes every feed with its URL and asks for agreement while the feeds are off", async () => {
    renderControl([]);

    const dialog = await openDialog();

    expect(dialog).toHaveTextContent(CONSENT_TITLE);
    expect(within(dialog).queryByRole("button", { name: DISABLE_ALL })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: /builtIn\.announcements/u })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /builtIn\.blog/u })).toBeChecked();

    const [announcementsUrl, blogUrl] = within(dialog).getAllByLabelText(URL_LABEL);

    expect(announcementsUrl).toHaveValue(announcements?.url);
    expect(blogUrl).toHaveValue(blog?.url);

    fireEvent.click(within(dialog).getByRole("checkbox", { name: /builtIn\.blog/u }));
    await waitFor(() =>
      expect(within(dialog).getByRole("checkbox", { name: /builtIn\.blog/u })).not.toBeChecked(),
    );
    fireEvent.change(announcementsUrl as HTMLElement, {
      target: { value: "https://mirror.internal/announcements.xml" },
    });
    expect(mocks.apply).not.toHaveBeenCalled();

    const confirm = screen.getByTestId("public-feeds-save");

    expect(confirm).toHaveTextContent("newsFeed.sources.consent.confirm");
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(mocks.apply).toHaveBeenCalledWith(
        [],
        [
          { enabled: true, source: announcements, url: "https://mirror.internal/announcements.xml" },
          { enabled: false, source: blog, url: blog?.url },
        ],
      ),
    );
  });

  it("rejects a mirror URL without an http(s) scheme", async () => {
    renderControl([]);

    const dialog = await openDialog();
    const [announcementsUrl] = within(dialog).getAllByLabelText(URL_LABEL);

    fireEvent.change(announcementsUrl as HTMLElement, { target: { value: "mirror.internal/feed" } });

    await waitFor(() => expect(dialog).toHaveTextContent("newsFeed.form.invalidUrl"));
    expect(screen.getByTestId("public-feeds-save")).toBeDisabled();
  });

  it("does nothing when the dialog is cancelled", async () => {
    renderControl([]);

    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "modal.cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("shows configured feeds read-only, with their URL, TTL and sync interval, until edit is clicked", async () => {
    renderControl([announcementsRow, row({ ...blogRow, url: "https://mirror.internal/blog.xml" })]);

    const dialog = await openDialog();
    const blogCard = within(dialog).getByTestId("public-feed-blog");

    expect(within(dialog).queryByLabelText(URL_LABEL)).not.toBeInTheDocument();
    expect(blogCard).toHaveTextContent("https://mirror.internal/blog.xml");
    expect(blogCard).toHaveTextContent("newsFeed.presets.thirtyDays");
    expect(blogCard).toHaveTextContent("newsFeed.presets.oneHour");

    fireEvent.click(within(blogCard).getByRole("button", { name: EDIT_FEED }));

    expect(await within(dialog).findByLabelText(URL_LABEL)).toHaveValue("https://mirror.internal/blog.xml");
    expect(within(dialog).getByTestId("public-feed-announcements")).not.toContainElement(
      within(dialog).getByLabelText(URL_LABEL),
    );
    fireEvent.click(screen.getByRole("button", { name: "modal.cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("edits the feeds without asking for agreement again while one is already on", async () => {
    renderControl([announcementsRow, row({ ...blogRow, enabled: false })]);

    const dialog = await openDialog();
    const save = screen.getByTestId("public-feeds-save");

    expect(dialog).not.toHaveTextContent(CONSENT_TITLE);
    expect(save).toHaveTextContent("formActions.save");
    expect(save).toBeDisabled();

    // Configured feeds open read-only; only the unlocked blog row exposes its fields.
    expect(within(dialog).queryByRole("checkbox", { name: /builtIn\.blog/u })).not.toBeInTheDocument();
    const [, editBlog] = within(dialog).getAllByRole("button", { name: EDIT_FEED });

    fireEvent.click(editBlog as HTMLElement);
    fireEvent.click(await within(dialog).findByRole("checkbox", { name: /builtIn\.blog/u }));

    const blogUrl = within(dialog).getByLabelText(URL_LABEL);

    fireEvent.change(blogUrl, { target: { value: "https://mirror.internal/blog.xml" } });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocks.apply).toHaveBeenCalledWith(
        [announcementsRow, { ...blogRow, enabled: false }],
        [
          { enabled: true, source: announcements, url: announcements?.url },
          { enabled: true, source: blog, url: "https://mirror.internal/blog.xml" },
        ],
      ),
    );
  });

  it("switches every public feed off at once from the dialog", async () => {
    renderControl([announcementsRow, blogRow]);

    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: DISABLE_ALL }));

    await waitFor(() =>
      expect(mocks.apply).toHaveBeenCalledWith(
        [announcementsRow, blogRow],
        [
          { enabled: false, source: announcements },
          { enabled: false, source: blog },
        ],
      ),
    );
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
  ])("renders nothing when the deployment disallows $name", ({ config }) => {
    mocks.config = config;

    const { container } = renderControl([blogRow]);

    expect(container).toBeEmptyDOMElement();
    expect(mocks.useNewsFeedServiceGetNewsSources).toHaveBeenCalledWith(expect.anything(), undefined, {
      enabled: false,
    });
  });
});
