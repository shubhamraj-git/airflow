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
import { describe, expect, it, vi } from "vitest";

import { Wrapper } from "src/utils/Wrapper";

import { MaxEntriesField } from "./MaxEntriesField";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    // eslint-disable-next-line id-length
    t: (key: string) => key,
  }),
}));

const renderField = (preset: "10" | "custom", customEntries: number) =>
  render(
    <MaxEntriesField
      customEntries={customEntries}
      onCustomEntriesChange={vi.fn()}
      onPresetChange={vi.fn()}
      preset={preset}
      testId="max-entries-preset"
    />,
    { wrapper: Wrapper },
  );

describe("MaxEntriesField", () => {
  it("asks for a number only for the custom preset", () => {
    renderField("10", 10);

    expect(screen.getByText("newsFeed.form.maxEntries")).toBeInTheDocument();
    expect(screen.queryByLabelText(/newsFeed\.form\.customEntries/u)).not.toBeInTheDocument();
  });

  it.each([
    { entries: 0, expectError: true },
    { entries: 1, expectError: false },
    { entries: 100, expectError: false },
    { entries: 101, expectError: true },
  ])("flags $entries custom entries as out of range: $expectError", ({ entries, expectError }) => {
    renderField("custom", entries);

    if (expectError) {
      expect(screen.getByText("newsFeed.form.maxEntriesRange")).toBeInTheDocument();
    } else {
      expect(screen.queryByText("newsFeed.form.maxEntriesRange")).not.toBeInTheDocument();
    }
  });
});
