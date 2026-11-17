/**
 * First-contact SLA for CRM leads (step 2.2).
 *
 * The store commits to contacting a new lead within two hours. A lead is
 * overdue while no first contact is recorded and the SLA window has passed.
 */
export const FIRST_CONTACT_SLA_MS = 2 * 60 * 60 * 1000;

export type SlaLead = {
  createdAt: Date;
  firstContactAt: Date | null;
};

export function firstContactDueAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + FIRST_CONTACT_SLA_MS);
}

export function isFirstContactOverdue(lead: SlaLead, now: Date = new Date()): boolean {
  if (lead.firstContactAt !== null) return false;
  return now.getTime() - lead.createdAt.getTime() > FIRST_CONTACT_SLA_MS;
}

/** Hours elapsed since the lead was created, rounded down, never negative. */
export function hoursSinceCreation(lead: SlaLead, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - lead.createdAt.getTime()) / 3_600_000));
}
