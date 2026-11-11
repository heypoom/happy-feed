import type { ProviderOptions } from ".";
import { parseFeedXml, type RawItem } from "../feed-xml";
import { fetchText } from "../http";

const CHANNEL_ID = /^UC[\w-]{22}$/;

export async function youtube(url: string, { state }: ProviderOptions): Promise<RawItem[]> {
  const channelId = await resolveChannelId(url, state.youtubeIds);
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  return parseFeedXml(await fetchText(feedUrl), feedUrl);
}

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
