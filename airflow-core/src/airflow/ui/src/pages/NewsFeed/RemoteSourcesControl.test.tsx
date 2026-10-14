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

import { RemoteSourcesControl } from "./RemoteSourcesControl";

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

vi.mock("src/queries/useApplyRemoteSources", () => ({
  useApplyRemoteSources: () => ({
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

const [, blog] = BUILT_IN_NEWS_SOURCES;

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

const mirrorRow = row({});
const blogRow = row({ id: "blog", label: blog?.label ?? "", url: blog?.url ?? "" });

const BUTTON = /newsFeed\.remoteSources\.title/u;
const LABEL = /newsFeed\.remoteSources\.label/u;
const URL_LABEL = /newsFeed\.form\.url/u;

const renderControl = (sources: Array<NewsSourceResponse>) => {
  mocks.useNewsFeedServiceGetNewsSources.mockReturnValue({
    data: { news_sources: sources, total_entries: sources.length },
    error: null,
    isLoading: false,
  });

  return render(<RemoteSourcesControl />, { wrapper: Wrapper });
};

const openDialog = async () => {
  fireEvent.click(screen.getByRole("button", { name: BUTTON }));

  return screen.findByRole("dialog");
};

// A dialog unmounted while open leaves the next test's dialog closing on its first interaction;
// cancelling lets the dialog machine tear down before the test ends.
const closeDialog = async () => {
  fireEvent.click(screen.getByRole("button", { name: "modal.cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
};

describe("RemoteSourcesControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config = { news_feed_allow_remote_sources: true };
  });

  it.each([
    { name: "off", scenario: "with only a public feed", sources: [blogRow] },
    { name: "off", scenario: "with every source disabled", sources: [row({ enabled: false })] },
    { name: "on", scenario: "with every source enabled", sources: [mirrorRow, blogRow] },
    {
      name: "on",
      scenario: "with one of two sources enabled",
      sources: [mirrorRow, row({ enabled: false, id: "other", url: "https://other.internal/rss" })],
    },
  ])("reports the custom sources as $name $scenario", ({ name, sources }) => {
    renderControl(sources);

    expect(screen.getByRole("button", { name: BUTTON })).toHaveTextContent(
      `newsFeed.remoteSources.status.${name}`,
    );
  });

  it.each([
    {
      expected: true,
      name: "an enabled source failed its last sync",
      sources: [row({ last_fetch_error: "HTTP 503" })],
    },
    {
      expected: false,
      name: "only a disabled source failed",
      sources: [row({ enabled: false, last_fetch_error: "HTTP 503" })],
    },
    { expected: false, name: "every sync succeeded", sources: [mirrorRow] },
  ])("marks the button with an error icon only when $name", ({ expected, sources }) => {
    renderControl(sources);

    const button = screen.getByRole("button", { name: BUTTON });
    const icon = within(button).queryByTestId("sync-error-icon");

    if (expected) {
      expect(icon).toHaveTextContent("newsFeed.sources.syncFailed");
    } else {
      expect(icon).not.toBeInTheDocument();
    }
  });

  it("adds a source and asks for agreement when it is the first one switched on", async () => {
    renderControl([]);

    const dialog = await openDialog();

    expect(dialog).toHaveTextContent("newsFeed.remoteSources.empty");
    fireEvent.click(within(dialog).getByRole("button", { name: /remoteSources\.add/u }));

    fireEvent.change(await within(dialog).findByLabelText(LABEL), { target: { value: "Team blog" } });
    fireEvent.change(within(dialog).getByLabelText(URL_LABEL), {
      target: { value: "https://blog.internal/atom.xml" },
    });

    const save = screen.getByTestId("remote-sources-save");

    await waitFor(() => expect(save).toBeEnabled());
    expect(save).toHaveTextContent("newsFeed.sources.consent.confirm");
    expect(dialog).toHaveTextContent("newsFeed.sources.consent.title");
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocks.apply).toHaveBeenCalledWith({
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
        deletes: [],
        patches: [],
      }),
    );
    await closeDialog();
  });

  it("rejects a public Apache Airflow feed URL and a duplicate URL", async () => {
    renderControl([mirrorRow]);

    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: /remoteSources\.add/u }));

    // The stored source stays read-only, so the only URL field belongs to the new row.
    const newUrl = await within(dialog).findByLabelText(URL_LABEL);

    fireEvent.change(newUrl, { target: { value: blog?.url } });
    await waitFor(() => expect(dialog).toHaveTextContent("newsFeed.remoteSources.builtInUrl"));

    fireEvent.change(newUrl, { target: { value: mirrorRow.url } });
    await waitFor(() => expect(dialog).toHaveTextContent("newsFeed.remoteSources.duplicateUrl"));
    expect(screen.getByTestId("remote-sources-save")).toBeDisabled();
    await closeDialog();
  });

  it("shows a stored source read-only until its edit button is clicked", async () => {
    renderControl([mirrorRow]);

    const dialog = await openDialog();

    expect(dialog).toHaveTextContent(mirrorRow.url);
    expect(dialog).toHaveTextContent("newsFeed.presets.thirtyDays");
    expect(dialog).toHaveTextContent("newsFeed.form.syncInterval: newsFeed.presets.oneHour");
    expect(dialog).toHaveTextContent("newsFeed.form.maxEntries: newsFeed.presets.tenEntries");
    expect(within(dialog).queryByLabelText(LABEL)).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "newsFeed.remoteSources.edit" }));

    const label = await within(dialog).findByLabelText(LABEL);

    expect(label).toHaveValue("Internal mirror");
    fireEvent.change(label, { target: { value: "Mirror" } });

    const save = screen.getByTestId("remote-sources-save");

    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocks.apply).toHaveBeenCalledWith({
        creates: [],
        deletes: [],
        patches: [{ id: "mirror", requestBody: { label: "Mirror" }, updateMask: ["label"] }],
      }),
    );
    await closeDialog();
  });

  it("removes a source and saves without asking for agreement again", async () => {
    renderControl([mirrorRow, row({ id: "other", label: "Other", url: "https://other.internal/rss" })]);

    const dialog = await openDialog();

    expect(dialog).not.toHaveTextContent("newsFeed.sources.consent.title");
    fireEvent.click(
      within(dialog).getAllByRole("button", { name: "newsFeed.remoteSources.remove" })[1] as HTMLElement,
    );

    const save = screen.getByTestId("remote-sources-save");

    await waitFor(() => expect(save).toBeEnabled());
    expect(save).toHaveTextContent("formActions.save");
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocks.apply).toHaveBeenCalledWith({ creates: [], deletes: ["other"], patches: [] }),
    );
    await closeDialog();
  });

  it("switches every custom source off at once from the dialog", async () => {
    renderControl([mirrorRow, blogRow]);

    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "newsFeed.sources.disableAll" }));

    await waitFor(() =>
      expect(mocks.apply).toHaveBeenCalledWith({
        creates: [],
        deletes: [],
        patches: [{ id: "mirror", requestBody: { enabled: false }, updateMask: ["enabled"] }],
      }),
    );
    await closeDialog();
  });

  it("renders nothing when the deployment disallows remote sources", () => {
    mocks.config = { news_feed_allow_remote_sources: false };

    const { container } = renderControl([mirrorRow]);

    expect(container).toBeEmptyDOMElement();
  });
});
