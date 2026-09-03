import { inngest } from "./client";
import { runPrivacyRetention } from "@/privacy/retention";

export const runPrivacyRetentionDaily = inngest.createFunction({
  id: "privacy-retention-daily-v1",
  retries: 3,
  triggers: [{ cron: "0 2 * * *" }],
}, async ({ step }) => step.run("apply privacy retention", () => runPrivacyRetention()));
