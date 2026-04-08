import express, { type Express, type Request } from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";

const DEFAULT_CORS_WHITELIST = [
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

function isLocalhost(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function buildRequestOrigin(req: Request): string | null {
  const host = req.get("host");
  if (!host) return null;

  const forwardedProto = req.get("x-forwarded-proto");
  const protocol = (forwardedProto || req.protocol || "http")
    .split(",")[0]
    .trim();

  return `${protocol}://${host}`;
}

export function configureApp(app: Express): void {
  const runtimePort = process.env.PORT?.trim() || "3001";
  const corsWhitelist = new Set(
    (process.env.CORS_WHITELIST
      ? process.env.CORS_WHITELIST.split(",").map((origin) => origin.trim())
      : DEFAULT_CORS_WHITELIST
    ).concat([
      `http://localhost:${runtimePort}`,
      `http://127.0.0.1:${runtimePort}`,
    ]),
  );
  const isDev = process.env.NODE_ENV !== "production";

  app.use(
    cors((req, callback) => {
      const origin = req.header("Origin");

      if (!origin) {
        callback(null, {
          credentials: true,
          optionsSuccessStatus: 200,
          origin: true,
        });
        return;
      }

      const requestOrigin = buildRequestOrigin(req);
      const isSameOrigin = requestOrigin === origin;
      const isAllowed =
        isSameOrigin ||
        corsWhitelist.has(origin) ||
        (isDev && isLocalhost(origin));

      if (!isAllowed) {
        callback(new Error("Not allowed by CORS"));
        return;
      }

      callback(null, {
        credentials: true,
        optionsSuccessStatus: 200,
        origin: true,
      });
    }),
  );

  app.use(express.json({ limit: "50mb" }));

  app.use((req, res, next) => {
    const start = Date.now();
    const method = req.method;
    const url = req.originalUrl;
    const ts = new Date().toISOString().split("T")[1].slice(0, 8);

    console.log(`\x1b[36m[${ts}] --> ${method} ${url}\x1b[0m`);

    res.on("finish", () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const color =
        status >= 500 ? "\x1b[31m" : status >= 400 ? "\x1b[33m" : "\x1b[32m";
      console.log(
        `${color}[${ts}] <-- ${method} ${url} ${status} ${duration}ms\x1b[0m`,
      );
    });

    next();
  });

  if (!isDev) {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      message: "Too many requests, please try again later",
      standardHeaders: "draft-8",
      legacyHeaders: false,
    });

    app.use("/api/", limiter);
  }
}
