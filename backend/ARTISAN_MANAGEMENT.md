# Artisan Management System API Documentation

Complete API reference for artisan profile management, services, portfolio, working hours, and locations.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Endpoints](#endpoints)
4. [Data Models](#data-models)
5. [Examples](#examples)

## Overview

The artisan management system provides comprehensive tools for artisans to:

- **Profile Management** - Create and maintain artisan profiles with skills and experience
- **Service Offerings** - Define and manage services with pricing and categories
- **Portfolio** - Showcase completed work with images and project details
- **Working Hours** - Set regular working schedules and manage availability
- **Special Hours** - Mark holidays, vacations, and special closures
- **Locations** - Manage multiple service locations with coordinates

All endpoints use **Stellar signature verification** for authentication, consistent with ArtisanHub architecture.

## Authentication

### Signature Verification

All state-changing operations require:
1. Valid Stellar public key as `artisanId`
2. Cryptographic signature from the private key holder
3. Signature verification against payload: `OPERATION:artisanId[:field:value]`

### Rate Limiting

- **Update operations**: 20 requests/minute per client IP

## Endpoints

### Artisan Profile

#### Get Profile
**GET** `/api/artisans/{artisanId}/profile`

Retrieve artisan profile information.

**Response (200):**
```json
{
  "profile": {
    "artisanId": "GAB...XYZ",
    "bio": "Skilled carpenter with 10 years experience",
    "experienceYears": "10",
    "education": "Carpentry Certificate",
    "certifications": [],
    "skills": ["carpentry", "wood-working", "furniture"],
    "languages": ["en", "es"],
    "averageRating": 4.8,
    "totalReviews": 45,
    "isVerified": true,
    "isActive": true,
    "profileCreatedAt": "2026-08-11T10:00:00.000Z",
    "profileUpdatedAt": "2026-08-12T15:30:00.000Z"
  }
}
```

---

#### Create Profile
**POST** `/api/artisans/{artisanId}/profile`

Create a new artisan profile.

**Request Body:**
```json
{
  "bio": "Skilled carpenter",
  "experienceYears": "10",
  "education": "Carpentry Certificate",
  "skills": ["carpentry", "wood-working"],
  "languages": ["en", "es"],
  "signature": "base64-signature"
}
```

**Response (201):**
```json
{
  "profile": { ... }
}
```

---

#### Update Profile
**PUT** `/api/artisans/{artisanId}/profile`

Update artisan profile information.

**Request Body:**
```json
{
  "bio": "Updated bio",
  "skills": ["carpentry", "wood-working", "restoration"],
  "signature": "base64-signature"
}
```

**Response (200):**
```json
{
  "profile": { ... }
}
```

---

### Services

#### List Services
**GET** `/api/artisans/{artisanId}/services`

Get all services offered by an artisan.

**Response (200):**
```json
{
  "services": [
    {
      "id": "svc-uuid-1",
      "artisanId": "GAB...XYZ",
      "categoryId": "carpentry",
      "name": "Custom Cabinet Making",
      "description": "Handmade custom cabinets",
      "basePrice": "100000000",
      "currency": "XLM",
      "isAvailable": true,
      "estimatedDurationMinutes": 240,
      "serviceDetails": {},
      "createdAt": "2026-08-11T10:00:00.000Z",
      "updatedAt": "2026-08-11T10:00:00.000Z"
    }
  ]
}
```

---

#### Create Service
**POST** `/api/artisans/{artisanId}/services`

Create a new service offering.

**Request Body:**
```json
{
  "categoryId": "carpentry",
  "name": "Custom Cabinet Making",
  "description": "Handmade custom cabinets",
  "basePrice": "100000000",
  "currency": "XLM",
  "estimatedDurationMinutes": 240,
  "serviceDetails": {
    "materials": ["oak", "maple"],
    "finishes": ["natural", "stained"]
  },
  "signature": "base64-signature"
}
```

**Response (201):**
```json
{
  "service": { ... }
}
```

---

#### Update Service
**PUT** `/api/artisans/services/{serviceId}`

Update service details.

**Request Body:**
```json
{
  "basePrice": "150000000",
  "isAvailable": true,
  "signature": "base64-signature"
}
```

**Response (200):**
```json
{
  "service": { ... }
}
```

---

#### Delete Service
**DELETE** `/api/artisans/{artisanId}/services/{serviceId}`

Remove a service offering.

**Request Body:**
```json
{
  "signature": "base64-signature"
}
```

**Response (200):**
```json
{
  "message": "Service deleted successfully"
}
```

---

### Portfolio

#### List Portfolio
**GET** `/api/artisans/{artisanId}/portfolio`

View all portfolio items for an artisan.

**Response (200):**
```json
{
  "portfolio": [
    {
      "id": "port-uuid-1",
      "artisanId": "GAB...XYZ",
      "title": "Modern Kitchen Cabinet",
      "description": "Custom oak cabinet with stainless hardware",
      "images": [
        "https://storage.example.com/image1.jpg",
        "https://storage.example.com/image2.jpg"
      ],
      "category": "Furniture",
      "completionDate": "2026-07-15",
      "projectUrl": "https://example.com/project/kitchen-cabinet",
      "tags": ["oak", "modern", "stainless-steel"],
      "isFeatured": true,
      "displayOrder": 1,
      "createdAt": "2026-08-11T10:00:00.000Z",
      "updatedAt": "2026-08-11T10:00:00.000Z"
    }
  ]
}
```

---

#### Create Portfolio Item
**POST** `/api/artisans/{artisanId}/portfolio`

Add a new portfolio item.

**Request Body:**
```json
{
  "title": "Modern Kitchen Cabinet",
  "description": "Custom oak cabinet",
  "images": [
    "https://storage.example.com/image1.jpg"
  ],
  "category": "Furniture",
  "completionDate": "2026-07-15",
  "projectUrl": "https://example.com/project",
  "tags": ["oak", "modern"],
  "signature": "base64-signature"
}
```

**Response (201):**
```json
{
  "portfolioItem": { ... }
}
```

---

#### Update Portfolio Item
**PUT** `/api/artisans/portfolio/{itemId}`

Update portfolio item details.

**Request Body:**
```json
{
  "title": "Updated Title",
  "tags": ["oak", "modern", "featured"],
  "isFeatured": true
}
```

**Response (200):**
```json
{
  "portfolioItem": { ... }
}
```

---

#### Delete Portfolio Item
**DELETE** `/api/artisans/{artisanId}/portfolio/{itemId}`

Remove a portfolio item.

**Request Body:**
```json
{
  "signature": "base64-signature"
}
```

**Response (200):**
```json
{
  "message": "Portfolio item deleted successfully"
}
```

---

### Working Hours

#### Get Working Hours
**GET** `/api/artisans/{artisanId}/working-hours`

View all working hours schedules.

**Response (200):**
```json
{
  "workingHours": [
    {
      "id": "wh-uuid-1",
      "artisanId": "GAB...XYZ",
      "dayOfWeek": "Monday",
      "startTime": "09:00",
      "endTime": "17:00",
      "isAvailable": true,
      "createdAt": "2026-08-11T10:00:00.000Z",
      "updatedAt": "2026-08-11T10:00:00.000Z"
    }
  ]
}
```

---

#### Set Working Hours
**POST** `/api/artisans/{artisanId}/working-hours`

Set working hours for a specific day.

**Request Body:**
```json
{
  "dayOfWeek": "Monday",
  "startTime": "09:00",
  "endTime": "17:00",
  "signature": "base64-signature"
}
```

**Response (201):**
```json
{
  "workingHours": { ... }
}
```

---

#### Toggle Working Day
**PUT** `/api/artisans/{artisanId}/working-hours/{dayOfWeek}`

Mark a day as available/unavailable.

**Request Body:**
```json
{
  "isAvailable": false,
  "signature": "base64-signature"
}
```

**Response (200):**
```json
{
  "workingHours": { ... }
}
```

---

### Special Hours

#### List Special Hours
**GET** `/api/artisans/{artisanId}/special-hours`

View all special hours (holidays, vacations, etc).

**Response (200):**
```json
{
  "specialHours": [
    {
      "id": "sh-uuid-1",
      "artisanId": "GAB...XYZ",
      "type": "vacation",
      "startDate": "2026-08-20",
      "endDate": "2026-08-27",
      "reason": "Summer vacation",
      "createdAt": "2026-08-11T10:00:00.000Z"
    }
  ]
}
```

---

#### Add Special Hours
**POST** `/api/artisans/{artisanId}/special-hours`

Mark a special period (holiday, vacation, etc).

**Request Body:**
```json
{
  "type": "vacation",
  "startDate": "2026-08-20",
  "endDate": "2026-08-27",
  "reason": "Summer vacation",
  "signature": "base64-signature"
}
```

**Response (201):**
```json
{
  "specialHours": { ... }
}
```

---

#### Remove Special Hours
**DELETE** `/api/artisans/{artisanId}/special-hours/{specialHoursId}`

Remove a special hours entry.

**Request Body:**
```json
{
  "signature": "base64-signature"
}
```

**Response (200):**
```json
{
  "message": "Special hours removed successfully"
}
```

---

### Locations

#### List Locations
**GET** `/api/artisans/{artisanId}/locations`

View all locations where artisan provides services.

**Response (200):**
```json
{
  "locations": [
    {
      "id": "loc-uuid-1",
      "artisanId": "GAB...XYZ",
      "locationName": "Main Workshop",
      "streetAddress": "123 Woodwork Ave",
      "city": "New York",
      "stateProvince": "NY",
      "postalCode": "10001",
      "country": "USA",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "phoneNumber": "+1-555-0100",
      "isPrimary": true,
      "isServiceLocation": true,
      "createdAt": "2026-08-11T10:00:00.000Z",
      "updatedAt": "2026-08-11T10:00:00.000Z"
    }
  ]
}
```

---

#### Create Location
**POST** `/api/artisans/{artisanId}/locations`

Add a new service location.

**Request Body:**
```json
{
  "locationName": "Downtown Studio",
  "streetAddress": "456 Oak Street",
  "city": "New York",
  "stateProvince": "NY",
  "postalCode": "10002",
  "country": "USA",
  "latitude": 40.7150,
  "longitude": -74.0050,
  "phoneNumber": "+1-555-0101",
  "isPrimary": false,
  "isServiceLocation": true,
  "signature": "base64-signature"
}
```

**Response (201):**
```json
{
  "location": { ... }
}
```

---

#### Update Location
**PUT** `/api/artisans/locations/{locationId}`

Update location details.

**Request Body:**
```json
{
  "phoneNumber": "+1-555-0105",
  "isPrimary": true
}
```

**Response (200):**
```json
{
  "location": { ... }
}
```

---

#### Delete Location
**DELETE** `/api/artisans/{artisanId}/locations/{locationId}`

Remove a service location.

**Request Body:**
```json
{
  "signature": "base64-signature"
}
```

**Response (200):**
```json
{
  "message": "Location deleted successfully"
}
```

---

## Data Models

### ArtisanProfile
```typescript
{
  artisanId: string;               // Stellar public key
  bio: string | null;              // Biography
  experienceYears: string | null;  // Years of experience
  education: string | null;        // Educational background
  certifications: unknown;         // Array of certifications
  skills: string[];                // List of skills
  languages: string[];             // Languages spoken
  averageRating: number;           // Average rating (1-5)
  totalReviews: number;            // Number of reviews
  isVerified: boolean;             // Account verification status
  isActive: boolean;               // Account active status
  profileCreatedAt: string;        // ISO timestamp
  profileUpdatedAt: string;        // ISO timestamp
}
```

### ArtisanService
```typescript
{
  id: string;                          // Unique service ID
  artisanId: string;                   // Stellar public key
  categoryId: string;                  // Service category
  name: string;                        // Service name
  description: string | null;          // Service description
  basePrice: string;                   // Price in stroops (string)
  currency: string;                    // Currency code (XLM)
  isAvailable: boolean;                // Availability status
  estimatedDurationMinutes: number | null; // Estimated duration
  serviceDetails: Record<string, unknown>; // Additional details
  createdAt: string;                   // ISO timestamp
  updatedAt: string;                   // ISO timestamp
}
```

### PortfolioItem
```typescript
{
  id: string;                    // Unique item ID
  artisanId: string;             // Stellar public key
  title: string;                 // Project title
  description: string | null;    // Project description
  images: string[];              // Array of image URLs
  category: string | null;       // Project category
  completionDate: string | null; // ISO date
  projectUrl: string | null;     // External project URL
  tags: string[];                // Project tags
  isFeatured: boolean;           // Featured status
  displayOrder: number;          // Display order
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
}
```

### WorkingHours
```typescript
{
  id: string;                                      // Unique ID
  artisanId: string;                               // Stellar public key
  dayOfWeek: "Monday" | "Tuesday" | ... | "Sunday"; // Day
  startTime: string;                               // HH:MM format
  endTime: string;                                 // HH:MM format
  isAvailable: boolean;                            // Availability
  createdAt: string;                               // ISO timestamp
  updatedAt: string;                               // ISO timestamp
}
```

### SpecialHours
```typescript
{
  id: string;                           // Unique ID
  artisanId: string;                    // Stellar public key
  type: "holiday" | "vacation" | "special_closure"; // Type
  startDate: string;                    // ISO date
  endDate: string;                      // ISO date
  reason: string | null;                // Reason
  createdAt: string;                    // ISO timestamp
}
```

### ArtisanLocation
```typescript
{
  id: string;                    // Unique location ID
  artisanId: string;             // Stellar public key
  locationName: string;          // Location name
  streetAddress: string;         // Street address
  city: string;                  // City name
  stateProvince: string;         // State/Province
  postalCode: string;            // Postal code
  country: string;               // Country
  latitude: number | null;       // GPS latitude
  longitude: number | null;      // GPS longitude
  phoneNumber: string | null;    // Contact phone
  isPrimary: boolean;            // Primary location
  isServiceLocation: boolean;    // Can provide services here
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
}
```

---

## Examples

### Complete Artisan Setup

```bash
# 1. Create profile
curl -X POST http://localhost:3000/api/artisans/GAB...XYZ/profile \
  -H "Content-Type: application/json" \
  -d '{
    "bio": "Skilled carpenter",
    "experienceYears": "10",
    "skills": ["carpentry", "wood-working"],
    "signature": "..."
  }'

# 2. Add services
curl -X POST http://localhost:3000/api/artisans/GAB...XYZ/services \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": "carpentry",
    "name": "Custom Cabinets",
    "basePrice": "100000000",
    "signature": "..."
  }'

# 3. Set working hours
curl -X POST http://localhost:3000/api/artisans/GAB...XYZ/working-hours \
  -H "Content-Type: application/json" \
  -d '{
    "dayOfWeek": "Monday",
    "startTime": "09:00",
    "endTime": "17:00",
    "signature": "..."
  }'

# 4. Add location
curl -X POST http://localhost:3000/api/artisans/GAB...XYZ/locations \
  -H "Content-Type: application/json" \
  -d '{
    "locationName": "Main Workshop",
    "streetAddress": "123 Woodwork Ave",
    "city": "New York",
    "stateProvince": "NY",
    "postalCode": "10001",
    "country": "USA",
    "isPrimary": true,
    "signature": "..."
  }'

# 5. Add portfolio item
curl -X POST http://localhost:3000/api/artisans/GAB...XYZ/portfolio \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Kitchen Cabinet",
    "description": "Custom oak cabinet",
    "images": ["https://storage.example.com/image1.jpg"],
    "category": "Furniture",
    "tags": ["oak", "modern"],
    "signature": "..."
  }'
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success (GET, PUT) |
| 201 | Created (POST) |
| 400 | Bad request, validation error |
| 401 | Unauthorized, invalid signature |
| 403 | Forbidden, not authorized |
| 404 | Not found |
| 409 | Conflict (profile exists) |

---

## Database Tables

### artisan_profiles
```sql
artisan_id (PK, FK)          -- Stellar public key
bio                          -- Biography text
experience_years             -- Years as string
education                    -- Educational details
certifications               -- JSONB array
skills                       -- JSONB array
languages                    -- JSONB array
average_rating               -- Float (1-5)
total_reviews                -- Integer count
is_verified                  -- Boolean
is_active                    -- Boolean
profile_created_at           -- Timestamp
profile_updated_at           -- Timestamp
```

### artisan_services
```sql
id (PK)                      -- UUID
artisan_id (FK)              -- Stellar public key
category_id (FK)             -- Category reference
name                         -- Service name
description                  -- Details
base_price                   -- Stroop amount (string)
currency                     -- Currency code
is_available                 -- Boolean
estimated_duration_minutes   -- Integer
service_details              -- JSONB
created_at                   -- Timestamp
updated_at                   -- Timestamp
UNIQUE(artisan_id, name)
```

### portfolio_items
```sql
id (PK)                      -- UUID
artisan_id (FK)              -- Stellar public key
title                        -- Project title
description                  -- Details
images                       -- JSONB array of URLs
category                     -- Project category
completion_date              -- Date
project_url                  -- URL
tags                         -- JSONB array
is_featured                  -- Boolean
display_order                -- Integer
created_at                   -- Timestamp
updated_at                   -- Timestamp
```

### working_hours
```sql
id (PK)                      -- UUID
artisan_id (FK)              -- Stellar public key
day_of_week                  -- Day name
start_time                   -- Time
end_time                     -- Time
is_available                 -- Boolean
created_at                   -- Timestamp
updated_at                   -- Timestamp
UNIQUE(artisan_id, day_of_week)
```

### special_hours
```sql
id (PK)                      -- UUID
artisan_id (FK)              -- Stellar public key
type                         -- holiday/vacation/special_closure
start_date                   -- Date
end_date                     -- Date
reason                       -- Text
created_at                   -- Timestamp
```

### artisan_locations
```sql
id (PK)                      -- UUID
artisan_id (FK)              -- Stellar public key
location_name                -- Name
street_address               -- Address
city                         -- City
state_province               -- State/Province
postal_code                  -- Postal code
country                      -- Country
latitude                     -- GPS latitude
longitude                    -- GPS longitude
phone_number                 -- Contact phone
is_primary                   -- Boolean
is_service_location          -- Boolean
created_at                   -- Timestamp
updated_at                   -- Timestamp
```

---

## Integration Notes

- **Backwards Compatible** - No changes to existing artisan table
- **Stellar Authentication** - Uses existing signature verification
- **Database** - PostgreSQL with Knex migrations
- **Rate Limiting** - 20 requests/minute for updates
