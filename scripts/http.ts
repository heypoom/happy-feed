const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 2_000;
// YouTube serves a stripped page without the canonical channel link to non-browser user agents.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const RATE_LIMIT_RETRIES = 3;
const MAX_RETRY_AFTER_MS = 60_000;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
    readonly retryAfterMs?: number,
  ) {
    super(`HTTP ${status} from ${url}`);
  }
}

// One retry covers a slow or flaky server (a timeout, a dropped connection or 5xx).
// A 429 means "slow down", so it gets up to three retries, waiting as long as Retry-After asks
// or doubling the wait each time. A 4xx other than 429 is a real answer, so it fails straight away.
export async function withRetry<T>(attempt: () => Promise<T>, delayMs = RETRY_DELAY_MS): Promise<T> {
  for (let retry = 0; ; retry++) {
    try {
      return await attempt();
    } catch (error) {
      const rateLimited = error instanceof HttpError && error.status === 429;
      const permanent = error instanceof HttpError && error.status < 500 && !rateLimited;
      if (permanent || retry >= (rateLimited ? RATE_LIMIT_RETRIES : 1)) throw error;
      const wait = rateLimited ? (error.retryAfterMs ?? delayMs * 2 ** (retry + 1)) : delayMs;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

// Retry-After is either seconds or an HTTP date.
function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS) : undefined;
}

async function request(url: string, accept: string): Promise<Response> {
  return withRetry(async () => {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, "accept-language": "en", accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new HttpError(response.status, url, retryAfterMs(response.headers.get("retry-after")));
    return response;
  });
}

export async function fetchText(url: string): Promise<string> {
  return (await request(url, "*/*")).text();
}

export async function fetchJson<T = unknown>(url: string): Promise<T> {
  return (await (await request(url, "application/json")).json()) as T;
}
