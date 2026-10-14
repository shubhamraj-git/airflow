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
import { FiEdit } from "react-icons/fi";

import type { NewsItemResponse } from "openapi/requests/types.gen";

import { IconButton, Modal } from "src/system-components";

import { useEditNewsItem } from "src/queries/useEditNewsItem";

import NewsItemForm, { type NewsItemFormValues } from "./NewsItemForm";
import { matchExpiryPreset } from "./presets";

type Props = {
  readonly newsItem: NewsItemResponse;
};

const EditNewsItemButton = ({ newsItem }: Props) => {
  const { t: translate } = useTranslation("admin");
  const { onClose, onOpen, open } = useDisclosure();
  const expiryPreset = matchExpiryPreset(newsItem.published_at, newsItem.expires_at);
  const initialValues: NewsItemFormValues = {
    author: newsItem.author ?? "",
    body: newsItem.body ?? "",
    customExpiresAt: expiryPreset === "custom" ? (newsItem.expires_at ?? "") : "",
    expiryPreset,
    priority: newsItem.priority,
    publishedAt: newsItem.published_at,
    title: newsItem.title,
    url: newsItem.url ?? "",
  };
  const { editNewsItem, error, isPending, setError } = useEditNewsItem(newsItem.id, initialValues, {
    onSuccessConfirm: onClose,
  });

  const handleClose = () => {
    setError(undefined);
    onClose();
  };

  return (
    <>
      <IconButton label={translate("newsFeed.editItem")} onClick={onOpen}>
        <FiEdit />
      </IconButton>

      <Modal onOpenChange={handleClose} open={open} title={translate("newsFeed.editItem")}>
        <NewsItemForm
          error={error}
          initialValues={initialValues}
          isPending={isPending}
          manageMutate={editNewsItem}
          setError={setError}
        />
      </Modal>
    </>
  );
};

export default EditNewsItemButton;
