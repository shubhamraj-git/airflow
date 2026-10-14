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

import { useNewsFeedServiceGetNewsItemsKey, useNewsFeedServicePostNewsItem } from "openapi/queries";

import { toaster } from "src/system-components";

import type { NewsItemFormValues } from "src/pages/NewsFeed/NewsItemForm";
import { computeExpiresAt } from "src/pages/NewsFeed/presets";

export const useAddNewsItem = (
  initialValues: NewsItemFormValues,
  { onSuccessConfirm }: { onSuccessConfirm: () => void },
) => {
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(undefined);
  const { t: translate } = useTranslation(["common", "admin"]);

  const onSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: [useNewsFeedServiceGetNewsItemsKey] });

    toaster.create({
      description: translate("toaster.create.success.description", {
        resourceName: translate("admin:newsFeed.item_one"),
      }),
      title: translate("toaster.create.success.title", {
        resourceName: translate("admin:newsFeed.item_one"),
      }),
      type: "success",
    });

    onSuccessConfirm();
  };

  const onError = (_error: unknown) => {
    setError(_error);
  };

  const { isPending, mutate } = useNewsFeedServicePostNewsItem({ onError, onSuccess });

  const addNewsItem = (values: NewsItemFormValues) => {
    // The form opens with "now" prefilled; left untouched, the server stamps the moment of saving
    // instead, so an item is never a few seconds "scheduled" because of the time spent writing it.
    const isPublishedAtUntouched = values.publishedAt === initialValues.publishedAt;

    mutate({
      requestBody: {
        author: values.author === "" ? undefined : values.author,
        body: values.body === "" ? undefined : values.body,
        expires_at: computeExpiresAt(values.publishedAt, values.expiryPreset, values.customExpiresAt),
        priority: values.priority,
        published_at: isPublishedAtUntouched ? undefined : values.publishedAt,
        title: values.title,
        url: values.url === "" ? undefined : values.url,
      },
    });
  };

  return { addNewsItem, error, isPending, setError };
};
