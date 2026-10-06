import { defineConfig } from 'drizzle-kit';

// drizzle-kit 0.31+ automatically loads .env.local.
// DATABASE_URL is only needed for `db:migrate` and `db:push`;
// `db:generate` and `db:check` work without a live database connection.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
