// src/reservations/config.ts
// Stable business constants shared across the reservations domain.
// Centralised here to avoid importing from seed.ts in production code.

/**
 * Stable UUID for the single Presh's Kitchen business record.
 * Must match the value used in src/db/seed.ts.
 */
export const BUSINESS_ID = '11111111-0001-4000-a000-000000000001';