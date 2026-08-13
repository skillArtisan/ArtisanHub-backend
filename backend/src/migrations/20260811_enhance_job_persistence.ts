import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Job history/timeline table for tracking all status transitions
  await knex.schema.createTable("job_history", (table) => {
    table.string("id").primary();
    table.string("job_id").notNullable().references("job_id").inTable("jobs");
    table.string("previous_state").nullable(); // State before transition
    table.string("new_state").notNullable(); // State after transition
    table.string("triggered_by").notNullable(); // Stellar address of who triggered
    table.text("reason").nullable(); // Reason for transition (dispute reason, etc)
    table.jsonb("metadata").defaultTo("{}"); // Additional context
    table.string("transaction_hash").nullable(); // If contract-related
    table.timestamp("timestamp").defaultTo(knex.fn.now());
    table.string("ip_address").nullable();
    table.text("user_agent").nullable();

    table.index("job_id");
    table.index("new_state");
    table.index("timestamp");
    table.index("triggered_by");
  });

  // Add composite index for efficient querying
  await knex.schema.raw(
    'CREATE INDEX idx_job_history_job_timestamp ON job_history(job_id, timestamp DESC)'
  );

  // Enhanced jobs table with additional tracking fields
  // (only adding new columns if needed)
  const hasDisputeReason = await knex.schema.hasColumn("jobs", "dispute_reason");
  if (!hasDisputeReason) {
    await knex.schema.alterTable("jobs", table => {
      table.text("dispute_reason").nullable();
      table.timestamp("last_status_change").nullable();
      table.string("cancelled_by").nullable();
      table.text("cancellation_reason").nullable();
    });
  }

  // Create an index for efficient job searching
  await knex.schema.raw(
    'CREATE INDEX idx_jobs_customer_state ON jobs(customer, state)'
  );
  await knex.schema.raw(
    'CREATE INDEX idx_jobs_artisan_state ON jobs(artisan, state)'
  );
  await knex.schema.raw(
    'CREATE INDEX idx_jobs_created_at_desc ON jobs(created_at DESC)'
  );
  await knex.schema.raw(
    'CREATE INDEX idx_jobs_state_created ON jobs(state, created_at DESC)'
  );
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes
  try {
    await knex.schema.raw('DROP INDEX IF EXISTS idx_job_history_job_timestamp');
    await knex.schema.raw('DROP INDEX IF EXISTS idx_jobs_customer_state');
    await knex.schema.raw('DROP INDEX IF EXISTS idx_jobs_artisan_state');
    await knex.schema.raw('DROP INDEX IF EXISTS idx_jobs_created_at_desc');
    await knex.schema.raw('DROP INDEX IF EXISTS idx_jobs_state_created');
  } catch (error) {
    // Indexes might not exist
  }

  // Drop job_history table
  await knex.schema.dropTableIfExists("job_history");

  // Remove added columns from jobs table
  const hasDisputeReason = await knex.schema.hasColumn("jobs", "dispute_reason");
  if (hasDisputeReason) {
    await knex.schema.alterTable("jobs", table => {
      table.dropColumn("dispute_reason");
      table.dropColumn("last_status_change");
      table.dropColumn("cancelled_by");
      table.dropColumn("cancellation_reason");
    });
  }
}
