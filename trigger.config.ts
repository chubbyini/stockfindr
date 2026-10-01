import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Your project ref: Trigger.dev dashboard → Project settings.
  project: "proj_ixyvognhczqulijstdgs", // stockfindr (sojournerbuilds org)
  dirs: ["./trigger"],
  runtime: "node-24",
  maxDuration: 300, // 5 min cap for the nightly job
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 5000,
      maxTimeoutInMs: 30000,
      factor: 2,
      randomize: true,
    },
  },
});
