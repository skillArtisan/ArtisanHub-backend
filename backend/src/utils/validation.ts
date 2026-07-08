/**
 * Stellar Public Key Validation
 * Stellar public keys are 56 characters long and start with 'G'
 */
export function isValidStellarPublicKey(publicKey: string): boolean {
  return /^G[A-Za-z0-9]{55}$/.test(publicKey);
}

/**
 * Stellar Contract ID Validation
 * Contract IDs are 64-character hexadecimal strings (32 bytes)
 */
export function isValidContractId(contractId: string): boolean {
  return /^[A-Fa-f0-9]{64}$/.test(contractId);
}

/**
 * Validate amount in stroops (smallest Stellar unit)
 * Must be a non-negative integer string
 */
export function isValidAmount(amount: string): boolean {
  return /^\d+$/.test(amount) && BigInt(amount) >= 0n;
}

/**
 * Sanitize text fields by:
 * - Trimming whitespace
 * - Removing control characters
 * - Limiting length
 */
export function sanitizeText(text: string, maxLength: number = 1000): string {
  // Remove control characters (except newline and tab)
  let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Trim leading/trailing whitespace
  sanitized = sanitized.trim();

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize metadata object by sanitizing all string values
 */
export function sanitizeMetadata(
  metadata: Record<string, unknown>,
  maxLength: number = 1000,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string") {
      sanitized[key] = sanitizeText(value, maxLength);
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      sanitized[key] = sanitizeMetadata(
        value as Record<string, unknown>,
        maxLength,
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Custom error class for validation errors
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Validate Stellar public key with detailed error
 */
export function validateStellarPublicKey(
  publicKey: string,
  fieldName: string = "publicKey",
): void {
  if (!publicKey || publicKey.trim() === "") {
    throw new ValidationError(
      `${fieldName} is required`,
      fieldName,
      "REQUIRED",
    );
  }

  if (!isValidStellarPublicKey(publicKey)) {
    throw new ValidationError(
      `${fieldName} must be a valid Stellar public key (56 characters starting with G)`,
      fieldName,
      "INVALID_STELLAR_KEY",
    );
  }
}

/**
 * Validate contract ID with detailed error
 */
export function validateContractId(
  contractId: string,
  fieldName: string = "contractId",
): void {
  if (!contractId || contractId.trim() === "") {
    throw new ValidationError(
      `${fieldName} is required`,
      fieldName,
      "REQUIRED",
    );
  }

  if (!isValidContractId(contractId)) {
    throw new ValidationError(
      `${fieldName} must be a valid 64-character hexadecimal string`,
      fieldName,
      "INVALID_CONTRACT_ID",
    );
  }
}

/**
 * Validate amount with detailed error
 */
export function validateAmount(
  amount: string,
  fieldName: string = "amount",
): void {
  if (!amount || amount.trim() === "") {
    throw new ValidationError(
      `${fieldName} is required`,
      fieldName,
      "REQUIRED",
    );
  }

  if (!isValidAmount(amount)) {
    throw new ValidationError(
      `${fieldName} must be a non-negative integer string (stroops)`,
      fieldName,
      "INVALID_AMOUNT",
    );
  }
}
