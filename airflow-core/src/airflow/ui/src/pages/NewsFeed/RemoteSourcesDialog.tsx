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

import { Box, Button, Field, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiPlus, FiSave, FiTrash2 } from "react-icons/fi";

import type { NewsSourceResponse } from "openapi/requests/types.gen";

import { Alert, Checkbox, IconButton, Modal } from "src/system-components";

import { ErrorAlert } from "src/components/ErrorAlert";

import { resolveMaxNewsEntries } from "src/constants/newsFeed";
import { useConfig } from "src/queries/useConfig";

import { MaxEntriesField } from "./MaxEntriesField";
import { SourceSummary } from "./SourceSummary";
import { SyncIntervalField } from "./SyncIntervalField";
import { TtlPresetSelect } from "./TtlPresetSelect";
import { isValidMaxEntries, isValidSyncMinutes } from "./presets";
import { HTTP_URL_PATTERN } from "./publicFeedsForm";
import {
  BUILT_IN_URLS,
  buildRemoteSourceValues,
  hasRemoteSourceChanges,
  isAnyRemoteSourceEnabled,
  newRemoteSourceValues,
  toRemoteSourceChanges,
  type RemoteSourceChanges,
  type RemoteSourcesFormValues,
} from "./remoteSourcesForm";

type RemoteSourcesDialogProps = {
  readonly error: unknown;
  readonly isPending: boolean;
  readonly onClose: () => void;
  /** Absent while every remote source is already off. */
  readonly onDisableAll?: () => void;
  readonly onSave: (changes: RemoteSourceChanges) => void;
  readonly open: boolean;
  readonly rows: Array<NewsSourceResponse>;
};

/**
 * The one dialog for the administrator's own Atom or RSS sources: each with its label, URL, TTL and
 * enabled state, plus rows to add or remove. Switching the first source on from fully off is gated
 * by the consent text and an explicit "I agree", as for the public feeds.
 */
export const RemoteSourcesDialog = ({
  error,
  isPending,
  onClose,
  onDisableAll,
  onSave,
  open,
  rows,
}: RemoteSourcesDialogProps) => {
  const { t: translate } = useTranslation(["admin", "common"]);
  const maxTotal = resolveMaxNewsEntries(useConfig("news_feed_max_entries"));
  const {
    control,
    formState: { isValid },
    handleSubmit,
    watch,
  } = useForm<RemoteSourcesFormValues>({ defaultValues: buildRemoteSourceValues(rows), mode: "onChange" });
  const { append, fields, remove } = useFieldArray({ control, name: "sources" });
  // Stored sources stay read-only until their edit button is clicked, so nothing changes by accident.
  const [unlockedIds, setUnlockedIds] = useState<ReadonlySet<string>>(new Set());
  const unlock = (fieldId: string) => setUnlockedIds((previous) => new Set([...previous, fieldId]));
  const values = watch();
  const changes = toRemoteSourceChanges(values, rows);
  const needsConsent = !rows.some((row) => row.enabled) && isAnyRemoteSourceEnabled(values);
  const canSave = isValid && !isPending && hasRemoteSourceChanges(changes);

  return (
    <Modal
      footerActions={
        <>
          <Button
            data-testid="remote-sources-save"
            disabled={!canSave}
            loading={isPending}
            onClick={() =>
              void handleSubmit((formValues) => onSave(toRemoteSourceChanges(formValues, rows)))()
            }
          >
            {needsConsent ? (
              translate("newsFeed.sources.consent.confirm")
            ) : (
              <>
                <FiSave /> {translate("formActions.save")}
              </>
            )}
          </Button>
          {onDisableAll === undefined ? undefined : (
            // The footer lays its actions out right to left; `order` sends this one to the far
            // left, away from Cancel and Save.
            <Button
              disabled={isPending}
              marginRight="auto"
              onClick={onDisableAll}
              order={1}
              variant="outline"
            >
              {translate("newsFeed.sources.disableAll")}
            </Button>
          )}
        </>
      }
      onOpenChange={onClose}
      open={open}
      scrollBehavior="inside"
      size="lg"
      title={translate("newsFeed.remoteSources.dialog.title")}
    >
      <VStack align="stretch" gap={4}>
        {needsConsent ? (
          <Alert status="warning" title={translate("newsFeed.sources.consent.title")}>
            {translate("newsFeed.sources.consent.body")} {translate("newsFeed.sources.consent.airGapped")}
          </Alert>
        ) : undefined}
        <Text color="fg.muted" fontSize="sm">
          {translate("newsFeed.remoteSources.dialog.intro")}
        </Text>
        {fields.length === 0 ? (
          <Text color="fg.muted" fontSize="sm">
            {translate("newsFeed.remoteSources.empty")}
          </Text>
        ) : undefined}
        {fields.map((field, index) => {
          const ttlPreset = watch(`sources.${index}.ttlPreset`);
          const source = values.sources.at(index);
          const lockedSource = source?.rowId !== undefined && !unlockedIds.has(field.id) ? source : undefined;

          if (lockedSource !== undefined) {
            return (
              <SourceSummary
                actions={
                  <>
                    <IconButton
                      label={translate("newsFeed.remoteSources.edit")}
                      onClick={() => unlock(field.id)}
                      size="sm"
                      variant="ghost"
                    >
                      <FiEdit2 />
                    </IconButton>
                    <IconButton
                      label={translate("newsFeed.remoteSources.remove")}
                      onClick={() => remove(index)}
                      size="sm"
                      variant="ghost"
                    >
                      <FiTrash2 />
                    </IconButton>
                  </>
                }
                customMaxEntries={lockedSource.customMaxEntries}
                customSyncMinutes={lockedSource.customSyncMinutes}
                customTtlDays={lockedSource.customTtlDays}
                enabled={lockedSource.enabled}
                key={field.id}
                maxEntriesPreset={lockedSource.maxEntriesPreset}
                row={rows.find((row) => row.id === lockedSource.rowId)}
                syncPreset={lockedSource.syncPreset}
                testId={`remote-source-${index}`}
                title={lockedSource.label}
                ttlPreset={lockedSource.ttlPreset}
                url={lockedSource.url}
              />
            );
          }

          return (
            <Box
              borderRadius="md"
              borderWidth="1px"
              data-testid={`remote-source-${index}`}
              key={field.id}
              p={3}
            >
              <HStack alignItems="flex-start" gap={4}>
                <Controller
                  control={control}
                  name={`sources.${index}.enabled`}
                  render={({ field: enabledField }) => (
                    <Checkbox
                      checked={enabledField.value}
                      mt={7}
                      onCheckedChange={({ checked }) => enabledField.onChange(checked === true)}
                    >
                      {translate("newsFeed.remoteSources.enabled")}
                    </Checkbox>
                  )}
                />
                <Controller
                  control={control}
                  name={`sources.${index}.label`}
                  render={({ field: labelField, fieldState }) => (
                    <Field.Root invalid={Boolean(fieldState.error)} required>
                      <Field.Label fontSize="sm">
                        {translate("newsFeed.remoteSources.label")} <Field.RequiredIndicator />
                      </Field.Label>
                      <Input {...labelField} required size="sm" />
                      {fieldState.error ? (
                        <Field.ErrorText>{fieldState.error.message}</Field.ErrorText>
                      ) : undefined}
                    </Field.Root>
                  )}
                  rules={{
                    validate: (value) =>
                      value.trim() !== "" || translate("newsFeed.remoteSources.labelRequired"),
                  }}
                />
                <IconButton
                  label={translate("newsFeed.remoteSources.remove")}
                  mt={7}
                  onClick={() => remove(index)}
                  size="sm"
                  variant="ghost"
                >
                  <FiTrash2 />
                </IconButton>
              </HStack>
              <Controller
                control={control}
                name={`sources.${index}.url`}
                render={({ field: urlField, fieldState }) => (
                  <Field.Root invalid={Boolean(fieldState.error)} mt={2} required>
                    <Field.Label fontSize="sm">
                      {translate("newsFeed.form.url")} <Field.RequiredIndicator />
                    </Field.Label>
                    <Input {...urlField} placeholder="https://" required size="sm" />
                    {fieldState.error ? (
                      <Field.ErrorText>{fieldState.error.message}</Field.ErrorText>
                    ) : undefined}
                  </Field.Root>
                )}
                rules={{
                  validate: (value, formValues) => {
                    const url = value.trim();

                    if (!HTTP_URL_PATTERN.test(url)) {
                      return translate("newsFeed.form.invalidUrl");
                    }

                    return BUILT_IN_URLS.has(url)
                      ? translate("newsFeed.remoteSources.builtInUrl")
                      : formValues.sources.filter((candidate) => candidate.url.trim() === url).length === 1 ||
                          translate("newsFeed.remoteSources.duplicateUrl");
                  },
                }}
              />
              <HStack alignItems="flex-start" gap={4} mt={2}>
                <Controller
                  control={control}
                  name={`sources.${index}.ttlPreset`}
                  render={({ field: ttlField }) => (
                    <Field.Root>
                      <Field.Label fontSize="sm">{translate("newsFeed.form.ttl")}</Field.Label>
                      <TtlPresetSelect
                        onChange={ttlField.onChange}
                        testId={`ttl-preset-${index}`}
                        value={ttlField.value}
                      />
                    </Field.Root>
                  )}
                />
                {ttlPreset === "custom" ? (
                  <Controller
                    control={control}
                    name={`sources.${index}.customTtlDays`}
                    render={({ field: daysField, fieldState }) => (
                      <Field.Root invalid={Boolean(fieldState.error)} required>
                        <Field.Label fontSize="sm">
                          {translate("newsFeed.form.customDays")} <Field.RequiredIndicator />
                        </Field.Label>
                        <Input
                          min={1}
                          onBlur={daysField.onBlur}
                          onChange={(event) => {
                            const { value: raw, valueAsNumber } = event.target;

                            daysField.onChange(raw === "" ? Number.NaN : valueAsNumber);
                          }}
                          ref={daysField.ref}
                          size="sm"
                          type="number"
                          value={Number.isFinite(daysField.value) ? daysField.value : ""}
                        />
                        {fieldState.error ? (
                          <Field.ErrorText>{fieldState.error.message}</Field.ErrorText>
                        ) : undefined}
                      </Field.Root>
                    )}
                    rules={{
                      validate: (value, formValues) =>
                        formValues.sources.at(index)?.ttlPreset !== "custom" ||
                        (Number.isInteger(value) && value >= 1) ||
                        translate("common:validation.mustBeAtLeast", { min: 1 }),
                    }}
                  />
                ) : undefined}
              </HStack>
              <Controller
                control={control}
                name={`sources.${index}.syncPreset`}
                render={({ field: presetField }) => (
                  <Controller
                    control={control}
                    name={`sources.${index}.customSyncMinutes`}
                    render={({ field: minutesField }) => (
                      <SyncIntervalField
                        customMinutes={minutesField.value}
                        onCustomMinutesChange={minutesField.onChange}
                        onPresetChange={presetField.onChange}
                        preset={presetField.value}
                        testId={`sync-preset-${index}`}
                      />
                    )}
                    rules={{
                      validate: (value, formValues) =>
                        formValues.sources.at(index)?.syncPreset !== "custom" || isValidSyncMinutes(value),
                    }}
                  />
                )}
              />
              <Controller
                control={control}
                name={`sources.${index}.maxEntriesPreset`}
                render={({ field: presetField }) => (
                  <Controller
                    control={control}
                    name={`sources.${index}.customMaxEntries`}
                    render={({ field: entriesField }) => (
                      <MaxEntriesField
                        customEntries={entriesField.value}
                        onCustomEntriesChange={entriesField.onChange}
                        onPresetChange={presetField.onChange}
                        preset={presetField.value}
                        testId={`max-entries-preset-${index}`}
                      />
                    )}
                    rules={{
                      validate: (value, formValues) =>
                        formValues.sources.at(index)?.maxEntriesPreset !== "custom" ||
                        isValidMaxEntries(value),
                    }}
                  />
                )}
              />
            </Box>
          );
        })}
        <Button
          alignSelf="flex-start"
          onClick={() => append(newRemoteSourceValues())}
          size="sm"
          variant="outline"
        >
          <FiPlus /> {translate("newsFeed.remoteSources.add")}
        </Button>
        <Text color="fg.muted" fontSize="xs">
          {translate("newsFeed.sources.maxEntriesHint", { maxTotal })}
        </Text>
        <ErrorAlert error={error} />
      </VStack>
    </Modal>
  );
};
