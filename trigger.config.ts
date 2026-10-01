import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Your project ref: Trigger.dev dashboard → Project settings.
  // (`npx trigger.dev@latest init` fills this in automatically.)
  project: "proj_replace_with_your_ref",
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
