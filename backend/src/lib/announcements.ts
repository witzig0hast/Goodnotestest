import { db } from "./db.js";
import { generateAnnouncementId } from "./ids.js";

export interface Announcement {
  id: string;
  message: string;
  createdAt: string;
}

interface AnnouncementRow {
  id: string;
  message: string;
  created_at: string;
}

function toAnnouncement(row: AnnouncementRow): Announcement {
  return { id: row.id, message: row.message, createdAt: row.created_at };
}

export function createAnnouncement(message: string): Announcement {
  const id = generateAnnouncementId();
  db.prepare("INSERT INTO announcements (id, message) VALUES (?, ?)").run(id, message);
  const row = db.prepare("SELECT * FROM announcements WHERE id = ?").get(id) as AnnouncementRow;
  return toAnnouncement(row);
}

export function listAnnouncements(): Announcement[] {
  const rows = db
    .prepare("SELECT * FROM announcements ORDER BY created_at DESC")
    .all() as AnnouncementRow[];
  return rows.map(toAnnouncement);
}

export function deleteAnnouncement(id: string): boolean {
  const result = db.prepare("DELETE FROM announcements WHERE id = ?").run(id);
  return result.changes > 0;
}
