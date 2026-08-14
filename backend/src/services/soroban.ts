import {
  Keypair,
  Networks,
  TransactionBuilder,
  Contract,
  rpc,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { config } from "../config.js";
import type { JobRecord, ResolveFavour } from "../types.js";

// ─── ScVal helpers ────────────────────────────────────────────────────────────

function strVal(str: string) {
  return nativeToScVal(str, { type: "string" });
}

function addressVal(address: string) {
  return nativeToScVal(address, { type: "address" });
}

function i128Val(amount: string | number) {
  return nativeToScVal(amount, { type: "i128" });
}

// ─── Contract result type ─────────────────────────────────────────────────────

export type ContractResult = {
  network: string;
  contractId: string;
  method: string;
  hash?: string;
  status: string;
};

// ─── Polling config ───────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 15; // 30 seconds max wait

// ─── RPC server (lazy — only used when config is present) ─────────────────────

let _server: rpc.Server | null = null;

function getServer(): rpc.Server {
  if (!_server) {
    _server = new rpc.Server(config.soroban.rpcUrl);
  }
  return _server;
}

// ─── Core invocation ──────────────────────────────────────────────────────────

/**
 * Invoke a Soroban contract method.
 *
 * Returns early with status "SKIPPED_NO_CONFIG" when the required env vars
 * (SERVER_PRIVATE_KEY and JOB_ESCROW_CONTRACT_ID) are absent so the rest of
 * the backend can operate without a live contract during development.
 *
 * Throws a descriptive Error on any network or contract-level failure so
 * callers can roll back DB state and return a meaningful HTTP response.
 */
async function invokeContract(
  method: string,
  args: ReturnType<typeof nativeToScVal>[],
): Promise<ContractResult> {
  if (!config.soroban.serverPrivateKey || !config.soroban.contractId) {
    console.warn(
      `[Soroban] SKIPPED ${method} — SERVER_PRIVATE_KEY or JOB_ESCROW_CONTRACT_ID not configured`,
    );
    return {
      network: config.soroban.network,
      contractId: config.soroban.contractId || "not-configured",
      method,
      status: "SKIPPED_NO_CONFIG",
    };
  }

  const server = getServer();
  const keypair = Keypair.fromSecret(config.soroban.serverPrivateKey);

  let account;
  try {
    account = await server.getAccount(keypair.publicKey());
  } catch (err) {
    throw new Error(
      `[Soroban] Failed to fetch account ${keypair.publicKey()}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const networkPassphrase =
    config.soroban.network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

  const contract = new Contract(config.soroban.contractId);
  const operation = contract.call(method, ...args);

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  // Simulate + add resource fee
  let preparedTx;
  try {
    preparedTx = await server.prepareTransaction(tx);
  } catch (err) {
    throw new Error(
      `[Soroban] Transaction simulation failed for ${method}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  preparedTx.sign(keypair);

  const sendResponse = await server.sendTransaction(preparedTx);

  if (sendResponse.status === "ERROR") {
    throw new Error(
      `[Soroban] Transaction submission failed for ${method}: ${JSON.stringify(sendResponse.errorResult ?? sendResponse)}`,
    );
  }

  // ── Poll for confirmation ────────────────────────────────────────────────
  const txHash = sendResponse.hash;
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    const txStatus = await server.getTransaction(txHash);

    if (txStatus.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      console.log(
        `[Soroban] ${method} confirmed — txHash=${txHash}`,
      );
      return {
        network: config.soroban.network,
        contractId: config.soroban.contractId,
        method,
        hash: txHash,
        status: "SUCCESS",
      };
    }

    if (txStatus.status === rpc.Api.GetTransactionStatus.FAILED) {
      // Extract a human-readable error from resultMetaXdr when present
      const detail =
        "resultMetaXdr" in txStatus
          ? ` (resultMetaXdr available)`
          : "";
      throw new Error(
        `Contract execution failed: ${method}${detail}`,
      );
    }

    // NOT_FOUND — transaction still pending, wait and retry
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `[Soroban] Timed out waiting for ${method} confirmation after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`,
  );
}

// ─── Public service ───────────────────────────────────────────────────────────

export const sorobanService = {
  /**
   * Register a new job escrow on-chain.
   * Called after the DB record is created; caller deletes the DB record on failure.
   */
  async createJob(job: JobRecord): Promise<ContractResult> {
    return invokeContract("create_job", [
      strVal(job.jobId),
      addressVal(job.customer),
      addressVal(job.artisan),
      i128Val(job.amount),
      strVal(job.jobHash),
      strVal(job.trade),
    ]);
  },

  /**
   * Record artisan acceptance on-chain.
   * Caller reverts job state to "Open" on failure.
   */
  async acceptJob(jobId: string, artisan: string): Promise<ContractResult> {
    return invokeContract("accept_job", [
      strVal(jobId),
      addressVal(artisan),
    ]);
  },

  /**
   * Mark the job as completed and release escrow to the artisan on-chain.
   * Caller reverts job state and reputation on failure.
   */
  async confirmDone(jobId: string, customer: string): Promise<ContractResult> {
    return invokeContract("confirm_done", [
      strVal(jobId),
      addressVal(customer),
    ]);
  },

  /**
   * Record a dispute on-chain.
   * Caller clears the dispute timestamp on failure.
   */
  async raiseDispute(jobId: string, customer: string): Promise<ContractResult> {
    return invokeContract("raise_dispute", [
      strVal(jobId),
      addressVal(customer),
    ]);
  },

  /**
   * Resolve a dispute on-chain via the designated mediator.
   * Caller reverts job state and reputation on failure.
   */
  async resolveDispute(
    jobId: string,
    mediator: string,
    favour: ResolveFavour,
  ): Promise<ContractResult> {
    return invokeContract("resolve_dispute", [
      strVal(jobId),
      addressVal(mediator),
      strVal(favour),
    ]);
  },
};
