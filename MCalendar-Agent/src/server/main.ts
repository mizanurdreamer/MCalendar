import { startWebServer } from "./http.js";

const portArgIdx = process.argv.indexOf("--port");
const port = portArgIdx !== -1 ? parseInt(process.argv[portArgIdx + 1], 10) : undefined;

startWebServer({ port }).catch((err) => {
  console.error(err);
  process.exit(1);
});
