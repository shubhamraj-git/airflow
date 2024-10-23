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
import {
  FormControl,
  FormLabel,
  Input,
  Textarea,
  VStack,
  ModalCloseButton,
  Button,
  ModalFooter,
  Checkbox,
  Box,
  Text,
  Spacer,
  HStack,
} from "@chakra-ui/react";
import React, { useState, useEffect } from "react";

type DagParams = {
  configJson: string;
  dagId: string;
  logicalDate: string;
  runId?: string;
};

type TriggerDAGFormProps = {
  dagParams: DagParams;
  onClose: () => void;
  onTrigger: () => void;
  setDagParams: React.Dispatch<React.SetStateAction<DagParams>>;
};

const TriggerDAGForm: React.FC<TriggerDAGFormProps> = ({
  dagParams,
  onClose,
  onTrigger,
  setDagParams,
}) => {
  const [validateJson, setValidateJson] = useState(false); // State to track checkbox

  // Format the JSON in a pretty way whenever the configJson changes
  useEffect(() => {
    if (validateJson && dagParams.configJson) {
      try {
        const prettyJson = JSON.stringify(
          JSON.parse(dagParams.configJson),
          null,
          2,
        ); // Pretty JSON formatting

        setDagParams((prev) => ({ ...prev, configJson: prettyJson }));
      } catch {
        // Do nothing if it's invalid; handle validation separately
      }
    }
  }, [dagParams.configJson, validateJson, setDagParams]);

  const handleChange = (
    ele: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = ele.target;

    setDagParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (ele: React.ChangeEvent<HTMLInputElement>) => {
    setValidateJson(ele.target.checked);
  };

  const isValidJson = () => {
    try {
      JSON.parse(dagParams.configJson);

      return true;
    } catch {
      return false;
    }
  };

  return (
    <>
      <ModalCloseButton />

      <VStack align="stretch" p={4} spacing={4}>
        <FormControl isRequired>
          <FormLabel>Logical date</FormLabel>
          <Input
            boxShadow="md" // Shadow effect on input
            name="logicalDate"
            onChange={handleChange}
            placeholder="mm / dd / yyyy"
            type="date"
            value={dagParams.logicalDate}
          />
        </FormControl>

        <FormControl>
          <FormLabel>Run ID (Optional)</FormLabel>
          <Input
            boxShadow="md" // Shadow effect on input
            name="runId"
            onChange={handleChange}
            opacity={0.7} // Slightly faded to indicate it's optional
            placeholder="Run ID (Optional - autogenerated if left empty)"
            value={dagParams.runId}
          />
        </FormControl>

        <FormControl>
          <FormLabel>Configuration JSON</FormLabel>
          <Textarea
            boxShadow="md" // Shadow effect on input
            name="configJson"
            onChange={handleChange}
            rows={6}
            value={dagParams.configJson}
            whiteSpace="pre-wrap" // Preserve whitespace to show pretty JSON formatting
          />
          {validateJson && !isValidJson() ? (
            <Box color="red.500" mt={2}>
              <Text fontSize="sm">Invalid JSON format</Text>
            </Box>
          ) : null}
        </FormControl>

        {/* Checkbox for JSON validation */}
        <Checkbox isChecked={validateJson} onChange={handleCheckboxChange}>
          Validate JSON
        </Checkbox>
      </VStack>

      <ModalFooter>
        <HStack w="full">
          {/* Cancel button in red */}
          <Button colorScheme="red" onClick={onClose}>
            Cancel
          </Button>
          <Spacer />
          {/* Trigger button in green */}
          <Button
            colorScheme="green" // Green color for trigger button
            isDisabled={validateJson ? !isValidJson() : undefined} // Disable if JSON is invalid
            onClick={onTrigger}
          >
            Trigger
          </Button>
        </HStack>
      </ModalFooter>
    </>
  );
};

export default TriggerDAGForm;
