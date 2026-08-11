# User Management Quick Start Guide

## Branch Information
- **Branch Name:** `feat/user-management`
- **Commit:** `ef5c3ae`
- **Status:** Ready for testing and review

## What's New

### 5 Core Features Implemented

#### 1. **User Registration & Profiles** ✅
- Create user accounts with email
- Update user profile (name, email)
- View user profiles
- Soft delete with grace period

**Key Endpoints:**
- `POST /api/users` - Create account
- `GET /api/users/{userId}` - Get profile
- `PUT /api/users/{userId}` - Update profile

#### 2. **Profile Image Upload** ✅
- Upload profile pictures (JPEG, PNG, WebP)
- Max 5MB file size
- Automatic versioning (only one current image)
- View current profile image

**Key Endpoints:**
- `POST /api/users/{userId}/profile-image` - Upload
- `GET /api/users/{userId}/profile-image` - Retrieve

#### 3. **User Preferences** ✅
- Notifications settings (on/off)
- Email preferences
- Language selection
- Timezone configuration
- Custom notification rules

**Key Endpoints:**
- `GET /api/users/{userId}/preferences` - Get settings
- `PUT /api/users/{userId}/preferences` - Update settings

#### 4. **Email Verification** ✅
- Token-based email verification
- 24-hour token expiry
- Resend verification flow
- Email uniqueness validation

**Key Endpoints:**
- `POST /api/users/{userId}/verify-email` - Verify with token
- `POST /api/users/{userId}/resend-verification` - Resend token

#### 5. **Account Deletion** ✅
- Request account deletion
- 30-day grace period for recovery
- Confirmation-based deletion
- Cancel deletion anytime during grace period
- Soft delete (data preserved in database)

**Key Endpoints:**
- `POST /api/users/{userId}/request-deletion` - Request deletion
- `POST /api/users/{userId}/confirm-deletion` - Confirm deletion
- `POST /api/users/{userId}/cancel-deletion` - Cancel deletion

## Quick Implementation Facts

| Aspect | Details |
|--------|---------|
| **Total Files Added** | 3 new files (migration, routes, service) |
| **Total Endpoints** | 13 REST endpoints |
| **Database Tables** | 4 new tables |
| **Code Lines** | ~1000+ lines of production code |
| **Authentication** | Stellar signature-based (existing pattern) |
| **Rate Limiting** | 10 req/min general, 3 req/hour deletions |
| **Data Validation** | Sanitization, email format, file size checks |
| **Documentation** | 2 comprehensive guides included |

## Files Changed

### New Files
```
backend/src/migrations/20260811_add_user_profiles.ts    (140 lines)
backend/src/routes/users.ts                              (390 lines)
backend/src/services/users.ts                            (420 lines)
backend/USER_MANAGEMENT.md                               (400+ lines)
backend/IMPLEMENTATION_SUMMARY.md                        (250+ lines)
```

### Modified Files
```
backend/src/server.ts                                    (+1 import, +1 route registration)
backend/src/types.ts                                     (+40 lines of new types)
```

## Testing The API

### 1. User Registration
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "GAB...XYZ",
    "email": "user@example.com",
    "fullName": "John Doe",
    "signature": "base64-signature"
  }'
```

### 2. Get User Profile
```bash
curl -X GET http://localhost:3000/api/users/GAB...XYZ
```

### 3. Update Profile
```bash
curl -X PUT http://localhost:3000/api/users/GAB...XYZ \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Jane Doe",
    "signature": "base64-signature"
  }'
```

### 4. Upload Profile Image
```bash
curl -X POST http://localhost:3000/api/users/GAB...XYZ/profile-image \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://storage.example.com/image.jpg",
    "mimeType": "image/jpeg",
    "fileSize": 102400,
    "signature": "base64-signature"
  }'
```

### 5. Get Preferences
```bash
curl -X GET http://localhost:3000/api/users/GAB...XYZ/preferences
```

### 6. Update Preferences
```bash
curl -X PUT http://localhost:3000/api/users/GAB...XYZ/preferences \
  -H "Content-Type: application/json" \
  -d '{
    "timezone": "America/New_York",
    "emailNotifications": true,
    "signature": "base64-signature"
  }'
```

### 7. Verify Email
```bash
curl -X POST http://localhost:3000/api/users/GAB...XYZ/verify-email \
  -H "Content-Type: application/json" \
  -d '{"token": "verification-token"}'
```

### 8. Request Account Deletion
```bash
curl -X POST http://localhost:3000/api/users/GAB...XYZ/request-deletion \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "No longer using",
    "signature": "base64-signature"
  }'
```

### 9. Confirm Deletion (30-day grace)
```bash
curl -X POST http://localhost:3000/api/users/GAB...XYZ/confirm-deletion \
  -H "Content-Type: application/json" \
  -d '{
    "token": "confirmation-token",
    "signature": "base64-signature"
  }'
```

### 10. Cancel Deletion
```bash
curl -X POST http://localhost:3000/api/users/GAB...XYZ/cancel-deletion \
  -H "Content-Type: application/json" \
  -d '{"signature": "base64-signature"}'
```

## Database Migration

Before starting the server with this branch:

```bash
# Run migrations to create tables
npm run migrate

# This will create:
# - users table
# - user_preferences table
# - user_profile_images table
# - account_deletion_requests table
```

## Key Design Decisions

1. **Stellar Public Key as User ID**
   - Aligns with existing ArtisanHub architecture
   - Uses Stellar keypair for signature verification
   - No additional authentication system needed

2. **Signature Verification**
   - All state-changing operations require signatures
   - Payload format: `OPERATION:userId:field:value`
   - Uses Stellar SDK keypair verification

3. **Email Verification with Tokens**
   - 24-hour token expiry
   - Tokens stored in database for revocation control
   - Resend capability for expired tokens

4. **30-Day Grace Period for Deletion**
   - User can cancel anytime during grace period
   - Recovery capability before permanent deletion
   - Confirmation token prevents accidental deletion

5. **Soft Deletes**
   - Accounts marked as `deleted_at` timestamp
   - Data preserved for audit/recovery
   - Queries filter out soft-deleted accounts

6. **Image Versioning**
   - Only one profile image marked as current
   - Full history preserved in database
   - Automatic cleanup of old images possible

## Security Features

✅ **Cryptographic Signature Verification** - Prevents unauthorized operations
✅ **Rate Limiting** - Protects against brute force and abuse
✅ **Input Sanitization** - Removes control characters from text
✅ **Email Validation** - Format and uniqueness checks
✅ **Token Expiry** - Verification tokens expire after 24 hours
✅ **Confirmation Tokens** - Deletion requires separate confirmation
✅ **Soft Deletes** - Data not permanently removed immediately
✅ **Database Indexes** - Performance optimized queries

## API Response Format

All successful responses return data in this format:
```json
{
  "user": {...},
  "message": "Optional message"
}
```

All error responses return:
```json
{
  "error": "Error description"
}
```

## HTTP Status Codes Used

| Code | Meaning |
|------|---------|
| 200 | Success (GET, PUT) |
| 201 | Created (POST: user, image) |
| 202 | Accepted (deletion request) |
| 400 | Bad request, validation error |
| 401 | Unauthorized, invalid signature |
| 404 | Not found |
| 409 | Conflict (exists, in use) |
| 410 | Gone (token expired) |

## Backwards Compatibility

✅ **No Breaking Changes**
- Existing job routes unchanged
- New routes in separate `/api/users` namespace
- Can deploy alongside existing system

## Documentation References

1. **API Documentation:** See `USER_MANAGEMENT.md` for complete API reference
2. **Implementation Details:** See `IMPLEMENTATION_SUMMARY.md` for technical overview
3. **Code:** See source files in `src/services/users.ts` and `src/routes/users.ts`

## Next Steps for Integration

1. **Email Service Integration**
   - Send verification emails on registration
   - Send deletion confirmation emails
   - Send grace period warning emails

2. **Frontend Implementation**
   - Build user registration form
   - Implement email verification UI
   - Build profile management interface
   - Add image upload functionality
   - Implement preference settings

3. **Testing**
   - Unit tests for service layer
   - Integration tests with database
   - E2E tests for complete workflows
   - Load testing for rate limiter

4. **Deployment**
   - Run migrations before server start
   - Configure email service credentials
   - Set up file storage for images
   - Monitor rate limiter metrics

## Support & Questions

- Full endpoint documentation: `USER_MANAGEMENT.md`
- Implementation details: `IMPLEMENTATION_SUMMARY.md`
- Service logic: `backend/src/services/users.ts`
- Route handlers: `backend/src/routes/users.ts`

## Commit Information

```
Commit: ef5c3ae
Message: feat: add comprehensive user management system
Branch: feat/user-management
Date: August 11, 2026
Files: 7 changed, ~2000+ insertions
```

All files have been committed and are ready for code review or merging.
