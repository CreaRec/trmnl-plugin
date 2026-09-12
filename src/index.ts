import { assertPollTokenConfigured } from "./poll-auth.js";
import { createServer, resolveListenOptions } from "./server.js";

assertPollTokenConfigured();

const { host, port } = resolveListenOptions();
const server = createServer();

server.listen(port, host, () => {
  console.log(`trmnl-plugin listening on http://${host}:${port}`);
});
