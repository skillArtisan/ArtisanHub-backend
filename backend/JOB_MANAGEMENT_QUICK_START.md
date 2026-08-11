# Persistent Job Management - Quick Start

Complete persistent job management system with comprehensive search, lifecycle tracking, and full history.

## What's Implemented

✅ **Persistent Storage** - All jobs stored in PostgreSQL
✅ **Advanced Search** - Filter by status, customer, artisan, trade, amount, date  
✅ **Lifecycle Tracking** - 7-state machine with valid transitions
✅ **History Tracking** - Complete audit trail of all changes
✅ **Authorization** - Role-based access control
✅ **Pagination** - Efficient large dataset handling
✅ **Statistics** - User-specific job summaries
✅ **Validation** - Prevent invalid transitions

## Quick API Reference

### Search Jobs
```bash
# All jobs
GET /api/jobs

# By status
GET /api/jobs?status=Active

# By customer
GET /api/jobs?customer=GAB...&page=1&limit=20

# By date range
GET /api/jobs?createdAfter=2026-08-01T00:00:00Z&createdBefore=2026-08-31T23:59:59Z

# By amount
GET /api/jobs?minAmount=100000000&maxAmount=500000000

# Combined filters
GET /api/jobs?customer=GAB...&status=Active&trade=carpentry&sortBy=created&sortOrder=desc
```

### View Jobs
```bash
# Get job details
GET /api/jobs/{jobId}

# Get my jobs
GET /api/jobs/my-jobs -H "x-user-address: GAB..."

# Get statistics
GET /api/jobs/stats -H "x-user-address: GAB..."

# Get history
GET /api/jobs/{jobId}/history?page=1&limit=50
```

### Manage Jobs
```bash
# Transition status
POST /api/jobs/{jobId}/transition \
  -H "x-user-address: GAB..." \
  -d '{"newState": "Active", "signature": "..."}'

# Validate transition
POST /api/jobs/{jobId}/validate-transition \
  -d '{"newState": "Completed"}'
```

## Job States

```
Open          → Newly created job
  ↓ Accept
Active        → Work in progress
  ↓ Complete/Dispute
Completed     → Work finished (can still be disputed)
Disputed      → Issue reported (needs resolution)
  ↓ Resolve
Refunded      → Final state - money refunded
Cancelled     → Final state - job cancelled
```

## Testing Examples

### 1. Search All Active Jobs
```bash
curl "http://localhost:3000/api/jobs?status=Active&limit=20"
```

### 2. Get Specific Job
```bash
curl "http://localhost:3000/api/jobs/job-uuid-1"
```

### 3. View Job History
```bash
curl "http://localhost:3000/api/jobs/job-uuid-1/history?limit=50"
```

### 4. Get My Jobs as Customer
```bash
curl -H "x-user-address: GAB...XYZ" \
  "http://localhost:3000/api/jobs/my-jobs?role=customer"
```

### 5. Get My Jobs as Artisan
```bash
curl -H "x-user-address: GAC...ABC" \
  "http://localhost:3000/api/jobs/my-jobs?role=artisan"
```

### 6. Accept a Job
```bash
curl -X POST "http://localhost:3000/api/jobs/job-uuid-1/transition" \
  -H "x-user-address: GAC...ABC" \
  -H "Content-Type: application/json" \
  -d '{
    "newState": "Active",
    "reason": "Accepted by artisan",
    "signature": "base64-signature"
  }'
```

### 7. Complete a Job
```bash
curl -X POST "http://localhost:3000/api/jobs/job-uuid-1/transition" \
  -H "x-user-address: GAC...ABC" \
  -H "Content-Type: application/json" \
  -d '{
    "newState": "Completed",
    "signature": "base64-signature"
  }'
```

### 8. Dispute a Job
```bash
curl -X POST "http://localhost:3000/api/jobs/job-uuid-1/transition" \
  -H "x-user-address: GAB...XYZ" \
  -H "Content-Type: application/json" \
  -d '{
    "newState": "Disputed",
    "reason": "Work not completed properly",
    "signature": "base64-signature"
  }'
```

### 9. Get Statistics
```bash
curl -H "x-user-address: GAB...XYZ" \
  "http://localhost:3000/api/jobs/stats"
```

### 10. Search by Trade
```bash
curl "http://localhost:3000/api/jobs?trade=carpentry&sortBy=created&limit=50"
```

## Filter Combinations

### Active Jobs by Artisan
```
GET /api/jobs?artisan=GAC...ABC&status=Active
```

### Customer's Completed Jobs
```
GET /api/jobs?customer=GAB...XYZ&status=Completed&sortBy=created&sortOrder=desc
```

### Disputed Jobs Requiring Resolution
```
GET /api/jobs?status=Disputed&limit=100
```

### Jobs in Date Range
```
GET /api/jobs?createdAfter=2026-08-01&createdBefore=2026-08-31&limit=50
```

### High-Value Active Jobs
```
GET /api/jobs?minAmount=500000000&status=Active&sortBy=amount&sortOrder=desc
```

## Response Format

### Search Response
```json
{
  "jobs": [
    {
      "jobId": "job-uuid",
      "customer": "GAB...",
      "artisan": "GAC...",
      "amount": "100000000",
      "state": "Active",
      "createdAt": "2026-08-01T10:00:00Z",
      "trade": "carpentry",
      "description": "Build cabinet"
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

### Job Details with History
```json
{
  "job": { ... },
  "history": [
    {
      "id": "hist-uuid",
      "previousState": "Open",
      "newState": "Active",
      "triggeredBy": "GAC...",
      "reason": null,
      "timestamp": "2026-08-01T11:00:00Z"
    }
  ]
}
```

### Statistics Response
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
      "active": 3,
      "completed": 15,
      "disputed": 1,
      "cancelled": 1
    }
  }
}
```

## Key Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/jobs` | Search & filter all jobs |
| GET | `/api/jobs/{id}` | Get job details + history |
| GET | `/api/jobs/{id}/history` | Get paginated history |
| GET | `/api/jobs/my-jobs` | Get authenticated user's jobs |
| GET | `/api/jobs/stats` | Get user job statistics |
| POST | `/api/jobs/{id}/transition` | Change job status |
| POST | `/api/jobs/{id}/validate-transition` | Validate status change |
| GET | `/api/jobs/by-status` | Get jobs by status |

## File Structure

```
backend/
├── src/
│   ├── migrations/
│   │   └── 20260811_enhance_job_persistence.ts ... (80 lines)
│   │
│   ├── services/
│   │   └── jobPersistence.ts .................. (350 lines)
│   │       • Search with filters
│   │       • History tracking
│   │       • Status transitions
│   │       • Authorization
│   │       • Statistics
│   │
│   ├── routes/
│   │   └── jobsEnhanced.ts ................... (300 lines)
│   │       • 8 REST endpoints
│   │       • Search endpoint
│   │       • History endpoint
│   │       • Transition endpoint
│   │       • Stats endpoint
│   │
│   ├── utils/
│   │   └── jobPersistence.test.ts ........... (250 lines)
│   │       • Lifecycle tests
│   │       • Transition validation
│   │       • Authorization tests
│   │       • Filter tests
│   │
│   └── server.ts ........................... (updated)
│
├── PERSISTENT_JOB_MANAGEMENT.md ........... (400+ lines)
│   • Complete API documentation
│   • All endpoints documented
│   • Examples and use cases
│
└── JOB_MANAGEMENT_QUICK_START.md ......... (this file)
    • Quick reference
    • Testing examples
    • Filter combinations
```

## Valid State Transitions

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
| Refunded | Any | ❌ |
| Cancelled | Any | ❌ |

## History Tracking

Every transition records:
- ✅ Previous state
- ✅ New state
- ✅ User who made change
- ✅ Timestamp
- ✅ Reason (if provided)
- ✅ Transaction hash (if applicable)
- ✅ IP address
- ✅ User agent

## Authorization

- ✅ Customer can: view own jobs, create, complete, dispute
- ✅ Artisan can: view assigned jobs, accept, complete, dispute
- ✅ Both need signature verification
- ✅ Only authorized users can modify

## Validation Rules

- ✅ Valid transitions only
- ✅ Stellar addresses verified
- ✅ Signatures validated
- ✅ Dates in ISO 8601 format
- ✅ Amounts in stroops (string)

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request |
| 401 | Invalid signature |
| 403 | Not authorized |
| 404 | Not found |
| 409 | Invalid transition |

## Integration Checklist

- [x] Persistent storage
- [x] Search with filters
- [x] Pagination
- [x] Sorting
- [x] History tracking
- [x] Lifecycle management
- [x] Authorization
- [x] Validation
- [x] Error handling
- [x] Documentation
- [x] Test cases

## Documentation

Full documentation: **PERSISTENT_JOB_MANAGEMENT.md**

All 8 endpoints documented with:
- Complete parameter lists
- Request/response examples
- Authorization requirements
- Error scenarios
- Use cases

## Ready to Use

✅ Production-ready code
✅ Persistent storage
✅ Comprehensive search
✅ Complete history
✅ Authorization checks
✅ Validation
✅ Full documentation
✅ Test cases

The persistent job management system is complete!
