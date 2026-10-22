import "dotenv/config";
import { resolve } from "node:path";
import { z } from "zod";
import { createDb } from "./db.js";
import { buildApp } from "./app.js";
const config = z
  .object({
    DATABASE_URL: z.url(),
    JWT_SECRET: z.string().min(32),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    UPLOAD_DIR: z.string().default("uploads"),
    MOCK_OTP: z.literal("true"),
    NODE_ENV: z.string().optional(),
  })
  .parse(process.env);
if (config.NODE_ENV === "production")
  throw new Error(
    "Mock OTP is for local development only; production startup is disabled.",
  );
const db = createDb(config.DATABASE_URL);
const app = await buildApp({
  db,
  secret: config.JWT_SECRET,
  uploadDir: resolve(config.UPLOAD_DIR),
  logger: true,
});
const shutdown = async () => {
  await app.close();
  await db.$disconnect();
};
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
try {
  await app.listen({ port: config.PORT, host: "127.0.0.1" });
} catch (error) {
  app.log.error(error);
  await shutdown();
  process.exitCode = 1;
}
