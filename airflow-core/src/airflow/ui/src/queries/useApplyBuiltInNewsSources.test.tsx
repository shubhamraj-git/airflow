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
import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { NewsSourceResponse } from "openapi/requests/types.gen";

import { BUILT_IN_NEWS_SOURCES } from "src/constants/newsFeed";
import { useApplyBuiltInNewsSources } from "src/queries/useApplyBuiltInNewsSources";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const [announcements, blog] = BUILT_IN_NEWS_SOURCES;

if (announcements === undefined || blog === undefined) {
  throw new Error("expected two built-in sources");
}

const announcementsRow: NewsSourceResponse = {
  created_at: "2026-10-01T00:00:00.000Z",
  created_by: "admin",
  enabled: true,
  id: "announcements",
  label: announcements.label,
  last_fetch_error: null,
  last_fetched_at: null,
  max_entries: 10,
  sync_interval_minutes: 60,
  ttl_days: 30,
  updated_at: "2026-10-01T00:00:00.000Z",
  url: announcements.url,
};

type Captured = { body: Record<string, unknown>; method: string; updateMask: string | null; url: string };

const captureRequests = (status = 200) => {
  const captured: Array<Captured> = [];
  const record = async ({ request }: { request: Request }) => {
    captured.push({
      body: (await request.json()) as Record<string, unknown>,
      method: request.method,
      updateMask: new URL(request.url).searchParams.getAll("update_mask").join(",") || null,
      url: new URL(request.url).pathname,
    });

    return HttpResponse.json({ id: "any" }, { status });
  };

  server.use(http.post("*/api/v2/newsSources", record), http.patch("*/api/v2/newsSources/:id", record));

  return captured;
};

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const TestWrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return TestWrapper;
};

describe("useApplyBuiltInNewsSources", () => {
  it("patches existing feeds, creates missing enabled ones and skips untouched disabled ones", async () => {
    const captured = captureRequests();
    const onSuccessConfirm = vi.fn();
    const { result } = renderHook(() => useApplyBuiltInNewsSources({ onSuccessConfirm }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.apply(
        [announcementsRow],
        [
          { enabled: false, source: announcements },
          { enabled: true, source: blog },
        ],
      );
    });

    expect(captured).toEqual(
      expect.arrayContaining([
        {
          body: { enabled: false },
          method: "PATCH",
          updateMask: "enabled",
          url: "/api/v2/newsSources/announcements",
        },
        {
          body: {
            enabled: true,
            label: blog.label,
            max_entries: 10,
            sync_interval_minutes: 60,
            ttl_days: 30,
            url: blog.url,
          },
          method: "POST",
          updateMask: null,
          url: "/api/v2/newsSources",
        },
      ]),
    );
    expect(captured).toHaveLength(2);
    expect(onSuccessConfirm).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeUndefined();
  });

  it("patches a changed maximum number of entries", async () => {
    const captured = captureRequests();
    const { result } = renderHook(() => useApplyBuiltInNewsSources({ onSuccessConfirm: vi.fn() }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.apply(
        [announcementsRow],
        [{ enabled: true, maxEntries: 25, source: announcements }],
      );
    });

    expect(captured).toEqual([
      {
        body: { max_entries: 25 },
        method: "PATCH",
        updateMask: "max_entries",
        url: "/api/v2/newsSources/announcements",
      },
    ]);
  });

  it("patches a changed sync interval", async () => {
    const captured = captureRequests();
    const { result } = renderHook(() => useApplyBuiltInNewsSources({ onSuccessConfirm: vi.fn() }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.apply(
        [announcementsRow],
        [{ enabled: true, source: announcements, syncIntervalMinutes: 15 }],
      );
    });

    expect(captured).toEqual([
      {
        body: { sync_interval_minutes: 15 },
        method: "PATCH",
        updateMask: "sync_interval_minutes",
        url: "/api/v2/newsSources/announcements",
      },
    ]);
  });

  it("only sends the TTL when it changed and makes no request for a disabled missing feed", async () => {
    const captured = captureRequests();
    const { result } = renderHook(() => useApplyBuiltInNewsSources({ onSuccessConfirm: vi.fn() }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.apply(
        [announcementsRow],
        [
          { enabled: true, source: announcements, ttlDays: null },
          { enabled: false, source: blog },
        ],
      );
    });

    expect(captured).toEqual([
      {
        body: { ttl_days: null },
        method: "PATCH",
        updateMask: "ttl_days",
        url: "/api/v2/newsSources/announcements",
      },
    ]);
  });

  it("creates a feed with a mirror URL and patches a changed URL, matching the row by label", async () => {
    const captured = captureRequests();
    const { result } = renderHook(() => useApplyBuiltInNewsSources({ onSuccessConfirm: vi.fn() }), {
      wrapper: createWrapper(),
    });
    const mirrorRow = {
      ...announcementsRow,
      enabled: false,
      url: "https://mirror.internal/announcements.xml",
    };

    await act(async () => {
      await result.current.apply(
        [mirrorRow],
        [
          { enabled: true, source: announcements, url: "https://mirror.internal/v2/announcements.xml" },
          { enabled: true, source: blog, url: "https://mirror.internal/blog.xml" },
        ],
      );
    });

    expect(captured).toEqual(
      expect.arrayContaining([
        {
          body: { enabled: true, url: "https://mirror.internal/v2/announcements.xml" },
          method: "PATCH",
          updateMask: "enabled,url",
          url: "/api/v2/newsSources/announcements",
        },
        {
          body: {
            enabled: true,
            label: blog.label,
            max_entries: 10,
            sync_interval_minutes: 60,
            ttl_days: 30,
            url: "https://mirror.internal/blog.xml",
          },
          method: "POST",
          updateMask: null,
          url: "/api/v2/newsSources",
        },
      ]),
    );
    expect(captured).toHaveLength(2);
  });

  it("brings a row stored under an older label and URL back under the current ones", async () => {
    const captured = captureRequests();
    const { result } = renderHook(() => useApplyBuiltInNewsSources({ onSuccessConfirm: vi.fn() }), {
      wrapper: createWrapper(),
    });
    const legacyRow = {
      ...announcementsRow,
      label: "Apache Airflow",
      url: "https://airflow.apache.org/announcements/index.xml",
    };

    await act(async () => {
      await result.current.apply(
        [legacyRow],
        [{ enabled: true, source: announcements, url: announcements.url }],
      );
    });

    expect(captured).toEqual([
      {
        body: { label: announcements.label, url: announcements.url },
        method: "PATCH",
        updateMask: "url,label",
        url: "/api/v2/newsSources/announcements",
      },
    ]);
  });

  it("keeps the dialog open and exposes the error when a request fails", async () => {
    captureRequests(500);
    const onSuccessConfirm = vi.fn();
    const { result } = renderHook(() => useApplyBuiltInNewsSources({ onSuccessConfirm }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.apply([], [{ enabled: true, source: blog }]);
    });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.isPending).toBe(false);
    expect(onSuccessConfirm).not.toHaveBeenCalled();
  });
});
