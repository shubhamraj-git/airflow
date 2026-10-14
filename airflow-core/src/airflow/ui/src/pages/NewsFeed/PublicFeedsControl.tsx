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

import { BUILT_IN_NEWS_SOURCES, isBuiltInNewsSourceRow } from "src/constants/newsFeed";
import { useApplyBuiltInNewsSources } from "src/queries/useApplyBuiltInNewsSources";
import { useConfig } from "src/queries/useConfig";

import { SyncErrorIcon } from "./FetchStatus";
import { PublicFeedsDialog } from "./PublicFeedsDialog";

const NEWS_SOURCES_LIMIT = 100;

/** On, in green, as soon as one feed is enabled; the dialog shows which. */
const STATUS_COLOR = { off: "gray", on: "green" } as const;

/**
 * One button that shows whether the public Apache Airflow feeds are on or off and opens the dialog
 * that configures them.
 */
export const PublicFeedsControl = () => {
  const { t: translate } = useTranslation("admin");
  const allowRemoteSources = Boolean(useConfig("news_feed_allow_remote_sources"));
  const allowPublicFeeds = Boolean(useConfig("news_feed_allow_public_airflow_feeds"));
  const isAllowed = allowRemoteSources && allowPublicFeeds;
  const { data, error, isLoading } = useNewsFeedServiceGetNewsSources(
    { limit: NEWS_SOURCES_LIMIT, orderBy: ["label"] },
    undefined,
    { enabled: isAllowed },
  );
  const [open, setOpen] = useState(false);
  const closeDialog = () => setOpen(false);
  const {
    apply,
    error: applyError,
    isPending,
    setError,
  } = useApplyBuiltInNewsSources({
    onSuccessConfirm: closeDialog,
  });

  if (!isAllowed) {
    return undefined;
  }

  const sources = data?.news_sources ?? [];
  const builtInRows = sources.filter(isBuiltInNewsSourceRow);
  const enabledCount = builtInRows.filter((source) => source.enabled).length;
  const status = enabledCount > 0 ? "on" : "off";

  const openDialog = () => {
    setError(undefined);
    setOpen(true);
  };

  const disableAll = () =>
    void apply(
      sources,
      BUILT_IN_NEWS_SOURCES.map((source) => ({ enabled: false, source })),
    );

  return (
    <>
      <ErrorAlert error={error} />
      {isLoading ? (
        <Skeleton height={8} width="200px" />
      ) : (
        <Button data-testid="public-feeds-button" onClick={openDialog} size="sm" variant="outline">
          <Status.Root colorPalette={STATUS_COLOR[status]}>
            <Status.Indicator />
          </Status.Root>
          {translate("newsFeed.sources.publicFeeds")}
          <Text as="span" color="fg.muted" fontWeight="normal">
            {translate(`newsFeed.sources.status.${status}`)}
          </Text>
          <SyncErrorIcon rows={builtInRows} />
        </Button>
      )}
      {open ? (
        <PublicFeedsDialog
          error={applyError}
          isPending={isPending}
          onClose={closeDialog}
          onDisableAll={enabledCount > 0 ? disableAll : undefined}
          onSave={(changes) => void apply(sources, changes)}
          open
          rows={builtInRows}
        />
      ) : undefined}
    </>
  );
};
