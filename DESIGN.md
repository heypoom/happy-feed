---
name: Happy Feed
description: A cheerful box of colorful index tiles for creators Poom chose by hand.
colors:
  accent: "#6a4cf5"
  accent-ink: "#ffffff"
  lilac-ground: "#f6f4fd"
  paper-surface: "#ffffff"
  midnight-ink: "#1e1b33"
  dusk-muted: "#5d5878"
  lilac-line: "#e4e0f3"
  night-accent: "#a08bff"
  night-accent-ink: "#14122a"
  night-ground: "#14122a"
  night-surface: "#1e1b3a"
  night-text: "#efecff"
  night-muted: "#aaa5cc"
  night-line: "#2d2950"
  night-focus: "#b9a8ff"
  ink-on-solid: "#1e1b33"
  sunny: "#ffc83d"
  sunny-ink: "#4a2f00"
  leaf: "#2fbf7f"
  leaf-deep: "#1f9e66"
  blush: "#ff9eb8"
  sun-wash: "#fff3c4"
  sun-solid: "#ffc21a"
  sun-ink: "#6b4500"
  tangerine-wash: "#ffe6d5"
  tangerine-solid: "#ff8a3d"
  tangerine-ink: "#7a2f00"
  mint-wash: "#d7f5e6"
  mint-solid: "#2fc489"
  mint-ink: "#0b5a3a"
  sky-wash: "#dbedff"
  sky-solid: "#4a9bff"
  sky-ink: "#0d4482"
  grape-wash: "#ebe4ff"
  grape-solid: "#8a6dff"
  grape-ink: "#3a2196"
  berry-wash: "#ffe0eb"
  berry-solid: "#ff5c93"
  berry-ink: "#84143f"
  teal-wash: "#d4f4f6"
  teal-solid: "#1fbccb"
  teal-ink: "#0b5560"
  lime-wash: "#ebf7d3"
  lime-solid: "#8fce2e"
  lime-ink: "#3b5a0a"
typography:
  display:
    fontFamily: "Bricolage Grotesque, ui-rounded, system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 800
    letterSpacing: "-0.03em"
    fontVariation: "\"opsz\" 48"
  headline-watch:
    fontFamily: "Bricolage Grotesque, ui-rounded, system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 700
    lineHeight: 1.22
    letterSpacing: "-0.015em"
    fontVariation: "\"opsz\" 28"
  headline-read:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "1.3rem"
    fontWeight: 650
    lineHeight: 1.28
    letterSpacing: "-0.01em"
  body-reading:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Bricolage Grotesque, ui-rounded, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  title-tab:
    fontFamily: "Bricolage Grotesque, ui-rounded, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 650
  label-chip:
    fontFamily: "Bricolage Grotesque, ui-rounded, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 600
  label-byline:
    fontFamily: "Bricolage Grotesque, ui-rounded, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  label-tag:
    fontFamily: "Bricolage Grotesque, ui-rounded, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 650
  label-format:
    fontFamily: "Bricolage Grotesque, ui-rounded, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "0.01em"
rounded:
  pill: "999px"
  moment: "32px"
  tile: "24px"
  thumb-mini: "16px"
  focus: "12px"
  monogram: "10px"
spacing:
  hairline-gap: "4px"
  chip-gap: "8px"
  card-gap: "12px"
  gutter: "16px"
  gutter-wide: "24px"
  feed-gap: "28px"
  feed-row-gap-desktop: "36px"
  rail-gap: "40px"
  column: "620px"
  rail: "300px"
components:
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.dusk-muted}"
    typography: "{typography.title-tab}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "40px"
  tab-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
  tab-group:
    backgroundColor: "{colors.paper-surface}"
    rounded: "{rounded.pill}"
    padding: "4px"
  chip:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.label-chip}"
    rounded: "{rounded.pill}"
    padding: "0 14px 0 11px"
    height: "36px"
  chip-selected-sky:
    backgroundColor: "{colors.sky-wash}"
    textColor: "{colors.sky-ink}"
    rounded: "{rounded.pill}"
  format-pill-sky:
    backgroundColor: "{colors.sky-solid}"
    textColor: "{colors.ink-on-solid}"
    typography: "{typography.label-format}"
    rounded: "{rounded.pill}"
    padding: "3px 9px 3px 7px"
  tag-sky:
    textColor: "{colors.sky-ink}"
    typography: "{typography.label-tag}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  read-tile-sky:
    backgroundColor: "{colors.sky-wash}"
    textColor: "{colors.midnight-ink}"
    rounded: "{rounded.tile}"
    padding: "18px 18px 16px"
  watch-thumb:
    rounded: "{rounded.tile}"
  monogram-sky:
    backgroundColor: "{colors.sky-solid}"
    textColor: "{colors.ink-on-solid}"
    rounded: "{rounded.monogram}"
    size: "32px"
  play-button-sky:
    backgroundColor: "{colors.sky-solid}"
    textColor: "{colors.ink-on-solid}"
    size: "52px"
  button:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  theme-toggle:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.midnight-ink}"
    size: "44px"
  moment:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.midnight-ink}"
    rounded: "{rounded.moment}"
    padding: "36px 20px 32px"
---

# Design System: Happy Feed

## Overview

**Creative North Star: "The Tile Box"**

Happy Feed is a box of colorful index tiles. Every tag owns a hue, and every card says up front whether it is something to watch or something to read. The ground is quiet (a cool lilac-white by day, a deep violet night after dark), so the eight tag hues carry the cheer. Everything is chunky and rounded and drawn with a soft hand. Nibble's category-colored tiles and Pi's warm mixed card shapes are the references.

Density is relaxed: one column on a phone, used one-handed in bed, with generous gaps between cards. On desktop a sticky rail holds the controls and the feed becomes a grid of tiles. The sprout mascot appears in the masthead and again at the stopping points ("caught up", "that's everything", empty and error states), so the moments where the feed ends feel friendly.

Light and dark are equal citizens. A header toggle switches between them and there is no settings screen. The voice is warm and never alarmed: no red warnings, no badges asking for attention.

**Key Characteristics:**
- Eight tag hues (sun, tangerine, mint, sky, grape, berry, teal, lime), each with a wash, a solid and an ink.
- Watch and read cards have different anatomy, not only a different label.
- Two voices: Bricolage Grotesque for the UI and watch titles, Literata for reading.
- Pill and 24px-tile geometry everywhere, with drawn icons on a 2px round stroke.
- Soft, cool-tinted shadows, and a sprout mascot that marks the stopping points.

## Colors

A quiet lilac or violet ground under eight bright tag hues, with one violet accent reserved for the active control.

### Primary
- **Electric Violet** (accent; night: night-accent): fills the active format tab and the one action button inside a moment. It also sets the focus ring. It is never used for content.

### Tag Hues
Each hue is a triple. The **wash** is the tile and chip-selected background. The **solid** is used for dots, format pills, play buttons, monograms and the ring around a thumbnail. The **ink** is for text on the wash. The dark theme swaps all three for night versions (see the sidecar): the washes become dark tinted grounds, the solids get brighter and the inks get lighter.
- **Sunflower** (sun-wash / sun-solid / sun-ink)
- **Tangerine** (tangerine-wash / tangerine-solid / tangerine-ink)
- **Mint** (mint-wash / mint-solid / mint-ink)
- **Sky** (sky-wash / sky-solid / sky-ink)
- **Grape** (grape-wash / grape-solid / grape-ink)
- **Berry** (berry-wash / berry-solid / berry-ink)
- **Teal** (teal-wash / teal-solid / teal-ink)
- **Lime** (lime-wash / lime-solid / lime-ink)

### Mascot
- **Sunny** with **Sunny Ink**: the sprout's face. Sunny is also the text-selection highlight.
- **Leaf** and **Leaf Deep**: the sprout's two leaves.
- **Blush**: the sprout's cheeks.

### Neutral
- **Lilac Ground** / **Night Ground**: the page background, also used behind the sticky controls on mobile.
- **Paper Surface** / **Night Surface**: holds the tab group, chips, theme toggle and moments.
- **Midnight Ink** / **Night Text**: primary text.
- **Dusk Muted** / **Night Muted**: idle tabs, bylines, timestamps and moment body copy.
- **Lilac Line** / **Night Line**: chip borders, the rule between chip groups, and the scrollbar.
- **Ink on Solid** (fixed in both themes): text and icons on any tag solid (format pill, play button, monogram). The solids are bright in both themes, so this dark ink does not flip.

### Named Rules
**The Hue Owns the Card Rule.** A card takes the hue of its first tag, falling back to a hash of the author. Tags are assigned hues in sorted order through the sequence sky, sun, berry, mint, grape, tangerine, teal, lime, so neighbors contrast and a small tag set never lands on three warm hues in a row. Never pick a hue by hand for a single card.

**The Accent Is a Control Rule.** Electric Violet marks only the selected tab, the moment action and focus. Content gets its color from the tag hues and never from the accent.

**The Jewel Contrast Rule.** A read tile with no image becomes a jewel tile: the solid mixed into the wash (50% in light), with on-jewel text. On-jewel text must clear 4.5:1 for every hue in both themes. Dark mode mixes 80% solid with ink-on-solid text; the lowest hue, grape, measures 4.62:1.

## Typography

**Display Font:** Bricolage Grotesque (with ui-rounded, system-ui)
**Reading Font:** Literata (with Georgia)

**Character:** Bricolage is the playful, chunky voice for the UI, the wordmark and watch titles. It uses optical sizing (opsz 48 at display size, 28 at titles). Literata is the calm reading voice. It handles anything that is meant to be read: read-card titles, summaries and moment body copy.

### Hierarchy
- **Display** (800, 1.6rem, -0.03em): the wordmark and moment titles ("You're all caught up!").
- **Headline, watch** (Bricolage 700, 1.3rem, 1.22, balanced wrap): video titles.
- **Headline, read** (Literata 650, 1.3rem, 1.28, pretty wrap): article titles.
- **Body, reading** (Literata 400, 1rem, 1.55, max 62ch, clamped to 4 lines): summaries. Moment copy also uses Literata, at 34ch.
- **Body** (Bricolage 400, 16px, 1.5): the base UI text.
- **Labels** (Bricolage): tabs 650 at 0.95rem, chips 600 at 0.9rem, bylines 0.875rem with the author in 700, tags 650 at 0.78rem, format pills 700 at 0.75rem. Counts and timestamps use tabular numbers.

### Named Rules
**The Two Voices Rule.** The title face signals the format. A watch title is set in Bricolage and a read title in Literata. Never set a read title in the display face, and never set UI chrome in Literata.

## Layout

The phone layout is one centered column, 620px max, with a 16px gutter (24px at 720px and up). The masthead respects the top safe area and scrolls away. Under it one bar sticks to the top on the ground color: the icon format tabs and a Filters button, with a strip of active-filter tokens beneath while a filter is on. The bar tucks up while you scroll down into the feed and returns on any scroll up; with reduced motion it stays put. Tags, sources, No AI and people live in the filter sheet. Cards stack 28px apart. Below 400px the wordmark drops to 1.3rem so it stays on one line.

From 1024px the body becomes a two-column grid: a 300px sticky rail and the feed, 40px apart, 1560px max with 32px side padding. The rail holds the masthead and the controls. The tabs stack vertically, the chips wrap, and the rule between tag chips and source chips turns horizontal. The feed becomes a 2-column grid (36px row gap, 28px column gap), and 3 columns from 1440px. A moment shown alone spans every column, centered at 560px max.

Breakpoints: 400px (wordmark), 420px (Filters label), 720px, 1024px, 1440px. Below 1024px the rail element is `display: contents`, so the sticky bar sticks to the page rather than to the rail.

## Elevation & Depth

Depth is soft and ambient. One two-layer shadow, tinted cool violet in light and pure black in dark, lifts the white or violet surfaces off the ground: the tab group, the theme toggle, moments, watch thumbnails, and read tiles on hover. Read tiles rest flat because their color already separates them. Watch thumbnails get a 4px ring in the hue's wash, in addition to the shadow. The round play button has its own deeper drop shadow.

### Named Rules
**The Flat Tile Rule.** Read tiles are flat at rest and lift (2px up, plus the shadow) only on hover. Separate tiles from the ground with color, not with a border or a resting shadow.

## Shapes

The form language is chunky and rounded. Every control is a full pill: tabs, chips, format pills, tags and buttons. Cards and thumbnails are 24px tiles. Moments are rounder still at 32px. Inline thumbnails on read cards use 16px corners, and monograms use 10px. The theme toggle, play button and "go" arrow are circles. Borders are rare: only idle chips have one (1.5px, in the line color). Icons are drawn SVG symbols at 2px stroke with round caps and joins, 20px by default and 13 to 22px in context. Play and format glyphs are filled.

## Components

### New / Anytime
- Two words under the masthead row in the masthead's voice (Bricolage 750, 1.3rem, -0.025em), 22px apart, each a 44px tap target. The selected one is in full ink with a 3px accent underline that draws in from the centre; the other is muted and inks on hover. It scrolls away with the masthead, so the sticky bar stays one row. On a shelf (Favourites, Archive) neither applies, so the row steps aside: the words fade and lift 8px with a 3px blur, then the row folds shut (0.4s ease-out), giving the list 50px back; leaving the shelf reverses it. A page opened on a shelf starts folded, and with reduced motion it simply hides.
- In the URL as `?feed=anytime` (New is the default), and `&stack=N` for a stack dug past the first.

### Pull to Refresh (touch screens)
- From the very top of the page, pulling slides the masthead, bar and feed down with the finger (half the finger's travel, up to 120px), and the sprout drops into the gap on a 46px surface disc beside a surface pill label. Its eyes open and its leaves wave as the pull nears the 72px trigger; it hops while working (still with reduced motion), then the label says what happened for about a second before everything slides back.
- New: "Pull to check for new posts" / "Let go to check" / "Checking…", then "Up to date" or "3 new posts". Anytime: "Pull for another stack" / "Let go to deal" / "Dealing…", then "Stack 2" (the same as Keep digging, so Back returns) or "That's every stack for today".
- The browser's own pull-to-reload is off on touch screens (`overscroll-behavior-y: none`), since a reload deals the same cards.

### Format Tabs
- **Character:** a single pill track that answers "watch or read?".
- **Shape:** a pill group on the surface with 4px inner padding. Each tab is a 40px pill with an icon, a label and a tabular count.
- **States:** idle tabs are muted and take a 7% text tint on hover; the selected tab fills with Electric Violet (aria-pressed). A tab with no matches is disabled in a solid muted tint that still clears 3:1.
- **Bar and rail:** one row of tabs (40px on phones, 34px in the rail). Only the selected tab shows its label and count; the rest are icons (see Rail tabs). The filter sheet repeats them as a 2-by-2 grid with every label and count, so four-digit counts never clip.
- **Counts:** full ink at weight 500, never opacity, so they clear 4.5:1 on the violet pill.

### Chips
- **Style:** a surface pill with a 1.5px line border. Tag chips lead with a 10px dot in the hue's solid. Source chips lead with a muted 16px drawn icon.
- **State:** on hover the border takes the hue's solid. When selected, the chip fills with the hue's wash, with a solid border and ink text. Source chips have no hue and invert to the text color on the ground.

### Watch Card
- **Character:** the picture leads and there is no frame.
- A 16:9 thumbnail with 24px corners, a 4px wash ring and the soft shadow. A circular 52px play button in the hue's solid sits in the lower-left. On hover the image scales to 1.03 and the play button to 1.08. Pressing play swaps in the embed in place.
- Below the thumbnail: the Bricolage title (with an underline in the hue's solid on hover), the byline, then tags.

### Read Card
- **Character:** a tinted tile that works with no image at all.
- A wash tile with 24px corners and 18px padding (22px/24px at 720px and up). The byline leads with a 32px monogram (the author's initial on the hue's solid). The Literata title sits beside an optional 76px (96px) inline thumbnail. The summary below is clamped to four lines. The footer has the tags and a 32px circular "go" arrow, which rotates 45 degrees on hover. The whole tile is the link, and focus outlines the whole tile.
- **Post card:** for Bluesky and Mastodon. A surface-colored speech bubble (24px corners, 6px bottom-left) that leads with the post text in Bricolage 500 at 1.125rem, then an optional image, then tags. Words lead, because social posts have no title. Post images use the 16:9 frame of video thumbnails, and in the desktop grid the text stops at 5 lines, so no single post sets a whole row's height; the viewer shows both in full.
- **People chips:** a second chip row with a round monogram in the person's hue. It filters by author and combines with tags and sources.
- **Post viewer:** a native `<dialog>`. On phones it is a bottom sheet (28px top corners, grab bar, max 88dvh) that slides up 48px; on desktop it is a 540px right panel that slides in. Post text is Bricolage 500 at 1.2rem in `pre-wrap`; images sit in a 2-column grid with 20px outer corners; link cards and quotes are bordered or washed tiles. The footer holds the card actions and one accent "Open on …" link.
- **Card actions:** a heart (favourite) and a check (mark read or watched) in each card's footer, as 36px circles on a 12% ink tint. A pressed heart fills berry, a pressed check fills mint. Video cards carry no format pill; the thumbnail already says "video".
- **Leaving a list:** a card that leaves the current list fades and shrinks out (220ms), then the cards after it glide into the gap (450ms, out-expo). There is no undo bar; the Archive is the undo.
- **List links:** Favourites and Archive sit in the masthead row as 44px circles with an accent count badge, beside the theme toggle, on phones and in the desktop rail alike.
- **Rail tabs:** on every width the All, Posts, Watch and Read tabs share one row. The selected tab grows to show its label and count; the others are icon buttons whose label and count live in the tooltip and accessible name ("Watch, 620 posts"). Idle tabs tint on hover; an empty tab is a solid muted tint (at least 3:1), not faded.
- **Filters button (phones):** a 48px surface circle with a sliders icon beside the tabs, labeled "Filters" from 420px. An accent badge counts the tag, source and people filters that are on. It opens the filter sheet.
- **Filter sheet (phones):** a native `<dialog>` in the post viewer's shape (28px top corners, grab bar, slides up 48px), 92dvh tall. A sticky head with a centered "Filters" title and a 44px close; then the 2-by-2 tabs, the chips (wrapped, on the ground color), Sources and People with "Find a person". A sticky footer holds "Clear all" and a primary "Show N posts" that closes it. Filters apply live underneath; the close button, the footer button, Esc, a backdrop tap and a pull down on the head (over 90px) all close it and keep the selection. From 1024px the same dialog is `display: contents` and its contents are the rail.
- **Active strip (phones):** while a filter is on, a scrolling row of 32px tokens under the bar: a Clear chip pinned to its start, then each tag, source and person in its hue wash with an ×. A tap removes that one. The row fades out at its right edge.
- **People list:** on desktop, a "People · N" heading with a "Find a person" box above a two-column grid of 32px rows (22px monogram, name truncated with the full name in the tooltip). Typing filters as you go, Enter picks the first unselected match, Esc clears the search before it clears filters. Selected people always sort first. Phones show the same list in the filter sheet with 40px rows.
- **Sources:** folded behind a "Sources" toggle chip after the tags, because the format tabs already answer most of that question. It stays open, and cannot be folded, while a source filter is on, and shows how many are on. Source icons never reuse a format icon: YouTube a screen, Blogs a page, Substack an envelope, Bluesky and Mastodon an @.
- **Clear chip:** appears first in the rail's chip list only while a filter is on, as a filled accent pill with an × and the number of active filters. On phones it leads the active strip instead, sticky at its left edge and masked by the ground, and the sheet footer has "Clear all". Esc does the same (when the sheet is closed). It clears tags, sources, people and the format tab, but keeps the current list and No AI.
- **Hide chip:** a neutral chip with an eye-off icon that leads the chip row. It is labeled "No <topic>" and fills with the text color when on, so it reads as a setting rather than a tag.
- **Jewel variant:** with no image, the tile deepens to the jewel mix. The monogram and format pill invert to on-jewel, tags are outlined (1.5px, 45% on-jewel) rather than tinted, and the go arrow sits on a 14% on-jewel tint. The byline time uses full on-jewel ink.

### Byline, Format Pill and Tags
- The byline shows the author in bold, then a format pill (the hue's solid with Ink on Solid text and a filled play or book glyph), then the relative time pushed to the end.
- Tags are pills with a 22% solid tint and hue-ink text.
- **Dealt dates:** a card from today's hand replaces the relative time with an outlined pill in its hue ("From Aug 2022": 1.5px ring at 70% solid, hue-ink text, tag size and weight; on jewel tiles the ring and text are on-jewel). Outlined, so it never reads as a tag. Anytime cards show the month plainly ("Mar 2019"), since every card there is old.

### Moment (Signature)
- **Character:** the sprout's stopping point.
- A surface card with 32px corners and the soft shadow, holding a centered 96px sprout, a display title, Literata body copy, an optional pill button, and optional fine print. The "happy" mood hops and waves its leaves once when it scrolls into view. The "sleepy" mood closes its eyes and is used for the end, empty and error states.
- **Caught up** counts today's hand: "That's this week, plus 8 from the archive. A new hand is dealt tomorrow."
- **End of a stack** (Anytime) is sleepy: "That's today's stack" (or "That's stack 2"), the number of picks, "A fresh stack is dealt tomorrow." and a quiet surface "Keep digging" button, shown only while there is more to deal. Another stack is always a tap, never more scrolling. When the stack deals from the archive (no deck for the day, or a tag, source or person filter) and older posts are still loading, Anytime shows a happy "Dealing today's stack" moment.

### Sync Line and Sync Sheet
- Under a shelf's title: an 18px cloud, a muted status ("On this device only.", "Synced across your devices." with a leaf-green cloud, or "Couldn't sync just now.") and an accent text button, "Sync devices" or "Sync settings".
- The sheet is a short bottom sheet on phones and a 440px centred card from 1024px: a display title, Literata body, one pill input on the ground colour, fine print, and a full-width pill button. Once syncing, it shows the words in a ground-coloured block so the next device can copy them, and a quiet "Stop syncing on this device".

### Masthead
- The 40px sprout and the wordmark on the left (34px and 1.3rem below 400px; 34px and 1.1rem in the desktop rail, so the row fits 300px on one line), the Favourites and Archive circles and the 44px circular theme toggle on the right. On hover the toggle rotates -20 degrees, and the sun and moon icons cross-fade with a rotation.

### Loading Skeleton
- Wash tiles with pulsing bars in a 30% solid tint, in rotating hues.

## Do's and Don'ts

### Do:
- **Do** give every card and tag chip one of the six hues through the shared hue assignment, and use that hue's wash, solid and ink together.
- **Do** keep watch and read visibly distinct in anatomy (a frameless picture versus a tinted tile) and in title voice (Bricolage versus Literata), not only in the format pill.
- **Do** make every read card work with no image. The jewel tile is the image-less form.
- **Do** ship every color change in both themes and through the header toggle. Check text on washes, solids and jewels at 4.5:1 in each theme.
- **Do** use the shared out-expo ease (cubic-bezier(0.16, 1, 0.3, 1)), and let `prefers-reduced-motion` switch off every animation and transition.
- **Do** mark stopping points with the sprout mascot, happy when caught up and sleepy at the end.

### Don't:
- **Don't** build the gray news column of identical photo cards. A card without its hue is off-system.
- **Don't** use Electric Violet as a content or tag color.
- **Don't** add a settings screen for theming. The header toggle is the only theme control.
- **Don't** draw icons as emoji or font glyphs. Add them as SVG symbols on the 2px round stroke.
- **Don't** give read tiles a hard border or a resting shadow. Color separates them, and the shadow is only for hover.
