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
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiSave } from "react-icons/fi";

import type { NewsSourceResponse } from "openapi/requests/types.gen";

import { Alert, Checkbox, IconButton, Modal } from "src/system-components";

import { ErrorAlert } from "src/components/ErrorAlert";

import {
  BUILT_IN_NEWS_SOURCES,
  findBuiltInRow,
  resolveMaxNewsEntries,
  type BuiltInNewsSourceKey,
} from "src/constants/newsFeed";
import type { BuiltInNewsSourceChange } from "src/queries/useApplyBuiltInNewsSources";
import { useConfig } from "src/queries/useConfig";

import { FetchStatus } from "./FetchStatus";
import { MaxEntriesField } from "./MaxEntriesField";
import { SourceSummary } from "./SourceSummary";
import { SyncIntervalField } from "./SyncIntervalField";
import { TtlPresetSelect } from "./TtlPresetSelect";
import { isValidMaxEntries, isValidSyncMinutes } from "./presets";
import {
  buildDialogValues,
  buildInitialValues,
  hasChanges,
  HTTP_URL_PATTERN,
  isAnyFeedEnabled,
  toChanges,
  type PublicFeedsFormValues,
} from "./publicFeedsForm";

type PublicFeedsDialogProps = {
  readonly error: unknown;
  readonly isPending: boolean;
  readonly onClose: () => void;
  /** Absent while every public feed is already off. */
  readonly onDisableAll?: () => void;
  readonly onSave: (changes: Array<BuiltInNewsSourceChange>) => void;
  readonly open: boolean;
  readonly rows: Array<NewsSourceResponse>;
};

/**
 * The one dialog for the public feeds: each with its enabled state, URL (official or mirror) and
 * TTL. Switching them on from fully off is gated by the consent text and an explicit "I agree".
 */
export const PublicFeedsDialog = ({
  error,
  isPending,
  onClose,
  onDisableAll,
  onSave,
  open,
  rows,
}: PublicFeedsDialogProps) => {
  const { t: translate } = useTranslation(["admin", "common"]);
  const maxTotal = resolveMaxNewsEntries(useConfig("news_feed_max_entries"));
  const storedValues = buildInitialValues(rows);
  const {
    control,
    formState: { isValid },
    handleSubmit,
    watch,
  } = useForm<PublicFeedsFormValues>({ defaultValues: buildDialogValues(storedValues), mode: "onChange" });
  const values = watch();
  const needsConsent = !isAnyFeedEnabled(storedValues) && isAnyFeedEnabled(values);
  // A configured feed stays read-only until its edit button is clicked, so nothing changes by
  // accident; while every feed is off the admin is choosing what to enable, so all start editable.
  const [unlockedKeys, setUnlockedKeys] = useState<ReadonlySet<BuiltInNewsSourceKey>>(
    () => new Set(isAnyFeedEnabled(storedValues) ? [] : BUILT_IN_NEWS_SOURCES.map((source) => source.key)),
  );
  const unlock = (key: BuiltInNewsSourceKey) => setUnlockedKeys((previous) => new Set([...previous, key]));
  const canSave = isValid && !isPending && hasChanges(values, storedValues);

  return (
    <Modal
      footerActions={
        <>
          <Button
            data-testid="public-feeds-save"
            disabled={!canSave}
            loading={isPending}
            onClick={() => void handleSubmit((formValues) => onSave(toChanges(formValues, storedValues)))()}
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
      title={translate("newsFeed.sources.dialog.title")}
    >
      <VStack align="stretch" gap={5}>
        {needsConsent ? (
          <Alert status="warning" title={translate("newsFeed.sources.consent.title")}>
            {translate("newsFeed.sources.consent.body")} {translate("newsFeed.sources.consent.airGapped")}
          </Alert>
        ) : undefined}
        {BUILT_IN_NEWS_SOURCES.map((source) => {
          const ttlPreset = watch(`${source.key}.ttlPreset`);
          const feed = values[source.key];

          if (!unlockedKeys.has(source.key)) {
            return (
              <SourceSummary
                actions={
                  <IconButton
                    label={translate("newsFeed.sources.editFeed")}
                    onClick={() => unlock(source.key)}
                    size="sm"
                    variant="ghost"
                  >
                    <FiEdit2 />
                  </IconButton>
                }
                customMaxEntries={feed.customMaxEntries}
                customSyncMinutes={feed.customSyncMinutes}
                customTtlDays={feed.customTtlDays}
                enabled={feed.enabled}
                key={source.key}
                maxEntriesPreset={feed.maxEntriesPreset}
                row={findBuiltInRow(rows, source)}
                syncPreset={feed.syncPreset}
                testId={`public-feed-${source.key}`}
                title={translate(`newsFeed.sources.builtIn.${source.key}`)}
                ttlPreset={feed.ttlPreset}
                url={feed.url}
              />
            );
          }

          return (
            <Box
              borderRadius="md"
              borderWidth="1px"
              data-testid={`public-feed-${source.key}`}
              key={source.key}
              p={3}
            >
              <Controller
                control={control}
                name={`${source.key}.enabled`}
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={({ checked }) => field.onChange(checked === true)}
                  >
                    <Text as="span" fontWeight="semibold">
                      {translate(`newsFeed.sources.builtIn.${source.key}`)}
                    </Text>
                  </Checkbox>
                )}
              />
              <FetchStatus row={findBuiltInRow(rows, source)} />
              <Controller
                control={control}
                name={`${source.key}.url`}
                render={({ field, fieldState }) => (
                  <Field.Root invalid={Boolean(fieldState.error)} mt={2} required>
                    <Field.Label fontSize="sm">
                      {translate("newsFeed.form.url")} <Field.RequiredIndicator />
                    </Field.Label>
                    <Input {...field} required size="sm" />
                    {fieldState.error ? (
                      <Field.ErrorText>{fieldState.error.message}</Field.ErrorText>
                    ) : (
                      <Field.HelperText>{translate("newsFeed.sources.mirrorHint")}</Field.HelperText>
                    )}
                  </Field.Root>
                )}
                rules={{
                  validate: (value) =>
                    HTTP_URL_PATTERN.test(value.trim()) || translate("newsFeed.form.invalidUrl"),
                }}
              />
              <HStack alignItems="flex-start" gap={4} mt={2}>
                <Controller
                  control={control}
                  name={`${source.key}.ttlPreset`}
                  render={({ field }) => (
                    <Field.Root>
                      <Field.Label fontSize="sm">{translate("newsFeed.form.ttl")}</Field.Label>
                      <TtlPresetSelect
                        onChange={field.onChange}
                        testId={`ttl-preset-${source.key}`}
                        value={field.value}
                      />
                    </Field.Root>
                  )}
                />
                {ttlPreset === "custom" ? (
                  <Controller
                    control={control}
                    name={`${source.key}.customTtlDays`}
                    render={({ field, fieldState }) => (
                      <Field.Root invalid={Boolean(fieldState.error)} required>
                        <Field.Label fontSize="sm">
                          {translate("newsFeed.form.customDays")} <Field.RequiredIndicator />
                        </Field.Label>
                        <Input
                          min={1}
                          onBlur={field.onBlur}
                          onChange={(event) => {
                            const { value: raw, valueAsNumber } = event.target;

                            field.onChange(raw === "" ? Number.NaN : valueAsNumber);
                          }}
                          ref={field.ref}
                          size="sm"
                          type="number"
                          value={Number.isFinite(field.value) ? field.value : ""}
                        />
                        {fieldState.error ? (
                          <Field.ErrorText>{fieldState.error.message}</Field.ErrorText>
                        ) : undefined}
                      </Field.Root>
                    )}
                    rules={{
                      validate: (value, formValues) =>
                        formValues[source.key].ttlPreset !== "custom" ||
                        (Number.isInteger(value) && value >= 1) ||
                        translate("common:validation.mustBeAtLeast", { min: 1 }),
                    }}
                  />
                ) : undefined}
              </HStack>
              <Controller
                control={control}
                name={`${source.key}.syncPreset`}
                render={({ field }) => (
                  <Controller
                    control={control}
                    name={`${source.key}.customSyncMinutes`}
                    render={({ field: minutesField }) => (
                      <SyncIntervalField
                        customMinutes={minutesField.value}
                        onCustomMinutesChange={minutesField.onChange}
                        onPresetChange={field.onChange}
                        preset={field.value}
                        testId={`sync-preset-${source.key}`}
                      />
                    )}
                    rules={{
                      validate: (value, formValues) =>
                        formValues[source.key].syncPreset !== "custom" || isValidSyncMinutes(value),
                    }}
                  />
                )}
              />
              <Controller
                control={control}
                name={`${source.key}.maxEntriesPreset`}
                render={({ field }) => (
                  <Controller
                    control={control}
                    name={`${source.key}.customMaxEntries`}
                    render={({ field: entriesField }) => (
                      <MaxEntriesField
                        customEntries={entriesField.value}
                        onCustomEntriesChange={entriesField.onChange}
                        onPresetChange={field.onChange}
                        preset={field.value}
                        testId={`max-entries-preset-${source.key}`}
                      />
                    )}
                    rules={{
                      validate: (value, formValues) =>
                        formValues[source.key].maxEntriesPreset !== "custom" || isValidMaxEntries(value),
                    }}
                  />
                )}
              />
            </Box>
          );
        })}
        <Text color="fg.muted" fontSize="xs">
          {needsConsent ? undefined : `${translate("newsFeed.sources.consent.body")} `}
          {translate("newsFeed.sources.maxEntriesHint", { maxTotal })}
        </Text>
        <ErrorAlert error={error} />
      </VStack>
    </Modal>
  );
};
