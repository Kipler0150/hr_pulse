import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { processPayroll } from "@/inngest/payroll";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processPayroll],
});
