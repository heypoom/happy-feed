# Happy Feed

A calm, endless feed of creators I chose, served at https://feed.poom.dev. YouTube videos, blog posts, Substack issues, and Bluesky and Mastodon posts land in one scroll.

- **Watch, Read and Posts tabs**, with filters by tag, source and person. Filters live in the URL; Clear (or Esc) resets them.
- **No AI** hides posts that mention AI, unless the title says "No AI".
- **Favourites and Archive.** Marking a post read or watched moves it out of the feed. Both lists stay in your browser and don't sync between devices.
- **In-app viewer** for Bluesky and Mastodon posts: full text and images, never replies.
- **"You're all caught up"** after this week's posts, then the full archive below.
- **Calmer YouTube titles and thumbnails** from [DeArrow](https://dearrow.ajay.app)'s community submissions, where they exist. Hover a title to see the original.

## Run it

```sh
bun install
bun run fetch   # writes public/feed.json from collection/*.json
bun run dev     # http://localhost:5173
bun test
bun run e2e     # Playwright on phone and desktop, against a fixture feed with the network blocked
bun run build   # static site in dist/
bun run og      # re-renders public/og.png from scripts/og/og.html
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

Every request is retried once after a timeout, dropped connection or 5xx, and up to three times after a 429, honouring `Retry-After`. API sources fall back to RSS if the first archive page fails; a later page failing keeps the posts already fetched. A source that still fails lands in `feed.json`'s `errors`, and the rest builds. `twitter` and `facebook` keys exist but need a self-hosted RSS bridge (`RSS_BRIDGE`, `RSS_BRIDGE_FACEBOOK`); no free route to X exists.

DeArrow lookups are cached in `.cache/dearrow.json`: new videos are re-checked every 6 hours, older ones every few days to a month. DeArrow's API and data are [CC BY-NC-SA 4.0](https://github.com/ajayyy/SponsorBlock/wiki/Database-and-API-License), credited at the end of the feed.

## Deploy

The site is an assets-only Cloudflare Worker at `feed.poom.dev` (`cloudflare.config.ts`).

- **From your machine:** `bun run deploy` fetches, builds, and runs `cf deploy dist`. Needs Node.js 22.18+ and `npx cf auth login`.
- **From GitHub:** `.github/workflows/deploy.yml` does the same on every push to `main`, every 3 hours, and on demand. It needs a `CLOUDFLARE_API_TOKEN` repository secret made from the "Edit Cloudflare Workers" token template.

## Agent skills

Built with [Claude Code](https://claude.com/claude-code). Skills are installed locally, not committed:

- Cloudflare skills, pinned in `skills-lock.json`: `npx skills experimental_install`
- [Impeccable](https://impeccable.style) design skill: `npx impeccable install`

## License

[MIT](LICENSE)
