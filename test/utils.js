/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { expect } from 'chai';

/**
 * This module contains helper functions for testing log methods.
 * */
// Function to check if any argument is a string containing the expected substring
// or if it's an Error instance with a message containing the expected substring
function argsContainSubstring(args, expectedSubstring) {
  // Helper function to determine if a single value contains the expected substring
  function containsSubstring(value) {
    // If the value is a string, check if it includes the expected substring
    if (typeof value === 'string') {
      return value.includes(expectedSubstring);
    } else if (value instanceof Error) {
      // If the value is an instance of Error, check its message for the expected substring
      return value.message.includes(expectedSubstring);
    }
    // Return false for any other type of value
    return false;
  }

  // Check if any of the arguments contain the expected substring
  return args.some(containsSubstring);
}

function expectLogContains(logMethod, expectedSubstring) {
  // Determine if the log method was called with the expected substring in any of its calls
  const wasCalledWithSubstring = logMethod.getCalls().some(
    (call) => argsContainSubstring(call.args, expectedSubstring),
  );
  // Assert that the log method was called with the expected substring
  expect(wasCalledWithSubstring).to.be.true;
}

// High-level helper function to assert that a log method was not called with a
// specific substring in any of its string or Error arguments
function expectLogDoesNotContain(logMethod, expectedSubstring) {
  // Determine if the log method was called with the expected substring in any of its calls
  const wasCalledWithSubstring = logMethod.getCalls().some(
    (call) => argsContainSubstring(call.args, expectedSubstring),
  );
  // Assert that the log method was called with the expected substring
  expect(wasCalledWithSubstring).to.be.false;
}

export {
  expectLogContains,
  expectLogDoesNotContain,
}
