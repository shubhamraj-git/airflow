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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Wrapper } from "src/utils/Wrapper";

import NewsItemForm, { type NewsItemFormValues } from "./NewsItemForm";

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

const renderForm = (values: Partial<NewsItemFormValues> = {}) => {
  const manageMutate = vi.fn();

  render(
    <NewsItemForm
      error={undefined}
      initialValues={{ ...initialValues, ...values }}
      isPending={false}
      manageMutate={manageMutate}
      setError={vi.fn()}
    />,
    { wrapper: Wrapper },
  );

  return manageMutate;
};

describe("NewsItemForm", () => {
  it("submits the entered values with the selected expiry preset", async () => {
    const manageMutate = renderForm();

    fireEvent.change(screen.getByLabelText(/newsFeed\.form\.title/u), { target: { value: "Maintenance" } });
    fireEvent.change(screen.getByLabelText(/newsFeed\.form\.link/u), {
      target: { value: "https://wiki.example.com/maintenance" },
    });

    const saveButton = screen.getByRole("button", { name: /save/u });

    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(manageMutate).toHaveBeenCalledWith({
        ...initialValues,
        title: "Maintenance",
        url: "https://wiki.example.com/maintenance",
      }),
    );
  });

  it("rejects a link without an http(s) scheme", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/newsFeed\.form\.title/u), { target: { value: "Maintenance" } });
    fireEvent.change(screen.getByLabelText(/newsFeed\.form\.link/u), {
      target: { value: "wiki.example.com" },
    });

    await waitFor(() => expect(screen.getByText(/newsFeed\.form\.invalidUrl/u)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /save/u })).toBeDisabled();
  });

  it("requires a custom expiry after the publication time", async () => {
    renderForm({ customExpiresAt: "2026-10-13T12:00:00.000Z", expiryPreset: "custom", title: "Maintenance" });

    // The custom date picker is only mounted for the custom preset.
    expect(screen.getByText(/newsFeed\.form\.customDate/u)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/newsFeed\.form\.title/u), { target: { value: "Maintenance!" } });

    await waitFor(() => expect(screen.getByRole("button", { name: /save/u })).toBeDisabled());
  });

  it("hides the custom expiry picker for preset expiries", () => {
    renderForm({ expiryPreset: "indefinite" });

    expect(screen.queryByText(/newsFeed\.form\.customDate/u)).not.toBeInTheDocument();
  });
});
