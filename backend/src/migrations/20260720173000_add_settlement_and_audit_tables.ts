import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Settlement events table
  await knex.schema.createTable("settlement_events", (table) => {
    table.string("id").primary();
    table.string("job_id").notNullable().references("job_id").inTable("jobs");
    table.string("type").notNullable(); // 'payout', 'refund', 'dispute_refund'
    table.string("amount").notNullable();
    table.string("from_address").notNullable();
    table.string("to_address").notNullable();
    table.string("transaction_hash").notNullable().defaultTo("");
    table.string("status").notNullable(); // 'pending', 'completed', 'failed'
    table.text("error_message").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("completed_at").nullable();
    
    table.index("job_id");
    table.index("status");
    table.index("created_at");
  });

  // Idempotency keys table
  await knex.schema.createTable("idempotency_keys", (table) => {
    table.string("key").primary();
    table.string("job_id").notNullable().references("job_id").inTable("jobs");
    table.string("operation").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("expires_at").notNullable();
    
    table.index("job_id");
    table.index("expires_at");
  });

  // Audit trail table
  await knex.schema.createTable("audit_entries", (table) => {
    table.string("id").primary();
    table.timestamp("timestamp").defaultTo(knex.fn.now());
    table.string("action").notNullable();
    table.string("job_id").notNullable().references("job_id").inTable("jobs");
    table.string("actor").notNullable();
    table.jsonb("details").notNullable().defaultTo("{}");
    table.string("ip_address").nullable();
    table.text("user_agent").nullable();
    
    table.index("job_id");
    table.index("action");
    table.index("actor");
    table.index("timestamp");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("audit_entries");
  await knex.schema.dropTableIfExists("idempotency_keys");
  await knex.schema.dropTableIfExists("settlement_events");
}
