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
import { Flex, Heading, HStack, VStack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { Toaster } from "src/system-components";

import { useDocumentTitle } from "src/utils";

import AddNewsItemButton from "./AddNewsItemButton";
import { NewsItemsTable } from "./NewsItemsTable";
import { PublicFeedsControl } from "./PublicFeedsControl";
import { RemoteSourcesControl } from "./RemoteSourcesControl";

export const NewsFeed = () => {
  const { t: translate } = useTranslation(["admin", "common"]);

  useDocumentTitle(translate("common:admin.News Feed"));

  return (
    <VStack alignItems="stretch" gap={4}>
      <Toaster />
      <Flex alignItems="center" flexWrap="wrap" gap={4} justifyContent="space-between">
        <Heading size="md">{translate("newsFeed.title")}</Heading>
        <HStack flexWrap="wrap" gap={4}>
          <PublicFeedsControl />
          <RemoteSourcesControl />
          <AddNewsItemButton />
        </HStack>
      </Flex>
      <NewsItemsTable />
    </VStack>
  );
};
