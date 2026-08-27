ALTER TABLE "attendance_intervals" ADD CONSTRAINT "attendance_clock_order_check" CHECK ("attendance_intervals"."clock_out" IS NULL OR "attendance_intervals"."clock_out" > "attendance_intervals"."clock_in");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_not_self" CHECK ("employees"."manager_id" IS NULL OR "employees"."manager_id" <> "employees"."id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_termination_date_check" CHECK ("employees"."termination_date" IS NULL OR "employees"."termination_date" >= "employees"."hire_date");--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_date_order_check" CHECK ("leave_requests"."end_date" >= "leave_requests"."start_date");--> statement-breakpoint
ALTER TABLE "pay_settings" ADD CONSTRAINT "pay_settings_effective_dates_check" CHECK ("pay_settings"."effective_to" IS NULL OR "pay_settings"."effective_to" >= "pay_settings"."effective_from");--> statement-breakpoint
ALTER TABLE "pay_settings" ADD CONSTRAINT "pay_settings_gross_nonnegative" CHECK ("pay_settings"."gross_amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "pay_settings" ADD CONSTRAINT "pay_settings_deductions_nonnegative" CHECK ("pay_settings"."flat_deductions_minor" >= 0);--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_gross_nonnegative" CHECK ("payouts"."gross_amount_minor" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_deductions_nonnegative" CHECK ("payouts"."deductions_amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_net_check" CHECK ("payouts"."net_amount_minor" = "payouts"."gross_amount_minor" - "payouts"."deductions_amount_minor");--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_period_order_check" CHECK ("payroll_runs"."period_end" >= "payroll_runs"."period_start");--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_totals_nonnegative" CHECK ("payroll_runs"."gross_total_minor" IS NULL OR "payroll_runs"."gross_total_minor" >= 0);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_deductions_nonnegative" CHECK ("payroll_runs"."deductions_total_minor" IS NULL OR "payroll_runs"."deductions_total_minor" >= 0);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_net_nonnegative" CHECK ("payroll_runs"."net_total_minor" IS NULL OR "payroll_runs"."net_total_minor" >= 0);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_net_total_check" CHECK ("payroll_runs"."net_total_minor" IS NULL OR "payroll_runs"."net_total_minor" = "payroll_runs"."gross_total_minor" - "payroll_runs"."deductions_total_minor");
