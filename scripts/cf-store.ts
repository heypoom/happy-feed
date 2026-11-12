import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Store, StoredObject } from "./store";

// The bucket bound as FEED in cloudflare.config.ts.
export const BUCKET = "happy-feed";
const CLI_CONCURRENCY = 8;

// R2 through the cf CLI, which carries the owner's login (`npx cf auth login`) or, with --local, the
// state the Vite dev server reads (.cloudflare/state). Objects written or read in this run are kept
// in memory, so publish does not fetch back the records refresh just wrote.
export class CfR2Store implements Store {
  private readonly known = new Map<string, string>();
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly bucket: string,
    private readonly local: boolean,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const body = this.known.get(key) ?? (await this.cf(["get", key]).catch((error: Error) => (/does not exist/.test(error.message) ? undefined : Promise.reject(error))));
    if (body === undefined) return undefined;
    this.known.set(key, body);
    return JSON.parse(body) as T;
  }

  async put(key: string, value: unknown): Promise<void> {
    const body = JSON.stringify(value);
    const file = join(tmpdir(), `happy-feed-${crypto.randomUUID()}.json`);
    await Bun.write(file, body);
    try {
      await this.cf(["put", key, "--file", file, "--content-type", "application/json"]);
    } finally {
      await rm(file, { force: true });
    }
    this.known.set(key, body);
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let cursor: string | undefined;
    do {
      const { stdout, stderr } = await this.run(["list", "--prefix", prefix, ...(cursor ? ["--cursor", cursor] : [])]);
      const page = JSON.parse(stdout) as { key: string; last_modified: string }[];
      objects.push(...page.map((object) => ({ key: object.key, uploaded: new Date(object.last_modified) })));
      const info = JSON.parse(/result_info: (.*)/.exec(stderr)?.[1] ?? "{}") as { cursor?: string; is_truncated?: string };
      cursor = info.is_truncated === "true" ? info.cursor : undefined;
    } while (cursor);
    return objects;
  }

  async delete(key: string): Promise<void> {
    await this.cf(["delete", key, "--force"]);
    this.known.delete(key);
  }

  private async cf(args: string[]): Promise<string> {
    return (await this.run(args)).stdout;
  }

  private async run(args: string[]): Promise<{ stdout: string; stderr: string }> {
    while (this.running >= CLI_CONCURRENCY) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.running++;
    try {
      const command = ["node_modules/.bin/cf", "r2", "objects", ...args, "--bucket-name", this.bucket, ...(this.local ? ["--local"] : [])];
      const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      if (code !== 0) throw new Error(`cf r2 objects ${args.slice(0, 2).join(" ")} failed: ${stderr.trim()}`);
      return { stdout, stderr };
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}
