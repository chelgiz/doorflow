/**
 * First-contact SLA for CRM leads (step 2.2).
 *
 * The store commits to contacting a new lead within two hours. A lead is
 * overdue while no first contact is recorded and the SLA window has passed.
 */
export const FIRST_CONTACT_SLA_MS = 2 * 60 * 60 * 1000;

import { isLeadClosed } from "@/lib/admin/lead-actions";

export type SlaLead = {
  createdAt: Date;
  firstContactAt: Date | null;
  status: string;
};

export function firstContactDueAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + FIRST_CONTACT_SLA_MS);
}

export function isFirstContactOverdue(lead: SlaLead, now: Date = new Date()): boolean {
  if (lead.firstContactAt !== null) return false;
  // Closed leads are not expected to be contacted any more (same rule as for
  // the planned action), so they never count as SLA-overdue.
  if (isLeadClosed(lead.status)) return false;
  return now.getTime() - lead.createdAt.getTime() > FIRST_CONTACT_SLA_MS;
}

/** Hours elapsed since the lead was created, rounded down, never negative. */
export function hoursSinceCreation(lead: SlaLead, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - lead.createdAt.getTime()) / 3_600_000));
}
