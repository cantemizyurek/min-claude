import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDb } from "./client";

const db = createDb();
migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied successfully");
