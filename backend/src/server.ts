import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { validateStellarPublicKey, validateContractId } from "./utils/validation.js";

// Validate critical configuration at startup
function validateStartupConfig() {
  const errors: string[] = [];

  // Validate mediator public key if set
  if (config.soroban.mediatorPublicKey) {
    try {
      validateStellarPublicKey(config.soroban.mediatorPublicKey, "MEDIATOR_PUBLIC_KEY");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Invalid MEDIATOR_PUBLIC_KEY");
    }
  } else {
    console.warn("⚠️  MEDIATOR_PUBLIC_KEY not set - dispute resolution will not work");
  }

  // Validate contract ID if set
  if (config.soroban.contractId) {
    try {
      validateContractId(config.soroban.contractId, "JOB_ESCROW_CONTRACT_ID");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Invalid JOB_ESCROW_CONTRACT_ID");
    }
  } else {
    console.warn("⚠️  JOB_ESCROW_CONTRACT_ID not set - contract operations will fail");
  }

  // Validate server private key if set
  if (config.soroban.serverPrivateKey) {
    if (!/^S[A-Z0-9]{55}$/.test(config.soroban.serverPrivateKey)) {
      errors.push("SERVER_PRIVATE_KEY must be a valid Stellar secret key (56 characters starting with S)");
    }
  }

  // Validate network URLs
  if (!config.soroban.rpcUrl.startsWith("http")) {
    errors.push("SOROBAN_RPC_URL must be a valid HTTP(S) URL");
  }
  if (!config.soroban.horizonUrl.startsWith("http")) {
    errors.push("STELLAR_HORIZON_URL must be a valid HTTP(S) URL");
  }

  if (errors.length > 0) {
    console.error("❌ Configuration validation failed:");
    errors.forEach(err => console.error(`   - ${err}`));
    throw new Error("Invalid server configuration. Please check your environment variables.");
  }

  console.log("✅ Configuration validation passed");
}

export async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: config.corsOrigin,
  });

  // Global middleware
  app.addHook("onRequest", securityHeaders);
  app.addHook("onRequest", requestLogger());

  app.get("/health", async () => {
    return {
      ok: true,
      service: "ArtisanHub-backend",
      network: config.soroban.network,
    };
  });

  await registerJobRoutes(app);

  return app;
}

const app = await buildServer();

// Validate configuration before starting server
validateStartupConfig();

try {
  await app.listen({
    port: config.port,
    host: config.host,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
