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

import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  useNewsFeedServiceDeleteNewsSource,
  useNewsFeedServiceGetNewsSourcesKey,
  useNewsFeedServicePatchNewsSource,
  useNewsFeedServicePostNewsSource,
} from "openapi/queries";

import { toaster } from "src/system-components";

import type { RemoteSourceChanges } from "src/pages/NewsFeed/remoteSourcesForm";

/** Apply the creates, patches and deletes of the remote sources dialog in one go. */
export const useApplyRemoteSources = ({ onSuccessConfirm }: { onSuccessConfirm: () => void }) => {
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(undefined);
  const [isPending, setIsPending] = useState(false);
  const { t: translate } = useTranslation(["common", "admin"]);
  const { mutateAsync: create } = useNewsFeedServicePostNewsSource();
  const { mutateAsync: update } = useNewsFeedServicePatchNewsSource();
  const { mutateAsync: remove } = useNewsFeedServiceDeleteNewsSource();

  const apply = async (changes: RemoteSourceChanges) => {
    setIsPending(true);
    setError(undefined);

    try {
      await Promise.all([
        ...changes.creates.map((requestBody) => create({ requestBody })),
        ...changes.patches.map(({ id, requestBody, updateMask }) =>
          update({ newsSourceId: id, requestBody, updateMask }),
        ),
        ...changes.deletes.map((id) => remove({ newsSourceId: id })),
      ]);
      await queryClient.invalidateQueries({ queryKey: [useNewsFeedServiceGetNewsSourcesKey] });
    } catch (applyError: unknown) {
      setError(applyError);
      setIsPending(false);

      return;
    }
    setIsPending(false);

    const resourceName = translate("admin:newsFeed.remoteSources.name");

    toaster.create({
      description: translate("toaster.update.success.description", { resourceName }),
      title: translate("toaster.update.success.title", { resourceName }),
      type: "success",
    });
    onSuccessConfirm();
  };

  return { apply, error, isPending, setError };
};
