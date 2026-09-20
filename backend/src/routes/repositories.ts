import { Router } from "express";
import { z } from "zod";
import { issueSession } from "../lib/auth-token.js";
import { createRepository, findRepositoryByEmail } from "../lib/repositories.js";

export const repositoriesRouter = Router();

const createRepositorySchema = z.object({
  name: z.string().trim().min(1).max(80).default("Meine Notizen"),
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben."),
  password: z.string().min(8, "Das Passwort muss mindestens 8 Zeichen haben."),
});

repositoriesRouter.post("/", (req, res) => {
  const parsed = createRepositorySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Ungültige Angaben." });
    return;
  }

  if (findRepositoryByEmail(parsed.data.email)) {
    res.status(409).json({ error: "Für diese E-Mail-Adresse gibt es bereits ein Konto." });
    return;
  }

  const secrets = createRepository(parsed.data);

  // The PIN and WebDAV password are only ever readable here, right after
  // creation — only their hashes are stored, so this is the one chance
  // to show them to the person setting this up.
  issueSession(res, secrets.id);

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
