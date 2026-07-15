import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { createRateLimiter } from "./middleware/rateLimiter.js";

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

try {
  await app.listen({
    port: config.port,
    host: config.host,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
