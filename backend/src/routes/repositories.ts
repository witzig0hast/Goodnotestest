import { Router } from "express";
import { z } from "zod";
import { createRepository } from "../lib/repositories.js";

export const repositoriesRouter = Router();

const createRepositorySchema = z.object({
  name: z.string().trim().min(1).max(80).default("Meine Notizen"),
});

repositoriesRouter.post("/", (req, res) => {
  const parsed = createRepositorySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Ungültiger Name." });
    return;
  }

  const secrets = createRepository(parsed.data.name);

  // The PIN and WebDAV password are only ever readable here, right after
  // creation — only their hashes are stored, so this is the one chance
  // to show them to the person setting this up.
  res.status(201).json({
    repositoryId: secrets.id,
    name: secrets.name,
    pin: secrets.pin,
    webdav: {
      username: secrets.webdavUsername,
      password: secrets.webdavPassword,
    },
  });
});
