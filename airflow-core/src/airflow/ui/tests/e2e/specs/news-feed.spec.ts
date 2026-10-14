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
import { expect, test } from "tests/e2e/fixtures";
import {
  apiCreateNewsItem,
  apiCreateNewsSource,
  apiDeleteNewsItem,
  apiDeleteNewsSource,
} from "tests/e2e/utils/api/news-feed";
import { uniqueRunId } from "tests/e2e/utils/shared";

test.describe("News feed", () => {
  test.setTimeout(60_000);

  let seededItemTitle: string;
  let seededItemId: string;
  let unreachableSourceId: string | undefined;
  const createdItemTitles: Array<string> = [];

  test.beforeAll(async ({ authenticatedRequest }) => {
    seededItemTitle = `E2E news ${uniqueRunId("news")}`;
    seededItemId = await apiCreateNewsItem(authenticatedRequest, {
      body: "Written by the **end-to-end** suite.",
      title: seededItemTitle,
      url: "https://airflow.apache.org/",
    });
  });

  test.afterAll(async ({ authenticatedRequest }) => {
    await apiDeleteNewsItem(authenticatedRequest, seededItemId);
    if (unreachableSourceId !== undefined) {
      await apiDeleteNewsSource(authenticatedRequest, unreachableSourceId);
    }
  });

  test("shows items written by administrators on the home page", async ({ homePage }) => {
    await homePage.navigate();

    await expect(homePage.newsSection).toBeVisible();
    await expect(homePage.newsEntries.filter({ hasText: seededItemTitle })).toBeVisible();
    await expect(homePage.newsEntries.filter({ hasText: seededItemTitle })).toContainText("end-to-end");
  });

  test("creates, edits and deletes an item from the admin page", async ({ newsFeedPage }) => {
    const title = `E2E admin news ${uniqueRunId("news")}`;
    const updatedTitle = `${title} (updated)`;

    createdItemTitles.push(title, updatedTitle);
    await newsFeedPage.navigate();

    await newsFeedPage.createItem(title, "https://example.com/news");
    await expect(newsFeedPage.getItemRow(title)).toBeVisible();
    await expect(newsFeedPage.getItemRow(title)).toContainText("Active");

    await newsFeedPage.editItemTitle(title, updatedTitle);
    await expect(newsFeedPage.getItemRow(updatedTitle)).toBeVisible();

    await newsFeedPage.deleteItem(updatedTitle);
    await expect(newsFeedPage.getItemRow(updatedTitle)).toHaveCount(0);
  });

  test("warns on the home page when an enabled remote source is unreachable", async ({
    authenticatedRequest,
    homePage,
  }) => {
    const label = `Unreachable ${uniqueRunId("source")}`;

    unreachableSourceId = await apiCreateNewsSource(authenticatedRequest, {
      enabled: true,
      label,
      url: `https://${uniqueRunId("news-feed")}.invalid/feed.xml`,
    });

    await homePage.navigate();

    await expect(homePage.newsSourceWarning).toBeVisible({ timeout: 30_000 });
    await expect(homePage.newsSourceWarning).toContainText(label);
  });
});
