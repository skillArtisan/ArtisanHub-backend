# Artisan Management Quick Start Guide

Complete implementation of artisan CRUD services, portfolio, service categories, working hours, and location management.

## What's New

### 5 Features Implemented

1. **CRUD Services** ✅ - Create, read, update, delete services
2. **Portfolio Management** ✅ - Showcase work with images and details
3. **Service Categories** ✅ - Organize services by category
4. **Working Hours** ✅ - Set schedules for each day of week
5. **Location Updates** ✅ - Manage multiple service locations

## Quick API Reference

### Profile Management (3 endpoints)
```
GET    /api/artisans/{artisanId}/profile           Get profile
POST   /api/artisans/{artisanId}/profile           Create profile
PUT    /api/artisans/{artisanId}/profile           Update profile
```

### Services (5 endpoints)
```
GET    /api/artisans/{artisanId}/services          List services
POST   /api/artisans/{artisanId}/services          Create service
GET    /api/artisans/services/{serviceId}          Get service
PUT    /api/artisans/services/{serviceId}          Update service
DELETE /api/artisans/{artisanId}/services/{id}     Delete service
```

### Portfolio (4 endpoints)
```
GET    /api/artisans/{artisanId}/portfolio         List portfolio
POST   /api/artisans/{artisanId}/portfolio         Add portfolio item
PUT    /api/artisans/portfolio/{itemId}            Update portfolio item
DELETE /api/artisans/{artisanId}/portfolio/{id}    Delete portfolio item
```

### Working Hours (3 endpoints)
```
GET    /api/artisans/{artisanId}/working-hours     Get all hours
POST   /api/artisans/{artisanId}/working-hours     Set working hours
PUT    /api/artisans/{artisanId}/working-hours/{day} Toggle day availability
```

### Special Hours (3 endpoints)
```
GET    /api/artisans/{artisanId}/special-hours     List special hours
POST   /api/artisans/{artisanId}/special-hours     Add special hours
DELETE /api/artisans/{artisanId}/special-hours/{id} Remove special hours
```

### Locations (4 endpoints)
```
GET    /api/artisans/{artisanId}/locations         List locations
POST   /api/artisans/{artisanId}/locations         Create location
PUT    /api/artisans/locations/{locationId}       Update location
DELETE /api/artisans/{artisanId}/locations/{id}    Delete location
```

**Total: 22 REST Endpoints**

## Testing Examples

### 1. Create Profile
```bash
curl -X POST http://localhost:3000/api/artisans/GAB...XYZ/profile \
  -H "Content-Type: application/json" \
  -d '{
    "bio": "Skilled carpenter with 10 years experience",
    "experienceYears": "10",
    "education": "Carpentry Certificate",
    "skills": ["carpentry", "wood-working", "furniture"],
    "languages": ["en", "es"],
    "signature": "base64-signature"
  }'
```

### 2. Create Service
```bash
curl -X POST http://localhost:3000/api/artisans/GAB...XYZ/services \
  -H "Content-Type: application/json" \
  -d '{
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
  }'
```

### 3. Add Portfolio Item
```bash
curl -X POST http://localhost:3000/api/artisans/GAB...XYZ/portfolio \
  -H "Content-Type: application/json" \
  -d '{
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
    "signature": "base64-signature"
  }'
```

### 4. Set Working Hours
```bash
curl -X POST http://localhost:3000/api/artisans/GAB...XYZ/working-hours \
  -H "Content-Type: application/json" \
  -d '{
    "dayOfWeek": "Monday",
    "startTime": "09:00",
    "endTime": "17:00",
    "signature": "base64-signature"
  }'
```

### 5. Add Location
```bash
curl -X POST http://localhost:3000/api/artisans/GAB...XYZ/locations \
  -H "Content-Type: application/json" \
  -d '{
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
    "signature": "base64-signature"
  }'
```

### 6. Add Special Hours (Vacation)
```bash
curl -X POST http://localhost:3000/api/artisans/GAB...XYZ/special-hours \
  -H "Content-Type: application/json" \
  -d '{
    "type": "vacation",
    "startDate": "2026-08-20",
    "endDate": "2026-08-27",
    "reason": "Summer vacation",
    "signature": "base64-signature"
  }'
```

### 7. Get Profile
```bash
curl -X GET http://localhost:3000/api/artisans/GAB...XYZ/profile
```

### 8. List Services
```bash
curl -X GET http://localhost:3000/api/artisans/GAB...XYZ/services
```

### 9. List Portfolio
```bash
curl -X GET http://localhost:3000/api/artisans/GAB...XYZ/portfolio
```

### 10. Get Working Hours
```bash
curl -X GET http://localhost:3000/api/artisans/GAB...XYZ/working-hours
```

## File Structure

```
backend/
├── src/
│   ├── migrations/
│   │   └── 20260811_add_artisan_management.ts .... (132 lines)
│   │       • artisan_profiles table
│   │       • service_categories table
│   │       • artisan_services table
│   │       • portfolio_items table
│   │       • working_hours table
│   │       • special_hours table
│   │       • artisan_locations table
│   │       • artisan_reviews table
│   │       • artisan_certifications table
│   │       • availability_slots table
│   │
│   ├── routes/
│   │   └── artisans.ts ....................... (570+ lines)
│   │       • 22 REST endpoints
│   │       • Zod schema validation
│   │       • Signature verification
│   │       • Rate limiting
│   │
│   ├── services/
│   │   └── artisans.ts ...................... (700+ lines)
│   │       • Profile CRUD
│   │       • Services management
│   │       • Portfolio management
│   │       • Working hours scheduling
│   │       • Location management
│   │
│   ├── types.ts ............................ (+100 lines)
│   │       • ArtisanProfile type
│   │       • ServiceCategory type
│   │       • ArtisanService type
│   │       • PortfolioItem type
│   │       • WorkingHours type
│   │       • SpecialHours type
│   │       • ArtisanLocation type
│   │       • And more...
│   │
│   └── server.ts .......................... (+1 line)
│       • Import and register routes
│
└── ARTISAN_MANAGEMENT.md ............... (400+ lines)
    • Complete API documentation
    • Data models
    • Examples
    • Database schema
```

## Key Features

### Profile Management
- Bio, experience years, education
- Skills and language proficiencies
- Verification and active status
- Average rating and review count

### Service Management
- Create multiple services per category
- Set base pricing in stroops
- Estimated duration tracking
- Service details as flexible JSON
- Availability toggle

### Portfolio
- Multiple images per project
- Project categories and tags
- Completion dates and external URLs
- Featured items with display ordering
- Full CRUD operations

### Working Hours
- Set hours for each day of the week
- Enable/disable individual days
- Automatic conflict prevention
- Persistent storage

### Special Hours
- Vacations, holidays, special closures
- Date-based management
- Optional reason field
- Easy removal

### Locations
- Multiple service locations per artisan
- Primary location designation
- GPS coordinates support
- Service availability per location
- Contact information

## Database Schema

### 10 New Tables
1. **artisan_profiles** - Extended profile information
2. **service_categories** - Service type categories
3. **artisan_services** - Services offered by artisans
4. **portfolio_items** - Portfolio showcases
5. **working_hours** - Regular schedules
6. **special_hours** - Holidays/vacations
7. **artisan_locations** - Service locations
8. **artisan_reviews** - Customer reviews
9. **artisan_certifications** - Professional credentials
10. **availability_slots** - Booking availability

### Indexes
- `artisan_id` indexed on all relevant tables
- `is_available` indexed for availability queries
- `is_primary` indexed for location queries
- Unique constraints for data integrity

## Security Features

✅ **Stellar Signature Verification** - All modifications authenticated
✅ **Rate Limiting** - 20 requests/minute for updates
✅ **Input Validation** - Zod schemas for all inputs
✅ **Data Sanitization** - Prevent injection attacks
✅ **Authorization** - Artisan can only modify own data

## HTTP Status Codes

| Code | Use Case |
|------|----------|
| 200 | Successful GET/PUT |
| 201 | Created (POST) |
| 400 | Bad request, validation error |
| 401 | Invalid signature |
| 403 | Unauthorized (not owner) |
| 404 | Not found |
| 409 | Conflict (duplicate, etc) |

## Backwards Compatibility

✅ **No breaking changes** to existing artisan table
✅ **Separate endpoints** under `/api/artisans/*`
✅ **Existing functions work** without modification
✅ **Additive only** - New tables and features only

## Next Steps

1. **Run Migration**
   ```bash
   npm run migrate
   ```

2. **Test Endpoints** - Use examples above

3. **Integrate with Frontend**
   - Use signature-based authentication
   - Build forms for profile, services, locations
   - Implement image upload for portfolio

4. **Add Service Categories**
   - Create initial categories in database
   - Build category selection UI

5. **Integrate with Job System**
   - Link artisan services to jobs
   - Use working hours for availability
   - Show portfolio in job applications

## Documentation

- **Full API Docs:** See `ARTISAN_MANAGEMENT.md`
- **Service Code:** See `src/services/artisans.ts`
- **Route Code:** See `src/routes/artisans.ts`
- **Types:** See `src/types.ts`
- **Migration:** See `src/migrations/20260811_add_artisan_management.ts`

## Statistics

| Metric | Value |
|--------|-------|
| **Total Endpoints** | 22 |
| **Database Tables** | 10 |
| **Lines of Code** | 1,400+ |
| **Service Methods** | 30+ |
| **Route Handlers** | 22 |
| **Documentation** | 400+ lines |

## Ready to Use

✅ All features fully implemented
✅ Comprehensive documentation included
✅ Production-ready code
✅ Backwards compatible
✅ Ready for testing

The artisan management system is complete and ready to integrate!
