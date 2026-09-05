import { pool } from "@workspace/db";
import { seedDemoData } from "./lib/demo-data";

try {
  const result = await seedDemoData();
  console.info("Demo data seeded:", result);
} catch (error) {
  console.error("Failed to seed demo data:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}