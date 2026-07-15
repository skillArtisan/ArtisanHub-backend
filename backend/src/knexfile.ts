import type { Knex } from "knex";
import dotenv from "dotenv";

dotenv.config();

const config: Knex.Config = {
  client: "pg",
  connection: process.env.DATABASE_URL || {
    host: process.env.PG_HOST || '127.0.0.1',
    port: Number(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    database: process.env.PG_DATABASE || 'ArtisanHub'
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    directory: "./src/migrations",
    extension: "ts",
    tableName: "knex_migrations"
  }
};

export default config;
