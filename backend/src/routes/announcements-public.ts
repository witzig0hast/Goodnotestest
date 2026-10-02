import { Router } from "express";
import { listAnnouncements } from "../lib/announcements.js";

// Deliberately unauthenticated — these are site-wide notices (maintenance
// windows, disclaimers) meant to be visible the moment anyone opens the
// site, before they've logged in.
export const publicAnnouncementsRouter = Router();

publicAnnouncementsRouter.get("/", (_req, res) => {
  res.json({ announcements: listAnnouncements() });
});
