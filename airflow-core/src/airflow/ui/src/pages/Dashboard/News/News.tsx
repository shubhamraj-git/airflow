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
import { useEffect, useState } from "react";

import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Separator,
  Skeleton,
  Text,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { LuNewspaper } from "react-icons/lu";
import { useLocalStorage } from "usehooks-ts";

import { Alert, Modal, RouterLink } from "src/system-components";

import { ErrorAlert } from "src/components/ErrorAlert";

import { NEWS_FEED_SEEN_ENTRIES_KEY } from "src/constants/localStorage";
import { resolveSourceLabel } from "src/constants/newsFeed";

import { NewsEntryRow } from "./NewsEntryRow";
import type { NewsFeedState } from "./useNewsFeed";

type NewsProps = {
  readonly feed: NewsFeedState;
};

// The inline list is clipped to the space the section gets (the height of the overview sections
// beside it on wide screens); the dialog is where every entry is read.
const LIST_FADE = "linear-gradient(to bottom, black calc(100% - 2em), transparent)";

export const News = ({ feed }: NewsProps) => {
  const { t: translate } = useTranslation("dashboard");
  const { onClose, onOpen, open } = useDisclosure();
  const { canManage, entries, error, failedSources, isEmpty, isLoading, isVisible } = feed;
  // The ids shown on the previous visit of this browser; undefined before the first visit.
  const [seenIds, setSeenIds] = useLocalStorage<Array<string> | undefined>(
    NEWS_FEED_SEEN_ENTRIES_KEY,
    undefined,
  );
  // Frozen when this visit starts: the page often mounts with cached entries and refetches, so an
  // item added on the admin page a moment ago arrives later and must still count as new.
  const [baselineIds, setBaselineIds] = useState(() => seenIds);
  const idsKey = entries.map((entry) => entry.id).join("\n");
  const newCount =
    baselineIds === undefined ? 0 : entries.filter((entry) => !baselineIds.includes(entry.id)).length;

  useEffect(() => {
    if (!isVisible || isLoading) {
      return;
    }
    setSeenIds(idsKey === "" ? [] : idsKey.split("\n"));
  }, [idsKey, isLoading, isVisible, setSeenIds]);

  if (!isVisible) {
    return undefined;
  }

  const showAll = () => {
    setBaselineIds(entries.map((entry) => entry.id));
    onOpen();
  };

  return (
    <Flex direction="column" height="100%" minHeight={0}>
      <Flex alignItems="center" color="fg.muted" flexShrink={0} justifyContent="space-between" my={2}>
        <Flex alignItems="center">
          <LuNewspaper />
          <Heading ml={1} size="xs">
            {translate("news.title")}
          </Heading>
          {newCount > 0 ? (
            <Badge colorPalette="brand" data-testid="news-new-count" ml={2} variant="solid">
              {translate("news.newCount", { count: newCount })}
            </Badge>
          ) : undefined}
        </Flex>
        {canManage ? (
          <RouterLink fontSize="xs" h={4} to="/news_feed">
            {translate("news.manage")}
          </RouterLink>
        ) : undefined}
      </Flex>
      <ErrorAlert error={error} />
      {failedSources.length > 0 ? (
        <Alert
          flexShrink={0}
          mb={2}
          size="sm"
          status="warning"
          title={translate("news.sourceUnreachable", {
            labels: [...new Set(failedSources.map((source) => resolveSourceLabel(source)))].join(", "),
          })}
        />
      ) : undefined}
      {isLoading ? (
        <VStack align="stretch" data-testid="news-skeleton" gap={2}>
          <Skeleton height={5} width="70%" />
          <Skeleton height={5} width="55%" />
          <Skeleton height={5} width="60%" />
        </VStack>
      ) : isEmpty ? (
        <VStack align="stretch" gap={1}>
          <Text color="fg.muted" fontSize="sm">
            {translate("news.empty")}
          </Text>
          <Text color="fg.subtle" fontSize="xs">
            {translate("news.emptyUserHint")}
          </Text>
        </VStack>
      ) : (
        <Flex
          direction="column"
          flex={1}
          maxHeight={{ base: "320px", lg: "none" }}
          minHeight={0}
          overflow="hidden"
        >
          <Box flex={1} minHeight={0} overflow="hidden" style={{ maskImage: LIST_FADE }}>
            <VStack align="stretch" gap={2}>
              {entries.map((entry) => (
                <NewsEntryRow entry={entry} key={entry.id} />
              ))}
            </VStack>
          </Box>
          <Separator />
          <Flex flexShrink={0} justify="center" pt={1}>
            <Button color="fg.info" fontSize="xs" onClick={showAll} size="sm" variant="plain">
              {translate("news.showAll", { count: entries.length })}
            </Button>
          </Flex>
        </Flex>
      )}
      <Modal
        contentProps={{ maxHeight: "85vh" }}
        onOpenChange={onClose}
        open={open}
        scrollBehavior="inside"
        size="xl"
        title={translate("news.allNews", { count: entries.length })}
      >
        <VStack align="stretch" data-testid="news-dialog-list" gap={2}>
          {entries.map((entry) => (
            <NewsEntryRow entry={entry} isExpanded key={entry.id} />
          ))}
        </VStack>
      </Modal>
    </Flex>
  );
};
