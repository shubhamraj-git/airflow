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
/**
 * News feed API helpers — create and delete news items and remote sources.
 */
import { expect } from "@playwright/test";

import { baseUrl, getRequestContext, type RequestLike } from "../shared";

export type NewsItemPayload = {
  body?: string;
  expires_at?: string;
  published_at?: string;
  title: string;
  url?: string;
};

export type NewsSourcePayload = {
  enabled?: boolean;
  label: string;
  ttl_days?: number | null;
  url: string;
};

/** Create a news item via the API and return its id. */
export async function apiCreateNewsItem(source: RequestLike, payload: NewsItemPayload): Promise<string> {
  const request = getRequestContext(source);
  let id = "";

  await expect(async () => {
    const response = await request.post(`${baseUrl}/api/v2/newsItems`, {
      data: payload,
      headers: { "Content-Type": "application/json" },
      timeout: 10_000,
    });

    if (!response.ok()) {
      throw new Error(`News item creation failed (${response.status()})`);
    }
    ({ id } = (await response.json()) as { id: string });
  }).toPass({ intervals: [2000, 3000, 5000], timeout: 90_000 });

  return id;
}

/** Delete a news item via the API. 404 is treated as success. */
export async function apiDeleteNewsItem(source: RequestLike, id: string): Promise<void> {
  const request = getRequestContext(source);
  const response = await request.delete(`${baseUrl}/api/v2/newsItems/${id}`, { timeout: 10_000 });

  if (response.status() !== 404 && !response.ok()) {
    throw new Error(`News item deletion failed (${response.status()})`);
  }
}

/** Create a news source via the API and return its id. A source with the same URL is reused. */
export async function apiCreateNewsSource(source: RequestLike, payload: NewsSourcePayload): Promise<string> {
  const request = getRequestContext(source);
  let id = "";

  await expect(async () => {
    const response = await request.post(`${baseUrl}/api/v2/newsSources`, {
      data: payload,
      headers: { "Content-Type": "application/json" },
      timeout: 10_000,
    });

    if (response.status() === 409) {
      const listResponse = await request.get(`${baseUrl}/api/v2/newsSources?limit=100`, { timeout: 10_000 });
      const { news_sources: sources } = (await listResponse.json()) as {
        news_sources: Array<{ id: string; url: string }>;
      };
      const existing = sources.find((candidate) => candidate.url === payload.url);

      if (existing === undefined) {
        throw new Error("News source exists but could not be listed");
      }
      ({ id } = existing);

      return;
    }
    if (!response.ok()) {
      throw new Error(`News source creation failed (${response.status()})`);
    }
    ({ id } = (await response.json()) as { id: string });
  }).toPass({ intervals: [2000, 3000, 5000], timeout: 90_000 });

  return id;
}

/** Delete a news source via the API. 404 is treated as success. */
export async function apiDeleteNewsSource(source: RequestLike, id: string): Promise<void> {
  const request = getRequestContext(source);
  const response = await request.delete(`${baseUrl}/api/v2/newsSources/${id}`, { timeout: 10_000 });

  if (response.status() !== 404 && !response.ok()) {
    throw new Error(`News source deletion failed (${response.status()})`);
  }
}
