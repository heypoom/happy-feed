import type { RawItem } from "../feed-xml";
import { rss } from "./rss";

// Twitter and Facebook have no free public feed, so they go through an RSSHub-style bridge
// whose URL template contains `{handle}`.
export function bridged(template: string | undefined, envVar: string): (url: string) => Promise<RawItem[]> {
  return async (url) => {
    if (!template) throw new Error(`no bridge configured (set ${envVar} to a URL template with {handle})`);
    const handle = new URL(url).pathname.split("/").find(Boolean);
    if (!handle) throw new Error(`no handle in ${url}`);
    return rss(template.replaceAll("{handle}", encodeURIComponent(handle)));
  };
}
