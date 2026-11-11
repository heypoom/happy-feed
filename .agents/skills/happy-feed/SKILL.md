---
name: happy-feed
description: Develop the Happy Feed repo (feed.poom.dev). Use when adding sources to the collection, changing the feed client, design or sidebar, touching the build/fetch pipeline, or deploying.
---

# Happy Feed

A personal, calm feed for one owner (Poom) who is escaping doomscrolling. Read first, every time:

- `PRODUCT.md`: who it's for and the product principles. Every change serves "calm, curated, honest about freshness".
- `DESIGN.md`: the visual system (tokens, eight tag hues, components). Update it whenever a component changes.
- `README.md`: sources, collection schema, commands, deploy.

## Map

- `scripts/build-feed.ts` → `aggregate.ts` (per-entry sources, mute, dedupe) → `dearrow.ts` (calmer YouTube titles/thumbnails) → `public/feed.json`. One provider per file in `scripts/providers/`; `http.ts` retries once.
- `src/main.ts` is the whole vanilla-TS client: `render()` → `viewItems()` → `renderControls()` / `renderCard()`, `openViewer()` for Bluesky/Mastodon, `h()` builds DOM. Pure, tested logic lives in `src/shared/`.
- State: filters in the URL (`show`, `tags`, `kind`, `people`, `view`); No AI in `localStorage.hide`; favourites/archive in `localStorage["library:v1"]` (per device, no sync).
- `.cache/` holds YouTube ids, scraped archive pages and DeArrow lookups; CI caches it too.

## Add a source

The owner writes `Name URL (Tag)`.

1. Append one line per entry at the end of `collection/phoomparin.json`, keeping the name exactly as written. One person with several sources is one entry with several keys.
2. Resolve the URL to a working source key: `youtube` for `@handle`; a Substack profile (`substack.com/@x`) is not a feed, so use the publication domain; X has no free route, so follow the person on `bluesky` or `mastodon` instead; a blog whose RSS holds only recent posts gets an `archive` index page too.
3. Done when `bun run fetch` lists the new author with a nonzero count and `0 errors`.

A ninth tag would reuse a hue: add a hue to the `:root`, dark-media and `[data-theme="dark"]` token blocks plus `HUES` in `src/shared/hues.ts`, with ink-on-wash and on-jewel contrast at 4.5:1 or more in both themes.

## Change the UI

Phones are the primary scene (one-handed, at night). Desktop is a 300px sticky rail plus a 2–3 column grid, all inside `@media (min-width: 1024px)`.

1. For design work, use the installed `impeccable` skill; its detector hook runs on UI edits.
2. Verify on the real render, not by reasoning: a puppeteer script (`createRequire("<repo>/package.json")("puppeteer")` against `bun run build` + `vite preview` on :4173) at 390px and 1280px, light and dark. Measure: horizontal overflow is 0, element positions, counts, no page errors. Look at the screenshots.
3. Done when the measurements match the intent, `bun test` shows `0 fail`, `bun run e2e` shows `0 failed`, and `DESIGN.md` describes what shipped.

## Deploy

`bun run deploy` fetches, builds and runs `cf deploy dist`. If `cf` reports it is not authenticated, the owner runs `npx cf auth login` (it opens a browser). The GitHub workflow only deploys once a `CLOUDFLARE_API_TOKEN` repo secret exists; check `gh secret list`.

Done when the live site serves the change: `curl https://feed.poom.dev/feed.json | jq` for data, or grep the live JS bundle for UI. Cloudflare serves a mix of old and new files for a few seconds after deploy, so poll before calling it a failure. If a source times out during the deploy's fetch, deploy again.

## Working agreements

- Commit each verified unit with a scoped prefix (`collection:`, `client:`, `feed:`, `rail:`, `cards:`, `design:`, `docs:`, `deploy:`). The owner pushes.
- E2E specs in `e2e/*.e2e.ts` (not `.spec.ts`, which `bun test` would collect) use `e2e/fixtures.ts`: a fixture `feed.json` and every non-localhost request aborted. Never let an e2e test load the real feed or refetch sources; that sends traffic to other people's sites.
- Read test results by the counts line (`grep -E "(pass|fail)"`); a `tail -1` hid a failing test once.
- Product rules that are easy to break: the viewer never shows replies, and mentions or hashtags are plain text; No AI checks the title, original title and summary, but a title saying "No AI" keeps the post; dedupe keys include the URL query (every YouTube video is `watch?v=`); the feed has no age cutoff.
- Contrast: compute it from the hex tokens. Values built with `color-mix()` come back from `getComputedStyle` as `color(srgb …)` and break naive parsers.
- Put multi-line scripts in a file rather than inline heredocs; the command safety check rejects some inline ones.
- Replies to the owner: short, measured numbers, before/after tables for layout or data changes, and say plainly when something was not verified.
