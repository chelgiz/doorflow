/**
 * First-contact SLA for CRM leads (step 2.2, reworked in step 7).
 *
 * The store commits to contacting a new lead within four *working* hours: a lead
 * that arrives at 23:00 is still fine at 01:00, because the clock only runs
 * during opening hours. Working hours live in `working-hours.ts`.
 */
import { isLeadClosed } from "@/lib/admin/lead-actions";
import {
  WORKING_HOURS_DESCRIPTION,
  addWorkingMinutes,
  workingMinutesBetween,
} from "@/lib/admin/working-hours";

export const FIRST_CONTACT_SLA_MINUTES = 240;
export const FIRST_CONTACT_SLA_DESCRIPTION = `4 рабочих часа (${WORKING_HOURS_DESCRIPTION})`;

export type SlaLead = {
  createdAt: Date;
  firstContactAt: Date | null;
  status: string;
};

export function firstContactDueAt(createdAt: Date): Date {
  return addWorkingMinutes(createdAt, FIRST_CONTACT_SLA_MINUTES);
}

export function isFirstContactOverdue(lead: SlaLead, now: Date = new Date()): boolean {
  if (lead.firstContactAt !== null) return false;
  // Closed leads are not expected to be contacted any more (same rule as for
  // the planned action), so they never count as SLA-overdue.
  if (isLeadClosed(lead.status)) return false;
  return now.getTime() > firstContactDueAt(lead.createdAt).getTime();
}

/** Working hours elapsed since the lead was created, rounded down, never negative. */
export function workingHoursSinceCreation(lead: SlaLead, now: Date = new Date()): number {
  return Math.max(0, Math.floor(workingMinutesBetween(lead.createdAt, now) / 60));
}
