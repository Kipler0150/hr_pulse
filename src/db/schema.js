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
export const timecardStatus = pgEnum("timecard_status", ["draft", "submitted", "returned", "approved"]);
export const timecardEventAction = pgEnum("timecard_event_action", ["prepared", "submitted", "returned", "resubmitted", "approved", "configuration_returned"]);
export const earningType = pgEnum("earning_type", ["overtime"]);
export const leaveType = pgEnum("leave_type", ["paid", "unpaid", "sick", "other"]);
export const leaveStatus = pgEnum("leave_status", ["draft", "submitted", "approved", "declined", "cancelled"]);
export const leaveEventAction = pgEnum("leave_event_action", ["submitted", "approved", "declined", "cancelled"]);
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

export const overtimePolicies = pgTable("overtime_policies", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	version: integer("version").notNull(),
	effectiveFrom: date("effective_from").notNull(),
	dailyThresholdMinutes: integer("daily_threshold_minutes").notNull(),
	enabled: boolean("enabled").default(true).notNull(),
	...timestamps,
}, (table) => [
	uniqueIndex("overtime_policies_organization_start_unique").on(table.organizationId, table.effectiveFrom),
	uniqueIndex("overtime_policies_organization_version_unique").on(table.organizationId, table.version),
	index("overtime_policies_organization_start_idx").on(table.organizationId, table.effectiveFrom.desc()),
	check("overtime_policies_version_positive", sql`${table.version} > 0`),
	check("overtime_policies_threshold_range", sql`${table.dailyThresholdMinutes} BETWEEN 1 AND 1440`),
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
	overtimeEligible: boolean("overtime_eligible").default(false).notNull(),
	standardPeriodMinutes: integer("standard_period_minutes"),
	overtimeMultiplierBasisPoints: integer("overtime_multiplier_basis_points"),
	...timestamps,
}, (table) => [
	index("pay_settings_employee_idx").on(table.employeeId),
	check("pay_settings_effective_dates_check", sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`),
	check("pay_settings_version_positive", sql`${table.version} > 0`),
	check("pay_settings_gross_positive", sql`${table.grossAmountMinor} > 0`),
	check("pay_settings_overtime_inputs_check", sql`(${table.overtimeEligible} = false AND ${table.standardPeriodMinutes} IS NULL AND ${table.overtimeMultiplierBasisPoints} IS NULL) OR (${table.overtimeEligible} = true AND ${table.standardPeriodMinutes} > 0 AND ${table.overtimeMultiplierBasisPoints} BETWEEN 10000 AND 50000)`),
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
	index("attendance_employee_clock_in_cursor_idx").on(table.employeeId, table.clockIn.desc(), table.id.desc()),
	uniqueIndex("attendance_one_open_per_employee").on(table.employeeId).where(sql`${table.status} = 'open'`),
	check("attendance_clock_order_check", sql`${table.clockOut} IS NULL OR ${table.clockOut} > ${table.clockIn}`),
	check("attendance_state_consistency_check", sql`(${table.status} = 'open' AND ${table.clockOut} IS NULL) OR (${table.status} = 'completed' AND ${table.clockOut} IS NOT NULL)`),
]);

export const attendanceIntervalCorrections = pgTable("attendance_interval_corrections", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	attendanceIntervalId: uuid("attendance_interval_id").notNull().references(() => attendanceIntervals.id),
	actorProfileId: uuid("actor_profile_id").notNull().references(() => profiles.id),
	correctedClockIn: timestamp("corrected_clock_in", { withTimezone: true }).notNull(),
	correctedClockOut: timestamp("corrected_clock_out", { withTimezone: true }).notNull(),
	reason: varchar("reason", { length: 500 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("attendance_corrections_interval_created_idx").on(table.attendanceIntervalId, table.createdAt.desc(), table.id.desc()),
	index("attendance_corrections_organization_idx").on(table.organizationId),
	check("attendance_corrections_clock_order_check", sql`${table.correctedClockOut} > ${table.correctedClockIn}`),
	check("attendance_corrections_reason_length_check", sql`char_length(${table.reason}) BETWEEN 1 AND 500`),
]);

export const timecards = pgTable("timecards", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	employeeId: uuid("employee_id").notNull(),
	payrollScheduleId: uuid("payroll_schedule_id").notNull().references(() => payrollSchedules.id),
	periodStart: date("period_start").notNull(),
	periodEnd: date("period_end").notNull(),
	status: timecardStatus("status").default("draft").notNull(),
	version: integer("version").default(1).notNull(),
	timezone: varchar("timezone", { length: 100 }).notNull(),
	submittedAt: timestamp("submitted_at", { withTimezone: true }),
	approvedAt: timestamp("approved_at", { withTimezone: true }),
	overtimePolicyId: uuid("overtime_policy_id").notNull().references(() => overtimePolicies.id),
	paySettingId: uuid("pay_setting_id").notNull().references(() => paySettings.id),
	policyVersion: integer("policy_version").notNull(),
	dailyThresholdMinutes: integer("daily_threshold_minutes").notNull(),
	policyEnabled: boolean("policy_enabled").notNull(),
	overtimeEligible: boolean("overtime_eligible").notNull(),
	standardPeriodMinutes: integer("standard_period_minutes"),
	overtimeMultiplierBasisPoints: integer("overtime_multiplier_basis_points"),
	baseGrossAmountMinor: bigint("base_gross_amount_minor", { mode: "number" }).notNull(),
	currency: varchar("currency", { length: 3 }).notNull(),
	workedSeconds: integer("worked_seconds").default(0).notNull(),
	regularSeconds: integer("regular_seconds").default(0).notNull(),
	overtimeSeconds: integer("overtime_seconds").default(0).notNull(),
	payableOvertimeMinutes: integer("payable_overtime_minutes").default(0).notNull(),
	overtimeAmountMinor: bigint("overtime_amount_minor", { mode: "number" }).default(0).notNull(),
	zeroHoursConfirmed: boolean("zero_hours_confirmed").default(false).notNull(),
	...timestamps,
}, (table) => [
	uniqueIndex("timecards_employee_period_unique").on(table.organizationId, table.employeeId, table.payrollScheduleId, table.periodStart, table.periodEnd),
	uniqueIndex("timecards_id_organization_unique").on(table.id, table.organizationId),
	index("timecards_employee_period_idx").on(table.employeeId, table.periodEnd.desc(), table.id.desc()),
	index("timecards_organization_status_period_idx").on(table.organizationId, table.status, table.periodEnd.desc(), table.id.desc()),
	check("timecards_period_order_check", sql`${table.periodEnd} >= ${table.periodStart}`),
	check("timecards_version_positive", sql`${table.version} > 0`),
	check("timecards_threshold_range", sql`${table.dailyThresholdMinutes} BETWEEN 1 AND 1440`),
	check("timecards_duration_nonnegative", sql`${table.workedSeconds} >= 0 AND ${table.regularSeconds} >= 0 AND ${table.overtimeSeconds} >= 0 AND ${table.payableOvertimeMinutes} >= 0`),
	check("timecards_duration_reconcile", sql`${table.workedSeconds} = ${table.regularSeconds} + ${table.overtimeSeconds}`),
	check("timecards_amount_nonnegative", sql`${table.baseGrossAmountMinor} > 0 AND ${table.overtimeAmountMinor} >= 0`),
	check("timecards_overtime_inputs_check", sql`(${table.policyEnabled} = false OR ${table.overtimeEligible} = false) OR (${table.standardPeriodMinutes} > 0 AND ${table.overtimeMultiplierBasisPoints} BETWEEN 10000 AND 50000)`),
	check("timecards_approval_state_check", sql`(${table.status} = 'approved' AND ${table.approvedAt} IS NOT NULL AND ${table.submittedAt} IS NOT NULL) OR (${table.status} <> 'approved' AND ${table.approvedAt} IS NULL)`),
]);

export const timecardDays = pgTable("timecard_days", {
	id: uuid("id").defaultRandom().primaryKey(),
	timecardId: uuid("timecard_id").notNull().references(() => timecards.id),
	localDate: date("local_date").notNull(),
	workedSeconds: integer("worked_seconds").default(0).notNull(),
	regularSeconds: integer("regular_seconds").default(0).notNull(),
	overtimeSeconds: integer("overtime_seconds").default(0).notNull(),
	payableOvertimeMinutes: integer("payable_overtime_minutes").default(0).notNull(),
	overtimeAmountMinor: bigint("overtime_amount_minor", { mode: "number" }).default(0).notNull(),
	currency: varchar("currency", { length: 3 }).notNull(),
}, (table) => [
	uniqueIndex("timecard_days_card_date_unique").on(table.timecardId, table.localDate),
	index("timecard_days_card_date_idx").on(table.timecardId, table.localDate),
	check("timecard_days_duration_nonnegative", sql`${table.workedSeconds} >= 0 AND ${table.regularSeconds} >= 0 AND ${table.overtimeSeconds} >= 0 AND ${table.payableOvertimeMinutes} >= 0`),
	check("timecard_days_duration_reconcile", sql`${table.workedSeconds} = ${table.regularSeconds} + ${table.overtimeSeconds}`),
	check("timecard_days_amount_nonnegative", sql`${table.overtimeAmountMinor} >= 0`),
]);

export const timecardDaySources = pgTable("timecard_day_sources", {
	id: uuid("id").defaultRandom().primaryKey(),
	timecardDayId: uuid("timecard_day_id").notNull().references(() => timecardDays.id),
	attendanceIntervalId: uuid("attendance_interval_id").notNull().references(() => attendanceIntervals.id),
	attendanceIntervalCorrectionId: uuid("attendance_interval_correction_id").references(() => attendanceIntervalCorrections.id),
	clockInSnapshot: timestamp("clock_in_snapshot", { withTimezone: true }).notNull(),
	clockOutSnapshot: timestamp("clock_out_snapshot", { withTimezone: true }).notNull(),
	allocatedSeconds: integer("allocated_seconds").notNull(),
}, (table) => [
	index("timecard_day_sources_day_idx").on(table.timecardDayId),
	index("timecard_day_sources_interval_idx").on(table.attendanceIntervalId),
	check("timecard_day_sources_duration_positive", sql`${table.allocatedSeconds} > 0`),
	check("timecard_day_sources_clock_order_check", sql`${table.clockOutSnapshot} > ${table.clockInSnapshot}`),
]);

export const timecardEvents = pgTable("timecard_events", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	timecardId: uuid("timecard_id").notNull().references(() => timecards.id),
	action: timecardEventAction("action").notNull(),
	actorProfileId: uuid("actor_profile_id").notNull().references(() => profiles.id),
	occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
	priorStatus: timecardStatus("prior_status"),
	resultingStatus: timecardStatus("resulting_status").notNull(),
	note: varchar("note", { length: 500 }),
	reasonCode: varchar("reason_code", { length: 100 }),
}, (table) => [
	index("timecard_events_card_order_idx").on(table.timecardId, table.occurredAt, table.id),
	check("timecard_events_note_length_check", sql`${table.note} IS NULL OR char_length(${table.note}) BETWEEN 1 AND 500`),
]);

export const mutationReceipts = pgTable("mutation_receipts", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	actorProfileId: uuid("actor_profile_id").notNull().references(() => profiles.id),
	operation: varchar("operation", { length: 100 }).notNull(),
	requestId: uuid("request_id").notNull(),
	payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
	resultEntityType: varchar("result_entity_type", { length: 100 }).notNull(),
	resultEntityId: uuid("result_entity_id").notNull(),
	resultVersion: integer("result_version").notNull(),
	resultSnapshot: jsonb("result_snapshot"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("mutation_receipts_operation_request_unique").on(table.organizationId, table.operation, table.requestId),
	check("mutation_receipts_result_version_positive", sql`${table.resultVersion} > 0`),
]);

export const leaveRequests = pgTable("leave_requests", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
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
	version: integer("version").default(1).notNull(),
	...timestamps,
}, (table) => [
	uniqueIndex("leave_requests_id_organization_unique").on(table.id, table.organizationId),
	foreignKey({
		columns: [table.employeeId, table.organizationId],
		foreignColumns: [employees.id, employees.organizationId],
		name: "leave_requests_employee_organization_fk",
	}),
	index("leave_requests_organization_submitted_idx").on(table.organizationId, table.submittedAt, table.id),
	index("leave_requests_employee_submitted_idx").on(table.employeeId, table.submittedAt.desc(), table.id.desc()),
	check("leave_date_order_check", sql`${table.endDate} >= ${table.startDate}`),
	check("leave_requests_version_positive", sql`${table.version} > 0`),
	check("leave_requests_reason_length_check", sql`${table.reason} IS NULL OR char_length(${table.reason}) <= 500`),
]);

export const leaveRequestEvents = pgTable("leave_request_events", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	leaveRequestId: uuid("leave_request_id").notNull(),
	requestVersion: integer("request_version").notNull(),
	action: leaveEventAction("action").notNull(),
	actorProfileId: uuid("actor_profile_id").notNull().references(() => profiles.id),
	actorRole: varchar("actor_role", { length: 30 }).notNull(),
	organizationTimezone: varchar("organization_timezone", { length: 100 }).notNull(),
	wasLate: boolean("was_late").default(false).notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
	priorStatus: leaveStatus("prior_status"),
	resultingStatus: leaveStatus("resulting_status").notNull(),
	decisionNote: varchar("decision_note", { length: 500 }),
	fallbackReason: varchar("fallback_reason", { length: 500 }),
}, (table) => [
	uniqueIndex("leave_request_events_request_version_unique").on(table.leaveRequestId, table.requestVersion),
	foreignKey({
		columns: [table.leaveRequestId, table.organizationId],
		foreignColumns: [leaveRequests.id, leaveRequests.organizationId],
		name: "leave_request_events_request_organization_fk",
	}),
	index("leave_request_events_organization_order_idx").on(table.organizationId, table.occurredAt, table.id),
	check("leave_request_events_note_length_check", sql`${table.decisionNote} IS NULL OR char_length(${table.decisionNote}) BETWEEN 1 AND 500`),
	check("leave_request_events_fallback_length_check", sql`${table.fallbackReason} IS NULL OR char_length(${table.fallbackReason}) BETWEEN 1 AND 500`),
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

export const payoutEarningLines = pgTable("payout_earning_lines", {
	id: uuid("id").defaultRandom().primaryKey(),
	payoutId: uuid("payout_id").notNull().references(() => payouts.id),
	timecardId: uuid("timecard_id").notNull().references(() => timecards.id),
	earningType: earningType("earning_type").notNull(),
	payableMinutes: integer("payable_minutes").notNull(),
	baseGrossAmountMinor: bigint("base_gross_amount_minor", { mode: "number" }).notNull(),
	standardPeriodMinutes: integer("standard_period_minutes"),
	multiplierBasisPoints: integer("multiplier_basis_points"),
	currency: varchar("currency", { length: 3 }).notNull(),
	amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
}, (table) => [
	uniqueIndex("payout_earning_lines_payout_type_unique").on(table.payoutId, table.earningType),
	uniqueIndex("payout_earning_lines_timecard_unique").on(table.timecardId),
	index("payout_earning_lines_payout_order_idx").on(table.payoutId, table.displayOrder),
	check("payout_earning_lines_values_nonnegative", sql`${table.payableMinutes} >= 0 AND ${table.baseGrossAmountMinor} > 0 AND ${table.amountMinor} >= 0 AND ${table.displayOrder} >= 0`),
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
