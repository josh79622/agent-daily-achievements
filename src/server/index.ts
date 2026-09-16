import { resolve } from "node:path";

import { createApp } from "./app.js";
import { createReportStore } from "../storage/report-store.js";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "4317", 10);
const reportStore = createReportStore(resolve("data/reports"));
const server = createApp({
  reportStore,
  staticDirectory: resolve("dist/web"),
});

server.listen(port, host, () => {
  console.log(`Daily achievements demo: http://${host}:${port}`);
});
