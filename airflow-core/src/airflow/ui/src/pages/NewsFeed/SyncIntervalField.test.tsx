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
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Wrapper } from "src/utils/Wrapper";

import { SyncIntervalField } from "./SyncIntervalField";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    // eslint-disable-next-line id-length
    t: (key: string) => key,
  }),
}));

const renderField = (preset: "15" | "custom", customMinutes: number) => {
  const onCustomMinutesChange = vi.fn();

  render(
    <SyncIntervalField
      customMinutes={customMinutes}
      onCustomMinutesChange={onCustomMinutesChange}
      onPresetChange={vi.fn()}
      preset={preset}
      testId="sync-preset"
    />,
    { wrapper: Wrapper },
  );

  return onCustomMinutesChange;
};

describe("SyncIntervalField", () => {
  it("asks for minutes only for the custom preset", () => {
    renderField("15", 60);

    expect(screen.queryByLabelText(/newsFeed\.form\.customMinutes/u)).not.toBeInTheDocument();
  });

  it.each([
    { expectError: true, minutes: 4 },
    { expectError: false, minutes: 5 },
  ])("flags $minutes custom minutes as invalid: $expectError", ({ expectError, minutes }) => {
    renderField("custom", minutes);

    if (expectError) {
      expect(screen.getByText("common:validation.mustBeAtLeast")).toBeInTheDocument();
    } else {
      expect(screen.queryByText("common:validation.mustBeAtLeast")).not.toBeInTheDocument();
    }
  });

  it("reports typed minutes, and an emptied field as not a number", () => {
    const onCustomMinutesChange = renderField("custom", 30);
    const input = screen.getByLabelText(/newsFeed\.form\.customMinutes/u);

    fireEvent.change(input, { target: { value: "45" } });
    fireEvent.change(input, { target: { value: "" } });

    expect(onCustomMinutesChange).toHaveBeenNthCalledWith(1, 45);
    expect(onCustomMinutesChange).toHaveBeenNthCalledWith(2, Number.NaN);
  });
});
