import { and, eq } from "drizzle-orm";
import { employees } from "@/db/schema";
import { validateDate, validateUuid } from "@/db/validation";
import { writeAuditEvent } from "./audit";

export async function deactivateEmployee(db, {
  organizationId,
  employeeId,
  actorProfileId,
  terminationDate,
}) {
  validateUuid(organizationId, "organizationId");
  validateUuid(employeeId, "employeeId");
  validateDate(terminationDate, "terminationDate");
  validateUuid(actorProfileId, "actorProfileId");

  return db.transaction(async (transaction) => {
    const [employee] = await transaction
      .select()
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)));
    if (!employee) throw new Error("Employee not found");
    if (employee.status === "terminated") throw new Error("Employee is already terminated");

    const [updated] = await transaction
      .update(employees)
      .set({ status: "terminated", terminationDate, updatedAt: new Date() })
      .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)))
      .returning();

    await writeAuditEvent(transaction, {
      organizationId,
      actorProfileId,
      action: "employee.deactivated",
      entityType: "employee",
      entityId: employeeId,
      metadata: { previousStatus: employee.status },
    });
    return updated;
  });
}
