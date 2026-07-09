import { Keypair, Networks, TransactionBuilder, Contract, rpc, nativeToScVal } from "@stellar/stellar-sdk";
import { config } from "../config.js";
import type { JobRecord, ResolveFavour } from "../types.js";

// Helper to construct a basic String ScVal
function strVal(str: string) {
  return nativeToScVal(str, { type: "string" });
}

// Helper to construct an Address ScVal
function addressVal(address: string) {
  return nativeToScVal(address, { type: "address" });
}

// Helper to construct an i128 ScVal (used for amounts/balances in Soroban usually)
function i128Val(amount: string | number) {
  return nativeToScVal(amount, { type: "i128" });
}

const server = new rpc.Server(config.soroban.rpcUrl);

async function invokeContract(method: string, args: any[]) {
  if (!config.soroban.serverPrivateKey || !config.soroban.contractId) {
    console.warn("Soroban configuration incomplete. Skipping actual contract invocation.");
    return {
      network: config.soroban.network,
      contractId: config.soroban.contractId || "not-configured",
      method,
      status: "SKIPPED_NO_CONFIG"
    };
  }

  const keypair = Keypair.fromSecret(config.soroban.serverPrivateKey);
  const account = await server.getAccount(keypair.publicKey());
  
  const contract = new Contract(config.soroban.contractId);
  const operation = contract.call(method, ...args);
  
  const networkPassphrase = config.soroban.network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;
  
  let tx = new TransactionBuilder(account, { fee: "100", networkPassphrase })
    .addOperation(operation)
    .setTimeout(30)
    .build();
    
  // Prepare transaction (simulates, adds min fee and footprint)
  const preparedTx = await server.prepareTransaction(tx);
  
  preparedTx.sign(keypair);
  
  const sendResponse = await server.sendTransaction(preparedTx);
  if (sendResponse.status === "ERROR") {
    throw new Error(`Contract invocation send failed: ${JSON.stringify(sendResponse)}`);
  }
  
  // Poll for result
  let txStatus = await server.getTransaction(sendResponse.hash);
  while (txStatus.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    txStatus = await server.getTransaction(sendResponse.hash);
  }
  
  if (txStatus.status === rpc.Api.GetTransactionStatus.FAILED) {
    console.error(`Contract execution failed for method ${method}`, txStatus.resultMetaXdr);
    throw new Error(`Contract execution failed: ${method}`);
  }
  
  // Log event emission (available in successful transactions)
  console.log(`[CONTRACT_EVENT] method=${method} txHash=${sendResponse.hash} status=${txStatus.status}`);
  
  return {
    network: config.soroban.network,
    contractId: config.soroban.contractId,
    method,
    hash: sendResponse.hash,
    status: txStatus.status
  };
}

export const sorobanService = {
  async createJob(job: JobRecord) {
    return invokeContract("create_job", [
      strVal(job.jobId),
      addressVal(job.customer),
      addressVal(job.artisan),
      i128Val(job.amount),
      strVal(job.jobHash),
      strVal(job.trade)
    ]);
  },

  async acceptJob(jobId: string, artisan: string) {
    return invokeContract("accept_job", [
      strVal(jobId),
      addressVal(artisan)
    ]);
  },

  async confirmDone(jobId: string, customer: string) {
    return invokeContract("confirm_done", [
      strVal(jobId),
      addressVal(customer)
    ]);
  },

  async raiseDispute(jobId: string, customer: string) {
    return invokeContract("raise_dispute", [
      strVal(jobId),
      addressVal(customer)
    ]);
  },

  async resolveDispute(jobId: string, mediator: string, favour: ResolveFavour) {
    return invokeContract("resolve_dispute", [
      strVal(jobId),
      addressVal(mediator),
      // Typically enums or strings in Soroban for choices
      strVal(favour)
    ]);
  }
};
