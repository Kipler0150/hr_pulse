import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	date,
	foreignKey,
	index,
	integer,
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
export const membershipStatus = pgEnum("membership_status", ["active", "inactive"]);
export const employeeStatus = pgEnum("employee_status", ["active", "inactive", "terminated"]);
export const payFrequency = pgEnum("pay_frequency", ["weekly", "biweekly", "semimonthly", "monthly"]);
export const attendanceSource = pgEnum("attendance_source", ["employee", "manager", "administrator", "system"]);
export const attendanceStatus = pgEnum("attendance_status", ["open", "completed"]);
export const leaveType = pgEnum("leave_type", ["paid", "unpaid", "sick", "other"]);
export const leaveStatus = pgEnum("leave_status", ["draft", "submitted", "approved", "declined", "cancelled"]);
export const payrollStatus = pgEnum("payroll_status", ["queued", "processing", "completed", "failed"]);
export const payoutStatus = pgEnum("payout_status", ["pending", "processing", "finalized", "failed"]);
export const payslipStatus = pgEnum("payslip_status", ["pending", "generated", "failed"]);
export const queueDeliveryStatus = pgEnum("queue_delivery_status", ["pending", "submitted", "failed"]);
export const payrollAttemptOutcome = pgEnum("payroll_attempt_outcome", ["processing", "succeeded", "retryable_failure", "failed"]);

export const organizations = pgTable("organizations", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: varchar("name", { length: 200 }).notNull(),
	slug: varchar("slug", { length: 100 }).notNull(),
	status: organizationStatus("status").default("active").notNull(),
	timezone: varchar("timezone", { length: 100 }).notNull(),
	defaultCurrency: varchar("default_currency", { length: 3 }).notNull(),
	regionCode: varchar("region_code", { length: 10 }),
	foundingProfileId: uuid("founding_profile_id").references(() => profiles.id),
	...timestamps,
}, (table) => [
	uniqueIndex("organizations_slug_unique").on(table.slug),
	uniqueIndex("organizations_founding_profile_unique").on(table.foundingProfileId),
]);

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
	status: membershipStatus("status").default("active").notNull(),
	deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
	...timestamps,
}, (table) => [
	uniqueIndex("memberships_organization_profile_unique").on(table.organizationId, table.profileId),
	index("memberships_organization_idx").on(table.organizationId),
]);

export const payrollSchedules = pgTable("payroll_schedules", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	frequency: payFrequency("frequency").notNull(),
	anchorStartDate: date("anchor_start_date"),
	effectiveStartDate: date("effective_start_date").notNull(),
	version: integer("version").default(1).notNull(),
	...timestamps,
}, (table) => [
	uniqueIndex("payroll_schedules_organization_unique").on(table.organizationId),
	check("payroll_schedules_version_positive", sql`${table.version} > 0`),
	check("payroll_schedules_anchor_check", sql`(${table.frequency} IN ('weekly', 'biweekly') AND ${table.anchorStartDate} IS NOT NULL) OR (${table.frequency} IN ('semimonthly', 'monthly') AND ${table.anchorStartDate} IS NULL)`),
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
	check("employees_manager_not_self", sql`${table.managerId} IS NULL OR ${table.managerId} <> ${table.id}`),
	check("employees_termination_date_check", sql`${table.terminationDate} IS NULL OR ${table.terminationDate} >= ${table.hireDate}`),
]);

export const paySettings = pgTable("pay_settings", {
	id: uuid("id").defaultRandom().primaryKey(),
	employeeId: uuid("employee_id").notNull().references(() => employees.id),
	effectiveFrom: date("effective_from").notNull(),
	effectiveTo: date("effective_to"),
	payFrequency: payFrequency("pay_frequency").notNull(),
	version: integer("version").default(1).notNull(),
	grossAmountMinor: bigint("gross_amount_minor", { mode: "number" }).notNull(),
	currency: varchar("currency", { length: 3 }).notNull(),
	...timestamps,
}, (table) => [
	index("pay_settings_employee_idx").on(table.employeeId),
	check("pay_settings_effective_dates_check", sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`),
	check("pay_settings_version_positive", sql`${table.version} > 0`),
	check("pay_settings_gross_positive", sql`${table.grossAmountMinor} > 0`),
]);

export const paySettingDeductions = pgTable("pay_setting_deductions", {
	id: uuid("id").defaultRandom().primaryKey(),
	paySettingId: uuid("pay_setting_id").notNull().references(() => paySettings.id),
	name: varchar("name", { length: 120 }).notNull(),
	amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	...timestamps,
}, (table) => [
	index("pay_setting_deductions_setting_idx").on(table.paySettingId),
	uniqueIndex("pay_setting_deductions_name_unique").on(table.paySettingId, sql`lower(${table.name})`),
	check("pay_setting_deductions_amount_positive", sql`${table.amountMinor} > 0`),
	check("pay_setting_deductions_order_nonnegative", sql`${table.displayOrder} >= 0`),
]);

export const payrollPreviewTokens = pgTable("payroll_preview_tokens", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	actorProfileId: uuid("actor_profile_id").notNull().references(() => profiles.id),
	periodStart: date("period_start").notNull(),
	periodEnd: date("period_end").notNull(),
	fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
	calculationVersion: varchar("calculation_version", { length: 50 }).notNull(),
	tokenHash: varchar("token_hash", { length: 64 }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	consumedAt: timestamp("consumed_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("payroll_preview_tokens_hash_unique").on(table.tokenHash),
	index("payroll_preview_tokens_organization_expiry_idx").on(table.organizationId, table.expiresAt),
	check("payroll_preview_period_order_check", sql`${table.periodEnd} >= ${table.periodStart}`),
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
	check("attendance_clock_order_check", sql`${table.clockOut} IS NULL OR ${table.clockOut} > ${table.clockIn}`),
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
	check("leave_date_order_check", sql`${table.endDate} >= ${table.startDate}`),
]);

export const payrollRuns = pgTable("payroll_runs", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	payrollScheduleId: uuid("payroll_schedule_id").notNull().references(() => payrollSchedules.id),
	periodStart: date("period_start").notNull(),
	periodEnd: date("period_end").notNull(),
	status: payrollStatus("status").default("queued").notNull(),
	organizationName: varchar("organization_name", { length: 200 }).notNull(),
	organizationTimezone: varchar("organization_timezone", { length: 100 }).notNull(),
	payFrequency: payFrequency("pay_frequency").notNull(),
	scheduleVersion: integer("schedule_version").notNull(),
	grossTotalMinor: bigint("gross_total_minor", { mode: "number" }).notNull(),
	deductionsTotalMinor: bigint("deductions_total_minor", { mode: "number" }).notNull(),
	netTotalMinor: bigint("net_total_minor", { mode: "number" }).notNull(),
	currency: varchar("currency", { length: 3 }).notNull(),
	currencyExponent: integer("currency_exponent").notNull(),
	currencyMapVersion: varchar("currency_map_version", { length: 50 }).notNull(),
	calculationVersion: varchar("calculation_version", { length: 50 }).notNull(),
	payrollReference: varchar("payroll_reference", { length: 100 }).notNull(),
	confirmedByProfileId: uuid("confirmed_by_profile_id").notNull().references(() => profiles.id),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true }).defaultNow().notNull(),
	sourceFingerprint: varchar("source_fingerprint", { length: 64 }).notNull(),
	previewTokenHash: varchar("preview_token_hash", { length: 64 }).notNull(),
	processingGeneration: integer("processing_generation").default(1).notNull(),
	queueStatus: queueDeliveryStatus("queue_status").default("pending").notNull(),
	queueSubmittedAt: timestamp("queue_submitted_at", { withTimezone: true }),
	queueEventId: varchar("queue_event_id", { length: 200 }),
	queueErrorCode: varchar("queue_error_code", { length: 100 }),
	leaseOwner: varchar("lease_owner", { length: 200 }),
	leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
	lastProgressAt: timestamp("last_progress_at", { withTimezone: true }),
	completedAt: timestamp("completed_at", { withTimezone: true }),
	errorCode: varchar("error_code", { length: 100 }),
	errorGuidance: text("error_guidance"),
	...timestamps,
}, (table) => [
	uniqueIndex("payroll_runs_organization_period_unique").on(table.organizationId, table.periodStart, table.periodEnd),
	uniqueIndex("payroll_runs_preview_token_unique").on(table.organizationId, table.previewTokenHash),
	uniqueIndex("payroll_runs_reference_unique").on(table.payrollReference),
	index("payroll_runs_organization_period_idx").on(table.organizationId, table.periodStart, table.periodEnd),
	check("payroll_period_order_check", sql`${table.periodEnd} >= ${table.periodStart}`),
	check("payroll_totals_nonnegative", sql`${table.grossTotalMinor} >= 0 AND ${table.deductionsTotalMinor} >= 0 AND ${table.netTotalMinor} >= 0`),
	check("payroll_net_total_check", sql`${table.netTotalMinor} = ${table.grossTotalMinor} - ${table.deductionsTotalMinor}`),
	check("payroll_processing_generation_positive", sql`${table.processingGeneration} > 0`),
]);

export const payrollRunAttempts = pgTable("payroll_run_attempts", {
	id: uuid("id").defaultRandom().primaryKey(),
	payrollRunId: uuid("payroll_run_id").notNull().references(() => payrollRuns.id),
	processingGeneration: integer("processing_generation").notNull(),
	attemptNumber: integer("attempt_number").notNull(),
	inngestEventId: varchar("inngest_event_id", { length: 200 }),
	initiatedByProfileId: uuid("initiated_by_profile_id").references(() => profiles.id),
	startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true }),
	outcome: payrollAttemptOutcome("outcome").default("processing").notNull(),
	errorCode: varchar("error_code", { length: 100 }),
	errorGuidance: text("error_guidance"),
}, (table) => [
	uniqueIndex("payroll_attempt_generation_number_unique").on(table.payrollRunId, table.processingGeneration, table.attemptNumber),
	index("payroll_attempt_run_started_idx").on(table.payrollRunId, table.startedAt),
	check("payroll_attempt_number_positive", sql`${table.attemptNumber} > 0 AND ${table.processingGeneration} > 0`),
]);

export const payouts = pgTable("payouts", {
	id: uuid("id").defaultRandom().primaryKey(),
	payrollRunId: uuid("payroll_run_id").notNull().references(() => payrollRuns.id),
	employeeId: uuid("employee_id").notNull().references(() => employees.id),
	paySettingId: uuid("pay_setting_id").notNull().references(() => paySettings.id),
	employeeNumber: varchar("employee_number", { length: 100 }).notNull(),
	legalName: varchar("legal_name", { length: 200 }).notNull(),
	grossAmountMinor: bigint("gross_amount_minor", { mode: "number" }).notNull(),
	deductionsAmountMinor: bigint("deductions_amount_minor", { mode: "number" }).notNull(),
	netAmountMinor: bigint("net_amount_minor", { mode: "number" }).notNull(),
	currency: varchar("currency", { length: 3 }).notNull(),
	currencyExponent: integer("currency_exponent").notNull(),
	calculationVersion: varchar("calculation_version", { length: 50 }).notNull(),
	status: payoutStatus("status").default("pending").notNull(),
	errorCode: varchar("error_code", { length: 100 }),
	errorGuidance: text("error_guidance"),
	...timestamps,
}, (table) => [
	uniqueIndex("payouts_run_employee_unique").on(table.payrollRunId, table.employeeId),
	index("payouts_employee_idx").on(table.employeeId),
	check("payouts_gross_nonnegative", sql`${table.grossAmountMinor} >= 0`),
	check("payouts_deductions_nonnegative", sql`${table.deductionsAmountMinor} >= 0`),
	check("payouts_net_check", sql`${table.netAmountMinor} = ${table.grossAmountMinor} - ${table.deductionsAmountMinor}`),
]);

export const payoutDeductionLines = pgTable("payout_deduction_lines", {
	id: uuid("id").defaultRandom().primaryKey(),
	payoutId: uuid("payout_id").notNull().references(() => payouts.id),
	sourceDeductionId: uuid("source_deduction_id").references(() => paySettingDeductions.id),
	name: varchar("name", { length: 120 }).notNull(),
	amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
	displayOrder: integer("display_order").notNull(),
}, (table) => [
	index("payout_deduction_lines_payout_order_idx").on(table.payoutId, table.displayOrder),
	check("payout_deduction_amount_positive", sql`${table.amountMinor} > 0`),
	check("payout_deduction_order_nonnegative", sql`${table.displayOrder} >= 0`),
]);

export const payslips = pgTable("payslips", {
	id: uuid("id").defaultRandom().primaryKey(),
	payoutId: uuid("payout_id").notNull().references(() => payouts.id),
	status: payslipStatus("status").default("pending").notNull(),
	storagePath: text("storage_path"),
	generatedAt: timestamp("generated_at", { withTimezone: true }),
	templateVersion: integer("template_version"),
	sha256: varchar("sha256", { length: 64 }),
	fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
	mimeType: varchar("mime_type", { length: 100 }),
	immutable: boolean("immutable").default(false).notNull(),
	errorCode: varchar("error_code", { length: 100 }),
	errorGuidance: text("error_guidance"),
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
