/**
 * Repeat-touch rule for CRM leads (step 2.5).
 *
 * The store commits to contacting a lead again three days after the first
 * contact when the lead has not moved on: no later status change, still open,
 * and no future action already planned. Such leads are "due for a follow-up"
 * and must appear in the manager's daily list.
 */
import { isLeadClosed } from "@/lib/admin/lead-actions";

export const FOLLOW_UP_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export type FollowUpLead = {
  firstContactAt: Date | null;
  status: string;
  nextActionAt: Date | null;
  lastStatusChangeAt?: Date | null;
};

export function followUpDueAt(firstContactAt: Date): Date {
  return new Date(firstContactAt.getTime() + FOLLOW_UP_AFTER_MS);
}

export function needsFollowUp(lead: FollowUpLead, now: Date = new Date()): boolean {
  if (lead.firstContactAt === null) return false;
  if (isLeadClosed(lead.status)) return false;
  // A future planned action means the manager already scheduled the next touch.
  if (lead.nextActionAt !== null && lead.nextActionAt.getTime() > now.getTime()) return false;
  if (now.getTime() - lead.firstContactAt.getTime() < FOLLOW_UP_AFTER_MS) return false;
  // Any status change after the first contact means the lead moved on.
  if (
    lead.lastStatusChangeAt &&
    lead.lastStatusChangeAt.getTime() > lead.firstContactAt.getTime()
  ) {
    return false;
  }
  return true;
}

/** Whole days elapsed since the first contact, never negative. */
export function daysSinceFirstContact(lead: FollowUpLead, now: Date = new Date()): number | null {
  if (lead.firstContactAt === null) return null;
  return Math.max(0, Math.floor((now.getTime() - lead.firstContactAt.getTime()) / 86_400_000));
}
