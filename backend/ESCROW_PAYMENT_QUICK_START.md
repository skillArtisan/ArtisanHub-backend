# Escrow & Payment Status API - Quick Start Guide

## Overview

This guide provides quick examples for the most common Escrow & Payment Status API operations. For detailed documentation, see `ESCROW_PAYMENT_API.md`.

---

## Key Concepts

- **Escrow States**: funding_pending → funds_locked → release_pending → released (or refunded)
- **Payment Events**: Immutable audit trail of all state changes
- **Idempotency**: Duplicate operations are safely detected and ignored
- **Signatures**: All user-initiated operations require Stellar signature verification

---

## Quick Examples

### 1. Check Escrow Status

```bash
curl -X GET https://api.artisanhub.com/api/jobs/550e8400-e29b-41d4-a716-446655440000/escrow
```

**Response:**
```json
{
  "escrow": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "funds_locked",
    "amountStroops": "10000000",
    "contractTxHash": "0x1234...abcd",
    "fundingTxHash": "0x5678...efgh",
    "lockedAt": "2026-08-11T10:31:15Z",
    "...": "..."
  },
  "history": [...]
}
```

---

### 2. Initiate Fund Release (Customer Action)

Customer confirms job is complete and initiates payment release:

```bash
# Step 1: Sign the payload
PAYLOAD="RELEASE_INITIATE:550e8400-e29b-41d4-a716-446655440000"
SIGNATURE=$(stellar-sign-payload "$PAYLOAD" "$CUSTOMER_SECRET_KEY")

# Step 2: Send release initiation request
curl -X POST https://api.artisanhub.com/api/jobs/550e8400-e29b-41d4-a716-446655440000/escrow/release-initiate \
  -H "Content-Type: application/json" \
  -d "{
    \"actor\": \"GCUS5DCDV3X5MWQX5JXVS5LQQWBKJX7X4JWZL3BZPKZ5CQXC5LXQC2J\",
    \"signature\": \"$SIGNATURE\"
  }"
```

**Response (202 Accepted):**
```json
{
  "message": "Release initiated",
  "escrow": {
    "status": "release_pending",
    "releaseInitiatedAt": "2026-08-11T10:45:00Z",
    "...": "..."
  }
}
```

---

### 3. Confirm Release with Transaction Hash (Backend Action)

After blockchain confirms the payment transaction:

```bash
curl -X POST https://api.artisanhub.com/api/jobs/550e8400-e29b-41d4-a716-446655440000/escrow/release-confirm \
  -H "Content-Type: application/json" \
  -d "{
    \"transactionHash\": \"0x9abc...defg\"
  }"
```

**Response:**
```json
{
  "message": "Release confirmed",
  "escrow": {
    "status": "released",
    "releaseTxHash": "0x9abc...defg",
    "releasedAt": "2026-08-11T10:46:00Z"
  }
}
```

---

### 4. View Payment History (Audit Trail)

Get all payment events for a job:

```bash
curl -X GET "https://api.artisanhub.com/api/jobs/550e8400-e29b-41d4-a716-446655440000/escrow/history?limit=50&offset=0"
```

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "events": [
    {
      "id": 45,
      "eventType": "release_initiated",
      "status": "pending",
      "initiatedBy": "GCUS5DCDV3X5MWQX5JXVS5LQQWBKJX7X4JWZL3BZPKZ5CQXC5LXQC2J",
      "ipAddress": "192.168.1.1",
      "createdAt": "2026-08-11T10:45:00Z"
    },
    {
      "id": 44,
      "eventType": "funds_locked",
      "status": "completed",
      "transactionHash": "0x5678...efgh",
      "initiatedBy": "system",
      "createdAt": "2026-08-11T10:31:15Z"
    },
    {
      "id": 43,
      "eventType": "funding_initiated",
      "status": "completed",
      "transactionHash": "0x1234...abcd",
      "initiatedBy": "system",
      "createdAt": "2026-08-11T10:30:00Z"
    }
  ]
}
```

---

### 5. Handle Dispute - Initiate Refund (Mediator Action)

Mediator resolves dispute in customer's favor:

```bash
# Step 1: Sign the refund payload
REASON="Artisan failed to complete work according to contract"
PAYLOAD="REFUND:550e8400-e29b-41d4-a716-446655440000:$REASON"
SIGNATURE=$(stellar-sign-payload "$PAYLOAD" "$MEDIATOR_SECRET_KEY")

# Step 2: Send refund request
curl -X POST https://api.artisanhub.com/api/jobs/550e8400-e29b-41d4-a716-446655440000/escrow/refund \
  -H "Content-Type: application/json" \
  -d "{
    \"reason\": \"$REASON\",
    \"mediator\": \"GDZQVZF7GWBQFTV3V5XQVXL3VQVZF7GWBQFTV3V5XQVXL3VQVZF\",
    \"signature\": \"$SIGNATURE\"
  }"
```

**Response (202 Accepted):**
```json
{
  "message": "Refund initiated",
  "escrow": {
    "status": "refunded",
    "refundedAt": "2026-08-11T11:00:00Z"
  }
}
```

---

### 6. Report Transaction Failure (Backend Error Handling)

When a blockchain transaction fails:

```bash
curl -X POST https://api.artisanhub.com/api/jobs/550e8400-e29b-41d4-a716-446655440000/escrow/transaction-failed \
  -H "Content-Type: application/json" \
  -d "{
    \"transactionHash\": \"0x9999...0000\",
    \"errorMessage\": \"RPC timeout after 5 retries\"
  }"
```

**Response (202 Accepted):**
```json
{
  "message": "Transaction failure recorded",
  "event": {
    "eventType": "transaction_failed",
    "status": "failed",
    "errorMessage": "RPC timeout after 5 retries"
  }
}
```

---

### 7. Get Payment Statistics (Admin/Monitoring)

View aggregate payment statistics:

```bash
curl -X GET https://api.artisanhub.com/api/escrow/statistics
```

**Response:**
```json
{
  "statistics": {
    "totalFunded": 5,
    "totalLocked": 12,
    "totalReleased": 8,
    "totalRefunded": 2,
    "totalDisputed": 1,
    "pendingActions": 3,
    "failedOperations": 0
  },
  "summary": {
    "totalJobs": 28,
    "avgAmountStroops": "10500000",
    "statusDistribution": {
      "fundingPending": 5,
      "fundsLocked": 12,
      "releasePending": 3,
      "released": 8,
      "refunded": 2,
      "disputed": 1
    }
  }
}
```

---

### 8. List All Escrow States with Filtering (Admin)

View all escrow states, optionally filtered by status:

```bash
# Get all jobs in "funds_locked" status
curl -X GET "https://api.artisanhub.com/api/escrow/states?status=funds_locked&limit=100"

# Or get all disputed jobs
curl -X GET "https://api.artisanhub.com/api/escrow/states?status=disputed&limit=50"
```

**Response:**
```json
{
  "states": [
    {
      "jobId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "funds_locked",
      "amountStroops": "10000000",
      "lockedAt": "2026-08-11T10:31:15Z",
      "...": "..."
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "hasMore": false
  }
}
```

---

## TypeScript Integration

```typescript
import { escrowPaymentService } from "./services/escrowPayment";

// Get escrow status
const escrow = await escrowPaymentService.getEscrowStatus(jobId);
console.log(escrow.status); // e.g., "funds_locked"

// Initiate release
const releasing = await escrowPaymentService.initiateRelease(
  jobId,
  customerPublicKey,
  ipAddress,
  userAgent
);
console.log(releasing.status); // "release_pending"

// Confirm release
const released = await escrowPaymentService.confirmRelease(jobId, txHash);
console.log(released.status); // "released"

// Get payment history
const history = await escrowPaymentService.getPaymentHistory(jobId, 50, 0);
history.forEach(event => {
  console.log(`${event.eventType}: ${event.status}`);
});

// Get statistics
const stats = await escrowPaymentService.getPaymentStatistics();
console.log(`Jobs released: ${stats.totalReleased}`);
```

---

## Common Workflows

### Happy Path: Job Completion & Payment

1. **Customer confirms** → `POST /escrow/release-initiate`
2. **Backend submits to blockchain** → Payment processed
3. **Backend confirms** → `POST /escrow/release-confirm`
4. **Final state** → `status: "released"`

### Dispute Path: Customer Initiates Dispute

1. **Customer raises dispute** → `POST /api/jobs/{id}/dispute`
2. **Escrow state** → `status: "disputed"`
3. **Mediator reviews** → Evidence and context
4. **Mediator resolves** → `POST /escrow/refund` (if favoring customer)
5. **Final state** → `status: "refunded"` or `status: "released"` (if favoring artisan)

### Transaction Failure Recovery

1. **Release initiated** → `status: "release_pending"`
2. **Blockchain tx fails** → `POST /escrow/transaction-failed`
3. **Backend retries** → Customer can retry if needed
4. **Eventually succeeds** → `status: "released"`

---

## Testing Locally

### 1. Run Database Migration

```bash
npm run migrate
```

This creates the three new tables:
- `escrow_states` - Current escrow status
- `payment_events` - Audit trail
- `payment_idempotency_keys` - Duplicate prevention

### 2. Run Test Suite

```bash
npm run test -- escrowPayment.test.ts
```

**Output:**
```
✓ Escrow Initialization (2)
✓ Funds Locking (3)
✓ Release Initiation (2)
✓ Release Confirmation (2)
✓ Refund Handling (2)
✓ Payment Events and Audit Trail (3)
✓ Idempotency Keys (2)
✓ Dispute Tracking (2)
✓ Payment Statistics (1)
✓ State Machine Validation (2)

PASS  escrowPayment.test.ts (22 tests)
```

### 3. Manual Testing with cURL

```bash
# Create a job first (using job endpoints)
curl -X POST http://localhost:4000/api/jobs ...

# Get escrow status
curl -X GET http://localhost:4000/api/jobs/abc123/escrow

# Initiate release
curl -X POST http://localhost:4000/api/jobs/abc123/escrow/release-initiate \
  -H "Content-Type: application/json" \
  -d '{"actor":"...", "signature":"..."}'
```

---

## Error Scenarios

| Error | Cause | Fix |
|-------|-------|-----|
| `409 Conflict - Cannot initiate release from funding_pending` | Funds not locked yet | Wait for contract confirmation |
| `401 Unauthorized - Invalid signature` | Bad signature | Verify signature payload format |
| `403 Forbidden - Not job customer or artisan` | Wrong actor | Use correct public key |
| `409 Duplicate operation detected` | Idempotency key hit | This is safe; operation succeeded |
| `404 Not found - Job not found` | Invalid job ID | Verify job exists first |

---

## Rate Limits

- **Read Operations**: 20 requests/minute
- **Write Operations**: 5 requests/minute

If rate limited (429), wait 60 seconds before retrying.

---

## API Endpoints Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/jobs/{id}/escrow` | Get escrow status |
| `POST` | `/api/jobs/{id}/escrow/release-initiate` | Initiate release |
| `POST` | `/api/jobs/{id}/escrow/release-confirm` | Confirm release |
| `POST` | `/api/jobs/{id}/escrow/refund` | Initiate refund |
| `GET` | `/api/jobs/{id}/escrow/history` | Get audit trail |
| `POST` | `/api/jobs/{id}/escrow/transaction-failed` | Report failure |
| `GET` | `/api/escrow/statistics` | Get stats |
| `GET` | `/api/escrow/states` | List all states |

---

## Monitoring

**Key Metrics to Track:**

- `totalLocked`: Jobs with funds locked (healthy state)
- `pendingActions`: Operations awaiting completion
- `failedOperations`: Failed transactions (investigate)
- `totalDisputed`: Active disputes (require mediation)

**Alert Triggers:**

- ⚠️ High `failedOperations` count
- ⚠️ Jobs stuck in `release_pending` > 1 hour
- ⚠️ Multiple `idempotency_detected` events (possible sync issues)

---

## Support & Documentation

- **Full API Docs**: See `ESCROW_PAYMENT_API.md`
- **Implementation Details**: See `src/services/escrowPayment.ts`
- **Routes**: See `src/routes/escrowPayment.ts`
- **Tests**: See `src/utils/escrowPayment.test.ts`
- **Migration**: See `src/migrations/20260811_add_escrow_payment_tracking.ts`

---

## Next Steps

1. Run the migration: `npm run migrate`
2. Run the tests: `npm run test -- escrowPayment.test.ts`
3. Try the API endpoints with your job IDs
4. Integrate frontend calls to these endpoints
5. Monitor the statistics and audit trail

Good luck! 🚀
