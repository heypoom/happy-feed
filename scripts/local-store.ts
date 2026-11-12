import type { Subprocess } from "bun";
import type { Store, StoredObject } from "./store";

// A local call answers in milliseconds, so ten seconds only trips on a stuck runtime.
const REQUEST_TIMEOUT_MS = 10_000;

// The local R2 bucket that `bun run dev` serves, through one runtime that `local-r2.mjs` keeps up for
// the whole run instead of the fresh runtime `cf --local` boots for every object.
export class LocalR2Store implements Store {
  private readonly calls = new Set<{ call: string; since: number }>();

  private constructor(
    private readonly child: Subprocess<"pipe", "pipe", "inherit">,
    private readonly origin: string,
    private readonly timeoutMs: number,
  ) {}

  static async open(bucket: string, { helper = "scripts/local-r2.mjs", state = [] as string[], timeoutMs = REQUEST_TIMEOUT_MS } = {}): Promise<LocalR2Store> {
    const child = Bun.spawn(["node", helper, bucket, ...state], { stdin: "pipe", stdout: "pipe", stderr: "inherit" });
    const reader = child.stdout.getReader();
    let output = "";
    const deadline = setTimeout(() => child.kill(), 60_000);
    try {
      while (!/ready (\d+)/.test(output)) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`the local R2 runtime exited before it was ready${output ? `: ${output.trim()}` : ""}`);
        output += new TextDecoder().decode(value);
      }
    } finally {
      clearTimeout(deadline);
      reader.releaseLock();
    }
    return new LocalR2Store(child, `http://127.0.0.1:${/ready (\d+)/.exec(output)![1]}`, timeoutMs);
  }

  async close(): Promise<void> {
    this.child.stdin.end();
    await this.child.exited;
  }

  inFlight(): { call: string; since: number }[] {
    return [...this.calls];
  }

  async get<T>(key: string): Promise<T | undefined> {
    const response = await this.request("get", key, `/${encodeURIComponent(key)}`);
    if (response.status === 404) return undefined;
    return JSON.parse(await this.body(response, "get", key)) as T;
  }

  async put(key: string, value: unknown): Promise<void> {
    const response = await this.request("put", key, `/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify(value), headers: { "content-type": "application/json" } });
    await this.body(response, "put", key);
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ prefix, ...(cursor ? { cursor } : {}) });
      const page = JSON.parse(await this.body(await this.request("list", prefix, `?${query}`), "list", prefix)) as {
        result: { key: string; last_modified: string }[];
        result_info: { cursor?: string; is_truncated?: string };
      };
      objects.push(...page.result.map((object) => ({ key: object.key, uploaded: new Date(object.last_modified) })));
      cursor = page.result_info.is_truncated === "true" ? page.result_info.cursor : undefined;
    } while (cursor);
    return objects;
  }

  async delete(key: string): Promise<void> {
    const response = await this.request("delete", key, `/${encodeURIComponent(key)}`, { method: "DELETE" });
    if (response.status !== 404) await this.body(response, "delete", key);
  }

  private async body(response: Response, verb: string, key: string): Promise<string> {
    const text = await response.text();
    if (!response.ok) throw new Error(`local R2 ${verb} ${key} failed: HTTP ${response.status} ${text.slice(0, 200)}`);
    return text;
  }

  // A stuck request is dropped and tried once more, like a stuck cf call.
  private async request(verb: string, key: string, path: string, init: RequestInit = {}): Promise<Response> {
    const call = { call: `local R2 ${verb} ${key}`, since: Date.now() };
    this.calls.add(call);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fetch(`${this.origin}${path}`, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "TimeoutError")) throw error;
          const message = `${call.call} timed out after ${this.timeoutMs / 1000}s`;
          if (attempt > 0) throw new Error(message);
          console.warn(`  ${message}, trying again`);
        }
      }
    } finally {
      this.calls.delete(call);
    }
  }
}
