import type { SourceKind } from "../../src/shared/types";
import type { RawItem } from "../feed-xml";
import { archive, type PageMeta } from "./archive";
import { bluesky } from "./bluesky";
import { bridged } from "./bridge";
import { mastodon } from "./mastodon";
import { rss } from "./rss";
import { substack } from "./substack";
import { website } from "./website";
import { youtube } from "./youtube";

// "head" reads only the newest page of a paged archive; "full" pages back to the first post.
export type Depth = "head" | "full";

// Lookups that rarely change, kept between runs so each run stays cheap.
export type ProviderState = {
  youtubeIds: Record<string, string>;
  archivePages: Record<string, PageMeta>;
};

export type ProviderOptions = { depth: Depth; state: ProviderState };
export type Provider = (url: string, options: ProviderOptions) => Promise<RawItem[]>;
export type ProviderRegistry = Record<SourceKind, Provider> & { archive: Provider };

export function createProviders(env: Record<string, string | undefined>): ProviderRegistry {
  return {
    youtube,
    rss,
    substack,
    website,
    bluesky,
    mastodon,
    twitter: bridged(env.RSS_BRIDGE, "RSS_BRIDGE"),
    facebook: bridged(env.RSS_BRIDGE_FACEBOOK, "RSS_BRIDGE_FACEBOOK"),
    archive,
  };
}
