import "server-only"; // build ERROR if this file is ever imported into browser code
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is missing in dashboard/.env.local");
}

export const sql = neon(url);
