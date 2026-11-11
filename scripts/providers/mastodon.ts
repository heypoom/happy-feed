import { htmlToText, truncate, type RawItem } from "../feed-xml";
import type { ProviderOptions } from ".";
import { fetchJson } from "../http";
import { paged, withFallback } from "./paged";
import { rss } from "./rss";

type Status = {
  id: string;
  url: string;
  created_at: string;
  content: string;
  media_attachments: { type: string; preview_url?: string }[];
};

// A profile URL like https://hachyderm.io/@<user>. The server's public API pages through every post,
// without replies or boosts.
export function mastodon(url: string, { depth }: ProviderOptions): Promise<RawItem[]> {
  const profile = new URL(url);
  const acct = profile.pathname.replace(/^\/@/, "").replace(/\/+$/, "");
  return withFallback(
    async () => {
      const account = await fetchJson<{ id: string }>(`${profile.origin}/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`);
      return paged<string>(depth, async (maxId) => {
        const statuses = await fetchJson<Status[]>(
          `${profile.origin}/api/v1/accounts/${account.id}/statuses?exclude_replies=true&exclude_reblogs=true&limit=40${maxId ? `&max_id=${maxId}` : ""}`,
        );
        return {
          items: statuses.map((status) => ({
            id: status.url,
            title: "",
            url: status.url,
            summary: truncate(htmlToText(status.content)) || undefined,
            image: status.media_attachments.find((media) => media.type === "image")?.preview_url,
            publishedAt: new Date(status.created_at).toISOString(),
          })),
          next: statuses.at(-1)?.id,
        };
      });
    },
    () => rss(`${url.replace(/\/+$/, "")}.rss`),
  );
}
