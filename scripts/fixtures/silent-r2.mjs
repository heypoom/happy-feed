// Stands in for local-r2.mjs in local-store.test.ts: it says ready, then never answers a request.
import { createServer } from "node:http";
const server = createServer(() => {});
process.stdin.on("end", () => process.exit(0)).resume();
server.listen(0, "127.0.0.1", () => console.log(`ready ${server.address().port}`));
