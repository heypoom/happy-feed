// Copies the published feed from feed.poom.dev into the local R2 bucket that `bun run dev` serves.
// It reads only the published manifest and chunks, so unlike `bun run refresh -- --local` it never
// fetches the sources themselves. Run it again for newer data.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Manifest } from "../src/shared/types";

const ORIGIN = "https://feed.poom.dev";
const BUCKET = "happy-feed";

const manifestBody = await download("feed/manifest.json");
const manifest = JSON.parse(manifestBody) as Manifest;
const dir = await mkdtemp(join(tmpdir(), "happy-feed-seed-"));
try {
  // Chunks first and the manifest last, as the Worker publishes, so the manifest never names a missing chunk.
  for (const chunk of manifest.chunks) await putLocal(dir, chunk.path, await download(chunk.path));
  await putLocal(dir, "feed/manifest.json", manifestBody);
} finally {
  await rm(dir, { recursive: true, force: true });
}
const items = manifest.chunks.reduce((sum, chunk) => sum + chunk.count, 0);
console.log(`seeded ${items} items in ${manifest.chunks.length} chunks, generated ${manifest.generatedAt}`);

async function download(path: string): Promise<string> {
  const response = await fetch(`${ORIGIN}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return await response.text();
}

async function putLocal(dir: string, key: string, body: string): Promise<void> {
  const file = join(dir, key.replaceAll("/", "_"));
  await Bun.write(file, body);
  const command = ["node_modules/.bin/cf", "r2", "objects", "put", key, "--file", file, "--content-type", "application/json", "--bucket-name", BUCKET, "--local"];
  const child = Bun.spawn(command, { stdout: "ignore", stderr: "pipe" });
  const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error(`cf r2 objects put ${key} failed: ${stderr.trim()}`);
}
