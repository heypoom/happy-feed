import { mergeLibraries, parseLibrary, sameLibrary } from "../src/shared/library";
import { isSyncKey, MAX_SYNC_BYTES, SYNC_PATH } from "../src/shared/sync";

const ATTEMPTS = 4;

// POST /sync/<key> with a device's library merges it into the stored one and answers with the result,
// so one request both sends and receives. Writes are conditional on the version read, so two devices
// syncing at once retry instead of dropping each other's changes.
export async function handleSync(request: Request, bucket: R2Bucket, key: string): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
  if (!isSyncKey(key)) return new Response("Not found", { status: 404 });
  const body = await request.text();
  if (body.length > MAX_SYNC_BYTES) return new Response("Too large", { status: 413 });
  let incoming;
  try {
    incoming = parseLibrary(JSON.parse(body));
  } catch {
    return new Response("Bad library", { status: 400 });
  }

  const path = `${SYNC_PATH}${key}.json`;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const object = await bucket.get(path);
    const stored = parseLibrary(object ? await object.json() : null);
    const merged = mergeLibraries(stored, incoming);
    if (object && sameLibrary(merged, stored)) return json(merged);
    const written = await bucket.put(path, JSON.stringify(merged), {
      httpMetadata: { contentType: "application/json" },
      onlyIf: object ? { etagMatches: object.etag } : undefined,
    });
    if (written) return json(merged);
  }
  return new Response("Busy, try again", { status: 503 });
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
