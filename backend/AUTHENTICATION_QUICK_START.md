# Authentication System - Quick Start Guide

Get the authentication system running in 5 minutes.

## Step 1: Install Dependencies

```bash
cd backend
npm install jsonwebtoken bcryptjs nodemailer device-detector-js
npm install -D @types/jsonwebtoken @types/bcryptjs @types/nodemailer
```

## Step 2: Configure Environment

Add to your `.env` file:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@artisanhub.com

# Security Settings (defaults shown)
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOGIN_ATTEMPT_WINDOW=900000
PASSWORD_RESET_EXPIRY=3600000
SESSION_MAX_AGE=604800000
```

**Generate secure secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Step 3: Run Migration

```bash
npx knex migrate:latest
```

## Step 4: Start Server

```bash
npm run dev
```

## Step 5: Test Authentication

### Register a User
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecureP@ss123",
    "fullName": "Test User"
  }'
```

### Login
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecureP@ss123"
  }'
```

Response contains:
```json
{
  "success": true,
  "user": {
    "id": "...",
    "email": "test@example.com",
    "emailVerified": false
  },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "session": {
    "id": "...",
    "deviceId": "...",
    "expiresAt": "..."
  }
}
```

### Use Protected Endpoint
```bash
curl -X GET http://localhost:4000/api/users/USER_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Common Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout current device
- `POST /api/auth/logout-all` - Logout all devices

### Password Management
- `POST /api/auth/password-reset/request` - Request password reset
- `POST /api/auth/password-reset/confirm` - Reset password
- `POST /api/auth/change-password` - Change password (requires auth)

### Session Management
- `GET /api/auth/sessions` - List active sessions (requires auth)
- `DELETE /api/auth/sessions/:sessionId` - Terminate session (requires auth)
- `POST /api/auth/sessions/terminate-others` - Logout other devices (requires auth)
- `GET /api/auth/login-history` - View login history (requires auth)

## Email Setup (Gmail)

1. Enable 2-factor authentication on your Google account
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use app password in `SMTP_PASSWORD`

## Troubleshooting

### Email not sending?
```bash
# Test connection
node -e "
const nodemailer = require('nodemailer');
const transport = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  auth: { user: 'your-email@gmail.com', pass: 'your-app-password' }
});
transport.verify().then(() => console.log('OK')).catch(console.error);
"
```

### Token not working?
- Check JWT_SECRET is set
- Verify token hasn't expired
- Check if token is blacklisted (after logout)

### Rate limited?
- Wait for the rate limit window to expire
- Check `Retry-After` header in response

## Production Checklist

Before deploying to production:

- [ ] Generate strong JWT secrets (64+ characters)
- [ ] Configure production email service (SendGrid/Mailgun/SES)
- [ ] Set appropriate CORS_ORIGIN
- [ ] Review rate limit settings
- [ ] Setup periodic cleanup jobs
- [ ] Configure HTTPS
- [ ] Setup monitoring/logging
- [ ] Test all authentication flows
- [ ] Backup database

## Next Steps

1. Read full documentation: `AUTHENTICATION_SETUP.md`
2. Review implementation: `AUTHENTICATION_IMPLEMENTATION_SUMMARY.md`
3. Integrate with frontend
4. Setup monitoring and alerts

## Support

For detailed information, see:
- `AUTHENTICATION_SETUP.md` - Complete setup guide
- `AUTHENTICATION_IMPLEMENTATION_SUMMARY.md` - Technical details

---

**Quick Start Version:** 1.0  
**Last Updated:** August 15, 2026
