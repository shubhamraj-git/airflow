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
import { Box, HStack, Text, VisuallyHidden } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { FiAlertCircle } from "react-icons/fi";

import Time from "src/components/Time";

type SyncState = { readonly last_fetch_error: string | null; readonly last_fetched_at: string | null };

type FetchStatusProps = {
  readonly row?: SyncState;
};

/** Error icon for a source button when enabled sources failed their last sync; nothing otherwise. */
export const SyncErrorIcon = ({
  rows,
}: {
  readonly rows: ReadonlyArray<{ enabled: boolean } & SyncState>;
}) => {
  const { t: translate } = useTranslation("admin");
  const failedCount = rows.filter((row) => row.enabled && row.last_fetch_error !== null).length;

  if (failedCount === 0) {
    return undefined;
  }

  const label = translate("newsFeed.sources.syncFailed", { count: failedCount });

  return (
    <Box as="span" color="fg.error" data-testid="sync-error-icon" display="inline-flex" title={label}>
      <FiAlertCircle aria-hidden />
      <VisuallyHidden>{label}</VisuallyHidden>
    </Box>
  );
};

/** When the sync command last fetched a source, or why it failed; entries only appear after a sync. */
export const FetchStatus = ({ row }: FetchStatusProps) => {
  const { t: translate } = useTranslation("admin");

  if (row?.last_fetch_error !== null && row?.last_fetch_error !== undefined) {
    return (
      <HStack alignItems="flex-start" color="fg.error" fontSize="xs" gap={1}>
        <Box flexShrink={0} mt="2px">
          <FiAlertCircle />
        </Box>
        <Text>{translate("newsFeed.sources.fetchStatus.failed", { error: row.last_fetch_error })}</Text>
      </HStack>
    );
  }
  if (row?.last_fetched_at === null || row?.last_fetched_at === undefined) {
    return (
      <Text color="fg.muted" fontSize="xs">
        {translate("newsFeed.sources.fetchStatus.never")}
      </Text>
    );
  }

  return (
    <Text color="fg.muted" fontSize="xs">
      {translate("newsFeed.sources.fetchStatus.lastSynced")} <Time datetime={row.last_fetched_at} />
    </Text>
  );
};
