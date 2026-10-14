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
import { useTranslation } from "react-i18next";

import { MAX_STORED_ENTRIES_PER_SOURCE } from "src/constants/newsFeed";

import { PresetNumberField } from "./PresetNumberField";
import {
  isValidMaxEntries,
  MAX_ENTRIES_LABEL_KEYS,
  MAX_ENTRIES_PRESETS,
  type MaxEntriesPreset,
} from "./presets";

type MaxEntriesFieldProps = {
  readonly customEntries: number;
  readonly onCustomEntriesChange: (entries: number) => void;
  readonly onPresetChange: (preset: MaxEntriesPreset) => void;
  readonly preset: MaxEntriesPreset;
  readonly testId: string;
};

/** "Show up to" preset select with an entries input for the custom preset. */
export const MaxEntriesField = ({
  customEntries,
  onCustomEntriesChange,
  onPresetChange,
  preset,
  testId,
}: MaxEntriesFieldProps) => {
  const { t: translate } = useTranslation("admin");

  return (
    <PresetNumberField
      customLabel={translate("newsFeed.form.customEntries")}
      customValue={customEntries}
      errorMessage={translate("newsFeed.form.maxEntriesRange", {
        max: MAX_STORED_ENTRIES_PER_SOURCE,
        min: 1,
      })}
      isValid={isValidMaxEntries}
      label={translate("newsFeed.form.maxEntries")}
      labelKeys={MAX_ENTRIES_LABEL_KEYS}
      max={MAX_STORED_ENTRIES_PER_SOURCE}
      min={1}
      onCustomValueChange={onCustomEntriesChange}
      onPresetChange={onPresetChange}
      preset={preset}
      presets={MAX_ENTRIES_PRESETS}
      testId={testId}
    />
  );
};
