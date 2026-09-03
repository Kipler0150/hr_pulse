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
export const privacyConsentType = pgEnum("privacy_consent_type", ["product_analytics"]);
export const privacyRequestType = pgEnum("privacy_request_type", ["deletion"]);
export const privacyRequestStatus = pgEnum("privacy_request_status", ["submitted", "under_review", "approved", "rejected", "scheduled", "completed", "failed"]);
export const privacyRequestResolution = pgEnum("privacy_request_resolution", ["administrator_rejected", "employee_withdrawn"]);
export const privacyDeletionStatus = pgEnum("privacy_deletion_status", ["processing", "completed", "failed"]);

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
	preferredName: text("preferred_name"),
	email: varchar("email", { length: 320 }).notNull(),
	phone: text("phone"),
	hireDate: date("hire_date").notNull(),
	department: varchar("department", { length: 200 }),
	title: varchar("title", { length: 200 }),
	managerId: uuid("manager_id"),
	workLocation: varchar("work_location", { length: 200 }),
	status: employeeStatus("status").default("active").notNull(),
	terminationDate: date("termination_date"),
	version: integer("version").default(1).notNull(),
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
	check("employees_version_positive", sql`${table.version} > 0`),
	check("employees_preferred_name_valid", sql`${table.preferredName} IS NULL OR (pg_catalog.btrim(${table.preferredName}) <> '' AND char_length(${table.preferredName}) <= 200)`),
	check("employees_phone_e164_or_null", sql`${table.phone} IS NULL OR ${table.phone} ~ '^[+][0-9]{7,15}$'`),
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
	payrollPeriodEnd: date("payroll_period_end").notNull(),
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
	payrollPeriodEnd: date("payroll_period_end").notNull(),
	status: payoutStatus("status").default("pending").notNull(),
	errorCode: varchar("error_code", { length: 100 }),
	errorGuidance: text("error_guidance"),
	...timestamps,
}, (table) => [
	uniqueIndex("payouts_run_employee_unique").on(table.payrollRunId, table.employeeId),
	index("payouts_employee_idx").on(table.employeeId),
	index("payouts_employee_period_cursor_idx").on(table.employeeId, table.payrollPeriodEnd.desc(), table.id.desc()),
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
	result: varchar("result", { length: 30 }).default("success").notNull(),
	actorLabelSnapshot: varchar("actor_label_snapshot", { length: 200 }),
	actorRoleSnapshot: varchar("actor_role_snapshot", { length: 30 }),
	correlationId: uuid("correlation_id"),
	metadata: jsonb("metadata").notNull().default({}),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("audit_events_organization_created_idx").on(table.organizationId, table.createdAt.desc(), table.id.desc()),
	index("audit_events_organization_action_created_idx").on(table.organizationId, table.action, table.createdAt.desc(), table.id.desc()),
	check("audit_events_action_check", sql`${table.action} IN ('organization.created', 'organization.updated', 'membership.created', 'membership.role_changed', 'membership.deactivated', 'employee.created', 'employee.updated', 'employee.deactivated', 'attendance.checked_in', 'attendance.clocked_out', 'timecard.prepared', 'timecard.submitted', 'timecard.returned', 'timecard.approved', 'timecard.configuration_returned', 'time_off.submitted', 'time_off.cancelled', 'time_off.approved', 'time_off.declined', 'payroll.preview_created', 'payroll.confirmed', 'payroll.queued', 'payroll.processing', 'payroll.completed', 'payroll.failed', 'payroll.retry_requested', 'self_service.profile_updated', 'auth.sign_in_succeeded', 'auth.sign_in_failed', 'auth.sign_out', 'access.organization_selected', 'access.authorization_denied', 'release_control.changed', 'organization.founded', 'membership.assigned', 'payroll_schedule.changed', 'pay_setting.created', 'payroll.recovered', 'overtime_policy.saved', 'attendance_interval.corrected', 'payroll.timecards_consumed', 'payroll.preview.blocked', 'timecard.resubmitted', 'privacy.consent_changed', 'privacy.deletion_requested', 'privacy.deletion_withdrawn', 'privacy.request_review_started', 'privacy.request_decided', 'privacy.hold_placed', 'privacy.hold_released', 'privacy.deletion_completed', 'privacy.deletion_failed')`),
	check("audit_events_result_check", sql`${table.result} IN ('success', 'expected_error', 'unexpected_error', 'denied')`),
	check("audit_events_entity_type_check", sql`${table.entityType} IN ('organization', 'membership', 'employee', 'attendance_interval', 'timecard', 'leave_request', 'payroll_run', 'payout', 'payslip', 'profile', 'access', 'release_control', 'pay_setting', 'payroll_preview', 'payroll_schedule', 'overtime_policy', 'attendance_correction')`),
]);

export const productEvents = pgTable("product_events", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	analyticsSubjectKey: varchar("analytics_subject_key", { length: 64 }),
	eventName: varchar("event_name", { length: 100 }).notNull(),
	schemaVersion: integer("schema_version").notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
	workflowArea: varchar("workflow_area", { length: 30 }),
	resultCategory: varchar("result_category", { length: 30 }),
	durationMs: integer("duration_ms"),
	dedupeKey: varchar("dedupe_key", { length: 64 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("product_events_organization_dedupe_unique").on(table.organizationId, table.dedupeKey),
	index("product_events_organization_occurred_idx").on(table.organizationId, table.occurredAt.desc(), table.id.desc()),
	index("product_events_organization_event_occurred_idx").on(table.organizationId, table.eventName, table.occurredAt.desc()),
	index("product_events_organization_subject_occurred_idx").on(table.organizationId, table.analyticsSubjectKey, table.occurredAt.desc(), table.id.desc()),
	check("product_events_schema_version_positive", sql`${table.schemaVersion} > 0`),
	check("product_events_event_name_check", sql`${table.eventName} IN ('auth.sign_in_succeeded', 'setup.organization_completed', 'setup.employee_created', 'attendance.checked_in', 'attendance.clocked_out', 'time_off.submitted', 'time_off.approved', 'time_off.declined', 'timecard.submitted', 'timecard.approved', 'payroll.preview_created', 'payroll.confirmed', 'payroll.completed', 'payroll.failed', 'self_service.profile_updated', 'self_service.payslip_downloaded')`),
	check("product_events_duration_bounded", sql`${table.durationMs} IS NULL OR ${table.durationMs} BETWEEN 0 AND 3600000`),
	check("product_events_result_category_check", sql`${table.resultCategory} IS NULL OR ${table.resultCategory} IN ('success', 'expected_error', 'unexpected_error')`),
	check("product_events_workflow_area_check", sql`${table.workflowArea} IS NULL OR ${table.workflowArea} IN ('auth', 'setup', 'attendance', 'time_off', 'timecards', 'payroll', 'self_service')`),
]);

export const operationFailures = pgTable("operation_failures", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	analyticsSubjectKey: varchar("analytics_subject_key", { length: 64 }),
	operation: varchar("operation", { length: 100 }).notNull(),
	safeCode: varchar("safe_code", { length: 100 }).notNull(),
	groupKey: varchar("group_key", { length: 64 }).notNull(),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
	occurrenceCount: integer("occurrence_count").default(1).notNull(),
	affectedEntityType: varchar("affected_entity_type", { length: 100 }),
	affectedEntityId: uuid("affected_entity_id"),
	workflowStatus: varchar("workflow_status", { length: 50 }),
	recoveryAvailable: boolean("recovery_available").default(false).notNull(),
	correlationId: uuid("correlation_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("operation_failures_organization_group_unique").on(table.organizationId, table.groupKey),
	index("operation_failures_organization_last_seen_idx").on(table.organizationId, table.lastSeenAt.desc(), table.id.desc()),
	index("operation_failures_organization_subject_last_seen_idx").on(table.organizationId, table.analyticsSubjectKey, table.lastSeenAt.desc(), table.id.desc()),
	check("operation_failures_operation_check", sql`${table.operation} IN ('auth.sign_in', 'auth.sign_out', 'auth.organization_select', 'setup.organization_create', 'setup.employee_save', 'attendance.check_in', 'attendance.clock_out', 'attendance.review', 'attendance_interval.correct', 'time_off.submit', 'time_off.cancel', 'time_off.approve', 'time_off.decline', 'timecard.prepare', 'timecard.submit', 'timecard.return', 'timecard.approve', 'overtime_policy.save', 'payroll.preview', 'payroll.confirm', 'payroll.queue', 'payroll.calculation', 'payroll.recover', 'payroll.retry', 'self_service.profile_update', 'self_service.payslip_download')`),
	check("operation_failures_safe_code_check", sql`${table.safeCode} IN ('OPERATION_UNAVAILABLE', 'PAYROLL_DISABLED', 'PAYSLIPS_BUCKET_UNAVAILABLE', 'PAYROLL_FORBIDDEN', 'PAYROLL_PERIOD_BLOCKED', 'NO_CLOSED_PERIOD', 'NO_ELIGIBLE_EMPLOYEES', 'EMPLOYEE_LIMIT_EXCEEDED', 'PAY_SETTING_MISSING', 'TIMECARD_APPROVAL_MISSING', 'CURRENCY_MISMATCH', 'DEDUCTIONS_EXCEED_GROSS', 'PREVIEW_EXPIRED', 'PREVIEW_STALE', 'RUN_NOT_RETRYABLE', 'PROCESSING_LEASE_ACTIVE', 'QUEUE_DELIVERY_FAILED', 'PAYSLIP_GENERATION_FAILED', 'PAYSLIP_INTEGRITY_FAILED', 'PAYSLIP_UNAVAILABLE', 'PAYROLL_PROCESSING_FAILED', 'PAYROLL_FAILED', 'ATTENDANCE_FORBIDDEN', 'EMPLOYEE_NOT_ELIGIBLE', 'ALREADY_CHECKED_IN', 'NOT_CHECKED_IN', 'ATTENDANCE_REQUEST_FAILED', 'TIME_OFF_FORBIDDEN', 'TIME_OFF_UNAVAILABLE', 'TIME_OFF_REQUEST_FAILED', 'OVERTIME_FORBIDDEN', 'TIMECARD_INVALID_STATE', 'TIMECARD_STALE', 'OVERTIME_REQUEST_FAILED', 'CONFIGURATION_DRIFT', 'ADMINISTRATOR_FALLBACK', 'ATTENDANCE_CORRECTION', 'SELF_SERVICE_ACCESS_UNAVAILABLE', 'SELF_SERVICE_UNAVAILABLE')`),
	check("operation_failures_count_nonnegative", sql`${table.occurrenceCount} >= 1`),
	check("operation_failures_time_order", sql`${table.lastSeenAt} >= ${table.firstSeenAt}`),
]);

export const privacyConsents = pgTable("privacy_consents", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	profileId: uuid("profile_id").notNull().references(() => profiles.id),
	consentType: privacyConsentType("consent_type").notNull().default("product_analytics"),
	granted: boolean("granted").notNull(),
	policyVersion: varchar("policy_version", { length: 50 }).notNull(),
	idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
	recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
	supersededAt: timestamp("superseded_at", { withTimezone: true }),
}, (table) => [
	index("privacy_consents_organization_profile_idx").on(table.organizationId, table.profileId, table.recordedAt.desc()),
	uniqueIndex("privacy_consents_idempotency_unique").on(table.organizationId, table.profileId, table.idempotencyKey),
	uniqueIndex("privacy_consents_current_unique").on(table.organizationId, table.profileId, table.consentType).where(sql`${table.supersededAt} IS NULL`),
]);

export const privacyRequests = pgTable("privacy_requests", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	profileId: uuid("profile_id").notNull().references(() => profiles.id),
	requestType: privacyRequestType("request_type").notNull().default("deletion"),
	status: privacyRequestStatus("status").notNull().default("submitted"),
	resolutionCode: privacyRequestResolution("resolution_code"),
	policyVersion: varchar("policy_version", { length: 50 }).notNull(),
	idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
	submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
	reviewedByProfileId: uuid("reviewed_by_profile_id").references(() => profiles.id),
	scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
	completedAt: timestamp("completed_at", { withTimezone: true }),
	failedAt: timestamp("failed_at", { withTimezone: true }),
	failureCode: varchar("failure_code", { length: 100 }),
	lastActionIdempotencyKey: varchar("last_action_idempotency_key", { length: 64 }),
	deletedCounts: jsonb("deleted_counts").notNull().default({}),
	...timestamps,
}, (table) => [
	index("privacy_requests_organization_status_idx").on(table.organizationId, table.status, table.submittedAt.desc(), table.id.desc()),
	index("privacy_requests_profile_submitted_idx").on(table.profileId, table.submittedAt.desc(), table.id.desc()),
	uniqueIndex("privacy_requests_idempotency_unique").on(table.organizationId, table.profileId, table.idempotencyKey),
	uniqueIndex("privacy_requests_open_unique").on(table.organizationId, table.profileId).where(sql`${table.status} IN ('submitted', 'under_review', 'approved', 'scheduled', 'failed')`),
	check("privacy_requests_failure_code_safe", sql`${table.failureCode} IS NULL OR ${table.failureCode} ~ '^[A-Z0-9_]{1,100}$'`),
]);

export const privacyHolds = pgTable("privacy_holds", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	profileId: uuid("profile_id").notNull().references(() => profiles.id),
	placedByProfileId: uuid("placed_by_profile_id").notNull().references(() => profiles.id),
	releasedByProfileId: uuid("released_by_profile_id").references(() => profiles.id),
	placedAt: timestamp("placed_at", { withTimezone: true }).defaultNow().notNull(),
	releasedAt: timestamp("released_at", { withTimezone: true }),
	active: boolean("active").notNull().default(true),
	lastActionIdempotencyKey: varchar("last_action_idempotency_key", { length: 64 }),
	...timestamps,
}, (table) => [
	index("privacy_holds_organization_profile_idx").on(table.organizationId, table.profileId, table.active),
	uniqueIndex("privacy_holds_active_unique").on(table.organizationId, table.profileId).where(sql`${table.active} = true`),
	check("privacy_holds_release_consistency", sql`(${table.active} = true AND ${table.releasedAt} IS NULL AND ${table.releasedByProfileId} IS NULL) OR (${table.active} = false AND ${table.releasedAt} IS NOT NULL AND ${table.releasedByProfileId} IS NOT NULL)`),
]);

export const privacyDeletionExecutions = pgTable("privacy_deletion_executions", {
	id: uuid("id").defaultRandom().primaryKey(),
	organizationId: uuid("organization_id").notNull().references(() => organizations.id),
	privacyRequestId: uuid("privacy_request_id").references(() => privacyRequests.id),
	executionKey: varchar("execution_key", { length: 100 }).notNull(),
	policyVersion: varchar("policy_version", { length: 50 }).notNull(),
	status: privacyDeletionStatus("status").notNull().default("processing"),
	batchSize: integer("batch_size").notNull().default(100),
	deletedCounts: jsonb("deleted_counts").notNull().default({}),
	failureCode: varchar("failure_code", { length: 100 }),
	startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true }),
	...timestamps,
}, (table) => [
	uniqueIndex("privacy_deletion_executions_key_unique").on(table.executionKey),
	index("privacy_deletion_executions_organization_started_idx").on(table.organizationId, table.startedAt.desc(), table.id.desc()),
	check("privacy_deletion_executions_batch_size_check", sql`${table.batchSize} BETWEEN 1 AND 100`),
	check("privacy_deletion_executions_failure_code_safe", sql`${table.failureCode} IS NULL OR ${table.failureCode} ~ '^[A-Z0-9_]{1,100}$'`),
]);
