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

import {
  useNewsFeedServiceGetNewsSourcesKey,
  useNewsFeedServicePatchNewsSource,
  useNewsFeedServicePostNewsSource,
} from "openapi/queries";
import type { NewsSourcePatchBody, NewsSourceResponse } from "openapi/requests/types.gen";

import { toaster } from "src/system-components";

import {
  DEFAULT_MAX_ENTRIES_PER_SOURCE,
  DEFAULT_SOURCE_TTL_DAYS,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  findBuiltInRow,
  type BuiltInNewsSource,
} from "src/constants/newsFeed";

export type BuiltInNewsSourceChange = {
  readonly enabled: boolean;
  /** Omitted keeps the stored maximum (or the default on creation). */
  readonly maxEntries?: number;
  readonly source: BuiltInNewsSource;
  /** Omitted keeps the stored interval (or the default on creation). */
  readonly syncIntervalMinutes?: number;
  /** Omitted keeps the stored TTL (or the default on creation). */
  readonly ttlDays?: number | null;
  /** Omitted keeps the stored URL (or the official one on creation); a mirror otherwise. */
  readonly url?: string;
};

/**
 * Apply enable/TTL/URL changes to the public feeds, creating their rows on first use.
 *
 * A feed that has no row, stays disabled and keeps the defaults needs no row at all.
 */
export const useApplyBuiltInNewsSources = ({ onSuccessConfirm }: { onSuccessConfirm: () => void }) => {
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(undefined);
  const [isPending, setIsPending] = useState(false);
  const { t: translate } = useTranslation(["common", "admin"]);
  const { mutateAsync: create } = useNewsFeedServicePostNewsSource();
  const { mutateAsync: update } = useNewsFeedServicePatchNewsSource();

  const applyChange = (existing: Array<NewsSourceResponse>, change: BuiltInNewsSourceChange) => {
    const row = findBuiltInRow(existing, change.source);
    const url = change.url ?? change.source.url;

    if (row === undefined) {
      return change.enabled ||
        change.ttlDays !== undefined ||
        change.syncIntervalMinutes !== undefined ||
        change.maxEntries !== undefined ||
        url !== change.source.url
        ? create({
            requestBody: {
              enabled: change.enabled,
              label: change.source.label,
              max_entries: change.maxEntries ?? DEFAULT_MAX_ENTRIES_PER_SOURCE,
              sync_interval_minutes: change.syncIntervalMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES,
              ttl_days: change.ttlDays === undefined ? DEFAULT_SOURCE_TTL_DAYS : change.ttlDays,
              url,
            },
          })
        : undefined;
    }

    const requestBody: NewsSourcePatchBody = {};
    const updateMask: Array<string> = [];

    if (row.enabled !== change.enabled) {
      requestBody.enabled = change.enabled;
      updateMask.push("enabled");
    }
    if (change.ttlDays !== undefined && row.ttl_days !== change.ttlDays) {
      requestBody.ttl_days = change.ttlDays;
      updateMask.push("ttl_days");
    }
    if (change.maxEntries !== undefined && row.max_entries !== change.maxEntries) {
      requestBody.max_entries = change.maxEntries;
      updateMask.push("max_entries");
    }
    if (
      change.syncIntervalMinutes !== undefined &&
      row.sync_interval_minutes !== change.syncIntervalMinutes
    ) {
      requestBody.sync_interval_minutes = change.syncIntervalMinutes;
      updateMask.push("sync_interval_minutes");
    }
    if (change.url !== undefined && row.url !== change.url) {
      requestBody.url = change.url;
      updateMask.push("url");
    }
    // A row matched by an outdated URL keeps being recognised once that URL is replaced by a mirror.
    if (row.label !== change.source.label) {
      requestBody.label = change.source.label;
      updateMask.push("label");
    }

    return updateMask.length > 0 ? update({ newsSourceId: row.id, requestBody, updateMask }) : undefined;
  };

  const apply = async (existing: Array<NewsSourceResponse>, changes: Array<BuiltInNewsSourceChange>) => {
    setIsPending(true);
    setError(undefined);

    const requests = changes
      .map((change) => applyChange(existing, change))
      .filter((request) => request !== undefined);

    try {
      await Promise.all(requests);
      await queryClient.invalidateQueries({ queryKey: [useNewsFeedServiceGetNewsSourcesKey] });
    } catch (applyError: unknown) {
      setError(applyError);
      setIsPending(false);

      return;
    }
    setIsPending(false);

    const resourceName = translate("admin:newsFeed.sources.publicFeedsName");

    toaster.create({
      description: translate("toaster.update.success.description", { resourceName }),
      title: translate("toaster.update.success.title", { resourceName }),
      type: "success",
    });
    onSuccessConfirm();
  };

  return { apply, error, isPending, setError };
};
