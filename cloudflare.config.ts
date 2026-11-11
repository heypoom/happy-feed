import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./worker/index.ts" with { type: "cf-worker" };

export default defineConfig({
  accountId: "160d4d33acd4258d2d67c59d7123a282",
  worker: {
    name: "happy-feed",
    compatibilityDate: "2026-11-11",
    entrypoint,
    domains: ["feed.poom.dev"],
    env: {
      FEED: bindings.r2({ name: "happy-feed" }),
    },
    // Every hour; the Sunday 03:17 UTC run reads every source in full (worker/index.ts).
    triggers: [triggers.scheduled({ schedule: "17 * * * *" })],
  },
});
