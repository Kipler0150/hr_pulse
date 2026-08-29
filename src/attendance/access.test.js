import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAttendanceEnabled: vi.fn(),
  captureException: vi.fn(),
  cookies: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./config", () => ({ assertAttendanceEnabled: mocks.assertAttendanceEnabled }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

import { getAttendanceAccessState, requireAttendanceContext } from "./access";

const organization = {
  id: "organization-id",
  name: "Acme",
  slug: "acme",
  status: "active",
  timezone: "Asia/Manila",
  default_currency: "PHP",
};

function queryResult(result, { single = false } = {}) {
  const builder = {
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(result),
    select: vi.fn(() => builder),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  if (single) delete builder.then;
  return builder;
}

function installAccessFixture({ employeeStatus = "active", profileError = null, role = "employee" } = {}) {
  const profile = queryResult({
    data: profileError ? null : { id: "profile-id", email: "employee@example.test", display_name: "Employee", status: "active" },
    error: profileError,
  }, { single: true });
  const memberships = queryResult({
    data: [{ id: "membership-id", organization_id: organization.id, profile_id: "profile-id", role, status: "active", organizations: organization }],
    error: null,
  });
  const employees = queryResult({
    data: [{ id: "employee-id", organization_id: organization.id, status: employeeStatus }],
    error: null,
  });
  const builders = [profile, memberships, employees];
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id", email: "employee@example.test" } }, error: null }) },
    from: vi.fn(() => builders.shift()),
  };
  mocks.createClient.mockResolvedValue(supabase);
  return supabase;
}

describe("attendance access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: organization.id })) });
  });

  it("derives employee access from the authenticated active organization records, covers: AC-5 and AC-7", async () => {
    installAccessFixture();

    await expect(requireAttendanceContext()).resolves.toMatchObject({
      employeeId: "employee-id",
      organizationId: organization.id,
      timezone: "Asia/Manila",
      selected: { role: "employee" },
    });
    expect(mocks.assertAttendanceEnabled).toHaveBeenCalledOnce();
  });

  it("enforces employee and reviewer role boundaries, covers: AC-5", async () => {
    installAccessFixture({ role: "manager" });
    await expect(requireAttendanceContext()).rejects.toMatchObject({ code: "ATTENDANCE_FORBIDDEN" });

    installAccessFixture({ role: "manager" });
    await expect(requireAttendanceContext({ review: true })).resolves.toMatchObject({ organizationId: organization.id });
  });

  it("rejects an employee whose linked record is inactive, covers: AC-5", async () => {
    installAccessFixture({ employeeStatus: "inactive" });

    await expect(requireAttendanceContext()).rejects.toMatchObject({ code: "EMPLOYEE_NOT_ELIGIBLE" });
  });

  it("sanitizes and reports an unexpected identity provider failure, covers: AC-7", async () => {
    installAccessFixture({ profileError: new Error("private identity detail") });

    await expect(getAttendanceAccessState()).rejects.toMatchObject({ code: "ATTENDANCE_REQUEST_FAILED" });
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "ATTENDANCE_REQUEST_FAILED" }),
      expect.objectContaining({ tags: expect.objectContaining({ action: "attendance.access", organizationId: organization.id }) }),
    );
    expect(JSON.stringify(mocks.captureException.mock.calls)).not.toContain("private identity detail");
  });
});
