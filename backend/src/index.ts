import { createApp } from "./app.js";
import { config } from "./lib/config.js";
import { runBackupChecks } from "./lib/backup-check.js";
import { purgeExpiredTrash } from "./lib/trash.js";
import { pruneAuditLog } from "./lib/audit.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`GoodShare backend listening on port ${config.port}`);
});

const SIX_HOURS = 6 * 60 * 60 * 1000;
setTimeout(() => runBackupChecks(), 60 * 1000);
setInterval(() => runBackupChecks(), SIX_HOURS);

// Housekeeping: trash past its retention period and old audit entries.
const ONE_HOUR = 60 * 60 * 1000;
function housekeeping() {
  purgeExpiredTrash().catch(() => {});
  pruneAuditLog();
}
setTimeout(housekeeping, 30 * 1000);
setInterval(housekeeping, ONE_HOUR);
