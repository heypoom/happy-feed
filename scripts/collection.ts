import { SOURCE_KINDS, type SourceKind } from "../src/shared/types";

export type Entry = {
  name: string;
  description?: string;
  tags: string[];
  // A kind can list several feeds, like a Medium profile and a publication the person writes for.
  sources: Partial<Record<SourceKind, string | string[]>>;
  archive?: string;
};

export type Collection = {
  name: string;
  description?: string;
  mute: string[];
  entries: Entry[];
};

const METADATA_KEYS = new Set(["name", "description", "mute"]);
const ENTRY_KEYS = new Set<string>(["name", "description", "tags", "archive", ...SOURCE_KINDS]);

export function parseCollection(raw: unknown, file: string): Collection {
  const fail = (path: string, message: string): never => {
    throw new Error(`${file}: ${path} ${message}`);
  };
  const root = record(raw) ?? fail("root", "must be an object");
  const metadata = record(root.metadata) ?? fail("metadata", "must be an object");
  checkKeys(metadata, METADATA_KEYS, "metadata", fail);
  const entries = Array.isArray(root.entries) ? root.entries : fail("entries", "must be an array");

  return {
    name: string(metadata.name) ?? fail("metadata.name", "must be a non-empty string"),
    description: optionalString(metadata.description, "metadata.description", fail),
    mute: stringArray(metadata.mute, "metadata.mute", fail),
    entries: entries.map((value, i) => {
      const at = `entries[${i}]`;
      const entry = record(value) ?? fail(at, "must be an object");
      checkKeys(entry, ENTRY_KEYS, at, fail);
      const name = string(entry.name) ?? fail(`${at}.name`, "must be a non-empty string");
      const label = `${at} (${name})`;
      const sources: Entry["sources"] = {};
      for (const kind of SOURCE_KINDS) {
        const value = entry[kind];
        if (value === undefined) continue;
        sources[kind] = Array.isArray(value)
          ? value.length > 0
            ? value.map((v, j) => url(v, `${label}.${kind}[${j}]`, fail))
            : fail(`${label}.${kind}`, "must list at least one URL")
          : url(value, `${label}.${kind}`, fail);
      }
      if (Object.keys(sources).length === 0) fail(label, `needs at least one of ${SOURCE_KINDS.join(", ")}`);
      return {
        name,
        description: optionalString(entry.description, `${label}.description`, fail),
        tags: stringArray(entry.tags, `${label}.tags`, fail),
        sources,
        archive: entry.archive === undefined ? undefined : url(entry.archive, `${label}.archive`, fail),
      };
    }),
  };
}

type Fail = (path: string, message: string) => never;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalString(value: unknown, path: string, fail: Fail): string | undefined {
  return value === undefined ? undefined : (string(value) ?? fail(path, "must be a non-empty string"));
}

function stringArray(value: unknown, path: string, fail: Fail): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return fail(path, "must be an array of strings");
  return value.map((v, i) => string(v) ?? fail(`${path}[${i}]`, "must be a non-empty string"));
}

function url(value: unknown, path: string, fail: Fail): string {
  const s = string(value) ?? fail(path, "must be a URL string");
  try {
    const parsed = new URL(s);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return s;
  } catch {}
  return fail(path, `is not a valid http(s) URL: ${JSON.stringify(s)}`);
}

function checkKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, fail: Fail): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail(path, `has unknown key(s): ${unknown.join(", ")}`);
}
