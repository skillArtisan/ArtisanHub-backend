import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add password field to users table
  await knex.schema.alterTable("users", (table) => {
    table.string("password_hash").nullable(); // Nullable for backward compatibility with Stellar-only auth
    table.timestamp("last_login_at").nullable();
    table.string("last_login_ip").nullable();
  });

  // Refresh tokens table for JWT refresh token management
  await knex.schema.createTable("refresh_tokens", (table) => {
    table.string("id").primary();
    table.string("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.text("token_hash").notNullable(); // Store hashed version of token
    table.string("device_id").notNullable(); // Unique device identifier
    table.string("device_name").nullable(); // User-friendly device name
    table.string("device_type").nullable(); // mobile, desktop, tablet, etc.
    table.string("browser").nullable();
    table.string("os").nullable();
    table.string("ip_address").nullable();
    table.timestamp("expires_at").notNullable();
    table.timestamp("last_used_at").defaultTo(knex.fn.now());
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.boolean("is_revoked").defaultTo(false);
    table.timestamp("revoked_at").nullable();

    table.index("user_id");
    table.index("device_id");
    table.index("expires_at");
    table.index("is_revoked");
    table.index(["user_id", "device_id"]);
  });

  // Password reset tokens table
  await knex.schema.createTable("password_reset_tokens", (table) => {
    table.string("id").primary();
    table.string("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("token_hash").notNullable().unique();
    table.timestamp("expires_at").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.boolean("is_used").defaultTo(false);
    table.timestamp("used_at").nullable();
    table.string("ip_address").nullable();

    table.index("user_id");
    table.index("expires_at");
    table.index("is_used");
  });

  // User sessions table for multi-device session tracking
  await knex.schema.createTable("user_sessions", (table) => {
    table.string("id").primary();
    table.string("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("device_id").notNullable();
    table.string("device_name").nullable();
    table.string("device_type").nullable();
    table.string("browser").nullable();
    table.string("os").nullable();
    table.string("ip_address").nullable();
    table.string("user_agent").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("last_active_at").defaultTo(knex.fn.now());
    table.timestamp("expires_at").notNullable();
    table.boolean("is_active").defaultTo(true);
    table.timestamp("terminated_at").nullable();

    table.index("user_id");
    table.index("device_id");
    table.index("is_active");
    table.index("expires_at");
    table.index(["user_id", "is_active"]);
  });

  // Login attempts table for rate limiting and security monitoring
  await knex.schema.createTable("login_attempts", (table) => {
    table.increments("id").primary();
    table.string("user_id").nullable(); // Nullable because failed attempts might not have valid user
    table.string("email").nullable();
    table.string("ip_address").notNullable();
    table.boolean("successful").defaultTo(false);
    table.string("failure_reason").nullable();
    table.string("user_agent").nullable();
    table.timestamp("attempted_at").defaultTo(knex.fn.now());

    table.index("user_id");
    table.index("email");
    table.index("ip_address");
    table.index("attempted_at");
    table.index(["ip_address", "attempted_at"]);
    table.index(["email", "attempted_at"]);
  });

  // Blacklisted tokens table for immediate token revocation
  await knex.schema.createTable("blacklisted_tokens", (table) => {
    table.string("id").primary();
    table.text("token_hash").notNullable().unique();
    table.string("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("token_type").notNullable(); // 'access' or 'refresh'
    table.timestamp("expires_at").notNullable();
    table.timestamp("blacklisted_at").defaultTo(knex.fn.now());
    table.string("reason").nullable(); // logout, security, admin_action, etc.

    table.index("token_hash");
    table.index("user_id");
    table.index("expires_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("blacklisted_tokens");
  await knex.schema.dropTableIfExists("login_attempts");
  await knex.schema.dropTableIfExists("user_sessions");
  await knex.schema.dropTableIfExists("password_reset_tokens");
  await knex.schema.dropTableIfExists("refresh_tokens");

  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("password_hash");
    table.dropColumn("last_login_at");
    table.dropColumn("last_login_ip");
  });
}
