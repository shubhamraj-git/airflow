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
import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useNewsFeedServiceGetNewsItemsKey, useNewsFeedServicePatchNewsItem } from "openapi/queries";
import type { NewsItemPatchBody } from "openapi/requests/types.gen";

import { toaster } from "src/system-components";

import type { NewsItemFormValues } from "src/pages/NewsFeed/NewsItemForm";
import { computeExpiresAt } from "src/pages/NewsFeed/presets";

const toExpiresAt = (values: NewsItemFormValues) =>
  computeExpiresAt(values.publishedAt, values.expiryPreset, values.customExpiresAt) ?? null;

export const useEditNewsItem = (
  newsItemId: string,
  initialValues: NewsItemFormValues,
  { onSuccessConfirm }: { onSuccessConfirm: () => void },
) => {
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(undefined);
  const { t: translate } = useTranslation(["common", "admin"]);

  const onSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: [useNewsFeedServiceGetNewsItemsKey] });

    toaster.create({
      description: translate("toaster.update.success.description", {
        resourceName: translate("admin:newsFeed.item_one"),
      }),
      title: translate("toaster.update.success.title", {
        resourceName: translate("admin:newsFeed.item_one"),
      }),
      type: "success",
    });

    onSuccessConfirm();
  };

  const onError = (_error: unknown) => {
    setError(_error);
  };

  const { isPending, mutate } = useNewsFeedServicePatchNewsItem({ onError, onSuccess });

  const editNewsItem = (values: NewsItemFormValues) => {
    const requestBody: NewsItemPatchBody = {};
    const updateMask: Array<string> = [];

    if (values.title !== initialValues.title) {
      requestBody.title = values.title;
      updateMask.push("title");
    }
    if (values.author !== initialValues.author) {
      requestBody.author = values.author === "" ? null : values.author;
      updateMask.push("author");
    }
    if (values.priority !== initialValues.priority) {
      requestBody.priority = values.priority;
      updateMask.push("priority");
    }
    if (values.body !== initialValues.body) {
      // An emptied field clears the column, so null rather than undefined.
      requestBody.body = values.body === "" ? null : values.body;
      updateMask.push("body");
    }
    if (values.url !== initialValues.url) {
      requestBody.url = values.url === "" ? null : values.url;
      updateMask.push("url");
    }
    if (values.publishedAt !== initialValues.publishedAt) {
      requestBody.published_at = values.publishedAt;
      updateMask.push("published_at");
    }
    const expiresAt = toExpiresAt(values);

    if (expiresAt !== toExpiresAt(initialValues)) {
      requestBody.expires_at = expiresAt;
      updateMask.push("expires_at");
    }

    mutate({ newsItemId, requestBody, updateMask });
  };

  return { editNewsItem, error, isPending, setError };
};
