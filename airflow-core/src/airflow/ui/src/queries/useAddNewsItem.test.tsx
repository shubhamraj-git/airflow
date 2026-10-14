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

import type { NewsItemFormValues } from "src/pages/NewsFeed/NewsItemForm";

import { useAddNewsItem } from "src/queries/useAddNewsItem";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const initialValues: NewsItemFormValues = {
  author: "",
  body: "",
  customExpiresAt: "",
  expiryPreset: "7d",
  priority: "P2",
  publishedAt: "2026-10-14T12:00:00.000Z",
  title: "",
  url: "",
};

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const TestWrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return TestWrapper;
};

const captureNewsItemPost = () => {
  const bodies: Array<Record<string, unknown>> = [];

  server.use(
    http.post("*/api/v2/newsItems", async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);

      return HttpResponse.json({ id: "new" }, { status: 201 });
    }),
  );

  return bodies;
};

describe("useAddNewsItem", () => {
  it("lets the server stamp the publication time when the prefilled one was left untouched", async () => {
    const bodies = captureNewsItemPost();
    const { result } = renderHook(() => useAddNewsItem(initialValues, { onSuccessConfirm: vi.fn() }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.addNewsItem({ ...initialValues, title: "Maintenance" });
    });

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      expires_at: "2026-10-21T12:00:00.000Z",
      priority: "P2",
      title: "Maintenance",
    });
  });

  it("sends the publication time the user picked", async () => {
    const bodies = captureNewsItemPost();
    const { result } = renderHook(() => useAddNewsItem(initialValues, { onSuccessConfirm: vi.fn() }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.addNewsItem({
        ...initialValues,
        author: "Platform team",
        body: "Details",
        expiryPreset: "indefinite",
        publishedAt: "2026-10-15T08:00:00.000Z",
        title: "Scheduled",
        url: "https://example.com/news",
      });
    });

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      author: "Platform team",
      body: "Details",
      priority: "P2",
      published_at: "2026-10-15T08:00:00.000Z",
      title: "Scheduled",
      url: "https://example.com/news",
    });
  });
});
