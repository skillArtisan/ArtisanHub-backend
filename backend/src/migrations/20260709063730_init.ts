import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("artisans", (table) => {
    table.string("id").primary();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("reputations", (table) => {
    table.string("artisan").primary().references("id").inTable("artisans");
    table.integer("completed").notNullable().defaultTo(0);
    table.integer("disputed").notNullable().defaultTo(0);
    table.string("total_earned").notNullable().defaultTo("0");
  });

  await knex.schema.createTable("jobs", (table) => {
    table.string("job_id").primary();
    table.string("customer").notNullable();
    table.string("artisan").notNullable().references("id").inTable("artisans");
    table.string("amount").notNullable();
    table.string("state").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("dispute_at").nullable();
    table.string("job_hash").notNullable();
    table.string("trade").notNullable();
    table.text("description").nullable();
    table.string("contract_tx_hash").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("jobs");
  await knex.schema.dropTableIfExists("reputations");
  await knex.schema.dropTableIfExists("artisans");
}
