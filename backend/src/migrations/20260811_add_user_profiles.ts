import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Users table - extends artisans with profile information
  await knex.schema.createTable("users", (table) => {
    table.string("id").primary(); // Stellar public key
    table.string("email").notNullable().unique();
    table.string("full_name").nullable();
    table.string("profile_image_url").nullable();
    table.jsonb("preferences").defaultTo("{}"); // User preferences stored as JSON
    table.boolean("email_verified").defaultTo(false);
    table.string("verification_token").nullable().unique();
    table.timestamp("verification_token_expires_at").nullable();
    table.boolean("is_active").defaultTo(true);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.timestamp("deleted_at").nullable();

    table.index("email");
    table.index("email_verified");
    table.index("is_active");
  });

  // User preferences table for detailed settings
  await knex.schema.createTable("user_preferences", (table) => {
    table.string("user_id").primary().references("id").inTable("users");
    table.boolean("notifications_enabled").defaultTo(true);
    table.boolean("email_notifications").defaultTo(true);
    table.string("preferred_language").defaultTo("en");
    table.string("timezone").defaultTo("UTC");
    table.boolean("receive_promotional_emails").defaultTo(false);
    table.jsonb("notification_settings").defaultTo("{}");
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  // User profile images table for versioning and history
  await knex.schema.createTable("user_profile_images", (table) => {
    table.string("id").primary();
    table.string("user_id").notNullable().references("id").inTable("users");
    table.string("image_url").notNullable();
    table.string("mime_type").notNullable();
    table.integer("file_size").notNullable();
    table.boolean("is_current").defaultTo(true);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("deleted_at").nullable();

    table.index("user_id");
    table.index("is_current");
  });

  // Account deletion requests table for soft deletes with recovery option
  await knex.schema.createTable("account_deletion_requests", (table) => {
    table.string("id").primary();
    table.string("user_id").notNullable().references("id").inTable("users");
    table.string("status").notNullable(); // 'pending', 'confirmed', 'completed', 'cancelled'
    table.string("confirmation_token").notNullable().unique();
    table.timestamp("requested_at").defaultTo(knex.fn.now());
    table.timestamp("confirmed_at").nullable();
    table.timestamp("completion_at").nullable();
    table.timestamp("expires_at").notNullable(); // Grace period for recovery
    table.text("reason").nullable();

    table.index("user_id");
    table.index("status");
    table.index("expires_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("account_deletion_requests");
  await knex.schema.dropTableIfExists("user_profile_images");
  await knex.schema.dropTableIfExists("user_preferences");
  await knex.schema.dropTableIfExists("users");
}
