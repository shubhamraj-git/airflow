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
import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { useApplyRemoteSources } from "src/queries/useApplyRemoteSources";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

type Captured = {
  body: Record<string, unknown> | null;
  method: string;
  updateMask: string | null;
  url: string;
};

// The Node interceptor invokes a resolver twice per axios request; reading the body makes the
// second invocation fail on the consumed body, so every request is recorded exactly once.
const readBody = async (request: Request): Promise<Record<string, unknown> | null> => {
  const text = await request.text();

  return text === "" ? null : (JSON.parse(text) as Record<string, unknown>);
};

const captureRequests = (status = 200) => {
  const captured: Array<Captured> = [];
  const record = async ({ request }: { request: Request }) => {
    captured.push({
      body: await readBody(request),
      method: request.method,
      updateMask: new URL(request.url).searchParams.getAll("update_mask").join(",") || null,
      url: new URL(request.url).pathname,
    });

    return request.method === "DELETE"
      ? new HttpResponse(null, { status: status === 200 ? 204 : status })
      : HttpResponse.json({ id: "any" }, { status });
  };

  server.use(
    http.post("*/api/v2/newsSources", record),
    http.patch("*/api/v2/newsSources/:id", record),
    http.delete("*/api/v2/newsSources/:id", record),
  );

  return captured;
};

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const TestWrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return TestWrapper;
};

const changes = {
  creates: [{ enabled: true, label: "Team blog", ttl_days: 30, url: "https://blog.internal/atom.xml" }],
  deletes: ["gone"],
  patches: [{ id: "mirror", requestBody: { enabled: false }, updateMask: ["enabled"] }],
};

describe("useApplyRemoteSources", () => {
  it("sends one request per create, patch and delete, then confirms", async () => {
    const captured = captureRequests();
    const onSuccessConfirm = vi.fn();
    const { result } = renderHook(() => useApplyRemoteSources({ onSuccessConfirm }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.apply(changes);
    });

    expect(captured).toEqual(
      expect.arrayContaining([
        { body: changes.creates[0], method: "POST", updateMask: null, url: "/api/v2/newsSources" },
        {
          body: { enabled: false },
          method: "PATCH",
          updateMask: "enabled",
          url: "/api/v2/newsSources/mirror",
        },
        { body: null, method: "DELETE", updateMask: null, url: "/api/v2/newsSources/gone" },
      ]),
    );
    expect(captured).toHaveLength(3);
    expect(onSuccessConfirm).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeUndefined();
  });

  it("keeps the dialog open and exposes the error when a request fails", async () => {
    captureRequests(500);
    const onSuccessConfirm = vi.fn();
    const { result } = renderHook(() => useApplyRemoteSources({ onSuccessConfirm }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.apply(changes);
    });

    expect(onSuccessConfirm).not.toHaveBeenCalled();
    expect(result.current.error).toBeDefined();
    expect(result.current.isPending).toBe(false);
  });
});
