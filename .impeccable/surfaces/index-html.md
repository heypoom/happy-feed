---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["src/main.ts","src/style.css"]
---

---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["src/main.ts","src/style.css"]
---

# Feed surface

Scope: the single feed page (`index.html`, `src/main.ts`, `src/style.css`). Visitor mode: Experience. Poom scrolls one-handed on a phone in bed at night, on the go, and in a desktop tab. Job: scroll to something worth watching or reading, then stop gently when caught up. Content: real items from the published feed (`bun run refresh -- --local` fills the local copy). Many blogs (Stack Diver) have no images, so the read layout is text-first. Constraints: light and dark with a header toggle and no settings screen; filters by tag and source in the URL; reduced motion respected.

Pinned references (user, 2026-11-11): Nibble "For you" for category-colored tiles and the Watch/Listen split; Pi for warm mixed card shapes. Also pinned: tag colors, distinct watch and read cards, a mascot when you're caught up, a theme toggle.

## Direction contract

THESIS: A box of colorful index tiles. Every tag owns a hue, and every card says up front whether it is something to watch or something to read. It refuses the gray news column of identical photo cards.

OWN-WORLD: A full palette of six tag hues (sunflower, tangerine, mint, sky, grape, berry). Each has a soft wash and a deep jewel tone. The light ground is a cool lilac-white and the dark ground is a deep violet night. Bricolage Grotesque is the voice for the UI and watch titles. Literata is the reading voice for read titles and summaries. Shapes are chunky and rounded, with drawn icons on a 2px stroke.

STORY: Poom sees at once what's new, whether to watch or read, and which corner of their interests each card comes from. They stop when the mascot says they're caught up.

FIRST VIEWPORT: A small sprout mascot with the "Happy Feed" wordmark and the theme toggle. Below them, Everything/Watch/Read tabs, then a scrolling row of tag chips with color dots. The first card fills the rest of the screen.

FORM: Pinned brief. A Nibble-style tile feed, rendered for the web. seed:0e7e0b14c6e63806 (rolled as a record; the user-pinned direction overrides the deal)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
