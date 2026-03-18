import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";

const server = createApp();

server.listen(port, host, () => {
  process.stdout.write(`EAT server listening on http://${host}:${port}\n`);
});
