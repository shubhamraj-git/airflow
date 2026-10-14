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

import { Button, Skeleton, Status, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { useNewsFeedServiceGetNewsSources } from "openapi/queries";

import { ErrorAlert } from "src/components/ErrorAlert";

import { isBuiltInNewsSourceRow } from "src/constants/newsFeed";
import { useApplyRemoteSources } from "src/queries/useApplyRemoteSources";
import { useConfig } from "src/queries/useConfig";

import { SyncErrorIcon } from "./FetchStatus";
import { RemoteSourcesDialog } from "./RemoteSourcesDialog";

const NEWS_SOURCES_LIMIT = 100;

/** On, in green, as soon as one source is enabled; the dialog shows which. */
const STATUS_COLOR = { off: "gray", on: "green" } as const;

/**
 * One button that shows whether any of the administrator's own remote sources is on and opens the
 * dialog that manages them. The public Apache Airflow feeds have their own control.
 */
export const RemoteSourcesControl = () => {
  const { t: translate } = useTranslation("admin");
  const allowRemoteSources = Boolean(useConfig("news_feed_allow_remote_sources"));
  const { data, error, isLoading } = useNewsFeedServiceGetNewsSources(
    { limit: NEWS_SOURCES_LIMIT, orderBy: ["label"] },
    undefined,
    { enabled: allowRemoteSources },
  );
  const [open, setOpen] = useState(false);
  const closeDialog = () => setOpen(false);
  const {
    apply,
    error: applyError,
    isPending,
    setError,
  } = useApplyRemoteSources({ onSuccessConfirm: closeDialog });

  if (!allowRemoteSources) {
    return undefined;
  }

  const rows = (data?.news_sources ?? []).filter((source) => !isBuiltInNewsSourceRow(source));
  const enabledRows = rows.filter((source) => source.enabled);
  const status = enabledRows.length > 0 ? "on" : "off";

  const openDialog = () => {
    setError(undefined);
    setOpen(true);
  };

  const disableAll = () =>
    void apply({
      creates: [],
      deletes: [],
      patches: enabledRows.map((row) => ({
        id: row.id,
        requestBody: { enabled: false },
        updateMask: ["enabled"],
      })),
    });

  return (
    <>
      <ErrorAlert error={error} />
      {isLoading ? (
        <Skeleton height={8} width="180px" />
      ) : (
        <Button data-testid="remote-sources-button" onClick={openDialog} size="sm" variant="outline">
          <Status.Root colorPalette={STATUS_COLOR[status]}>
            <Status.Indicator />
          </Status.Root>
          {translate("newsFeed.remoteSources.title")}
          <Text as="span" color="fg.muted" fontWeight="normal">
            {translate(`newsFeed.remoteSources.status.${status}`)}
          </Text>
          <SyncErrorIcon rows={rows} />
        </Button>
      )}
      {open ? (
        <RemoteSourcesDialog
          error={applyError}
          isPending={isPending}
          onClose={closeDialog}
          onDisableAll={enabledRows.length > 0 ? disableAll : undefined}
          onSave={(changes) => void apply(changes)}
          open
          rows={rows}
        />
      ) : undefined}
    </>
  );
};
