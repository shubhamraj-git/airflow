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
import { Box, Button, Field, HStack, Input, Spacer } from "@chakra-ui/react";
import { createListCollection } from "@chakra-ui/react/collection";
import dayjs from "dayjs";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiSave } from "react-icons/fi";

import type { NewsItemPriority } from "openapi/requests/types.gen";

import { Select } from "src/system-components";

import { DateTimeInput } from "src/components/DateTimeInput";
import { ErrorAlert } from "src/components/ErrorAlert";
import EditableMarkdown from "src/components/TriggerDag/EditableMarkdown";

import { NEWS_ITEM_PRIORITIES } from "src/constants/newsFeed";

import { ITEM_EXPIRY_PRESETS, type ItemExpiryPreset } from "./presets";

export type NewsItemFormValues = {
  author: string;
  body: string;
  customExpiresAt: string;
  expiryPreset: ItemExpiryPreset;
  priority: NewsItemPriority;
  publishedAt: string;
  title: string;
  url: string;
};

type NewsItemFormProps = {
  readonly error: unknown;
  readonly initialValues: NewsItemFormValues;
  readonly isPending: boolean;
  readonly manageMutate: (values: NewsItemFormValues) => void;
  readonly setError: (error: unknown) => void;
};

const TITLE_MAX_LENGTH = 250;
const AUTHOR_MAX_LENGTH = 250;
const HTTP_URL_PATTERN = /^https?:\/\//iu;

const PRESET_LABEL_KEYS: Record<ItemExpiryPreset, string> = {
  "1d": "newsFeed.presets.oneDay",
  "7d": "newsFeed.presets.sevenDays",
  custom: "newsFeed.presets.custom",
  indefinite: "newsFeed.presets.indefinite",
};

const NewsItemForm = ({ error, initialValues, isPending, manageMutate, setError }: NewsItemFormProps) => {
  const { t: translate } = useTranslation(["admin", "common"]);
  const {
    control,
    formState: { isDirty, isValid },
    handleSubmit,
    reset,
    watch,
  } = useForm<NewsItemFormValues>({ defaultValues: initialValues, mode: "onChange" });
  const expiryPreset = watch("expiryPreset");

  const presetOptions = createListCollection({
    items: ITEM_EXPIRY_PRESETS.map((preset) => ({
      label: translate(PRESET_LABEL_KEYS[preset]),
      value: preset,
    })),
  });

  const priorityOptions = createListCollection({
    items: NEWS_ITEM_PRIORITIES.map((priority) => ({
      label: translate(`newsFeed.priority.${priority}`),
      value: priority,
    })),
  });

  const handleReset = () => {
    setError(undefined);
    reset();
  };

  return (
    <>
      <Controller
        control={control}
        name="title"
        render={({ field, fieldState }) => (
          <Field.Root invalid={Boolean(fieldState.error)} required>
            <Field.Label fontSize="md">
              {translate("newsFeed.form.title")} <Field.RequiredIndicator />
            </Field.Label>
            <Input {...field} required size="sm" />
            {fieldState.error ? <Field.ErrorText>{fieldState.error.message}</Field.ErrorText> : undefined}
          </Field.Root>
        )}
        rules={{
          required: translate("newsFeed.form.titleRequired"),
          validate: (value) => value.length <= TITLE_MAX_LENGTH || translate("newsFeed.form.titleMaxLength"),
        }}
      />

      <Controller
        control={control}
        name="author"
        render={({ field, fieldState }) => (
          <Field.Root invalid={Boolean(fieldState.error)} mt={4}>
            <Field.Label fontSize="md">{translate("newsFeed.form.from")}</Field.Label>
            <Input {...field} placeholder={translate("newsFeed.form.fromPlaceholder")} size="sm" />
            {fieldState.error ? (
              <Field.ErrorText>{fieldState.error.message}</Field.ErrorText>
            ) : (
              <Field.HelperText>{translate("newsFeed.form.fromHint")}</Field.HelperText>
            )}
          </Field.Root>
        )}
        rules={{
          validate: (value) => value.length <= AUTHOR_MAX_LENGTH || translate("newsFeed.form.fromMaxLength"),
        }}
      />

      <Controller
        control={control}
        name="priority"
        render={({ field }) => (
          <Field.Root maxWidth="240px" mt={4}>
            <Field.Label fontSize="md">{translate("newsFeed.form.priority")}</Field.Label>
            <Select.Root
              collection={priorityOptions}
              data-testid="priority"
              onValueChange={({ value }) => field.onChange(value[0])}
              size="sm"
              value={[field.value]}
            >
              <Select.Trigger>
                <Select.ValueText />
              </Select.Trigger>
              <Select.Content>
                {priorityOptions.items.map((option) => (
                  <Select.Item item={option} key={option.value}>
                    {option.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Field.Root>
        )}
      />

      <Controller
        control={control}
        name="url"
        render={({ field, fieldState }) => (
          <Field.Root invalid={Boolean(fieldState.error)} mt={4}>
            <Field.Label fontSize="md">{translate("newsFeed.form.link")}</Field.Label>
            <Input {...field} placeholder="https://" size="sm" />
            {fieldState.error ? <Field.ErrorText>{fieldState.error.message}</Field.ErrorText> : undefined}
          </Field.Root>
        )}
        rules={{
          validate: (value) =>
            value === "" || HTTP_URL_PATTERN.test(value) || translate("newsFeed.form.invalidUrl"),
        }}
      />

      <Controller
        control={control}
        name="body"
        render={({ field }) => (
          <Field.Root mt={4}>
            <Field.Label fontSize="md">{translate("newsFeed.form.body")}</Field.Label>
            <EditableMarkdown
              field={{ onChange: field.onChange, value: field.value }}
              placeholder={translate("newsFeed.form.bodyPlaceholder")}
            />
          </Field.Root>
        )}
      />

      <Controller
        control={control}
        name="publishedAt"
        render={({ field, fieldState }) => (
          <Field.Root invalid={Boolean(fieldState.error)} mt={4} required>
            <Field.Label fontSize="md">
              {translate("newsFeed.form.publishedAt")} <Field.RequiredIndicator />
            </Field.Label>
            <DateTimeInput onChange={(event) => field.onChange(event.target.value)} value={field.value} />
          </Field.Root>
        )}
        rules={{ required: true }}
      />

      <HStack alignItems="flex-start" gap={4} mt={4}>
        <Controller
          control={control}
          name="expiryPreset"
          render={({ field }) => (
            <Field.Root>
              <Field.Label fontSize="md">{translate("newsFeed.form.expires")}</Field.Label>
              <Select.Root
                collection={presetOptions}
                data-testid="expiry-preset"
                onValueChange={({ value }) => field.onChange(value[0])}
                size="sm"
                value={[field.value]}
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
            </Field.Root>
          )}
        />
        {expiryPreset === "custom" ? (
          <Controller
            control={control}
            name="customExpiresAt"
            render={({ field, fieldState }) => (
              <Field.Root invalid={Boolean(fieldState.error)} required>
                <Field.Label fontSize="md">
                  {translate("newsFeed.form.customDate")} <Field.RequiredIndicator />
                </Field.Label>
                <DateTimeInput onChange={(event) => field.onChange(event.target.value)} value={field.value} />
                {fieldState.error ? <Field.ErrorText>{fieldState.error.message}</Field.ErrorText> : undefined}
              </Field.Root>
            )}
            rules={{
              validate: (value, values) =>
                values.expiryPreset !== "custom" ||
                (value !== "" && dayjs(value).isAfter(dayjs(values.publishedAt))) ||
                translate("newsFeed.form.expiresBeforePublished"),
            }}
          />
        ) : undefined}
      </HStack>

      <ErrorAlert error={error} />

      <Box as="footer" display="flex" justifyContent="flex-end" mt={8}>
        <HStack w="full">
          {isDirty ? (
            <Button onClick={handleReset} variant="outline">
              {translate("common:reset")}
            </Button>
          ) : undefined}
          <Spacer />
          <Button
            disabled={!isValid || isPending || !isDirty}
            onClick={() => void handleSubmit((values) => manageMutate(values))()}
          >
            <FiSave /> {translate("formActions.save")}
          </Button>
        </HStack>
      </Box>
    </>
  );
};

export default NewsItemForm;
