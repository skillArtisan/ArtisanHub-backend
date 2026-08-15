import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  soroban: {
    network: process.env.SOROBAN_NETWORK ?? "testnet",
    rpcUrl: process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
    horizonUrl: process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
    contractId: process.env.JOB_ESCROW_CONTRACT_ID ?? "",
    mediatorPublicKey: process.env.MEDIATOR_PUBLIC_KEY ?? "",
    serverPrivateKey: process.env.SERVER_PRIVATE_KEY ?? ""
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? "your-refresh-secret-key-change-in-production",
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY ?? "15m",
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY ?? "7d",
  },
  email: {
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    from: process.env.EMAIL_FROM ?? "noreply@artisanhub.com",
  },
  security: {
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
    maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS ?? 5),
    loginAttemptWindow: Number(process.env.LOGIN_ATTEMPT_WINDOW ?? 900000), // 15 minutes
    passwordResetExpiry: Number(process.env.PASSWORD_RESET_EXPIRY ?? 3600000), // 1 hour
    sessionMaxAge: Number(process.env.SESSION_MAX_AGE ?? 604800000), // 7 days
  }
};
