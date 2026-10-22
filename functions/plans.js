// ACM Docs plans: what each one allows and what it costs. The server is the only judge: the app shows
// these numbers, but every limit is counted and enforced here (functions + security rules).
const MB = 1024 * 1024;
const GB = 1024 * MB;

/** What can be counted per calendar month (UTC). */
export const ACTIONS = ['docs', 'scans', 'invoices', 'acmSend', 'acmOpen'];

/**
 * devices: active devices at once · cloud: encrypted storage (bytes) · month: actions per month.
 * family / business: what EACH account of the group gets.
 */
export const PLANS = {
  basic: { rank: 0, devices: 1, cloud: 100 * MB, month: { docs: 3, scans: 3, invoices: 2, acmSend: 3, acmOpen: 5 } },
  personal: { rank: 1, devices: 2, cloud: 5 * GB, month: { docs: 60, scans: 60, invoices: 30, acmSend: 30, acmOpen: 100 } },
  family: { rank: 2, devices: 2, cloud: 10 * GB, month: { docs: 150, scans: 150, invoices: 60, acmSend: 60, acmOpen: 200 }, seats: 5 },
  pro: { rank: 3, devices: 3, cloud: 50 * GB, month: { docs: 2000, scans: 2000, invoices: 2000, acmSend: 1000, acmOpen: 3000 } },
  business: { rank: 3, devices: 3, cloud: 25 * GB, month: { docs: 2000, scans: 2000, invoices: 2000, acmSend: 1000, acmOpen: 3000 }, minSeats: 3, maxSeats: 500 },
};

/** Prices in euro cents, VAT included. business: per account. */
export const PRICES = {
  personal: { month: 399, year: 3900 },
  pro: { month: 899, year: 8900 },
  family: { month: 1299, year: 12900 },
  business: { month: 699, year: 6900 },
};

export const PAID = ['personal', 'pro', 'family', 'business'];
export const GROUP_PLANS = ['family', 'business'];

/** "2026-10" in UTC: the month the counters belong to. */
export const monthOf = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 7);
