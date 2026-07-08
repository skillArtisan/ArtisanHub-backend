/**
 * Test file to demonstrate validation functionality
 * This can be run with: npx tsx src/utils/validation.test.ts
 */

import {
  isValidStellarPublicKey,
  isValidContractId,
  isValidAmount,
  sanitizeText,
  sanitizeMetadata,
  validateStellarPublicKey,
  validateContractId,
  validateAmount,
  ValidationError,
} from "./validation.js";

console.log("=== Testing Stellar Public Key Validation ===\n");

// Valid Stellar public key
const validPublicKey = "GABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEFGHIJKLMNOP";
console.log(
  `Valid key test: ${isValidStellarPublicKey(validPublicKey)} (expected: true)`,
);

// Invalid keys
console.log(
  `Invalid key (too short): ${isValidStellarPublicKey("GABC")} (expected: false)`,
);
console.log(
  `Invalid key (no G prefix): ${isValidStellarPublicKey("ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEFGHIJKLMNOP")} (expected: false)`,
);
console.log(
  `Invalid key (special chars): ${isValidStellarPublicKey("GABC!@#$%^&*()")} (expected: false)`,
);

console.log("\n=== Testing Contract ID Validation ===\n");

// Valid contract ID (64 hex chars)
const validContractId =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
console.log(
  `Valid contract ID: ${isValidContractId(validContractId)} (expected: true)`,
);

// Invalid contract IDs
console.log(
  `Invalid (too short): ${isValidContractId("abc123")} (expected: false)`,
);
console.log(
  `Invalid (non-hex): ${isValidContractId("g1b2c3d4e5f6g1b2c3d4e5f6g1b2c3d4e5f6g1b2c3d4e5f6g1b2c3d4e5f6g1b2")} (expected: false)`,
);

console.log("\n=== Testing Amount Validation ===\n");

// Valid amounts
console.log(`Valid amount (0): ${isValidAmount("0")} (expected: true)`);
console.log(`Valid amount (100): ${isValidAmount("100")} (expected: true)`);
console.log(
  `Valid amount (large): ${isValidAmount("1000000000000")} (expected: true)`,
);

// Invalid amounts
console.log(`Invalid (negative): ${isValidAmount("-100")} (expected: false)`);
console.log(`Invalid (decimal): ${isValidAmount("10.5")} (expected: false)`);
console.log(`Invalid (text): ${isValidAmount("abc")} (expected: false)`);

console.log("\n=== Testing Text Sanitization ===\n");

const dirtyText = "  Hello\x00World\x1FTest\x7F  ";
const sanitized = sanitizeText(dirtyText, 100);
console.log(`Original: "${dirtyText}"`);
console.log(`Sanitized: "${sanitized}"`);
console.log(
  `Control chars removed: ${!sanitized.includes("\x00") && !sanitized.includes("\x1F") && !sanitized.includes("\x7F")} (expected: true)`,
);
console.log(`Trimmed: ${sanitized === sanitized.trim()} (expected: true)`);

console.log("\n=== Testing Metadata Sanitization ===\n");

const dirtyMetadata = {
  title: "  Job\x00Title  ",
  description: "Test\x1FDescription",
  nested: {
    field: "Value\x7FHere",
  },
  number: 123,
  array: ["item\x001", "item\x002"],
};

const sanitizedMetadata = sanitizeMetadata(dirtyMetadata, 100);
console.log("Sanitized metadata:", JSON.stringify(sanitizedMetadata, null, 2));

console.log("\n=== Testing Validation Error Handling ===\n");

try {
  validateStellarPublicKey("invalid", "customer");
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(`ValidationError caught:`);
    console.log(`  Message: ${error.message}`);
    console.log(`  Field: ${error.field}`);
    console.log(`  Code: ${error.code}`);
  }
}

try {
  validateAmount("-100", "amount");
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(`\nAmount validation error:`);
    console.log(`  Message: ${error.message}`);
    console.log(`  Field: ${error.field}`);
    console.log(`  Code: ${error.code}`);
  }
}

console.log("\n=== All Tests Complete ===");
