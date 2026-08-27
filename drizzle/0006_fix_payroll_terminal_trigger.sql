CREATE OR REPLACE FUNCTION protect_terminal_payroll_records() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'payroll financial records cannot be deleted'; END IF;
	IF TG_TABLE_NAME = 'payroll_runs' AND OLD.status::text = 'completed' THEN RAISE EXCEPTION 'completed payroll runs are immutable'; END IF;
	IF TG_TABLE_NAME = 'payouts' AND OLD.status::text = 'finalized' THEN RAISE EXCEPTION 'finalized payouts are immutable'; END IF;
	IF TG_TABLE_NAME = 'payslips' AND OLD.status::text = 'generated' THEN RAISE EXCEPTION 'generated payslips are immutable'; END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
