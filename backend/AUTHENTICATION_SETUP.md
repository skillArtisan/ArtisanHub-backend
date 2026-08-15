# Authentication System Setup Guide

This guide covers the setup and usage of the comprehensive authentication system implemented for ArtisanHub backend.

## Features Implemented

✅ **JWT Authentication**
- Access tokens (short-lived, 15 minutes)
- Refresh tokens (long-lived, 7 days)
- Token rotation on refresh
- Token blacklisting for immediate revocation

✅ **Email Integration**
- Email verification on registration
- Password reset via email
- Password change notifications
- New device login alerts

✅ **Password Security**
- Bcrypt hashing with configurable rounds
- Password strength validation
- Secure password reset flow
- Force logout on password change

✅ **Rate Limiting**
- Login attempts: 5 per 15 minutes
- Registration: 3 per hour
- Password reset requests: 3 per hour
- Email verification: 5 per hour
- Refresh token: 10 per minute

✅ **Multi-Device Session Management**
- Device fingerprinting
- Active session tracking
- Session termination (individual or all)
- Login history tracking

✅ **Security Features**
- Email enumeration protection
- Login attempt monitoring
- Device verification on token refresh
- Automatic session cleanup

## Required Dependencies

Install the following dependencies:

```bash
# Runtime dependencies
npm install jsonwebtoken bcryptjs nodemailer device-detector-js

# Development dependencies (TypeScript types)
npm install -D @types/jsonwebtoken @types/bcryptjs @types/nodemailer
```

## Database Migration

Run the authentication migration to create required tables:

```bash
npx knex migrate:latest
```

This creates the following tables:
- `refresh_tokens` - JWT refresh token storage
- `password_reset_tokens` - Password reset token management
- `user_sessions` - Multi-device session tracking
- `login_attempts` - Security monitoring
- `blacklisted_tokens` - Immediate token revocation

Also adds to `users` table:
- `password_hash` - Bcrypt hashed passwords
- `last_login_at` - Last login timestamp
- `last_login_ip` - Last login IP address

## Environment Configuration

Update your `.env` file with the following variables (see `.env.example`):

### JWT Configuration
```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
```

**Important:** Use strong, unique secrets in production. Generate them with:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Email Configuration (SMTP)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@artisanhub.com
```

**Gmail Setup:**
1. Enable 2-factor authentication on your Google account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the app password in `SMTP_PASSWORD`

**Other Email Providers:**
- **SendGrid**: SMTP_HOST=smtp.sendgrid.net, SMTP_PORT=587
- **Mailgun**: SMTP_HOST=smtp.mailgun.org, SMTP_PORT=587
- **AWS SES**: SMTP_HOST=email-smtp.us-east-1.amazonaws.com, SMTP_PORT=587

### Security Settings
```env
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOGIN_ATTEMPT_WINDOW=900000
PASSWORD_RESET_EXPIRY=3600000
SESSION_MAX_AGE=604800000
```

## API Endpoints

### Authentication

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecureP@ss123",
  "fullName": "John Doe"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecureP@ss123"
}

Response:
{
  "success": true,
  "user": { "id": "...", "email": "...", "emailVerified": false },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "session": { "id": "...", "deviceId": "...", "expiresAt": "..." }
}
```

#### Refresh Token
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJ..."
}

Response:
{
  "success": true,
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "refreshToken": "eyJ..."
}
```

#### Logout All Devices
```http
POST /api/auth/logout-all
Authorization: Bearer <accessToken>
```

#### Change Password
```http
POST /api/auth/change-password
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "currentPassword": "OldP@ss123",
  "newPassword": "NewP@ss456"
}
```

### Password Reset

#### Request Password Reset
```http
POST /api/auth/password-reset/request
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Verify Reset Token
```http
POST /api/auth/password-reset/verify
Content-Type: application/json

{
  "userId": "user_id",
  "token": "reset_token"
}
```

#### Confirm Password Reset
```http
POST /api/auth/password-reset/confirm
Content-Type: application/json

{
  "userId": "user_id",
  "token": "reset_token",
  "newPassword": "NewP@ss123"
}
```

### Session Management

#### Get Active Sessions
```http
GET /api/auth/sessions
Authorization: Bearer <accessToken>

Response:
{
  "success": true,
  "sessions": [
    {
      "id": "...",
      "deviceId": "...",
      "deviceName": "Chrome on Windows",
      "browser": "Chrome 120",
      "os": "Windows 10",
      "ipAddress": "192.168.1.1",
      "lastActiveAt": "2026-08-15T10:00:00Z",
      "isCurrent": true
    }
  ]
}
```

#### Terminate Specific Session
```http
DELETE /api/auth/sessions/:sessionId
Authorization: Bearer <accessToken>
```

#### Terminate All Other Sessions
```http
POST /api/auth/sessions/terminate-others
Authorization: Bearer <accessToken>
```

#### Get Login History
```http
GET /api/auth/login-history
Authorization: Bearer <accessToken>

Response:
{
  "success": true,
  "history": [
    {
      "attemptedAt": "2026-08-15T10:00:00Z",
      "ipAddress": "192.168.1.1",
      "successful": true,
      "failureReason": null,
      "userAgent": "Mozilla/5.0..."
    }
  ]
}
```

## Password Requirements

Passwords must meet the following criteria:
- Minimum 8 characters
- Maximum 128 characters
- At least one lowercase letter
- At least one uppercase letter
- At least one number
- At least one special character
- Not in common password list

## Security Best Practices

### Token Storage (Frontend)
- Store access tokens in memory (React state/context)
- Store refresh tokens in httpOnly cookies (recommended) or secure localStorage
- Never store tokens in regular cookies or sessionStorage

### Token Usage
- Include access token in Authorization header: `Bearer <token>`
- Refresh token automatically when access token expires
- Clear all tokens on logout

### Rate Limiting
- Rate limits are per IP address
- Respect `Retry-After` header when rate limited
- Implement exponential backoff for failed requests

### Error Handling
- `401 Unauthorized`: Token expired or invalid - refresh or re-login
- `403 Forbidden`: Insufficient permissions or email not verified
- `429 Too Many Requests`: Rate limit exceeded - wait before retry

## Maintenance Tasks

### Cleanup Expired Data

Add periodic cleanup tasks (e.g., via cron job):

```typescript
import { cleanupExpiredSessions } from './services/session.js';
import { cleanupPasswordResetTokens } from './services/passwordReset.js';
import { cleanupExpiredBlacklistedTokens } from './utils/jwt.js';

// Run daily
async function cleanupTask() {
  const sessions = await cleanupExpiredSessions();
  const resetTokens = await cleanupPasswordResetTokens();
  const blacklistedTokens = await cleanupExpiredBlacklistedTokens();
  
  console.log(`Cleaned up: ${sessions.sessions} sessions, ${sessions.tokens} tokens, ${resetTokens} reset tokens, ${blacklistedTokens} blacklisted tokens`);
}
```

## Testing

### Test Email Sending
```typescript
import { testEmailConnection, sendVerificationEmail } from './services/email.js';

const connected = await testEmailConnection();
console.log('Email connection:', connected ? 'OK' : 'Failed');
```

### Test Password Hashing
```typescript
import { hashPassword, verifyPassword } from './utils/password.js';

const hash = await hashPassword('TestPassword123!');
const valid = await verifyPassword('TestPassword123!', hash);
console.log('Password verification:', valid);
```

## Migration from Stellar-Only Auth

The system supports both JWT and Stellar signature authentication:

1. **Dual Authentication**: Users can authenticate with either JWT or Stellar signatures
2. **Signature Optional**: Stellar signatures are now optional on protected endpoints
3. **Gradual Migration**: Existing users with Stellar auth can continue using it
4. **New Users**: New registrations can use email/password or Stellar

## Troubleshooting

### Email Not Sending
- Check SMTP credentials
- Verify firewall allows outbound SMTP
- Use `testEmailConnection()` to diagnose
- Check spam folder

### Tokens Not Working
- Verify JWT secrets are set
- Check token expiry times
- Ensure system clocks are synchronized
- Check if token is blacklisted

### Rate Limiting Issues
- Check IP address detection
- Verify rate limit configuration
- Clear rate limit store if needed: `clearRateLimitStore()`

### Database Errors
- Ensure migration ran successfully
- Check database connection
- Verify table permissions

## Additional Resources

- JWT.io - Decode and verify JWT tokens: https://jwt.io
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- Nodemailer Documentation: https://nodemailer.com

## Support

For issues or questions:
1. Check this documentation
2. Review error logs
3. Test with provided examples
4. Contact backend team
