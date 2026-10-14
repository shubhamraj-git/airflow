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
import { expect, type Locator, type Page } from "@playwright/test";

import { BasePage } from "tests/e2e/pages/BasePage";

export class NewsFeedPage extends BasePage {
  public static get newsFeedUrl(): string {
    return "/news_feed";
  }

  public readonly addItemButton: Locator;
  public readonly itemsTable: Locator;
  public readonly pageHeading: Locator;
  public readonly publicFeedsButton: Locator;
  public readonly remoteSourcesButton: Locator;

  public constructor(page: Page) {
    super(page);
    this.addItemButton = page.getByRole("button", { name: "Add new News" });
    this.itemsTable = page.getByTestId("table-list");
    this.pageHeading = page.getByRole("heading", { name: "News feed" });
    this.publicFeedsButton = page.getByRole("button", { name: /Public Airflow Feed/u });
    this.remoteSourcesButton = page.getByRole("button", { name: /Remote sources/u });
  }

  public async createItem(title: string, link?: string): Promise<void> {
    await this.addItemButton.click();

    const dialog = this.page.getByRole("dialog");

    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Title").fill(title);
    if (link !== undefined) {
      await dialog.getByLabel("Link").fill(link);
    }

    const saveButton = dialog.getByRole("button", { name: "Save" });

    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    const responsePromise = this.page.waitForResponse(
      (response) => response.url().includes("/api/v2/newsItems") && response.request().method() === "POST",
      { timeout: 10_000 },
    );

    await saveButton.click();
    await responsePromise;
    await this.waitForAllDialogsClosed();
  }

  public async deleteItem(title: string): Promise<void> {
    await this.getItemRow(title).getByRole("button", { name: "Delete News item" }).click();

    const dialog = this.page.getByRole("dialog");

    await expect(dialog).toBeVisible();

    const responsePromise = this.page.waitForResponse(
      (response) => response.url().includes("/api/v2/newsItems/") && response.request().method() === "DELETE",
      { timeout: 10_000 },
    );

    await dialog.getByTestId("delete-confirm-button").click();
    await responsePromise;
    await this.waitForAllDialogsClosed();
  }

  public async editItemTitle(title: string, newTitle: string): Promise<void> {
    await this.getItemRow(title).getByRole("button", { name: "Edit News item" }).click();

    const dialog = this.page.getByRole("dialog");

    await expect(dialog).toBeVisible();

    const titleInput = dialog.getByLabel("Title");

    await titleInput.fill("");
    await titleInput.fill(newTitle);

    const saveButton = dialog.getByRole("button", { name: "Save" });

    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    const responsePromise = this.page.waitForResponse(
      (response) => response.url().includes("/api/v2/newsItems/") && response.request().method() === "PATCH",
      { timeout: 10_000 },
    );

    await saveButton.click();
    await responsePromise;
    await this.waitForAllDialogsClosed();
  }

  public getItemRow(title: string): Locator {
    return this.itemsTable.getByRole("row").filter({ hasText: title });
  }

  public async navigate(): Promise<void> {
    await this.navigateTo(NewsFeedPage.newsFeedUrl);
    await expect(this.pageHeading).toBeVisible();
  }
}
