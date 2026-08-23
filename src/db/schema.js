import { sql } from "drizzle-orm";
import {
	bigint,
	date,
	foreignKey,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const organizationStatus = pgEnum("organization_status", ["active", "inactive"]);
export const profileStatus = pgEnum("profile_status", ["active", "inactive"]);
export const membershipRole = pgEnum("membership_role", ["administrator", "manager", "employee"]);
export const employeeStatus = pgEnum("employee_status", ["active", "inactive", "terminated"]);
export const payFrequency = pgEnum("pay_frequency", ["weekly", "biweekly", "semimonthly", "monthly"]);
export const attendanceSource = pgEnum("attendance_source", ["employee", "manager", "administrator", "system"]);
export const attendanceStatus = pgEnum("attendance_status", ["open", "completed"]);
export const leaveType = pgEnum("leave_type", ["paid", "unpaid", "sick", "other"]);
export const leaveStatus = pgEnum("leave_status", ["draft", "submitted", "approved", "declined", "cancelled"]);
export const payrollStatus = pgEnum("payroll_status", ["draft", "processing", "completed", "failed"]);
export const payoutStatus = pgEnum("payout_status", ["pending", "processing", "paid", "failed"]);
export const payslipStatus = pgEnum("payslip_status", ["pending", "generated", "failed"]);

export const organizations = pgTable("organizations", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: varchar("name", { length: 200 }).notNull(),
	slug: varchar("slug", { length: 100 }).notNull(),
	status: organizationStatus("status").default("active").notNull(),
	timezone: varchar("timezone", { length: 100 }).notNull(),
	defaultCurrency: varchar("default_currency", { length: 3 }).notNull(),
	regionCode: varchar("region_code", { length: 10 }),
	...timestamps,
}, (table) => [uniqueIndex("organizations_slug_unique").on(table.slug)]);

export const profiles = pgTable("profiles", {
	id: uuid("id").defaultRandom().primaryKey(),
	authUserId: uuid("auth_user_id").notNull(),
	email: varchar("email", { length: 320 }).notNull(),
	displayName: varchar("display_name", { length: 200 }).notNull(),
	status: profileStatus("status").default("active").notNull(),
	...timestamps,
}, (table) => [uniqueIndex("profiles_auth_user_id_unique").on(table.authUserId)]);

export const memberships = pgTable("memberships", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	profileId: uuid("profile_id").notNull().references(() => profiles.id),
	role: membershipRole("role").notNull(),
	...timestamps,
}, (table) => [
	uniqueIndex("memberships_organization_profile_unique").on(table.organizationId, table.profileId),
	index("memberships_organization_idx").on(table.organizationId),
]);

export const employees = pgTable("employees", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	profileId: uuid("profile_id").references(() => profiles.id),
	employeeNumber: varchar("employee_number", { length: 100 }).notNull(),
	legalName: varchar("legal_name", { length: 200 }).notNull(),
	preferredName: varchar("preferred_name", { length: 200 }),
	email: varchar("email", { length: 320 }).notNull(),
	phone: varchar("phone", { length: 50 }),
	hireDate: date("hire_date").notNull(),
	department: varchar("department", { length: 200 }),
	title: varchar("title", { length: 200 }),
	managerId: uuid("manager_id"),
	workLocation: varchar("work_location", { length: 200 }),
	status: employeeStatus("status").default("active").notNull(),
	terminationDate: date("termination_date"),
	...timestamps,
}, (table) => [
	uniqueIndex("employees_organization_number_unique").on(table.organizationId, table.employeeNumber),
	uniqueIndex("employees_profile_unique").on(table.profileId),
	uniqueIndex("employees_id_organization_unique").on(table.id, table.organizationId),
	index("employees_organization_idx").on(table.organizationId),
	index("employees_manager_idx").on(table.managerId),
	foreignKey({
		columns: [table.managerId, table.organizationId],
		foreignColumns: [table.id, table.organizationId],
		name: "employees_manager_same_organization_fk",
	}),
	sql`CONSTRAINT employees_manager_not_self CHECK (manager_id IS NULL OR manager_id <> id)`,
	sql`CONSTRAINT employees_termination_date_check CHECK (termination_date IS NULL OR termination_date >= hire_date)`,
]);

export const paySettings = pgTable("pay_settings", {
	id: uuid("id").defaultRandom().primaryKey(),
	employeeId: uuid("employee_id").notNull().references(() => employees.id),
	effectiveFrom: date("effective_from").notNull(),
	effectiveTo: date("effective_to"),
	payFrequency: payFrequency("pay_frequency").notNull(),
	grossAmountMinor: bigint("gross_amount_minor", { mode: "number" }).notNull(),
	flatDeductionsMinor: bigint("flat_deductions_minor", { mode: "number" }).notNull(),
	currency: varchar("currency", { length: 3 }).notNull(),
	...timestamps,
}, (table) => [
	index("pay_settings_employee_idx").on(table.employeeId),
	sql`CONSTRAINT pay_settings_effective_dates_check CHECK (effective_to IS NULL OR effective_to >= effective_from)`,
	sql`CONSTRAINT pay_settings_gross_nonnegative CHECK (gross_amount_minor >= 0)`,
	sql`CONSTRAINT pay_settings_deductions_nonnegative CHECK (flat_deductions_minor >= 0)`,
]);

export const attendanceIntervals = pgTable("attendance_intervals", {
	id: uuid("id").defaultRandom().primaryKey(),
	employeeId: uuid("employee_id").notNull().references(() => employees.id),
	clockIn: timestamp("clock_in", { withTimezone: true }).notNull(),
	clockOut: timestamp("clock_out", { withTimezone: true }),
	source: attendanceSource("source").notNull(),
	status: attendanceStatus("status").default("open").notNull(),
	...timestamps,
}, (table) => [
	index("attendance_employee_idx").on(table.employeeId),
	sql`CONSTRAINT attendance_clock_order_check CHECK (clock_out IS NULL OR clock_out > clock_in)`,
]);

export const leaveRequests = pgTable("leave_requests", {
	id: uuid("id").defaultRandom().primaryKey(),
	employeeId: uuid("employee_id").notNull().references(() => employees.id),
	startDate: date("start_date").notNull(),
	endDate: date("end_date").notNull(),
	leaveType: leaveType("leave_type").notNull(),
	reason: text("reason"),
	status: leaveStatus("status").default("draft").notNull(),
	reviewerProfileId: uuid("reviewer_profile_id").references(() => profiles.id),
	submittedAt: timestamp("submitted_at", { withTimezone: true }),
	decisionAt: timestamp("decision_at", { withTimezone: true }),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
	...timestamps,
}, (table) => [
	index("leave_requests_employee_idx").on(table.employeeId),
	sql`CONSTRAINT leave_date_order_check CHECK (end_date >= start_date)`,
]);

export const payrollRuns = pgTable("payroll_runs", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	periodStart: date("period_start").notNull(),
	periodEnd: date("period_end").notNull(),
	status: payrollStatus("status").default("draft").notNull(),
	grossTotalMinor: bigint("gross_total_minor", { mode: "number" }),
	deductionsTotalMinor: bigint("deductions_total_minor", { mode: "number" }),
	netTotalMinor: bigint("net_total_minor", { mode: "number" }),
	currency: varchar("currency", { length: 3 }).notNull(),
	idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
	errorCode: varchar("error_code", { length: 100 }),
	errorMessage: text("error_message"),
	...timestamps,
}, (table) => [
	uniqueIndex("payroll_runs_organization_idempotency_unique").on(table.organizationId, table.idempotencyKey),
	index("payroll_runs_organization_period_idx").on(table.organizationId, table.periodStart, table.periodEnd),
	sql`CONSTRAINT payroll_period_order_check CHECK (period_end >= period_start)`,
	sql`CONSTRAINT payroll_totals_nonnegative CHECK (gross_total_minor IS NULL OR gross_total_minor >= 0)`,
	sql`CONSTRAINT payroll_deductions_nonnegative CHECK (deductions_total_minor IS NULL OR deductions_total_minor >= 0)`,
	sql`CONSTRAINT payroll_net_nonnegative CHECK (net_total_minor IS NULL OR net_total_minor >= 0)`,
	sql`CONSTRAINT payroll_net_total_check CHECK (net_total_minor IS NULL OR net_total_minor = gross_total_minor - deductions_total_minor)`,
]);

export const payouts = pgTable("payouts", {
	id: uuid("id").defaultRandom().primaryKey(),
	payrollRunId: uuid("payroll_run_id").notNull().references(() => payrollRuns.id),
	employeeId: uuid("employee_id").notNull().references(() => employees.id),
	grossAmountMinor: bigint("gross_amount_minor", { mode: "number" }).notNull(),
	deductionsAmountMinor: bigint("deductions_amount_minor", { mode: "number" }).notNull(),
	netAmountMinor: bigint("net_amount_minor", { mode: "number" }).notNull(),
	currency: varchar("currency", { length: 3 }).notNull(),
	status: payoutStatus("status").default("pending").notNull(),
	errorCode: varchar("error_code", { length: 100 }),
	errorMessage: text("error_message"),
	...timestamps,
}, (table) => [
	uniqueIndex("payouts_run_employee_unique").on(table.payrollRunId, table.employeeId),
	index("payouts_employee_idx").on(table.employeeId),
	sql`CONSTRAINT payouts_gross_nonnegative CHECK (gross_amount_minor >= 0)`,
	sql`CONSTRAINT payouts_deductions_nonnegative CHECK (deductions_amount_minor >= 0)`,
	sql`CONSTRAINT payouts_net_check CHECK (net_amount_minor = gross_amount_minor - deductions_amount_minor)`,
]);

export const payslips = pgTable("payslips", {
	id: uuid("id").defaultRandom().primaryKey(),
	payoutId: uuid("payout_id").notNull().references(() => payouts.id),
	status: payslipStatus("status").default("pending").notNull(),
	storagePath: text("storage_path"),
	generatedAt: timestamp("generated_at", { withTimezone: true }),
	errorCode: varchar("error_code", { length: 100 }),
	errorMessage: text("error_message"),
	...timestamps,
}, (table) => [uniqueIndex("payslips_payout_unique").on(table.payoutId)]);

export const auditEvents = pgTable("audit_events", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	actorProfileId: uuid("actor_profile_id").references(() => profiles.id),
	action: varchar("action", { length: 100 }).notNull(),
	entityType: varchar("entity_type", { length: 100 }).notNull(),
	entityId: uuid("entity_id").notNull(),
	metadata: jsonb("metadata").notNull().default({}),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("audit_events_organization_created_idx").on(table.organizationId, table.createdAt)]);