import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { applyMonthlyTenureEvents } from "./lib/score.js";

const app: Express = express();

// YooKassa authenticates notifications by source IP. Never trust forwarded
// headers implicitly: production must explicitly configure the number of
// trusted proxy hops, otherwise req.ip remains the socket peer.
const configuredProxyHops = process.env.YOOKASSA_WEBHOOK_TRUSTED_PROXY_HOPS;
const proxyHops = configuredProxyHops === undefined
  ? (process.env.NODE_ENV === "production" ? 0 : 1)
  : Number(configuredProxyHops);
app.set("trust proxy", Number.isInteger(proxyHops) && proxyHops >= 0 ? proxyHops : 0);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Demo partner assets are shipped with the API so web and Expo use the same
// source of truth. Keep the legacy mount for clients seeded before this route
// was introduced; express.static still prevents path traversal.
const partnerLogosDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "partner-logos",
);
const partnerLogoStaticOptions = {
  fallthrough: false,
  maxAge: "1h",
};
app.use("/api/partner-logos", express.static(partnerLogosDirectory, partnerLogoStaticOptions));
app.use("/partner-logos", express.static(partnerLogosDirectory, partnerLogoStaticOptions));
app.use("/api", router);

// ---------------------------------------------------------------------------
// Monthly tenure cron — runs on startup then every 24 h
// Applies +5 score event for each active lease that completes a new month
// ---------------------------------------------------------------------------
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function scheduleTenure() {
  applyMonthlyTenureEvents()
    .then(() => logger.info("Monthly tenure events applied"))
    .catch((err: unknown) => logger.error({ err }, "Failed to apply tenure events"));
}

// Fire once after 5 s (give DB time to connect), then daily
setTimeout(() => {
  scheduleTenure();
  setInterval(scheduleTenure, ONE_DAY_MS);
}, 5000);

export default app;
