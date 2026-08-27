import { inngest } from "./client";
import { PAYROLL_EVENT_NAME, PAYROLL_EVENT_VERSION } from "@/payroll/queue";
import { failPayrollRun, processPayrollRun } from "@/payroll/processing";

export const processPayroll = inngest.createFunction({
  id: "process-payroll-run-v1",
  retries: 3,
  singleton: { key: "event.data.organizationId", mode: "skip" },
  triggers: [{ event: PAYROLL_EVENT_NAME }],
  onFailure: async ({ event, error }) => {
    const original = event.data.event.data;
    await failPayrollRun({
      runId: original.runId,
      organizationId: original.organizationId,
      generation: original.generation,
      error,
    });
  },
}, async ({ event, step }) => {
  if (event.data.eventVersion !== PAYROLL_EVENT_VERSION) return { status: "ignored_version" };
  return step.run("process frozen payroll", () => processPayrollRun({
    runId: event.data.runId,
    organizationId: event.data.organizationId,
    generation: event.data.generation,
    eventId: event.id,
  }));
});
