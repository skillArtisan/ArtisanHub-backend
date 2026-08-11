import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Artisan profiles table - extends basic artisan info
  await knex.schema.createTable("artisan_profiles", (table) => {
    table.string("artisan_id").primary().references("id").inTable("artisans");
    table.string("bio").nullable();
    table.string("experience_years").nullable();
    table.string("education").nullable();
    table.string("certifications").nullable(); // JSONB array of certification objects
    table.jsonb("skills").defaultTo("[]");
    table.jsonb("languages").defaultTo("[]");
    table.float("average_rating").defaultTo(0);
    table.integer("total_reviews").defaultTo(0);
    table.boolean("is_verified").defaultTo(false);
    table.boolean("is_active").defaultTo(true);
    table.timestamp("profile_created_at").defaultTo(knex.fn.now());
    table.timestamp("profile_updated_at").defaultTo(knex.fn.now());
  });

  // Service categories table
  await knex.schema.createTable("service_categories", (table) => {
    table.string("id").primary();
    table.string("name").notNullable().unique();
    table.text("description").nullable();
    table.string("icon_url").nullable();
    table.boolean("is_active").defaultTo(true);
    table.integer("display_order").defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index("is_active");
    table.index("display_order");
  });

  // Artisan services table - services offered by artisans
  await knex.schema.createTable("artisan_services", (table) => {
    table.string("id").primary();
    table.string("artisan_id").notNullable().references("id").inTable("artisans");
    table.string("category_id").notNullable().references("id").inTable("service_categories");
    table.string("name").notNullable();
    table.text("description").nullable();
    table.string("base_price").notNullable(); // Stored as stroop string
    table.string("currency").defaultTo("XLM");
    table.boolean("is_available").defaultTo(true);
    table.integer("estimated_duration_minutes").nullable();
    table.jsonb("service_details").defaultTo("{}");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.index("artisan_id");
    table.index("category_id");
    table.index("is_available");
    table.unique(["artisan_id", "name"]);
  });

  // Portfolio items table
  await knex.schema.createTable("portfolio_items", (table) => {
    table.string("id").primary();
    table.string("artisan_id").notNullable().references("id").inTable("artisans");
    table.string("title").notNullable();
    table.text("description").nullable();
    table.jsonb("images").defaultTo("[]"); // Array of image URLs
    table.string("category").nullable();
    table.date("completion_date").nullable();
    table.string("project_url").nullable();
    table.jsonb("tags").defaultTo("[]");
    table.boolean("is_featured").defaultTo(false);
    table.integer("display_order").defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.index("artisan_id");
    table.index("is_featured");
    table.index("display_order");
  });

  // Working hours table
  await knex.schema.createTable("working_hours", (table) => {
    table.string("id").primary();
    table.string("artisan_id").notNullable().references("id").inTable("artisans");
    table.string("day_of_week").notNullable(); // 'Monday', 'Tuesday', etc.
    table.time("start_time").notNullable();
    table.time("end_time").notNullable();
    table.boolean("is_available").defaultTo(true);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.index("artisan_id");
    table.unique(["artisan_id", "day_of_week"]);
  });

  // Special hours table - for holidays, vacations, special closures
  await knex.schema.createTable("special_hours", (table) => {
    table.string("id").primary();
    table.string("artisan_id").notNullable().references("id").inTable("artisans");
    table.string("type").notNullable(); // 'holiday', 'vacation', 'special_closure'
    table.date("start_date").notNullable();
    table.date("end_date").notNullable();
    table.text("reason").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index("artisan_id");
    table.index("start_date");
    table.index("end_date");
  });

  // Artisan locations table
  await knex.schema.createTable("artisan_locations", (table) => {
    table.string("id").primary();
    table.string("artisan_id").notNullable().references("id").inTable("artisans");
    table.string("location_name").notNullable();
    table.string("street_address").notNullable();
    table.string("city").notNullable();
    table.string("state_province").notNullable();
    table.string("postal_code").notNullable();
    table.string("country").notNullable();
    table.float("latitude").nullable();
    table.float("longitude").nullable();
    table.string("phone_number").nullable();
    table.boolean("is_primary").defaultTo(false);
    table.boolean("is_service_location").defaultTo(true); // Can provide services here
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.index("artisan_id");
    table.index("is_primary");
    table.index("city");
    table.index("is_service_location");
  });

  // Artisan reviews table
  await knex.schema.createTable("artisan_reviews", (table) => {
    table.string("id").primary();
    table.string("artisan_id").notNullable().references("id").inTable("artisans");
    table.string("customer").notNullable(); // Stellar public key
    table.string("job_id").nullable().references("job_id").inTable("jobs");
    table.integer("rating").notNullable(); // 1-5
    table.text("comment").nullable();
    table.boolean("is_verified_job").defaultTo(false);
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index("artisan_id");
    table.index("rating");
    table.index("created_at");
    table.unique(["artisan_id", "job_id"]); // One review per job
  });

  // Artisan certifications table - detailed certifications
  await knex.schema.createTable("artisan_certifications", (table) => {
    table.string("id").primary();
    table.string("artisan_id").notNullable().references("id").inTable("artisans");
    table.string("certification_name").notNullable();
    table.string("issuing_organization").notNullable();
    table.date("issue_date").notNullable();
    table.date("expiry_date").nullable();
    table.string("credential_url").nullable();
    table.string("credential_id").nullable();
    table.boolean("is_verified").defaultTo(false);
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index("artisan_id");
    table.index("is_verified");
  });

  // Artisan availability slots - for booking management
  await knex.schema.createTable("availability_slots", (table) => {
    table.string("id").primary();
    table.string("artisan_id").notNullable().references("id").inTable("artisans");
    table.timestamp("start_time").notNullable();
    table.timestamp("end_time").notNullable();
    table.string("status").notNullable(); // 'available', 'booked', 'blocked'
    table.string("job_id").nullable().references("job_id").inTable("jobs");
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index("artisan_id");
    table.index("start_time");
    table.index("status");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("availability_slots");
  await knex.schema.dropTableIfExists("artisan_certifications");
  await knex.schema.dropTableIfExists("artisan_reviews");
  await knex.schema.dropTableIfExists("artisan_locations");
  await knex.schema.dropTableIfExists("special_hours");
  await knex.schema.dropTableIfExists("working_hours");
  await knex.schema.dropTableIfExists("portfolio_items");
  await knex.schema.dropTableIfExists("artisan_services");
  await knex.schema.dropTableIfExists("service_categories");
  await knex.schema.dropTableIfExists("artisan_profiles");
}
