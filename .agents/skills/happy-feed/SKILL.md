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

- `worker/index.ts` is the Worker: an hourly cron runs `refresh()` (`scripts/sources.ts`: one `SourceRecord` per source in R2 `sources/`, merged by id, head depth once a source has worked) then `publish()` (`scripts/publish.ts`: dedupe, `dearrow.ts`, `recent` and per-year chunks, `feed/manifest.json` last). Its `fetch` serves `/feed/*` from the `FEED` bucket. One provider per file in `scripts/providers/`; `http.ts` retries once.
- `scripts/refresh.ts` (`bun run refresh`) runs the same refresh and publish from the laptop through the `cf` CLI; `--local` fills the bucket `bun run dev` serves. All logic is tested over `MemoryStore` in `scripts/feed.test.ts`.
- `src/main.ts` is the whole vanilla-TS client: `start()` loads the manifest and the `recent` chunk, `addArchive()` folds in the rest; `render()` → `viewItems()` → `renderControls()` / `renderCard()`, `openViewer()` for Bluesky/Mastodon, `h()` builds DOM. Pure, tested logic lives in `src/shared/`.
- State: filters in the URL (`show`, `tags`, `kind`, `people`, `view`); No AI in `localStorage.hide`; favourites/archive in `localStorage["library:v1"]` (per device, no sync), keyed on item ids (`kind:<provider id>`), which must never change.
- R2 `state/` holds YouTube ids, scraped archive pages and DeArrow lookups between runs.

## Add a source

The owner writes `Name URL (Tag)`.

1. Append one line per entry at the end of `collection/phoomparin.json`, keeping the name exactly as written. One person with several sources is one entry with several keys.
2. Resolve the URL to a working source key: `youtube` for `@handle`; a Substack profile (`substack.com/@x`) is not a feed, so use the publication domain; X has no free route, so follow the person on `bluesky` or `mastodon` instead; a blog whose RSS holds only recent posts gets an `archive` index page too.
3. Done when `bun run refresh -- --local --author "<Name>"` lists the new author with a nonzero count and no failure. After the owner deploys, the next hourly run picks the source up; `bun run refresh -- --author "<Name>"` publishes it right away.
4. Any collection edit (a new source, a tag, a rename, a mute word) needs a deploy to stick. The Worker bundles the collection at deploy time and every hourly run publishes from that copy, so a laptop refresh without a deploy is undone at the next :17. Pushing `main` deploys through the GitHub workflow.

A ninth tag would reuse a hue: add a hue to the `:root`, dark-media and `[data-theme="dark"]` token blocks plus `HUES` in `src/shared/hues.ts`, with ink-on-wash and on-jewel contrast at 4.5:1 or more in both themes.

## Change the UI

Phones are the primary scene (one-handed, at night). Desktop is a 300px sticky rail plus a 2–3 column grid, all inside `@media (min-width: 1024px)`.

1. For design work, use the installed `impeccable` skill; its detector hook runs on UI edits.
2. Verify on the real render, not by reasoning: a puppeteer script (`createRequire("<repo>/package.json")("puppeteer")` against `bun run build` + `vite preview` on :4173) at 390px and 1280px, light and dark. Measure: horizontal overflow is 0, element positions, counts, no page errors. Look at the screenshots.
3. Done when the measurements match the intent, `bun test` shows `0 fail`, `bun run e2e` shows `0 failed`, and `DESIGN.md` describes what shipped.

## Deploy

`bun run deploy` builds the site and the Worker and runs `cf deploy`. A deploy changes code only; the feed refreshes on the Worker's cron. If `cf` reports it is not authenticated, the owner runs `npx cf auth login` (it opens a browser). The GitHub workflow only deploys once a `CLOUDFLARE_API_TOKEN` repo secret exists; check `gh secret list`.

Done when the live site serves the change: `curl -s https://feed.poom.dev/feed/manifest.json | jq '.generatedAt, .errors'` for data, or grep the live JS bundle for UI. Cloudflare serves a mix of old and new files for a few seconds after deploy, so poll before calling it a failure. Substack rate-limits Cloudflare's network, so its sources can show as errors after a cron run; `bun run refresh -- --kind substack` refreshes them from the laptop.

## Working agreements

- Commit each verified unit with a scoped prefix (`collection:`, `client:`, `feed:`, `rail:`, `cards:`, `design:`, `docs:`, `deploy:`). The owner pushes.
- E2E specs in `e2e/*.e2e.ts` (not `.spec.ts`, which `bun test` would collect) use `e2e/fixtures.ts`: a fixture manifest with a recent and an older chunk, and every non-localhost request aborted. Never let an e2e test load the real feed or refetch sources; that sends traffic to other people's sites.
- Read test results by the counts line (`grep -E "(pass|fail)"`); a `tail -1` hid a failing test once.
- Product rules that are easy to break: the viewer never shows replies, and mentions or hashtags are plain text; No AI checks the title, original title and summary, but a title saying "No AI" keeps the post; dedupe keys include the URL query (every YouTube video is `watch?v=`); the feed has no age cutoff.
- Contrast: compute it from the hex tokens. Values built with `color-mix()` come back from `getComputedStyle` as `color(srgb …)` and break naive parsers.
- Put multi-line scripts in a file rather than inline heredocs; the command safety check rejects some inline ones.
- Replies to the owner: short, measured numbers, before/after tables for layout or data changes, and say plainly when something was not verified.
