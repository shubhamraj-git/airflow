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
import { useDisclosure } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { FiTrash2 } from "react-icons/fi";

import type { NewsItemResponse } from "openapi/requests/types.gen";

import { IconButton } from "src/system-components";

import DeleteDialog from "src/components/DeleteDialog";

import { useDeleteNewsItem } from "src/queries/useDeleteNewsItem";

type Props = {
  readonly newsItem: NewsItemResponse;
};

const DeleteNewsItemButton = ({ newsItem }: Props) => {
  const { t: translate } = useTranslation("admin");
  const { onClose, onOpen, open } = useDisclosure();
  const { isPending, mutate } = useDeleteNewsItem({ onSuccessConfirm: onClose });

  return (
    <>
      <IconButton colorPalette="danger" label={translate("newsFeed.deleteItem.title")} onClick={onOpen}>
        <FiTrash2 />
      </IconButton>

      <DeleteDialog
        isDeleting={isPending}
        onClose={onClose}
        onDelete={() => mutate({ newsItemId: newsItem.id })}
        open={open}
        resourceName={newsItem.title}
        title={translate("newsFeed.deleteItem.title")}
        warningText={translate("newsFeed.deleteItem.warning")}
      />
    </>
  );
};

export default DeleteNewsItemButton;
