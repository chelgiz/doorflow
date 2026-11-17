/**
 * Planned follow-up actions for CRM leads (step 2.3).
 *
 * A lead is overdue by action when `nextActionAt` is in the past and the lead
 * is still open: closed leads (sale, rejection, completed) never show as
 * overdue, because no follow-up is expected any more.
 */
export const CLOSED_LEAD_STATUSES = ["SALE", "REJECTED", "COMPLETED"] as const;

const closedStatuses = new Set<string>(CLOSED_LEAD_STATUSES);

export type ActionLead = {
  nextActionAt: Date | null;
  status: string;
};

export function isLeadClosed(status: string): boolean {
  return closedStatuses.has(status);
}

export function isActionOverdue(lead: ActionLead, now: Date = new Date()): boolean {
  if (lead.nextActionAt === null) return false;
  if (isLeadClosed(lead.status)) return false;
  return lead.nextActionAt.getTime() < now.getTime();
}

/** Hours until the planned action; negative values mean it is overdue. */
export function hoursUntilAction(lead: ActionLead, now: Date = new Date()): number | null {
  if (lead.nextActionAt === null) return null;
  return Math.round((lead.nextActionAt.getTime() - now.getTime()) / 3_600_000);
}
