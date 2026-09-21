import cors from "cors";
import express, { Router } from "express";
import { config } from "./lib/config.js";
import { handleWebdavRequest } from "./lib/webdav-server.js";
import { authRouter } from "./routes/auth.js";
import { filesRouter } from "./routes/files.js";
import { nextcloudRouter } from "./routes/nextcloud.js";
import { notificationsRouter } from "./routes/notifications.js";
import { repositoriesRouter } from "./routes/repositories.js";
import { shareRouter } from "./routes/share.js";
import { shortcutsRouter } from "./routes/shortcuts.js";
import { webauthnRouter } from "./routes/webauthn.js";

export function createApp() {
  const app = express();

  // The WebDAV endpoint is mounted before any JSON body parsing or CORS
  // handling: WebDAV clients (GoodNotes) read/write the raw request body
  // themselves, and a CORS middleware would hijack the OPTIONS method that
  // WebDAV uses to advertise its own capabilities.
  app.use("/webdav/:repositoryId", handleWebdavRequest);

  // Same reasoning as the WebDAV mount above: the iOS Shortcut posts a raw
  // file body, whatever Content-Type it happens to send, so this must sit
  // ahead of express.json() rather than risk it trying (and failing) to
  // parse binary data as JSON.
  app.use("/api/shortcuts", shortcutsRouter);

  const api = Router();
  api.use(
    cors({
      origin: config.frontendOrigin,
      credentials: true,
    })
  );
  api.use(express.json());

  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  api.use("/repositories", repositoriesRouter);
  api.use("/auth", authRouter);
  api.use("/files", filesRouter);
  api.use("/nextcloud", nextcloudRouter);
  api.use("/notifications", notificationsRouter);
  api.use("/share", shareRouter);
  api.use("/auth/webauthn", webauthnRouter);

  app.use("/api", api);

  return app;
}
