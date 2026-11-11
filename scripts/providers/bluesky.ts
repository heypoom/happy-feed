import { truncate, type RawItem } from "../feed-xml";
import type { ProviderOptions } from ".";
import { fetchJson } from "../http";
import { paged, withFallback } from "./paged";
import { rss } from "./rss";

type Embed = {
  $type?: string;
  images?: { thumb?: string }[];
  external?: { thumb?: string };
  thumbnail?: string;
  media?: Embed;
};
type AuthorFeed = {
  feed: { reason?: unknown; post: { uri: string; record: { text?: string; createdAt: string }; embed?: Embed } }[];
  cursor?: string;
};

function thumbnail(embed: Embed | undefined): string | undefined {
  if (!embed) return undefined;
  return embed.images?.[0]?.thumb ?? embed.external?.thumb ?? embed.thumbnail ?? thumbnail(embed.media);
}

// A profile URL like https://bsky.app/profile/<handle>. The public AppView pages through every post;
// replies and reposts are left out so the feed stays this person's own words.
export function bluesky(url: string, { depth }: ProviderOptions): Promise<RawItem[]> {
  const profile = url.replace(/\/+$/, "");
  const handle = profile.split("/").at(-1)!;
  return withFallback(
    () =>
      paged<string>(depth, async (cursor) => {
        const page = await fetchJson<AuthorFeed>(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&filter=posts_no_replies&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        return {
          items: page.feed
            .filter((entry) => !entry.reason)
            .map(({ post }) => ({
              id: post.uri,
              title: "",
              url: `${profile}/post/${post.uri.split("/").at(-1)}`,
              summary: truncate((post.record.text ?? "").replace(/\s+/g, " ").trim()) || undefined,
              image: thumbnail(post.embed),
              publishedAt: new Date(post.record.createdAt).toISOString(),
            })),
          next: page.cursor,
        };
      }),
    () => rss(`${profile}/rss`),
  );
}
