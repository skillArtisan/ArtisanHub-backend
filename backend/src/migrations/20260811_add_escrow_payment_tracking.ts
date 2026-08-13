import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Escrow state tracking table
  await knex.schema.createTable("escrow_states", (table) => {
    table.string("job_id").primary().references("id").inTable("jobs").onDelete("CASCADE");
    table.enum("status", [
      "funding_pending",
      "funds_locked",
      "release_pending",
      "released",
      "refunded",
      "disputed"
    ]).defaultTo("funding_pending");
    table.string("contract_tx_hash").nullable().index();
    table.string("funding_tx_hash").nullable().index();
    table.string("release_tx_hash").nullable().index();
    table.string("refund_tx_hash").nullable().index();
    table.string("amount_stroops").notNullable();
    table.timestamp("funded_at").nullable();
    table.timestamp("locked_at").nullable();
    table.timestamp("release_initiated_at").nullable();
    table.timestamp("released_at").nullable();
    table.timestamp("refunded_at").nullable();
    table.timestamp("disputed_at").nullable();
    table.text("contract_response").nullable();
    table.text("error_message").nullable();
    table.timestamps(true, true);
    table.index(["status", "updated_at"]);
  });

  // Payment events audit table
  await knex.schema.createTable("payment_events", (table) => {
    table.increments("id").primary();
    table.string("job_id").notNullable().references("id").inTable("jobs").onDelete("CASCADE");
    table.enum("event_type", [
      "funding_initiated",
      "funds_locked",
      "release_initiated",
      "released",
      "refund_initiated",
      "refunded",
      "dispute_raised",
      "dispute_resolved",
      "transaction_failed",
      "idempotency_detected"
    ]).notNullable();
    table.enum("status", ["pending", "completed", "failed"]).defaultTo("pending");
    table.string("transaction_hash").nullable().index();
    table.string("from_wallet").nullable();
    table.string("to_wallet").nullable();
    table.string("amount_stroops").nullable();
    table.json("metadata").nullable(); // Additional context
    table.text("error_message").nullable();
    table.string("initiated_by").notNullable(); // Who triggered (customer/artisan/system)
    table.string("ip_address").nullable();
    table.string("user_agent").nullable();
    table.timestamps(true, true);
    table.index(["job_id", "created_at"]);
    table.index(["event_type", "status"]);
  });

  // Idempotency key store (prevent duplicate operations)
  await knex.schema.createTable("payment_idempotency_keys", (table) => {
    table.string("key").primary();
    table.string("job_id").notNullable().references("id").inTable("jobs").onDelete("CASCADE");
    table.enum("operation", [
      "fund",
      "lock",
      "release",
      "refund",
      "dispute",
      "resolve"
    ]).notNullable();
    table.json("request_payload").notNullable();
    table.json("response_payload").nullable();
    table.timestamp("expires_at").notNullable();
    table.timestamps(true, true);
    table.index(["job_id", "operation"]);
    table.index("expires_at");
  });

  // Add escrow fields to existing settlement_events if needed (check if table exists)
  const hasSettlementEvents = await knex.schema.hasTable("settlement_events");
  if (hasSettlementEvents) {
    const hasEscrowTxHash = await knex.schema.hasColumn("settlement_events", "escrow_tx_hash");
    if (!hasEscrowTxHash) {
      await knex.schema.alterTable("settlement_events", (table) => {
        table.string("escrow_tx_hash").nullable().index().after("transaction_hash");
        table.enum("escrow_status", [
          "funding_pending",
          "funds_locked",
          "release_pending",
          "released",
          "refunded",
          "disputed"
        ]).nullable().after("status");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop idempotency table first (has foreign key)
  await knex.schema.dropTableIfExists("payment_idempotency_keys");
  
  // Drop payment events (has foreign key)
  await knex.schema.dropTableIfExists("payment_events");
  
  // Drop escrow states (has foreign key)
  await knex.schema.dropTableIfExists("escrow_states");

  // Remove escrow fields from settlement_events if they exist
  const hasSettlementEvents = await knex.schema.hasTable("settlement_events");
  if (hasSettlementEvents) {
    const hasEscrowTxHash = await knex.schema.hasColumn("settlement_events", "escrow_tx_hash");
    if (hasEscrowTxHash) {
      await knex.schema.alterTable("settlement_events", (table) => {
        table.dropColumn("escrow_tx_hash");
        table.dropColumn("escrow_status");
      });
    }
  }
}
