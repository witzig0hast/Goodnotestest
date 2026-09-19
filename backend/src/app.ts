import cors from "cors";
import express from "express";
import { config } from "./lib/config.js";
import { authRouter } from "./routes/auth.js";
import { repositoriesRouter } from "./routes/repositories.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.frontendOrigin,
      credentials: true,
    })
  );
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/repositories", repositoriesRouter);
  app.use("/api/auth", authRouter);

  return app;
}
