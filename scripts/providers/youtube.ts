import type { Depth, Provider, ProviderOptions } from ".";
import { parseFeedXml, truncate, type RawItem } from "../feed-xml";
import { fetchJson, fetchText } from "../http";
import { paged, withFallback } from "./paged";

const CHANNEL_ID = /^UC[\w-]{22}$/;
const API = "https://www.googleapis.com/youtube/v3/playlistItems";

type PlaylistPage = {
  items: {
    snippet: { title: string; description?: string; thumbnails?: Record<string, { url: string }>; resourceId: { videoId: string } };
    contentDetails?: { videoPublishedAt?: string };
  }[];
  nextPageToken?: string;
};

// The channel's RSS feed holds only its latest 15 uploads, Shorts included. With an API key, a full run
// lists every long-form upload instead (one quota unit per 50 videos), and hourly runs stay on the free
// feed, reading the newest 50 through the API only when the feed fails (YouTube takes it down at times).
export function youtube(apiKey: string | undefined): Provider {
  return async (url, { depth, state }: ProviderOptions) => {
    const channelId = await resolveChannelId(url, state.youtubeIds);
    const feed = () => channelFeed(channelId);
    if (!apiKey) return feed();
    if (depth === "head") {
      return feed().catch((error: unknown) => {
        console.warn(`  channel feed failed, using the API: ${error instanceof Error ? error.message : String(error)}`);
        return uploads(channelId, apiKey, "head");
      });
    }
    return withFallback(() => uploads(channelId, apiKey, "full"), feed);
  };
}

async function channelFeed(channelId: string): Promise<RawItem[]> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  return parseFeedXml(await fetchText(feedUrl), feedUrl).filter((item) => !isShort(item.url));
}

// "UULF" + the channel id is YouTube's playlist of a channel's long-form videos: every upload except Shorts
// and live streams. It is not documented, but it is the only listing that leaves Shorts out without a
// per-video lookup. Ids match the RSS feed's (`yt:video:<id>`), so the two copies of a video merge.
async function uploads(channelId: string, key: string, depth: Depth): Promise<RawItem[]> {
  const playlistId = `UULF${channelId.slice(2)}`;
  return paged<string>(depth, async (pageToken) => {
    const params = new URLSearchParams({ part: "snippet,contentDetails", playlistId, maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await fetchJson<PlaylistPage>(`${API}?${params}`, { "x-goog-api-key": key });
    return { items: page.items.flatMap(toRawItem), next: page.nextPageToken };
  });
}

// Private and deleted videos stay in the playlist with no publish date.
function toRawItem({ snippet, contentDetails }: PlaylistPage["items"][number]): RawItem[] {
  const publishedAt = contentDetails?.videoPublishedAt;
  if (!publishedAt) return [];
  const { videoId } = snippet.resourceId;
  const thumbnails = snippet.thumbnails ?? {};
  return [
    {
      id: `yt:video:${videoId}`,
      title: snippet.title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      summary: truncate(snippet.description ?? "") || undefined,
      image: (thumbnails.high ?? thumbnails.medium ?? thumbnails.default)?.url,
      videoId,
      publishedAt: new Date(publishedAt).toISOString(),
    },
  ];
}

export const isShort = (url: string) => /youtube\.com\/shorts\//.test(url);

async function resolveChannelId(url: string, ids: Record<string, string>): Promise<string> {
  const direct = /\/channel\/(UC[\w-]{22})/.exec(url)?.[1];
  if (direct) return direct;
  const cached = ids[url];
  if (cached) return cached;

  const html = await fetchText(url);
  const id = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html)?.[1];
  if (!id || !CHANNEL_ID.test(id)) throw new Error(`could not find a channel id on ${url}`);
  ids[url] = id;
  return id;
}
