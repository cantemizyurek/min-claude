import { createDb } from "@min-claude/db";
import { app } from "./app";

const db = createDb(process.env.DB_PATH);
const server = app(db);

export default {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
  fetch: server.fetch,
};
