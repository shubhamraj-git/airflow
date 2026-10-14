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
import { Heading, HStack, List, Text, VStack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { LuNewspaper } from "react-icons/lu";

import { useConfig } from "src/queries/useConfig";

/** Shown instead of the items table while no item exists: what the feed is and how to fill it. */
export const NewsFeedEmptyState = () => {
  const { t: translate } = useTranslation("admin");
  const isEnabled = Boolean(useConfig("news_feed_enabled"));
  const allowRemoteSources = Boolean(useConfig("news_feed_allow_remote_sources"));
  const allowPublicFeeds = Boolean(useConfig("news_feed_allow_public_airflow_feeds"));
  const showPublicFeedsHint = allowRemoteSources && allowPublicFeeds;

  return (
    <VStack
      align="center"
      borderRadius="md"
      borderWidth="1px"
      data-testid="news-feed-empty-state"
      gap={3}
      maxWidth="760px"
      mt={8}
      mx="auto"
      p={8}
      textAlign="center"
    >
      <HStack color="fg.muted" gap={2}>
        <LuNewspaper />
        <Heading size="md">{translate("newsFeed.emptyState.title")}</Heading>
      </HStack>
      <Text>{translate("newsFeed.emptyState.body")}</Text>
      <List.Root gap={1} pl={5} textAlign="left">
        <List.Item>{translate("newsFeed.emptyState.addHint")}</List.Item>
        {showPublicFeedsHint ? (
          <List.Item>{translate("newsFeed.emptyState.publicFeedsHint")}</List.Item>
        ) : undefined}
        {allowRemoteSources ? (
          <List.Item>{translate("newsFeed.emptyState.remoteSourcesHint")}</List.Item>
        ) : undefined}
        <List.Item>{translate("newsFeed.emptyState.apiHint")}</List.Item>
      </List.Root>
      {isEnabled ? undefined : (
        <Text color="fg.muted" fontSize="sm">
          {translate("newsFeed.emptyState.disabledHint")}
        </Text>
      )}
    </VStack>
  );
};
