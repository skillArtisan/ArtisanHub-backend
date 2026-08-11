# Persistent Job Management & Search API

Complete job lifecycle management with persistent storage, comprehensive search, filtering, and complete history tracking.

## Table of Contents

1. [Overview](#overview)
2. [Job Lifecycle](#job-lifecycle)
3. [Endpoints](#endpoints)
4. [Search & Filtering](#search--filtering)
5. [History Tracking](#history-tracking)
6. [Examples](#examples)

## Overview

The persistent job management system provides:

- **Complete Persistence** - All jobs and status changes stored permanently
- **Advanced Search** - Filter by status, customer, artisan, trade, amount, date
- **Lifecycle Management** - Track job through complete state machine
- **History Tracking** - Full audit trail of all status transitions
- **Authorization** - Role-based access control (customer/artisan/both)
- **Pagination** - Efficient handling of large datasets
- **Statistics** - User-specific job counts and summaries

## Job Lifecycle

### State Machine

```
Open
  ├─→ Active (accepted)
  └─→ Cancelled (rejected)

Active
  ├─→ Completed (finished)
  ├─→ Disputed (issue raised)
  └─→ Cancelled (cancelled mid-work)

Completed
  └─→ Disputed (issue after completion)

Disputed
  ├─→ Completed (resolved favorably)
  └─→ Refunded (refund issued)

Refunded (final state)

Cancelled (final state)
```

### Valid Transitions

| From | To | Allowed |
|------|----|----|
| Open | Active | ✅ |
| Open | Cancelled | ✅ |
| Active | Completed | ✅ |
| Active | Disputed | ✅ |
| Active | Cancelled | ✅ |
| Completed | Disputed | ✅ |
| Disputed | Completed | ✅ |
| Disputed | Refunded | ✅ |
| Refunded | Any | ❌ (final) |
| Cancelled | Any | ❌ (final) |

---

## Endpoints

### Search Jobs

#### GET /api/jobs

Search and filter all jobs with pagination and sorting.

**Query Parameters:**
```
status           - Job state: Open, Active, Completed, Disputed, Refunded, Cancelled
customer         - Filter by customer Stellar address
artisan          - Filter by artisan Stellar address
trade            - Filter by trade name (partial match)
minAmount        - Minimum amount in stroops
maxAmount        - Maximum amount in stroops
createdAfter     - ISO date string (filter by creation date)
createdBefore    - ISO date string (filter by creation date)
page             - Page number (default: 1)
limit            - Results per page (1-100, default: 20)
sortBy           - Sort field: created, amount, updated (default: created)
sortOrder        - Sort direction: asc, desc (default: desc)
```

**Response (200):**
```json
{
  "jobs": [
    {
      "jobId": "job-uuid-1",
      "customer": "GAB...XYZ",
      "artisan": "GAC...ABC",
      "amount": "100000000",
      "state": "Active",
      "createdAt": "2026-08-01T10:00:00.000Z",
      "disputeAt": null,
      "jobHash": "hash...",
      "trade": "carpentry",
      "description": "Build cabinet",
      "contractTxHash": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

### Get Job Details

#### GET /api/jobs/{jobId}

Retrieve complete job information including current state and history.

**Response (200):**
```json
{
  "job": {
    "jobId": "job-uuid-1",
    "customer": "GAB...XYZ",
    "artisan": "GAC...ABC",
    "amount": "100000000",
    "state": "Active",
    "createdAt": "2026-08-01T10:00:00.000Z",
    "disputeAt": null,
    "jobHash": "hash...",
    "trade": "carpentry",
    "description": "Build cabinet",
    "contractTxHash": null
  },
  "history": [
    {
      "id": "hist-uuid-1",
      "jobId": "job-uuid-1",
      "previousState": "Open",
      "newState": "Active",
      "triggeredBy": "GAC...ABC",
      "reason": null,
      "timestamp": "2026-08-01T11:00:00.000Z"
    }
  ]
}
```

---

### Get Job History

#### GET /api/jobs/{jobId}/history

Paginated complete history of all status transitions.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Results per page (1-100, default: 50)

**Headers:**
- `x-user-address` - (Optional) User's Stellar address for authorization check

**Response (200):**
```json
{
  "history": [
    {
      "id": "hist-uuid-1",
      "jobId": "job-uuid-1",
      "previousState": "Open",
      "newState": "Active",
      "triggeredBy": "GAC...ABC",
      "reason": null,
      "metadata": {},
      "transactionHash": null,
      "timestamp": "2026-08-01T11:00:00.000Z",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 5,
    "pages": 1
  }
}
```

---

### My Jobs

#### GET /api/jobs/my-jobs

Get jobs relevant to authenticated user (customer or artisan role).

**Query Parameters:**
- `role` - "customer", "artisan", or "both" (default: both)
- `status` - Filter by status
- `page` - Page number
- `limit` - Results per page

**Headers:**
- `x-user-address` - User's Stellar address (required)

**Response (200):**
```json
{
  "jobs": [ ... ],
  "pagination": { ... }
}
```

---

### Job Statistics

#### GET /api/jobs/stats

Get job statistics for a user (totals by status as customer and artisan).

**Query Parameters:**
- `userAddress` - User's Stellar address (optional, uses header if not provided)

**Headers:**
- `x-user-address` - User's Stellar address

**Response (200):**
```json
{
  "stats": {
    "asCustomer": {
      "total": 10,
      "open": 1,
      "active": 2,
      "completed": 5,
      "disputed": 1,
      "cancelled": 1
    },
    "asArtisan": {
      "total": 20,
      "open": 0,
      "active": 3,
      "completed": 15,
      "disputed": 1,
      "cancelled": 1
    }
  }
}
```

---

### Transition Job Status

#### POST /api/jobs/{jobId}/transition

Change job status with authorization and validation.

**Headers:**
- `x-user-address` - User's Stellar address (required)

**Request Body:**
```json
{
  "newState": "Active",
  "reason": "Customer accepted the job",
  "transactionHash": "abc123...",
  "signature": "base64-encoded-signature"
}
```

**Response (200):**
```json
{
  "job": { ... },
  "history": {
    "id": "hist-uuid-1",
    "jobId": "job-uuid-1",
    "previousState": "Open",
    "newState": "Active",
    "triggeredBy": "GAC...ABC",
    "reason": "Customer accepted the job",
    "timestamp": "2026-08-01T11:00:00.000Z"
  },
  "message": "Job transitioned to Active"
}
```

**Error Responses:**
- `400`: Missing required fields
- `401`: Invalid signature
- `403`: Not authorized for this job
- `404`: Job not found
- `409`: Invalid state transition

---

### Validate Transition

#### POST /api/jobs/{jobId}/validate-transition

Check if a status transition is valid without performing it.

**Request Body:**
```json
{
  "newState": "Completed"
}
```

**Response (200):**
```json
{
  "isValid": true,
  "currentState": "Active",
  "requestedState": "Completed"
}
```

---

### Jobs by Status

#### GET /api/jobs/by-status

Get all jobs in a specific status.

**Query Parameters:**
- `status` - Job state (required)
- `limit` - Max results (1-100, default: 50)

**Response (200):**
```json
{
  "jobs": [ ... ]
}
```

---

## Search & Filtering

### Filter Combinations

**By Status:**
```
GET /api/jobs?status=Active
```

**By Customer:**
```
GET /api/jobs?customer=GAB...XYZ&page=1&limit=20
```

**By Artisan:**
```
GET /api/jobs?artisan=GAC...ABC&status=Completed
```

**By Trade and Rating:**
```
GET /api/jobs?trade=carpentry&sortBy=created&sortOrder=desc
```

**By Date Range:**
```
GET /api/jobs?createdAfter=2026-08-01T00:00:00Z&createdBefore=2026-08-31T23:59:59Z
```

**By Amount Range:**
```
GET /api/jobs?minAmount=100000000&maxAmount=500000000&sortBy=amount
```

**Complete Filter:**
```
GET /api/jobs?customer=GAB...XYZ&status=Active&trade=carpentry&minAmount=100000000&page=1&limit=50&sortBy=created&sortOrder=desc
```

---

## History Tracking

### Recorded Information

Each transition records:
- ✅ Previous state
- ✅ New state
- ✅ User who triggered transition
- ✅ Timestamp (ISO 8601)
- ✅ Reason for transition
- ✅ Transaction hash (if contract-related)
- ✅ IP address
- ✅ User agent
- ✅ Additional metadata

### History Examples

**Job Created:**
```json
{
  "previousState": null,
  "newState": "Open",
  "triggeredBy": "GAB...XYZ",
  "reason": null,
  "metadata": {"action": "job_created"}
}
```

**Job Accepted:**
```json
{
  "previousState": "Open",
  "newState": "Active",
  "triggeredBy": "GAC...ABC",
  "reason": null,
  "metadata": {"action": "job_accepted"}
}
```

**Job Disputed:**
```json
{
  "previousState": "Active",
  "newState": "Disputed",
  "triggeredBy": "GAB...XYZ",
  "reason": "Quality issues - work not completed properly",
  "metadata": {"action": "job_disputed"}
}
```

**Dispute Resolved:**
```json
{
  "previousState": "Disputed",
  "newState": "Completed",
  "triggeredBy": "GAD...DEF",
  "reason": "Mediator resolved in favor of artisan",
  "metadata": {"action": "dispute_resolved", "decision": "artisan"}
}
```

---

## Examples

### Search All Active Jobs

```bash
curl "http://localhost:3000/api/jobs?status=Active&limit=20"
```

### Search My Customer Jobs

```bash
curl -H "x-user-address: GAB...XYZ" \
  "http://localhost:3000/api/jobs/my-jobs?role=customer&status=Active"
```

### Get Job Details

```bash
curl "http://localhost:3000/api/jobs/job-uuid-1"
```

### View Complete History

```bash
curl "http://localhost:3000/api/jobs/job-uuid-1/history?limit=50"
```

### Accept a Job

```bash
curl -X POST "http://localhost:3000/api/jobs/job-uuid-1/transition" \
  -H "Content-Type: application/json" \
  -H "x-user-address: GAC...ABC" \
  -d '{
    "newState": "Active",
    "reason": "I accept this job",
    "signature": "..."
  }'
```

### Complete a Job

```bash
curl -X POST "http://localhost:3000/api/jobs/job-uuid-1/transition" \
  -H "Content-Type: application/json" \
  -H "x-user-address: GAC...ABC" \
  -d '{
    "newState": "Completed",
    "signature": "..."
  }'
```

### Dispute a Job

```bash
curl -X POST "http://localhost:3000/api/jobs/job-uuid-1/transition" \
  -H "Content-Type: application/json" \
  -H "x-user-address: GAB...XYZ" \
  -d '{
    "newState": "Disputed",
    "reason": "Work not completed to standard",
    "signature": "..."
  }'
```

### Get Job Statistics

```bash
curl -H "x-user-address: GAB...XYZ" \
  "http://localhost:3000/api/jobs/stats"
```

---

## Persistence & Data

### Persistent Storage

✅ All jobs stored in PostgreSQL
✅ All status changes recorded
✅ Complete audit trail
✅ Survives server restarts
✅ Timestamps on all transitions

### Data Retention

- Jobs kept permanently
- History kept permanently
- Soft deletes not used (immutable record)
- Complete traceability maintained

---

## Authorization Rules

| Action | Customer | Artisan | Mediator | Admin |
|--------|----------|---------|----------|-------|
| View own jobs | ✅ | ✅ | - | ✅ |
| Create job | ✅ | - | - | ✅ |
| Accept job | - | ✅ | - | ✅ |
| Complete job | ✅ | ✅ | - | ✅ |
| Dispute job | ✅ | ✅ | - | ✅ |
| Resolve dispute | - | - | ✅ | ✅ |
| View history | ✅ | ✅ | ✅ | ✅ |

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request, validation error |
| 401 | Invalid signature |
| 403 | Not authorized for this job |
| 404 | Job not found |
| 409 | Invalid state transition |

---

## Validation Rules

- ✅ Only valid state transitions allowed
- ✅ Unauthorized users cannot modify jobs
- ✅ Valid Stellar addresses required
- ✅ Signatures verified on transitions
- ✅ Dates in ISO 8601 format
- ✅ Amounts in stroops (string)

---

## Integration Notes

- **Backwards Compatible** - Works with existing job system
- **Complete History** - No data loss, full audit trail
- **Persistent** - Survives restarts
- **Searchable** - Comprehensive filtering
- **Authorized** - Role-based access control
