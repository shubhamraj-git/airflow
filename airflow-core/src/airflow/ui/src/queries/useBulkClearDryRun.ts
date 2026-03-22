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
import { useEffect, useMemo, useState } from "react";

import { TaskInstanceService } from "openapi/requests/services.gen";
import type { TaskInstanceCollectionResponse, TaskInstanceResponse } from "openapi/requests/types.gen";

type Options = {
  includeDownstream: boolean;
  includeFuture: boolean;
  includeOnlyFailed: boolean;
  includePast: boolean;
  includeUpstream: boolean;
};

const EMPTY: TaskInstanceCollectionResponse = { task_instances: [], total_entries: 0 };

export const useBulkClearDryRun = (
  enabled: boolean,
  selectedTaskInstances: Array<TaskInstanceResponse>,
  options: Options,
) => {
  const [data, setData] = useState<TaskInstanceCollectionResponse>(EMPTY);
  const [isFetching, setIsFetching] = useState(false);

  // Stable string key so the effect only re-runs when the actual TI set changes
  const instancesKey = useMemo(
    () =>
      selectedTaskInstances
        .map((ti) => `${ti.dag_id}:${ti.dag_run_id}:${ti.task_id}:${ti.map_index}`)
        .join(","),
    [selectedTaskInstances],
  );

  useEffect(() => {
    if (!enabled || selectedTaskInstances.length === 0) {
      setData(EMPTY);

      return;
    }

    // Group by (dag_id, dag_run_id) — mirrors single-row clear which passes dag_run_id
    // to scope the clear to the specific run
    const byDagRun = new Map<string, { dagId: string; dagRunId: string; tis: Array<TaskInstanceResponse> }>();

    for (const ti of selectedTaskInstances) {
      const key = `${ti.dag_id}::${ti.dag_run_id}`;
      const group = byDagRun.get(key) ?? { dagId: ti.dag_id, dagRunId: ti.dag_run_id, tis: [] };

      group.tis.push(ti);
      byDagRun.set(key, group);
    }

    let cancelled = false;

    setIsFetching(true);

    Promise.all(
      [...byDagRun.values()].map(({ dagId, dagRunId, tis }) =>
        TaskInstanceService.postClearTaskInstances({
          dagId,
          requestBody: {
            dag_run_id: dagRunId,
            dry_run: true,
            include_downstream: options.includeDownstream,
            include_future: options.includeFuture,
            include_past: options.includePast,
            include_upstream: options.includeUpstream,
            only_failed: options.includeOnlyFailed,
            task_ids: tis.map((ti) =>
              ti.map_index >= 0 ? ([ti.task_id, ti.map_index] as [string, number]) : ti.task_id,
            ),
          },
        }),
      ),
    )
      .then((responses) => {
        if (cancelled) {
          return;
        }

        const seen = new Set<string>();
        const merged: Array<TaskInstanceResponse> = [];

        for (const response of responses) {
          for (const ti of response.task_instances) {
            const key = `${ti.dag_id}:${ti.dag_run_id}:${ti.task_id}:${ti.map_index}`;

            if (!seen.has(key)) {
              seen.add(key);
              merged.push(ti);
            }
          }
        }

        setData({ task_instances: merged, total_entries: merged.length });
      })
      .catch(() => {
        if (!cancelled) {
          setData(EMPTY);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsFetching(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    instancesKey,
    selectedTaskInstances,
    options.includeDownstream,
    options.includeFuture,
    options.includePast,
    options.includeUpstream,
    options.includeOnlyFailed,
  ]);

  return { data, isFetching };
};
