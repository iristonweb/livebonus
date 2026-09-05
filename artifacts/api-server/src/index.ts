import app from "./app";
import { seedDemoData } from "./lib/demo-data";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  if (process.env["SKIP_STARTUP_SEED"] !== "true") {
    try {
      const seeded = await seedDemoData();
      logger.info({ seeded }, "Demo data checked");
    } catch (err) {
      logger.error({ err }, "Failed to initialize demo data");
      process.exit(1);
    }
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void start();
