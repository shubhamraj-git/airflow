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

import { Button, useDisclosure } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { MdAdd } from "react-icons/md";

import { Modal } from "src/system-components";

import { DEFAULT_NEWS_ITEM_PRIORITY } from "src/constants/newsFeed";
import { useAddNewsItem } from "src/queries/useAddNewsItem";

import NewsItemForm, { type NewsItemFormValues } from "./NewsItemForm";

const buildInitialValues = (): NewsItemFormValues => ({
  author: "",
  body: "",
  customExpiresAt: "",
  expiryPreset: "7d",
  priority: DEFAULT_NEWS_ITEM_PRIORITY,
  publishedAt: dayjs().toISOString(),
  title: "",
  url: "",
});

const AddNewsItemButton = () => {
  const { t: translate } = useTranslation("admin");
  const { onClose, onOpen, open } = useDisclosure();
  // Captured when the dialog opens so the form and the mutation agree on the prefilled time.
  const [initialValues, setInitialValues] = useState(buildInitialValues);
  const { addNewsItem, error, isPending, setError } = useAddNewsItem(initialValues, {
    onSuccessConfirm: onClose,
  });

  const handleOpen = () => {
    setInitialValues(buildInitialValues());
    onOpen();
  };

  const handleClose = () => {
    setError(undefined);
    onClose();
  };

  return (
    <>
      <Button onClick={handleOpen}>
        <MdAdd /> {translate("newsFeed.addItem")}
      </Button>

      <Modal onOpenChange={handleClose} open={open} title={translate("newsFeed.addItem")}>
        <NewsItemForm
          error={error}
          initialValues={initialValues}
          isPending={isPending}
          manageMutate={addNewsItem}
          setError={setError}
        />
      </Modal>
    </>
  );
};

export default AddNewsItemButton;
