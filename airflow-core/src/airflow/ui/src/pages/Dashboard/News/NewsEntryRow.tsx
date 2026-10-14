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
import { Badge, Box, HStack, Link, Text, VStack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { FiExternalLink, FiHome, FiRss } from "react-icons/fi";

import ReactMarkdown from "src/components/ReactMarkdown";
import Time from "src/components/Time";

import { NEWS_ITEM_PRIORITY_COLORS } from "src/constants/newsFeed";

import type { NewsEntry } from "./types";

type NewsEntryRowProps = {
  readonly entry: NewsEntry;
  /** Full body instead of the short preview; used in the "show all" dialog. */
  readonly isExpanded?: boolean;
};

// About three lines of the body in the preview.
const PREVIEW_MAX_HEIGHT = "4.5em";
const PREVIEW_FADE = "linear-gradient(to bottom, black calc(100% - 1.25em), transparent)";

/** One entry as a card: who it is from and when on the first line, then the title, then the body. */
export const NewsEntryRow = ({ entry, isExpanded = false }: NewsEntryRowProps) => {
  const { t: translate } = useTranslation("dashboard");
  const isLocal = entry.kind === "local";
  const body = isLocal ? entry.body : undefined;
  const summary = isLocal ? undefined : entry.summary;
  const palette = NEWS_ITEM_PRIORITY_COLORS[entry.priority];

  return (
    <VStack
      align="stretch"
      bg={palette === undefined ? undefined : `${palette}.subtle`}
      borderColor={palette === undefined ? undefined : `${palette}.emphasized`}
      borderRadius="md"
      borderWidth="1px"
      data-priority={entry.priority}
      data-testid="news-entry"
      gap={1}
      px={3}
      py={2}
    >
      <HStack gap={2} justify="space-between">
        <HStack color={isLocal ? "fg" : "fg.muted"} fontSize="xs" fontWeight="semibold" gap={1} minWidth={0}>
          {palette === undefined ? undefined : (
            <Badge colorPalette={palette} size="sm" variant="solid">
              {entry.priority}
            </Badge>
          )}
          {isLocal ? <FiHome /> : <FiRss />}
          <Text lineClamp={1}>{entry.sourceLabel ?? translate("news.source.thisDeployment")}</Text>
        </HStack>
        <Box color="fg.muted" flexShrink={0} fontSize="xs">
          <Time datetime={entry.publishedAt} />
        </Box>
      </HStack>
      {entry.url === undefined ? (
        <Text fontSize="sm" fontWeight="medium">
          {entry.title}
        </Text>
      ) : (
        <Link
          alignSelf="flex-start"
          color="fg.info"
          fontSize="sm"
          fontWeight="medium"
          href={entry.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {entry.title} <FiExternalLink size={12} />
        </Link>
      )}
      {body === undefined || body === "" ? undefined : (
        <Box
          fontSize="sm"
          maxHeight={isExpanded ? undefined : PREVIEW_MAX_HEIGHT}
          overflow="hidden"
          style={isExpanded ? undefined : { maskImage: PREVIEW_FADE }}
        >
          <ReactMarkdown>{body}</ReactMarkdown>
        </Box>
      )}
      {summary === undefined || summary === "" ? undefined : (
        // Remote content is shown as plain text only; it is never rendered as HTML or Markdown.
        <Text color="fg.muted" fontSize="sm" lineClamp={isExpanded ? undefined : 2}>
          {summary}
        </Text>
      )}
    </VStack>
  );
};
