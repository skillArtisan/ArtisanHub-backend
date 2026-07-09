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
  }
};
