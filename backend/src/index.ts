import { createApp } from "./app.js";
import { config } from "./lib/config.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`GoodShare backend listening on port ${config.port}`);
});
