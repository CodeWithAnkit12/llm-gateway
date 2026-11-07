import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is missing in .env");
}

// "sql" is used as a TAG: sql`SELECT ...`. Values in ${} are sent safely
// as parameters, never glued into the SQL text. That prevents SQL injection.
export const sql = neon(url);
