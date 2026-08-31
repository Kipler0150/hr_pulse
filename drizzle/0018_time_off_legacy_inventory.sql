DO $$
DECLARE
  issue_count integer;
BEGIN
  SELECT count(*) INTO issue_count
  FROM leave_requests request
  LEFT JOIN employees employee ON employee.id = request.employee_id
  WHERE employee.id IS NULL OR request.organization_id IS NULL OR request.organization_id <> employee.organization_id;
  IF issue_count > 0 THEN RAISE EXCEPTION 'TIME_OFF_MIGRATION_ORPHAN_OR_ORGANIZATION_MISMATCH: % rows', issue_count; END IF;

  SELECT count(*) INTO issue_count
  FROM leave_requests
  WHERE end_date < start_date OR char_length(COALESCE(reason, '')) > 500;
  IF issue_count > 0 THEN RAISE EXCEPTION 'TIME_OFF_MIGRATION_INVALID_RANGE_OR_REASON: % rows', issue_count; END IF;

  SELECT count(*) INTO issue_count
  FROM leave_requests
  WHERE status <> 'draft';
  IF issue_count > 0 THEN RAISE EXCEPTION 'TIME_OFF_MIGRATION_UNEXPECTED_VISIBLE_STATE: % rows', issue_count; END IF;

  SELECT count(*) INTO issue_count
  FROM leave_requests first_request
  JOIN leave_requests second_request
    ON second_request.id > first_request.id
   AND second_request.employee_id = first_request.employee_id
   AND second_request.status IN ('submitted', 'approved')
   AND first_request.status IN ('submitted', 'approved')
   AND daterange(first_request.start_date, first_request.end_date, '[]') && daterange(second_request.start_date, second_request.end_date, '[]');
  IF issue_count > 0 THEN RAISE EXCEPTION 'TIME_OFF_MIGRATION_ACTIVE_OVERLAP: % pairs', issue_count; END IF;
END $$;
