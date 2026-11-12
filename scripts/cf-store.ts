import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Store, StoredObject } from "./store";

// The bucket bound as FEED in cloudflare.config.ts.
export const BUCKET = "happy-feed";
const CLI_CONCURRENCY = 8;
// Healthy calls take one to four seconds; a minute leaves room for a big put on a slow connection.
const CLI_TIMEOUT_MS = 60_000;

// The live R2 bucket through the cf CLI, which carries the owner's login (`npx cf auth login`). The local
// bucket goes through LocalR2Store. Objects written or read in this run are kept in memory, so publish
// does not fetch back the records refresh just wrote.
export class CfR2Store implements Store {
  private readonly known = new Map<string, string>();
  private running = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly calls = new Set<{ call: string; since: number }>();

  constructor(
    private readonly bucket: string,
    private readonly cli: string[] = ["node_modules/.bin/cf"],
    private readonly timeoutMs = CLI_TIMEOUT_MS,
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

  // The CLI calls running now, oldest first, for a progress line that shows what a slow run waits on.
  inFlight(): { call: string; since: number }[] {
    return [...this.calls];
  }

  private async cf(args: string[]): Promise<string> {
    return (await this.run(args)).stdout;
  }

  private async run(args: string[]): Promise<{ stdout: string; stderr: string }> {
    while (this.running >= CLI_CONCURRENCY) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.running++;
    try {
      // A cf call now and then never exits, so a stuck call is killed and tried once more.
      try {
        return await this.spawn(args);
      } catch (error) {
        if (!(error instanceof CliTimeout)) throw error;
        console.warn(`  ${error.message}, trying again`);
        return await this.spawn(args);
      }
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }

  private async spawn(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const command = [...this.cli, "r2", "objects", ...args, "--bucket-name", this.bucket];
    const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
    const call = { call: `cf r2 objects ${args.slice(0, 2).join(" ")}`, since: Date.now() };
    this.calls.add(call);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, this.timeoutMs);
    try {
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      if (timedOut) throw new CliTimeout(`${call.call} timed out after ${this.timeoutMs / 1000}s`);
      if (code !== 0) throw new Error(`${call.call} failed: ${stderr.trim()}`);
      return { stdout, stderr };
    } finally {
      clearTimeout(timer);
      this.calls.delete(call);
    }
  }
}

class CliTimeout extends Error {}
