# User Management API Documentation

This document describes the user management features added to ArtisanHub backend, including user profiles, account management, and user preferences.

## Table of Contents

1. [Overview](#overview)
2. [Authentication & Security](#authentication--security)
3. [Endpoints](#endpoints)
4. [Data Models](#data-models)
5. [Error Handling](#error-handling)
6. [Examples](#examples)

## Overview

The user management module provides functionality for:

- **User Registration & Profiles**: Create user accounts and manage profile information
- **Profile Images**: Upload and manage user profile pictures
- **User Preferences**: Customize notification settings, language, timezone, and more
- **Email Verification**: Verify user email addresses with token-based confirmation
- **Account Deletion**: Securely delete user accounts with a grace period for recovery

All endpoints use **Stellar-based signature verification** for authentication, consistent with the existing ArtisanHub architecture.

## Authentication & Security

### Signature Verification

All state-changing operations (POST, PUT) require:
1. A valid Stellar public key as `userId`
2. A cryptographic signature from the private key holder
3. The signature must verify against a specific payload format

**Signature Payload Format:**
```
OPERATION:userId[:field1:value1[:field2:value2...]]
```

**Example for profile update:**
```
UPDATE_PROFILE:GAB...XYZ:John Doe:john@example.com
```

### Rate Limiting

- **General user operations**: 10 requests/minute
- **Account deletion**: 3 requests/hour (stricter for sensitive operations)

### Data Validation

- Email must be valid format: `user@example.com`
- Profile images: max 5MB, allowed formats (JPEG, PNG, WebP)
- Text fields: sanitized to remove control characters, max 1000 chars
- Stellar public keys: must match pattern `G[A-Za-z0-9]{55}`

## Endpoints

### User Profile Management

#### Create User
**POST** `/api/users`

Create a new user account.

**Request Body:**
```json
{
  "userId": "GAB...XYZ",
  "email": "user@example.com",
  "fullName": "John Doe",
  "signature": "base64-encoded-signature"
}
```

**Response (201):**
```json
{
  "user": {
    "id": "GAB...XYZ",
    "email": "user@example.com",
    "fullName": "John Doe",
    "profileImageUrl": null,
    "preferences": {},
    "emailVerified": false,
    "isActive": true,
    "createdAt": "2026-08-11T10:00:00.000Z",
    "updatedAt": "2026-08-11T10:00:00.000Z"
  },
  "message": "User created successfully. Please verify your email."
}
```

**Error Responses:**
- `400`: Invalid email format or validation error
- `409`: User already exists

---

#### Get User Profile
**GET** `/api/users/{userId}`

Retrieve user profile information (public endpoint).

**Response (200):**
```json
{
  "user": {
    "id": "GAB...XYZ",
    "email": "user@example.com",
    "fullName": "John Doe",
    "profileImageUrl": "https://storage.example.com/images/user-1.jpg",
    "preferences": {},
    "emailVerified": true,
    "isActive": true,
    "createdAt": "2026-08-11T10:00:00.000Z",
    "updatedAt": "2026-08-12T15:30:00.000Z"
  }
}
```

**Error Responses:**
- `404`: User not found

---

#### Update User Profile
**PUT** `/api/users/{userId}`

Update user profile information. Requires signature verification.

**Request Body:**
```json
{
  "fullName": "Jane Doe",
  "email": "newemail@example.com",
  "signature": "base64-encoded-signature"
}
```

**Response (200):**
```json
{
  "user": {
    "id": "GAB...XYZ",
    "email": "newemail@example.com",
    "fullName": "Jane Doe",
    "profileImageUrl": "https://storage.example.com/images/user-1.jpg",
    "preferences": {},
    "emailVerified": false,
    "isActive": true,
    "createdAt": "2026-08-11T10:00:00.000Z",
    "updatedAt": "2026-08-12T16:00:00.000Z"
  }
}
```

**Error Responses:**
- `400`: Validation error or invalid email format
- `401`: Invalid signature
- `404`: User not found
- `409`: Email already in use

---

### Profile Image Management

#### Upload Profile Image
**POST** `/api/users/{userId}/profile-image`

Upload a profile picture. Previous images are automatically marked as inactive.

**Request Body:**
```json
{
  "imageUrl": "https://storage.example.com/uploads/user-profile-123.jpg",
  "mimeType": "image/jpeg",
  "fileSize": 102400,
  "signature": "base64-encoded-signature"
}
```

**Response (201):**
```json
{
  "profileImage": {
    "id": "img-uuid-1234",
    "userId": "GAB...XYZ",
    "imageUrl": "https://storage.example.com/uploads/user-profile-123.jpg",
    "mimeType": "image/jpeg",
    "fileSize": 102400,
    "isCurrent": true,
    "createdAt": "2026-08-12T10:30:00.000Z"
  },
  "message": "Profile image uploaded successfully"
}
```

**Error Responses:**
- `400`: File size exceeds 5MB or invalid MIME type
- `401`: Invalid signature
- `404`: User not found

**Supported MIME Types:**
- `image/jpeg`
- `image/png`
- `image/webp`

---

#### Get Profile Image
**GET** `/api/users/{userId}/profile-image`

Retrieve the current profile image information.

**Response (200):**
```json
{
  "profileImage": {
    "id": "img-uuid-1234",
    "userId": "GAB...XYZ",
    "imageUrl": "https://storage.example.com/uploads/user-profile-123.jpg",
    "mimeType": "image/jpeg",
    "fileSize": 102400,
    "isCurrent": true,
    "createdAt": "2026-08-12T10:30:00.000Z"
  }
}
```

**Error Responses:**
- `404`: No profile image found

---

### User Preferences

#### Get User Preferences
**GET** `/api/users/{userId}/preferences`

Retrieve user preference settings.

**Response (200):**
```json
{
  "preferences": {
    "notificationsEnabled": true,
    "emailNotifications": true,
    "preferredLanguage": "en",
    "timezone": "America/New_York",
    "receivePromotionalEmails": false,
    "notificationSettings": {
      "jobAlerts": true,
      "paymentNotifications": true,
      "messageDigest": "daily"
    }
  }
}
```

---

#### Update User Preferences
**PUT** `/api/users/{userId}/preferences`

Update user preference settings. Requires signature verification.

**Request Body:**
```json
{
  "notificationsEnabled": true,
  "emailNotifications": false,
  "preferredLanguage": "es",
  "timezone": "Europe/Madrid",
  "receivePromotionalEmails": false,
  "notificationSettings": {
    "jobAlerts": true,
    "paymentNotifications": true,
    "messageDigest": "weekly"
  },
  "signature": "base64-encoded-signature"
}
```

**Response (200):**
```json
{
  "preferences": {
    "notificationsEnabled": true,
    "emailNotifications": false,
    "preferredLanguage": "es",
    "timezone": "Europe/Madrid",
    "receivePromotionalEmails": false,
    "notificationSettings": {
      "jobAlerts": true,
      "paymentNotifications": true,
      "messageDigest": "weekly"
    }
  }
}
```

**Error Responses:**
- `400`: Validation error
- `401`: Invalid signature
- `404`: Preferences not found

---

### Email Verification

#### Verify Email
**POST** `/api/users/{userId}/verify-email`

Verify user email address using a verification token.

**Request Body:**
```json
{
  "token": "hex-encoded-token-string"
}
```

**Response (200):**
```json
{
  "message": "Email verified successfully"
}
```

**Error Responses:**
- `400`: Invalid or wrong verification token
- `404`: User not found
- `410`: Verification token has expired (24-hour expiry)

---

#### Resend Verification Email
**POST** `/api/users/{userId}/resend-verification`

Request a new verification email if the previous token expired.

**Response (200):**
```json
{
  "message": "Verification email resent",
  "verificationToken": "new-hex-encoded-token"
}
```

**Error Responses:**
- `400`: Email already verified
- `404`: User not found

---

### Account Deletion

#### Request Account Deletion
**POST** `/api/users/{userId}/request-deletion`

Initiate account deletion. A grace period is provided before final deletion.

**Request Body:**
```json
{
  "reason": "No longer using the service",
  "signature": "base64-encoded-signature"
}
```

**Response (202):**
```json
{
  "deletionRequest": {
    "id": "del-uuid-1234",
    "userId": "GAB...XYZ",
    "status": "pending",
    "confirmationToken": "hex-token-string",
    "requestedAt": "2026-08-12T10:00:00.000Z",
    "confirmedAt": null,
    "completionAt": null,
    "expiresAt": "2026-09-11T10:00:00.000Z",
    "reason": "No longer using the service"
  },
  "message": "Account deletion requested. You have 09/11/2026 to confirm deletion."
}
```

**Error Responses:**
- `401`: Invalid signature
- `404`: User not found
- `409`: Account deletion already requested

**Grace Period:** 30 days to confirm deletion. Account can be recovered during this period.

---

#### Confirm Account Deletion
**POST** `/api/users/{userId}/confirm-deletion`

Confirm and finalize account deletion. Account will be marked as deleted immediately.

**Request Body:**
```json
{
  "token": "confirmation-token-from-deletion-request",
  "signature": "base64-encoded-signature"
}
```

**Response (200):**
```json
{
  "message": "Account deletion confirmed and initiated",
  "deletionRequest": {
    "id": "del-uuid-1234",
    "userId": "GAB...XYZ",
    "status": "completed",
    "confirmationToken": "hex-token-string",
    "requestedAt": "2026-08-12T10:00:00.000Z",
    "confirmedAt": "2026-08-12T11:00:00.000Z",
    "completionAt": "2026-08-12T11:00:00.000Z",
    "expiresAt": "2026-09-11T10:00:00.000Z",
    "reason": "No longer using the service"
  }
}
```

**Error Responses:**
- `400`: Invalid confirmation token
- `401`: Invalid signature
- `404`: No pending deletion request found
- `410`: Deletion request has expired

---

#### Cancel Account Deletion
**POST** `/api/users/{userId}/cancel-deletion`

Cancel a pending account deletion request and keep the account active.

**Request Body:**
```json
{
  "signature": "base64-encoded-signature"
}
```

**Response (200):**
```json
{
  "message": "Account deletion cancelled"
}
```

**Error Responses:**
- `401`: Invalid signature
- `404`: No pending deletion request found

---

## Data Models

### User Profile
```typescript
type UserProfile = {
  id: string;                    // Stellar public key (G...)
  email: string;                 // Email address
  fullName: string | null;       // User's full name
  profileImageUrl: string | null; // URL to current profile image
  preferences: Record<string, unknown>; // Additional preferences
  emailVerified: boolean;        // Email verification status
  isActive: boolean;             // Account active status
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // ISO 8601 timestamp
}
```

### User Preferences
```typescript
type UserPreferences = {
  notificationsEnabled: boolean;      // Global notifications on/off
  emailNotifications: boolean;         // Email notifications on/off
  preferredLanguage: string;           // ISO 639-1 language code (e.g., "en", "es")
  timezone: string;                    // IANA timezone (e.g., "America/New_York")
  receivePromotionalEmails: boolean;   // Marketing emails
  notificationSettings: Record<string, unknown>; // Custom notification rules
}
```

### Profile Image
```typescript
type ProfileImage = {
  id: string;                    // Unique image ID
  userId: string;                // Owner's Stellar public key
  imageUrl: string;              // URL to the image file
  mimeType: string;              // MIME type (image/jpeg, image/png, image/webp)
  fileSize: number;              // File size in bytes
  isCurrent: boolean;            // Is this the active profile image?
  createdAt: string;             // ISO 8601 timestamp
}
```

### Account Deletion Request
```typescript
type AccountDeletionRequest = {
  id: string;                    // Unique request ID
  userId: string;                // User's Stellar public key
  status: "pending" | "confirmed" | "completed" | "cancelled"; // Deletion status
  confirmationToken: string;     // Token for confirming deletion
  requestedAt: string;           // When deletion was requested
  confirmedAt: string | null;    // When deletion was confirmed
  completionAt: string | null;   // When deletion was completed
  expiresAt: string;             // When grace period expires
  reason: string | null;         // Optional reason for deletion
}
```

## Error Handling

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Profile updated |
| 201 | Created | User created, image uploaded |
| 202 | Accepted | Deletion request accepted |
| 400 | Bad Request | Invalid email format, validation error |
| 401 | Unauthorized | Invalid signature |
| 404 | Not Found | User not found |
| 409 | Conflict | User already exists, email in use, deletion already pending |
| 410 | Gone | Verification token expired, deletion expired |

### Error Response Format

```json
{
  "error": "Error message describing what went wrong"
}
```

### Common Error Scenarios

**Invalid Signature:**
```
Status: 401
{
  "error": "Invalid signature"
}
```

**User Not Found:**
```
Status: 404
{
  "error": "User not found"
}
```

**Email Already Verified:**
```
Status: 400
{
  "error": "Email already verified"
}
```

---

## Examples

### Complete User Registration Flow

```bash
# 1. Create user account
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "GAB...XYZ",
    "email": "user@example.com",
    "fullName": "John Doe",
    "signature": "..."
  }'

# Response includes verification token
# 2. Verify email
curl -X POST http://localhost:3000/api/users/GAB...XYZ/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "token": "verification-token-from-email"
  }'

# 3. Upload profile image
curl -X POST http://localhost:3000/api/users/GAB...XYZ/profile-image \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://storage.example.com/image.jpg",
    "mimeType": "image/jpeg",
    "fileSize": 102400,
    "signature": "..."
  }'

# 4. Update preferences
curl -X PUT http://localhost:3000/api/users/GAB...XYZ/preferences \
  -H "Content-Type: application/json" \
  -d '{
    "timezone": "America/New_York",
    "emailNotifications": true,
    "signature": "..."
  }'
```

### Account Deletion with Recovery

```bash
# 1. Request deletion (30-day grace period)
curl -X POST http://localhost:3000/api/users/GAB...XYZ/request-deletion \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "No longer needed",
    "signature": "..."
  }'

# Response includes confirmation token and expiry date
# User has 30 days to confirm

# 2a. If user changes mind - cancel deletion
curl -X POST http://localhost:3000/api/users/GAB...XYZ/cancel-deletion \
  -H "Content-Type: application/json" \
  -d '{
    "signature": "..."
  }'

# 2b. If user confirms - complete deletion
curl -X POST http://localhost:3000/api/users/GAB...XYZ/confirm-deletion \
  -H "Content-Type: application/json" \
  -d '{
    "token": "confirmation-token",
    "signature": "..."
  }'
```

---

## Database Tables

### users
Stores user account information and authentication details.

```sql
CREATE TABLE users (
  id VARCHAR PRIMARY KEY,           -- Stellar public key
  email VARCHAR UNIQUE NOT NULL,
  full_name VARCHAR,
  profile_image_url VARCHAR,
  preferences JSONB,
  email_verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR UNIQUE,
  verification_token_expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
```

### user_preferences
Detailed user preference settings.

```sql
CREATE TABLE user_preferences (
  user_id VARCHAR PRIMARY KEY,
  notifications_enabled BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT TRUE,
  preferred_language VARCHAR DEFAULT 'en',
  timezone VARCHAR DEFAULT 'UTC',
  receive_promotional_emails BOOLEAN DEFAULT FALSE,
  notification_settings JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### user_profile_images
Profile image history and versioning.

```sql
CREATE TABLE user_profile_images (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  image_url VARCHAR NOT NULL,
  mime_type VARCHAR NOT NULL,
  file_size INTEGER NOT NULL,
  is_current BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
```

### account_deletion_requests
Account deletion workflow tracking.

```sql
CREATE TABLE account_deletion_requests (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL,
  confirmation_token VARCHAR UNIQUE NOT NULL,
  requested_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  completion_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  reason TEXT
);
```

---

## Integration Notes

- All endpoints use **Stellar signature-based authentication**
- User IDs are **Stellar public keys** (format: `G[A-Za-z0-9]{55}`)
- All timestamps are in **ISO 8601 format** (UTC)
- Email verification tokens expire after **24 hours**
- Account deletion requests have a **30-day grace period**
- Profile images are **versioned** with only one marked as current
- All string inputs are **sanitized** to remove control characters
