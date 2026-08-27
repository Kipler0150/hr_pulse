const transitions = {
  employee: {
    active: ["inactive", "terminated"],
    inactive: ["active", "terminated"],
    terminated: [],
  },
  attendance: {
    open: ["completed"],
    completed: [],
  },
  leave: {
    draft: ["submitted"],
    submitted: ["approved", "declined", "cancelled"],
    approved: [],
    declined: [],
    cancelled: [],
  },
  payroll: {
    queued: ["processing", "failed"],
    processing: ["completed", "failed"],
    completed: [],
    failed: ["queued"],
  },
  payout: {
    pending: ["processing", "failed"],
    processing: ["finalized", "failed"],
    finalized: [],
    failed: ["pending"],
  },
  payslip: {
    pending: ["generated", "failed"],
    generated: [],
    failed: ["pending"],
  },
};

export function assertTransition(entity, currentStatus, nextStatus) {
  const allowed = transitions[entity]?.[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new Error(`Invalid ${entity} transition from ${currentStatus} to ${nextStatus}`);
  }
  return nextStatus;
}

export function assertMutable(entity, status) {
  const terminal = transitions[entity]?.[status]?.length === 0;
  if (terminal) {
    throw new Error(`${entity} records in ${status} status are immutable`);
  }
  return true;
}

export function getTransitions(entity) {
  return transitions[entity] ? structuredClone(transitions[entity]) : {};
}
