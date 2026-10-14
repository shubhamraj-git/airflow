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
import { Badge, Flex, Link, Text } from "@chakra-ui/react";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { FiExternalLink } from "react-icons/fi";

import { useNewsFeedServiceGetNewsItems } from "openapi/queries";
import type { NewsItemResponse } from "openapi/requests/types.gen";

import { DataTable } from "src/components/DataTable";
import type { DataTableFeatures } from "src/components/DataTable/features";
import { useTableURLState } from "src/components/DataTable/useTableUrlState";
import { ErrorAlert } from "src/components/ErrorAlert";
import Time from "src/components/Time";

import { NEWS_ITEM_PRIORITY_COLORS } from "src/constants/newsFeed";

import DeleteNewsItemButton from "./DeleteNewsItemButton";
import EditNewsItemButton from "./EditNewsItemButton";
import { NewsFeedEmptyState } from "./NewsFeedEmptyState";
import { getNewsItemStatus, NEWS_ITEM_STATUS_COLORS } from "./newsItemStatus";

const getColumns = (translate: TFunction): Array<ColumnDef<DataTableFeatures, NewsItemResponse>> => [
  {
    accessorKey: "title",
    cell: ({ row: { original } }) =>
      original.url === null ? (
        <Text fontWeight="medium">{original.title}</Text>
      ) : (
        <Link
          color="fg.info"
          fontWeight="medium"
          href={original.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {original.title} <FiExternalLink size={12} />
        </Link>
      ),
    header: translate("newsFeed.columns.title"),
  },
  {
    accessorKey: "author",
    cell: ({ row: { original } }) => original.author ?? "",
    enableSorting: false,
    header: translate("newsFeed.columns.from"),
  },
  {
    accessorKey: "priority",
    cell: ({ row: { original } }) => (
      <Badge
        colorPalette={NEWS_ITEM_PRIORITY_COLORS[original.priority] ?? "gray"}
        variant={original.priority === "P2" ? "subtle" : "solid"}
      >
        {original.priority}
      </Badge>
    ),
    header: translate("newsFeed.columns.priority"),
  },
  {
    accessorKey: "status",
    cell: ({ row: { original } }) => {
      // Evaluated per render so a row created a moment ago is not shown as scheduled.
      const status = getNewsItemStatus(original, new Date());

      return (
        <Badge colorPalette={NEWS_ITEM_STATUS_COLORS[status]}>{translate(`newsFeed.status.${status}`)}</Badge>
      );
    },
    enableSorting: false,
    header: translate("newsFeed.columns.status"),
  },
  {
    accessorKey: "published_at",
    cell: ({ row: { original } }) => <Time datetime={original.published_at} />,
    header: translate("newsFeed.columns.published"),
  },
  {
    accessorKey: "expires_at",
    cell: ({ row: { original } }) =>
      original.expires_at === null ? (
        <Text color="fg.muted">{translate("newsFeed.presets.indefinite")}</Text>
      ) : (
        <Time datetime={original.expires_at} />
      ),
    header: translate("newsFeed.columns.expires"),
  },
  {
    accessorKey: "created_by",
    enableSorting: false,
    header: translate("newsFeed.columns.createdBy"),
  },
  {
    accessorKey: "actions",
    cell: ({ row: { original } }) => (
      <Flex justifyContent="end">
        <EditNewsItemButton newsItem={original} />
        <DeleteNewsItemButton newsItem={original} />
      </Flex>
    ),
    enableSorting: false,
    header: "",
    meta: { skeletonWidth: 10 },
  },
];

export const NewsItemsTable = () => {
  const { t: translate } = useTranslation("admin");
  const { setTableURLState, tableURLState } = useTableURLState({
    sorting: [{ desc: true, id: "published_at" }],
  });
  const { pagination, sorting } = tableURLState;
  const [sort] = sorting;
  const orderBy = sort ? [`${sort.desc ? "-" : ""}${sort.id}`] : ["-published_at"];

  const { data, error, isLoading } = useNewsFeedServiceGetNewsItems({
    includeInactive: true,
    limit: pagination.pageSize,
    offset: pagination.pageIndex * pagination.pageSize,
    orderBy,
    remote: false,
  });

  if (!isLoading && (error === null || error === undefined) && (data?.total_entries ?? 0) === 0) {
    return <NewsFeedEmptyState />;
  }

  return (
    <DataTable
      columns={getColumns(translate)}
      data={data?.news_items ?? []}
      errorMessage={<ErrorAlert error={error} />}
      initialState={tableURLState}
      isLoading={isLoading}
      modelName="admin:newsFeed.item"
      noRowsMessage={translate("newsFeed.items.noRowsMessage")}
      onStateChange={setTableURLState}
      total={data?.total_entries ?? 0}
    />
  );
};
