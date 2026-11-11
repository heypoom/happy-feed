import { truncate, type RawItem } from "../feed-xml";
import type { ProviderOptions } from ".";
import { fetchJson } from "../http";
import { paged, withFallback } from "./paged";
import { rss } from "./rss";

type ArchivePage = {
  posts: { canonical_url: string; title: string; subtitle?: string | null; description?: string | null; cover_image?: string | null; post_date: string }[];
  nextCursor?: string | null;
};

export function substack(url: string, { depth }: ProviderOptions): Promise<RawItem[]> {
  const origin = new URL(url).origin;
  return withFallback(
    () =>
      paged<string>(depth, async (cursor) => {
        const page = await fetchJson<ArchivePage>(
          `${origin}/api/v1/archive?sort=new&limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        return {
          items: page.posts.map((post) => ({
            id: post.canonical_url,
            title: post.title,
            url: post.canonical_url,
            summary: truncate(post.description || post.subtitle || "") || undefined,
            image: post.cover_image || undefined,
            publishedAt: new Date(post.post_date).toISOString(),
          })),
          next: page.nextCursor || undefined,
        };
      }),
    () => rss(`${origin}/feed`),
  );
}
