// Runs one local Cloudflare runtime for a whole laptop run and forwards R2 object requests to its
// explorer API, the same API `cf r2 objects … --local` calls after booting a fresh runtime per call.
// It runs under Node because Miniflare's dispatchFetch does not reach the runtime under Bun.
// Prints "ready <port>" once it listens, and exits when its parent closes stdin. Tests pass their own
// state folder as the second argument.
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Miniflare } from "miniflare";

const [bucket, state = ".cloudflare/state/v3"] = process.argv.slice(2);
const isolated = mkdtempSync(join(tmpdir(), "happy-feed-local-r2-"));
const mf = new Miniflare({
  unsafeLocalExplorer: true,
  cf: false,
  resourcePersistencePath: resolve(state),
  unsafeEnableSharedStorage: true,
  isolatedResourcePersistencePath: isolated,
  workers: [
    {
      config: {
        name: "happy-feed-local-r2",
        compatibilityDate: "2026-08-15",
        manifest: { mainModule: "noop.mjs", modules: { "noop.mjs": { type: "esm", contents: "export default { fetch() { return new Response(null, { status: 404 }); } };" } } },
      },
    },
  ],
});

const server = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const answer = await mf.dispatchFetch(`http://localhost/cdn-cgi/local/explorer/api/r2/buckets/${bucket}/objects${request.url}`, {
      method: request.method,
      headers: { host: "localhost", ...(request.headers["content-type"] ? { "content-type": request.headers["content-type"] } : {}) },
      body,
    });
    response.writeHead(answer.status, { "content-type": answer.headers.get("content-type") ?? "application/octet-stream" });
    response.end(Buffer.from(await answer.arrayBuffer()));
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end(error instanceof Error ? error.message : String(error));
  }
});

async function shutdown() {
  server.close();
  await mf.dispose().catch(() => {});
  rmSync(isolated, { recursive: true, force: true });
  process.exit(0);
}
process.stdin.on("end", shutdown).resume();
process.on("SIGTERM", shutdown);

await mf.ready;
server.listen(0, "127.0.0.1", () => console.log(`ready ${server.address().port}`));
