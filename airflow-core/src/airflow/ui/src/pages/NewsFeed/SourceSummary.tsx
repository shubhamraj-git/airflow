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
import type { ReactNode } from "react";

import { Badge, Box, HStack, Text, VStack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import type { NewsSourceResponse } from "openapi/requests/types.gen";

import { FetchStatus } from "./FetchStatus";
import {
  MAX_ENTRIES_LABEL_KEYS,
  SYNC_INTERVAL_LABEL_KEYS,
  TTL_PRESET_LABEL_KEYS,
  type MaxEntriesPreset,
  type SourceTtlPreset,
  type SyncIntervalPreset,
} from "./presets";

type SourceSummaryProps = {
  /** The icon buttons on the right, such as edit and remove. */
  readonly actions: ReactNode;
  readonly customMaxEntries: number;
  readonly customSyncMinutes: number;
  readonly customTtlDays: number;
  readonly enabled: boolean;
  readonly maxEntriesPreset: MaxEntriesPreset;
  /** The stored row, for the outcome of its last sync; absent before the source is saved. */
  readonly row?: NewsSourceResponse;
  readonly syncPreset: SyncIntervalPreset;
  readonly testId: string;
  readonly title: string;
  readonly ttlPreset: SourceTtlPreset;
  readonly url: string;
};

/**
 * A stored source shown read-only until its edit button unlocks the fields, so nothing changes by
 * accident; used by both source dialogs.
 */
export const SourceSummary = ({
  actions,
  customMaxEntries,
  customSyncMinutes,
  customTtlDays,
  enabled,
  maxEntriesPreset,
  row,
  syncPreset,
  testId,
  title,
  ttlPreset,
  url,
}: SourceSummaryProps) => {
  const { t: translate } = useTranslation("admin");

  return (
    <Box borderRadius="md" borderWidth="1px" data-testid={testId} p={3}>
      <HStack alignItems="flex-start" gap={4} justify="space-between">
        <VStack align="start" gap={1} minWidth={0}>
          <HStack gap={2}>
            <Badge colorPalette={enabled ? "green" : "gray"} variant="subtle">
              {translate(enabled ? "newsFeed.remoteSources.enabled" : "newsFeed.remoteSources.disabled")}
            </Badge>
            <Text fontWeight="semibold">{title}</Text>
          </HStack>
          <Text color="fg.muted" fontSize="sm" wordBreak="break-all">
            {url}
          </Text>
          <Text color="fg.muted" fontSize="xs">
            {translate("newsFeed.form.ttl")}:{" "}
            {ttlPreset === "custom"
              ? translate("newsFeed.remoteSources.days", { count: customTtlDays })
              : translate(TTL_PRESET_LABEL_KEYS[ttlPreset])}
          </Text>
          <Text color="fg.muted" fontSize="xs">
            {translate("newsFeed.form.syncInterval")}:{" "}
            {syncPreset === "custom"
              ? translate("newsFeed.remoteSources.minutes", { count: customSyncMinutes })
              : translate(SYNC_INTERVAL_LABEL_KEYS[syncPreset])}
          </Text>
          <Text color="fg.muted" fontSize="xs">
            {translate("newsFeed.form.maxEntries")}:{" "}
            {maxEntriesPreset === "custom"
              ? translate("newsFeed.remoteSources.entries", { count: customMaxEntries })
              : translate(MAX_ENTRIES_LABEL_KEYS[maxEntriesPreset])}
          </Text>
          <FetchStatus row={row} />
        </VStack>
        <HStack flexShrink={0} gap={1}>
          {actions}
        </HStack>
      </HStack>
    </Box>
  );
};
