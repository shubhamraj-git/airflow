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
import { Field, HStack, Input } from "@chakra-ui/react";

import { PresetSelect } from "./PresetSelect";

type PresetNumberFieldProps<Preset extends string> = {
  readonly customLabel: string;
  readonly customValue: number;
  /** Shown under the custom input while its value is invalid. */
  readonly errorMessage: string;
  readonly isValid: (value: number) => boolean;
  readonly label: string;
  readonly labelKeys: Record<Preset | "custom", string>;
  readonly max?: number;
  readonly min: number;
  readonly onCustomValueChange: (value: number) => void;
  readonly onPresetChange: (preset: Preset | "custom") => void;
  readonly preset: Preset | "custom";
  readonly presets: ReadonlyArray<Preset | "custom">;
  readonly testId: string;
};

/** A preset select, with a number input for the custom preset. */
export const PresetNumberField = <Preset extends string>({
  customLabel,
  customValue,
  errorMessage,
  isValid,
  label,
  labelKeys,
  max,
  min,
  onCustomValueChange,
  onPresetChange,
  preset,
  presets,
  testId,
}: PresetNumberFieldProps<Preset>) => {
  const isInvalid = preset === "custom" && !isValid(customValue);

  return (
    <HStack alignItems="flex-start" gap={4} mt={2}>
      <Field.Root>
        <Field.Label fontSize="sm">{label}</Field.Label>
        <PresetSelect
          labelKeys={labelKeys}
          onChange={onPresetChange}
          presets={presets}
          testId={testId}
          value={preset}
        />
      </Field.Root>
      {preset === "custom" ? (
        <Field.Root invalid={isInvalid} required>
          <Field.Label fontSize="sm">
            {customLabel} <Field.RequiredIndicator />
          </Field.Label>
          <Input
            max={max}
            min={min}
            onChange={(event) => {
              const { value: raw, valueAsNumber } = event.target;

              onCustomValueChange(raw === "" ? Number.NaN : valueAsNumber);
            }}
            size="sm"
            type="number"
            value={Number.isFinite(customValue) ? customValue : ""}
          />
          {isInvalid ? <Field.ErrorText>{errorMessage}</Field.ErrorText> : undefined}
        </Field.Root>
      ) : undefined}
    </HStack>
  );
};
