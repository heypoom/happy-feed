# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One user: Poom. They are prone to doomscrolling and keep landing on feeds that leave them sad (AI psychosis, politics). They open Happy Feed when the urge to scroll hits. That happens on the phone in bed late at night, on the phone in short bursts on the go, and in a desktop tab between work. Other people are not an audience. Other collection files are Poom's own themed lists.

## Product Purpose

Happy Feed lets Poom keep the scrolling habit and replaces what fills it. Everything in the feed comes from creators Poom chose by hand in `collection/*.json`. YouTube, blogs and RSS, and X (through a bridge) all become one kind of card. Success means a session that feels worth having and ends with a gentle cue to stop once Poom is caught up. A session that went on forever does not count as success.

## Positioning

There is no ranking for engagement. Only hand-picked sources are shown, plus a mute list that drops topics that cause harm. The feed is varied (no more than two cards in a row from one creator) and honest about freshness ("You're caught up").

## Operating Context

- A Cloudflare Worker at https://feed.poom.dev refreshes every source hourly and publishes the feed to R2, so it stays fresh without a deploy. A phone first loads a small manifest and the last month or so of posts, then the archive behind it. Substack rate-limits Cloudflare's network, so Poom refreshes it from the laptop (`bun run refresh -- --kind substack`).
- Collections are edited by hand as JSON. Each entry has a name, tags, and provider URLs (`youtube`, `rss`, `substack`, `website`, `twitter`, `facebook`).
- Filters by tag, source, and person live in the URL, so they can be bookmarked.
- YouTube titles and thumbnails are replaced with DeArrow's crowdsourced, non-sensational versions when a trusted one exists (top submission, locked or not downvoted); the original title stays on hover, and the No AI filter still checks it. DeArrow data is CC BY-NC-SA 4.0, fine for this personal, non-commercial feed with credit.
- Tapping a Bluesky or Mastodon post opens it in an in-app viewer (a bottom sheet on phones, a side panel on desktop) with the full text, images, link card, and quoted post, fetched from each network's public API. Replies are never shown, and mentions and hashtags are not links, so the viewer never leads back into the network. One "Open on Bluesky/Mastodon" link is the only exit.
- Every card can be favourited or marked read/watched. Marked posts leave the feed and rest in the Archive; Favourites and Archive are their own lists (`?view=favourites`, `?view=archive`). Both live in the browser's storage with a copy of each post, so they survive the post aging out of the feed, but they do not sync between devices.
- Topic excludes are presets toggled in the app (today: "No AI", which hides posts whose title or summary mentions AI, Artificial Intelligence or Superintelligence, except posts whose title says "No AI", which stay visible). The choice persists on the device, unlike the URL filters. The build-time `mute` list in a collection still removes posts for everyone.

## Capabilities and Constraints

- YouTube, RSS and website (feed autodiscovery) work without credentials.
- X and Facebook need a self-hosted RSS bridge (`RSS_BRIDGE`, `RSS_BRIDGE_FACEBOOK`). No free route exists. That was measured 2026-11-11: nitter 410, xcancel 451, X syndication 429, and 10 public Nitter instances returned no tweets (nitter.net now shows X's cease-and-desist notice). People who also post on Bluesky or Mastodon are followed there instead, through their free public RSS.
- There is no age cutoff or per-source cap: the feed keeps every post a source publishes, and infinite scroll reaches all of it. Substack, Bluesky and Mastodon are backfilled through their public archive APIs (every post, without replies or reposts), falling back to RSS if an API fails. A blog whose RSS holds only recent posts can add an `archive` index page, which is scraped for dated post links. YouTube stays at the latest 15 videos per channel, because going deeper needs a YouTube Data API key.
- Stack: Bun, TypeScript, Vite, vanilla TS client, static hosting on a Cloudflare Worker (deployed with the `cf` CLI).
- Undecided: where stopping cues go beyond the "caught up" divider. For example, whether older posts should feel different or need a deliberate tap to continue.

## Brand Commitments

The working name is "Happy Feed". The tone is calm and warm, never guilt-inducing.

## Evidence on Hand

The real content is Poom's collection in `collection/phoomparin.json`, which covers creative coding, coding, HCI and computer science creators. There are no testimonials or users beyond Poom, and none should be invented.

## Product Principles

1. **Curated over clever.** The feed only shows what Poom chose, and nothing is recommended by an algorithm.
2. **Nudge, don't nag.** Stopping cues are gentle and honest about freshness. They never shame or block.
3. **Variety is calming.** No single creator or topic dominates a stretch of the scroll.
4. **Sad stays out.** The mute list and the choice of sources protect mood before novelty.
5. **Works one-handed in the dark.** Phone at night is the hardest case to get right.

## Accessibility & Inclusion

Night-time reading on a phone needs comfortable dark mode and readable type at arm's length. Respect `prefers-reduced-motion`.
