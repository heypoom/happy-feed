# Happy Feed

A calm, endless feed of creators I chose, served at https://feed.poom.dev. YouTube videos, blog posts, Substack issues, and Bluesky and Mastodon posts land in one scroll.

- **Watch, Read and Posts tabs**, with filters by tag, source and person. Filters live in the URL; Clear (or Esc) resets them.
- **No AI** hides posts that mention AI, unless the title says "No AI".
- **Favourites and Archive.** Marking a post read or watched moves it out of the feed. Both lists stay in your browser. To share them across devices, open Favourites or Archive, tap Sync devices, and type the same sync words on each device; there is no account, and guests keep everything on the device.
- **In-app viewer** for Bluesky and Mastodon posts: full text and images, never replies.
- **"You're all caught up"** after this week's posts, then the full archive below.
- **Calmer YouTube titles and thumbnails** from [DeArrow](https://dearrow.ajay.app)'s community submissions, where they exist. Hover a title to see the original.

## Run it

```sh
bun install
bun run refresh -- --local   # fetches every source into the local R2 bucket that dev serves
bun run dev        # http://localhost:5173, the site and the Worker
bun test
bun run typecheck  # the client and scripts, then the Worker against the Workers runtime types
bun run e2e        # Playwright on phone and desktop, against a fixture feed with the network blocked
bun run build      # the site and the Worker in .cloudflare/output/
bun run og         # re-renders public/og.png from scripts/og/og.html
```

## Collections

Every `collection/*.json` file is loaded and merged. A source listed in several collections is fetched once, under the first entry's name (files load alphabetically), with every listing's tags and every listing collection's `mute` words. Unknown keys and bad URLs fail the build with the file and entry named.

```jsonc
{
  "metadata": {
    "name": "Poom's Faves",
    "mute": ["politics"] // optional; posts whose title or summary contain these are dropped
  },
  "entries": [
    {
      "name": "3Blue1Brown",  // shown as the card author
      "tags": ["Math"],       // filter chips
      "youtube": "https://www.youtube.com/@3blue1brown",
      "substack": "https://3blue1brown.substack.com"
    }
  ]
}
```

An entry needs at least one source. Every post a source publishes is kept, with no age cutoff.

| Key | Reads | Depth |
| --- | --- | --- |
| `youtube` | The channel's feed (`@handle` or `/channel/UC…`) | Latest 15 videos |
| `rss` | RSS or Atom | Whatever the feed holds |
| `website` | The feed a page advertises | Same |
| `archive` | An index page linking every post (`/YYYY/MM/DD/…`), for blogs whose RSS holds only recent posts. Pair it with `rss`. | Every linked post |
| `substack` | The publication's archive API | Every post |
| `bluesky` | `https://bsky.app/profile/<handle>` via the public API, no replies or reposts | Every post |
| `mastodon` | `https://<server>/@<user>` via the server's API, no replies or boosts | Every post |

Every request is retried once after a timeout, dropped connection or 5xx, and up to three times after a 429, honouring `Retry-After`. API sources fall back to RSS if the first archive page fails; a later page failing keeps the posts already fetched. A source that still fails keeps the posts it had and lands in the manifest's `errors`, and the rest publishes. `twitter` and `facebook` keys exist but need a self-hosted RSS bridge (`RSS_BRIDGE`, `RSS_BRIDGE_FACEBOOK`); no free route to X exists.

DeArrow lookups are cached in `state/dearrow.json` in the bucket: new videos are re-checked every 6 hours, older ones every few days to a month. DeArrow's API and data are [CC BY-NC-SA 4.0](https://github.com/ajayyy/SponsorBlock/wiki/Database-and-API-License), credited at the end of the feed.

## How the feed stays fresh

The site is a Cloudflare Worker at `feed.poom.dev` (`cloudflare.config.ts`, `worker/index.ts`) with an R2 bucket, `happy-feed`, bound as `FEED`. A cron runs the Worker at minute 17 of every hour:

1. **Refresh.** Each source has a record in `sources/<key>.json` with every post ever fetched from it and how the last fetch went. A source that has worked before is read at head depth (the newest page of a Substack, Bluesky or Mastodon archive). New posts join the stored ones, and a failed fetch keeps them. The Sunday 03:17 UTC run reads every page.
2. **Publish.** The Worker merges the records, applies DeArrow, and writes `feed/items-<label>-<hash>.json` chunks: `recent` (since the 1st of last month, UTC), then one per year. It writes `feed/manifest.json` last, and deletes chunks that nothing has referenced for 2 days.

The client fetches the manifest on every load, then the `recent` chunk, and paints. The rest of the archive arrives behind it. A link with a filter or a shelf waits for every chunk, because its counts and people need the whole feed. Chunks are named by their content, so a phone downloads an unchanged year once.

To refresh from your machine instead (Substack rate-limits Cloudflare's network), run the same code with `bun run refresh`. Options:

- `--kind substack` or `--author "Name"` refresh only the matching sources (each can repeat).
- `--full` reads every page.
- `--local` writes to the local bucket that `bun run dev` serves instead of the live one.

## Deploy

- **From your machine:** `bun run deploy` builds the site and the Worker and runs `cf deploy`. Needs Node.js 22.18+ and `npx cf auth login`. Deploys change code only; the feed itself refreshes on the cron.
- **From GitHub:** `.github/workflows/deploy.yml` tests and deploys on every push to `main` and on demand. It needs a `CLOUDFLARE_API_TOKEN` repository secret made from the "Edit Cloudflare Workers" token template.

## Agent skills

Built with [Claude Code](https://claude.com/claude-code). Skills are installed locally, not committed:

- Cloudflare skills, pinned in `skills-lock.json`: `npx skills experimental_install`
- [Impeccable](https://impeccable.style) design skill: `npx impeccable install`

## License

[MIT](LICENSE)
