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
import { createListCollection } from "@chakra-ui/react/collection";
import { useTranslation } from "react-i18next";

import { Select } from "src/system-components";

type PresetSelectProps<Preset extends string> = {
  readonly labelKeys: Record<Preset, string>;
  readonly onChange: (preset: Preset) => void;
  readonly presets: ReadonlyArray<Preset>;
  readonly testId: string;
  readonly value: Preset;
};

export const PresetSelect = <Preset extends string>({
  labelKeys,
  onChange,
  presets,
  testId,
  value,
}: PresetSelectProps<Preset>) => {
  const { t: translate } = useTranslation("admin");
  const presetOptions = createListCollection({
    items: presets.map((preset) => ({ label: translate(labelKeys[preset]), value: preset })),
  });

  return (
    <Select.Root
      collection={presetOptions}
      data-testid={testId}
      onValueChange={({ value: [preset] }) => {
        const selected = presets.find((candidate) => candidate === preset);

        if (selected !== undefined) {
          onChange(selected);
        }
      }}
      size="sm"
      value={[value]}
    >
      <Select.Trigger>
        <Select.ValueText />
      </Select.Trigger>
      <Select.Content>
        {presetOptions.items.map((option) => (
          <Select.Item item={option} key={option.value}>
            {option.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
};
