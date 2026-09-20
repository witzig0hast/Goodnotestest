import { createApp } from "./app.js";
import { config } from "./lib/config.js";
import { runBackupChecks } from "./lib/backup-check.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`GoodShare backend listening on port ${config.port}`);
});

const SIX_HOURS = 6 * 60 * 60 * 1000;
setTimeout(() => runBackupChecks(), 60 * 1000);
setInterval(() => runBackupChecks(), SIX_HOURS);
