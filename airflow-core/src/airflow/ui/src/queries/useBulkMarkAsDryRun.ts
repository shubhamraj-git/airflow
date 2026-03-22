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
import type {
  TaskInstanceCollectionResponse,
  TaskInstanceResponse,
  TaskInstanceState,
} from "openapi/requests/types.gen";

type Options = {
  includeDownstream: boolean;
  includeFuture: boolean;
  includePast: boolean;
  includeUpstream: boolean;
};

const EMPTY: TaskInstanceCollectionResponse = { task_instances: [], total_entries: 0 };

export const useBulkMarkAsDryRun = (
  enabled: boolean,
  selectedTaskInstances: Array<TaskInstanceResponse>,
  targetState: TaskInstanceState,
  options: Options,
) => {
  const [data, setData] = useState<TaskInstanceCollectionResponse>(EMPTY);
  const [isFetching, setIsFetching] = useState(false);

  // Stable string key representing the set of TIs that would be affected.
  // Recomputed when selectedTaskInstances or targetState changes.
  const instancesKey = useMemo(
    () =>
      selectedTaskInstances
        .filter((ti) => ti.state !== targetState)
        .map((ti) => `${ti.dag_id}:${ti.dag_run_id}:${ti.task_id}:${ti.map_index}`)
        .join(","),
    [selectedTaskInstances, targetState],
  );

  useEffect(() => {
    // Only run dry-run for TIs not already in the target state
    const affectedInstances = selectedTaskInstances.filter((ti) => ti.state !== targetState);

    if (!enabled || affectedInstances.length === 0) {
      setData(EMPTY);

      return;
    }

    let cancelled = false;

    setIsFetching(true);

    // One patchTaskInstanceDryRun per affected TI — mirrors the single-row mark-as dialog
    Promise.all(
      affectedInstances.map((ti) =>
        TaskInstanceService.patchTaskInstanceDryRun({
          dagId: ti.dag_id,
          dagRunId: ti.dag_run_id,
          mapIndex: ti.map_index,
          requestBody: {
            include_downstream: options.includeDownstream,
            include_future: options.includeFuture,
            include_past: options.includePast,
            include_upstream: options.includeUpstream,
            new_state: targetState,
          },
          taskId: ti.task_id,
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
    targetState,
    options.includeDownstream,
    options.includeFuture,
    options.includePast,
    options.includeUpstream,
  ]);

  return { data, isFetching };
};
