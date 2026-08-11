# Artisan Marketplace API Documentation

Complete API for discovering artisans, viewing profiles, reputation, ratings, and managing reviews.

## Table of Contents

1. [Overview](#overview)
2. [Endpoints](#endpoints)
3. [Search & Filtering](#search--filtering)
4. [Reviews & Reputation](#reviews--reputation)
5. [Examples](#examples)

## Overview

The artisan marketplace API enables customers to:
- **Discover artisans** through search and browsing
- **Filter by skills, location, rating, and availability**
- **View detailed profiles** with experience and ratings
- **Check reputation** and completed job count
- **Leave reviews** for completed work
- **Browse categories** (by skill, location, top-rated, new)

## Endpoints

### Search & Discovery

#### Search Artisans
**GET** `/api/artisans`

Search and filter artisans with pagination and sorting.

**Query Parameters:**
```
skill              - Filter by skill/trade name
trade              - Alternative skill filter
location           - Filter by street address (partial match)
city               - Filter by city name
minRating          - Minimum rating (0-5)
isAvailable        - Filter by availability (true/false)
isVerified         - Filter by verification status (true/false)
page               - Page number (default: 1)
limit              - Results per page (1-100, default: 20)
sortBy             - Sort field: rating, reviews, completed, newest (default: rating)
sortOrder          - Sort direction: asc, desc (default: desc)
```

**Response (200):**
```json
{
  "artisans": [
    {
      "artisanId": "GAB...XYZ",
      "name": "John Smith",
      "bio": "Professional carpenter",
      "skills": ["carpentry", "wood-working"],
      "location": "New York, NY",
      "experience": "10 years",
      "averageRating": 4.8,
      "totalReviews": 45,
      "completedJobs": 120,
      "isVerified": true,
      "isAvailable": true,
      "profileImage": "https://storage.example.com/image.jpg",
      "languages": ["English", "Spanish"],
      "joinedDate": "2025-01-15T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 250,
    "pages": 13
  }
}
```

**Example Queries:**
```bash
# Search by skill
GET /api/artisans?skill=carpentry&minRating=4&isVerified=true

# Filter by location
GET /api/artisans?city=New York&isAvailable=true

# Sort by reviews
GET /api/artisans?sortBy=reviews&sortOrder=desc&limit=50

# Paginate through results
GET /api/artisans?page=2&limit=20
```

---

### Artisan Profile

#### Get Artisan Details
**GET** `/api/artisans/{artisanId}`

Retrieve detailed profile and reputation information for an artisan.

**Path Parameters:**
- `artisanId` - Stellar public key (G...)

**Response (200):**
```json
{
  "profile": {
    "artisanId": "GAB...XYZ",
    "name": "John Smith",
    "bio": "Professional carpenter with 10 years experience",
    "skills": ["carpentry", "wood-working", "furniture"],
    "location": "123 Main St, New York, NY",
    "experience": "10 years",
    "averageRating": 4.8,
    "totalReviews": 45,
    "completedJobs": 120,
    "isVerified": true,
    "isAvailable": true,
    "profileImage": "https://storage.example.com/image.jpg",
    "languages": ["English", "Spanish"],
    "joinedDate": "2025-01-15T00:00:00.000Z"
  },
  "reputation": {
    "artisanId": "GAB...XYZ",
    "averageRating": 4.8,
    "totalReviews": 45,
    "completedJobs": 120,
    "isVerified": true,
    "verificationDate": "2025-06-20T00:00:00.000Z"
  }
}
```

**Error Responses:**
- `404`: Artisan not found or profile not available
- `400`: Invalid artisan ID format

---

### Reviews

#### Get Artisan Reviews
**GET** `/api/artisans/{artisanId}/reviews`

Retrieve paginated reviews for an artisan.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Results per page (1-100, default: 20)

**Response (200):**
```json
{
  "reviews": [
    {
      "id": "review-uuid-1",
      "artisanId": "GAB...XYZ",
      "customer": "GAC...ABC",
      "jobId": "job-123",
      "rating": 5,
      "comment": "Excellent work! Highly recommend.",
      "isVerifiedJob": true,
      "createdAt": "2026-08-10T14:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

---

#### Add Review
**POST** `/api/artisans/{artisanId}/reviews?jobId={jobId}`

Submit a review for a completed job. Requires customer signature verification.

**Headers:**
- `x-customer-address` - Customer's Stellar public key

**Query Parameters:**
- `jobId` - ID of the completed job

**Request Body:**
```json
{
  "rating": 5,
  "comment": "Excellent work! Highly recommend.",
  "signature": "base64-encoded-signature"
}
```

**Validation:**
- Rating must be 1-5 (integer)
- Comment max 1000 characters
- Only one review per job
- Job must be in "Completed" state
- Only customer can review
- Signature must verify

**Response (201):**
```json
{
  "review": {
    "id": "review-uuid-1",
    "artisanId": "GAB...XYZ",
    "customer": "GAC...ABC",
    "jobId": "job-123",
    "rating": 5,
    "comment": "Excellent work!",
    "isVerifiedJob": true,
    "createdAt": "2026-08-10T14:30:00.000Z"
  },
  "message": "Review added successfully"
}
```

**Error Responses:**
- `400`: Invalid rating, missing parameters, validation error
- `401`: Invalid signature
- `404`: Job not found
- `409`: Review already exists for this job

---

### Reputation

#### Get Reputation
**GET** `/api/artisans/{artisanId}/reputation`

Get reputation and rating summary.

**Response (200):**
```json
{
  "reputation": {
    "artisanId": "GAB...XYZ",
    "averageRating": 4.8,
    "totalReviews": 45,
    "completedJobs": 120,
    "isVerified": true,
    "verificationDate": "2025-06-20T00:00:00.000Z"
  }
}
```

---

### Browse Categories

#### Browse by Skill
**GET** `/api/artisans/browse/by-skill?skill={skill}&limit={limit}`

Get all artisans with a specific skill.

**Query Parameters:**
- `skill` - Skill name (required)
- `limit` - Max results (1-100, default: 20)

**Response (200):**
```json
{
  "artisans": [ ... ]
}
```

---

#### Browse by Location
**GET** `/api/artisans/browse/by-location?city={city}&limit={limit}`

Get all artisans in a specific city.

**Query Parameters:**
- `city` - City name (required)
- `limit` - Max results (1-100, default: 20)

**Response (200):**
```json
{
  "artisans": [ ... ]
}
```

---

#### Top Rated
**GET** `/api/artisans/browse/top-rated?limit={limit}`

Get highest-rated artisans.

**Query Parameters:**
- `limit` - Max results (1-100, default: 10)

**Response (200):**
```json
{
  "artisans": [ ... ]
}
```

---

#### New Artisans
**GET** `/api/artisans/browse/new?limit={limit}`

Get newest artisans joined.

**Query Parameters:**
- `limit` - Max results (1-100, default: 10)

**Response (200):**
```json
{
  "artisans": [ ... ]
}
```

---

### Availability

#### Check Availability
**GET** `/api/artisans/{artisanId}/availability`

Check if an artisan is currently available.

**Response (200):**
```json
{
  "isAvailable": true
}
```

---

## Search & Filtering

### Filter Combinations

**By Skill and Rating:**
```
GET /api/artisans?skill=carpentry&minRating=4&sortBy=rating&sortOrder=desc
```

**By Location and Availability:**
```
GET /api/artisans?city=New York&isAvailable=true&limit=50
```

**Verified Only:**
```
GET /api/artisans?isVerified=true&sortBy=reviews&limit=100
```

**By Multiple Criteria:**
```
GET /api/artisans?skill=carpentry&city=New York&minRating=4&isVerified=true&isAvailable=true&page=1&limit=20
```

### Sorting Options

| sortBy | Order | Use Case |
|--------|-------|----------|
| rating | desc | Best rated first |
| reviews | desc | Most reviewed first |
| completed | desc | Most experienced first |
| newest | desc | Recently joined first |

### Pagination

- **Default limit:** 20 results
- **Max limit:** 100 results
- **First page:** page=1
- **Calculate pages:** Math.ceil(total / limit)
- **Calculate offset:** (page - 1) * limit

---

## Reviews & Reputation

### Review Eligibility

Reviews can only be added when:
- ✅ Job exists in database
- ✅ Job state is "Completed"
- ✅ Reviewer is the customer from the job
- ✅ No review already exists for this job
- ✅ Rating is 1-5 (integer)
- ✅ Signature is valid

### Rating Calculation

- Average rating updated automatically when review added
- Rounded to 1 decimal place (4.8, 4.7, etc)
- Minimum 1 review to appear in search
- Reputation tied to job completion

---

## Examples

### Complete Discovery Flow

```bash
# 1. Search for carpenters in New York
curl "http://localhost:3000/api/artisans?skill=carpentry&city=New%20York&minRating=4&isVerified=true"

# 2. Get top 10 rated artisans
curl "http://localhost:3000/api/artisans/browse/top-rated?limit=10"

# 3. View specific artisan profile
curl "http://localhost:3000/api/artisans/GAB...XYZ"

# 4. Check reputation
curl "http://localhost:3000/api/artisans/GAB...XYZ/reputation"

# 5. View reviews
curl "http://localhost:3000/api/artisans/GAB...XYZ/reviews?limit=20"

# 6. Leave a review (after job completion)
curl -X POST "http://localhost:3000/api/artisans/GAB...XYZ/reviews?jobId=job-123" \
  -H "Content-Type: application/json" \
  -H "x-customer-address: GAC...ABC" \
  -d '{
    "rating": 5,
    "comment": "Great work!",
    "signature": "..."
  }'
```

### Search Scenarios

**Find Best Carpenters Locally:**
```bash
GET /api/artisans?skill=carpentry&city=New%20York&isVerified=true&sortBy=rating&limit=20
```

**Browse New Artisans:**
```bash
GET /api/artisans/browse/new?limit=20
```

**Find Most Reviewed:**
```bash
GET /api/artisans?sortBy=reviews&sortOrder=desc&limit=50
```

**Filter by Experience:**
```bash
GET /api/artisans?minRating=4&isAvailable=true&page=1&limit=20
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created (review added) |
| 400 | Bad request, validation error |
| 401 | Unauthorized, invalid signature |
| 404 | Not found |
| 409 | Conflict (duplicate review) |

---

## Data Validation

### Search Filters
- Rating: 0-5 (numeric)
- Limit: 1-100 (numeric)
- Page: 1+ (numeric)
- Skill/Trade: non-empty string
- City: non-empty string

### Review Fields
- Rating: 1-5 (integer only)
- Comment: 0-1000 characters
- Signature: valid base64 string

### Artisan Public Key
- Format: G[A-Za-z0-9]{55}
- Case-sensitive
- 56 characters total

---

## Rate Limiting

- **Review creation:** 10 per hour per customer
- **Search/Browse:** No limit
- **Profile viewing:** No limit

---

## Error Handling

All errors follow consistent format:
```json
{
  "error": "Descriptive error message"
}
```

### Common Errors

**Invalid Rating:**
```json
{
  "error": "Rating must be an integer between 1 and 5"
}
```

**Duplicate Review:**
```json
{
  "error": "Review already exists for this job"
}
```

**Unauthorized Reviewer:**
```json
{
  "error": "Only the customer can review this job"
}
```

**Job Not Completed:**
```json
{
  "error": "Can only review completed jobs"
}
```

---

## Integration Notes

- **Backwards Compatible** - No changes to existing artisan data
- **Reputation Integration** - Tracks ratings and completed jobs
- **Job Integration** - Reviews linked to job completions
- **User Integration** - Artisan profiles come from users table
- **Soroban Ready** - Reputation data can integrate with smart contract

---

## Future Enhancements

- [ ] Photo verification for reviews
- [ ] Response to reviews from artisans
- [ ] Review filtering (verified jobs only, date range, etc)
- [ ] Artisan performance analytics
- [ ] Badge system for achievements
- [ ] Review helpfulness voting
- [ ] Negative review moderation
