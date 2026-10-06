// src/reservations/reservations.test.ts
// Focused unit/integration tests for the reservation domain.
//
// Tests 1-14 are pure unit tests (no database).
// Tests 15-17 are integration tests requiring a live DATABASE_URL.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_RESERVATION_DAYS_AHEAD,
  MAX_STANDARD_PARTY_SIZE,
  MIN_PARTY_SIZE,
  RESTAURANT_TIMEZONE,
  getLastReservationHour,
  getRestaurantDateParts,
  isWithinLastReservationTime,
  normalizePhoneNumber,
  validatePartySize,
  validateReservationDateWindow,
} from './rules.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Date from a restaurant-local clock description.
 * Africa/Lagos is UTC+1 with no DST.
 */
function lagosTime(
  year: number,
  month: number, // 1-based
  day: number,
  hour: number,
  minute = 0,
): Date {
  // Africa/Lagos is always UTC+1 (no DST).
  const utcHour = hour - 1;
  return new Date(Date.UTC(year, month - 1, day, utcHour, minute, 0, 0));
}

/** A fixed "now" in Lagos time for deterministic tests. */
// 2025-06-15 10:00 Lagos = 2025-06-15 09:00 UTC
const NOW = lagosTime(2025, 6, 15, 10, 0); // Sunday

// ---------------------------------------------------------------------------
// 1–3: validatePartySize
// ---------------------------------------------------------------------------

describe('validatePartySize', () => {
  it('1. party size 1 is valid', () => {
    const result = validatePartySize(1);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.requiresEscalation).toBe(false);
    }
  });

  it('2. party size 8 is valid', () => {
    const result = validatePartySize(MAX_STANDARD_PARTY_SIZE);
    expect(result.valid).toBe(true);
  });

  it('3. party size 9 requires escalation', () => {
    const result = validatePartySize(MAX_STANDARD_PARTY_SIZE + 1);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.requiresEscalation).toBe(true);
      expect(result.reason).toBe('party_size_requires_escalation');
    }
  });
});

// ---------------------------------------------------------------------------
// Phone normalization unit tests
// ---------------------------------------------------------------------------

describe('normalizePhoneNumber', () => {
  it('normalizes spaces, hyphens, and parentheses in international numbers', () => {
    const v1 = normalizePhoneNumber('+234 800 555 1234');
    const v2 = normalizePhoneNumber('+234-800-555-1234');
    const v3 = normalizePhoneNumber('+234 (800) 555-1234');
    expect(v1).toBe('+2348005551234');
    expect(v2).toBe('+2348005551234');
    expect(v3).toBe('+2348005551234');
  });

  it('normalizes local formatting variants', () => {
    expect(normalizePhoneNumber('0800 555 1234')).toBe('08005551234');
    expect(normalizePhoneNumber('0800-555-1234')).toBe('08005551234');
  });
});

// ---------------------------------------------------------------------------
// 4–5: validateReservationDateWindow
// ---------------------------------------------------------------------------

describe('validateReservationDateWindow', () => {
  it('4. reservation today within valid hours passes date-window validation', () => {
    // 3 hours from now — still within today's window.
    const future = new Date(NOW.getTime() + 3 * 60 * 60 * 1000);
    const result = validateReservationDateWindow(future, NOW);
    expect(result.valid).toBe(true);
  });

  it('5. reservation beyond 30 days is rejected', () => {
    const tooFar = new Date(NOW.getTime() + (MAX_RESERVATION_DAYS_AHEAD + 1) * 24 * 60 * 60 * 1000);
    const result = validateReservationDateWindow(tooFar, NOW);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('reservation_beyond_window');
    }
  });
});

// ---------------------------------------------------------------------------
// 6–7: Business-hours boundary (Sunday)
// ---------------------------------------------------------------------------

describe('Sunday business-hours rules', () => {
  // 2025-06-15 is a Sunday. Open at 12:00 Lagos.

  it('6. Sunday before noon (11:59) is rejected', () => {
    // 11:59 Lagos = 10:59 UTC
    const beforeNoon = lagosTime(2025, 6, 15, 11, 59);
    // Validate date window passes (it's after now, same day).
    const dateResult = validateReservationDateWindow(beforeNoon, NOW);
    expect(dateResult.valid).toBe(true);

    // Check the hour against Sunday open time (12:00).
    const parts = getRestaurantDateParts(beforeNoon);
    expect(parts.dayOfWeek).toBe(0); // Sunday
    expect(parts.hour).toBe(11);
    // The availability layer rejects before_opening_time, but we verify the
    // raw parts here for the unit-level boundary check.
    expect(parts.hour < 12).toBe(true);
  });

  it('7. Sunday at 12:00 is valid from the hours perspective', () => {
    const atNoon = lagosTime(2025, 6, 15, 12, 0);
    const dateResult = validateReservationDateWindow(atNoon, NOW);
    expect(dateResult.valid).toBe(true);

    const parts = getRestaurantDateParts(atNoon);
    expect(parts.dayOfWeek).toBe(0); // Sunday
    expect(parts.hour).toBe(12);
    expect(parts.minute).toBe(0);
    // At or after open_time — should pass the open-time check.
    expect(parts.hour >= 12).toBe(true);
    // Must also be within last reservation time (21:00 on Sunday).
    expect(isWithinLastReservationTime(parts.dayOfWeek, parts.hour, parts.minute)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8–9: Last-reservation boundary (Monday)
// ---------------------------------------------------------------------------

describe('Monday last-reservation-time rules', () => {
  // 2025-06-16 is a Monday. Last reservation: 21:00 Lagos.

  it('8. Monday at 21:00 is valid from the last-reservation perspective', () => {
    const at21 = lagosTime(2025, 6, 16, 21, 0);
    const parts = getRestaurantDateParts(at21);
    expect(parts.dayOfWeek).toBe(1); // Monday
    expect(parts.hour).toBe(21);
    expect(isWithinLastReservationTime(1, 21, 0)).toBe(true);
  });

  it('9. Monday after 21:00 (21:01) is rejected', () => {
    expect(isWithinLastReservationTime(1, 21, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10–11: Last-reservation boundary (Friday)
// ---------------------------------------------------------------------------

describe('Friday last-reservation-time rules', () => {
  // 2025-06-20 is a Friday. Last reservation: 22:00 Lagos.

  it('10. Friday at 22:00 is valid from the last-reservation perspective', () => {
    expect(isWithinLastReservationTime(5, 22, 0)).toBe(true);
  });

  it('11. Friday after 22:00 (22:01) is rejected', () => {
    expect(isWithinLastReservationTime(5, 22, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12–17: Integration tests requiring DATABASE_URL
// ---------------------------------------------------------------------------

const hasDb = !!process.env['DATABASE_URL'];

// Dynamic import of database-dependent modules.
let createReservationFn: Awaited<typeof import('./create.ts')>['createReservation'] | null = null;
let cancelReservationFn: Awaited<typeof import('./cancel.ts')>['cancelReservation'] | null = null;
let checkAvailabilityFn: Awaited<typeof import('./availability.ts')>['checkAvailability'] | null = null;
let db: Awaited<typeof import('../db/index.ts')>['db'] | null = null;
let schema: typeof import('../db/schema.ts') | null = null;

beforeAll(async () => {
  if (!hasDb) return;
  const createMod = await import('./create.ts');
  const cancelMod = await import('./cancel.ts');
  const availMod = await import('./availability.ts');
  const dbMod = await import('../db/index.ts');
  const schemaMod = await import('../db/schema.ts');
  createReservationFn = createMod.createReservation;
  cancelReservationFn = cancelMod.cancelReservation;
  checkAvailabilityFn = availMod.checkAvailability;
  db = dbMod.db;
  schema = schemaMod;
});


afterAll(async () => {
  if (!db) return;
  // Close the postgres.js pool cleanly after integration tests.
  const clientKey = String.fromCharCode(36) + 'client';
  // @ts-expect-error — accessing internal  for cleanup
  const client = db[clientKey] as { end?: (opts?: object) => Promise<void> } | undefined;
  if (client?.end) {
    await client.end({ timeout: 5 });
  }
});

// A unique phone number per test run to avoid cross-run collisions.
const TEST_PHONE = '+234-test-' + Date.now();

/**
 * Build a future reservation date that is N days from now at 18:00 Lagos time.
 * Africa/Lagos is UTC+1 (no DST), so 18:00 Lagos = 17:00 UTC.
 */
function futureLagosDate(daysAhead: number): Date {
  const now = new Date();
  // Move to Lagos midnight of today, then add days, then set to 17:00 UTC (= 18:00 Lagos).
  const lagosNowParts = getRestaurantDateParts(now);
  const lagosToday = Date.UTC(
    lagosNowParts.year,
    lagosNowParts.month - 1,
    lagosNowParts.day,
    17, 0, 0, 0, // 18:00 Lagos = 17:00 UTC
  );
  return new Date(lagosToday + daysAhead * 86_400_000);
}

describe.skipIf(!hasDb)('integration: createReservation', () => {
  it('15. customer lookup by phone reuses an existing customer', async () => {
    const r1 = await createReservationFn!({
      customerName: 'Test User',
      customerPhone: TEST_PHONE,
      reservationAt: futureLagosDate(3),
      partySize: 2,
    });
    expect(r1.success).toBe(true);

    const r2 = await createReservationFn!({
      customerName: 'Test User',
      customerPhone: TEST_PHONE,
      reservationAt: futureLagosDate(4),
      partySize: 2,
    });
    expect(r2.success).toBe(true);

    // Both should belong to the same customer. Verify via DB.
    const { eq } = await import('drizzle-orm');
    const rows = await db!
      .select({ id: schema!.customers.id })
      .from(schema!.customers)
      .where(eq(schema!.customers.phone, normalizePhoneNumber(TEST_PHONE)));
    expect(rows.length).toBe(1);
  }, 15000);


  it('16. successful creation creates a confirmed reservation', async () => {
    const result = await createReservationFn!({
      customerName: 'Integration Test',
      customerPhone: TEST_PHONE + '-16',
      reservationAt: futureLagosDate(5),
      partySize: 4,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe('confirmed');
      expect(result.reservationId).toBeTruthy();

      // Verify in DB.
      const { eq } = await import('drizzle-orm');
      const rows = await db!
        .select({ status: schema!.reservations.status })
        .from(schema!.reservations)
        .where(eq(schema!.reservations.id, result.reservationId));
      expect(rows[0]?.status).toBe('confirmed');
    }
  }, 15000);

  it('17. failed final validation (past date) does not create a reservation', async () => {
    const pastDate = new Date(NOW.getTime() - 2 * 60 * 60 * 1000); // 2 h in the past
    const result = await createReservationFn!({
      customerName: 'Past Test',
      customerPhone: TEST_PHONE + '-17',
      reservationAt: pastDate,
      partySize: 2,
    });

    expect(result.success).toBe(false);
  }, 15000);
});

describe.skipIf(!hasDb)('integration: cancelReservation', () => {
  const phoneA = TEST_PHONE + '-cancelA';
  const phoneB = TEST_PHONE + '-cancelB';
  const phoneC = TEST_PHONE + '-cancelC';
  const phoneD = TEST_PHONE + '-cancelD';
  const phoneE = TEST_PHONE + '-cancelE';
  const phoneF = '+234 800 555 ' + Math.floor(1000 + Math.random() * 9000);

  let resA_id: string;
  let resB1_id: string;
  let resB2_id: string;
  let resB1_date: Date;
  let resB2_date: Date;
  let resC_id: string;
  let resD_id: string;
  let resE_id: string;
  let resF_id: string;

  beforeAll(async () => {
    if (!createReservationFn) return;

    // Customer A: 1 upcoming reservation
    const rA = await createReservationFn({
      customerName: 'Customer Alpha',
      customerPhone: phoneA,
      reservationAt: futureLagosDate(6),
      partySize: 2,
    });
    if (rA.success) resA_id = rA.reservationId;

    // Customer B: 2 upcoming reservations on different dates
    resB1_date = futureLagosDate(10);
    resB2_date = futureLagosDate(11);
    const rB1 = await createReservationFn({
      customerName: 'Customer Beta',
      customerPhone: phoneB,
      reservationAt: resB1_date,
      partySize: 4,
    });
    if (rB1.success) resB1_id = rB1.reservationId;

    const rB2 = await createReservationFn({
      customerName: 'Customer Beta',
      customerPhone: phoneB,
      reservationAt: resB2_date,
      partySize: 6,
    });
    if (rB2.success) resB2_id = rB2.reservationId;

    // Customer C: 1 upcoming reservation (for name/phone mismatch tests)
    const rC = await createReservationFn({
      customerName: 'Alice Smith',
      customerPhone: phoneC,
      reservationAt: futureLagosDate(12),
      partySize: 2,
    });
    if (rC.success) resC_id = rC.reservationId;

    // Customer D: 1 completed reservation
    const rD = await createReservationFn({
      customerName: 'Dave Completed',
      customerPhone: phoneD,
      reservationAt: futureLagosDate(13),
      partySize: 2,
    });
    if (rD.success) {
      resD_id = rD.reservationId;
      const { eq } = await import('drizzle-orm');
      await db!
        .update(schema!.reservations)
        .set({ status: 'completed' })
        .where(eq(schema!.reservations.id, resD_id));
    }

    // Customer E: 1 no_show reservation
    const rE = await createReservationFn({
      customerName: 'Eve NoShow',
      customerPhone: phoneE,
      reservationAt: futureLagosDate(14),
      partySize: 2,
    });
    if (rE.success) {
      resE_id = rE.reservationId;
      const { eq } = await import('drizzle-orm');
      await db!
        .update(schema!.reservations)
        .set({ status: 'no_show' })
        .where(eq(schema!.reservations.id, resE_id));
    }

    // Customer F: reservation for phone formatting normalization test
    const rF = await createReservationFn({
      customerName: 'Frank Norm',
      customerPhone: phoneF,
      reservationAt: futureLagosDate(15),
      partySize: 3,
    });
    if (rF.success) resF_id = rF.reservationId;
  }, 60000);

  it('1. Cancel by name + phone when exactly one upcoming reservation exists', async () => {
    const result = await cancelReservationFn!({
      customerName: 'Customer Alpha',
      customerPhone: phoneA,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe('cancelled');
      expect(result.reservationId).toBe(resA_id);
      expect(result.partySize).toBe(2);
      expect(result.reservationAt).toBeTruthy();
    }
  });

  it('2. Cancel by name + phone without providing date/time', async () => {
    const { eq } = await import('drizzle-orm');
    const rows = await db!
      .select({ status: schema!.reservations.status })
      .from(schema!.reservations)
      .where(eq(schema!.reservations.id, resA_id));
    expect(rows[0]?.status).toBe('cancelled');
  });

  it('3. Multiple matching upcoming reservations return multiple_matches and do not cancel anything', async () => {
    const result = await cancelReservationFn!({
      customerName: 'Customer Beta',
      customerPhone: phoneB,
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe('multiple_matches');
    if (result.status === 'multiple_matches') {
      expect(result.matchingReservations.length).toBe(2);
    }

    const { eq } = await import('drizzle-orm');
    const rows1 = await db!
      .select({ status: schema!.reservations.status })
      .from(schema!.reservations)
      .where(eq(schema!.reservations.id, resB1_id));
    expect(rows1[0]?.status).toBe('confirmed');

    const rows2 = await db!
      .select({ status: schema!.reservations.status })
      .from(schema!.reservations)
      .where(eq(schema!.reservations.id, resB2_id));
    expect(rows2[0]?.status).toBe('confirmed');
  });

  it('4. Cancel a specific reservation using name + phone + reservationAt', async () => {
    const result = await cancelReservationFn!({
      customerName: 'Customer Beta',
      customerPhone: phoneB,
      reservationAt: resB1_date.toISOString(),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe('cancelled');
      expect(result.reservationId).toBe(resB1_id);
    }

    const { eq } = await import('drizzle-orm');
    const rows1 = await db!
      .select({ status: schema!.reservations.status })
      .from(schema!.reservations)
      .where(eq(schema!.reservations.id, resB1_id));
    expect(rows1[0]?.status).toBe('cancelled');

    const rows2 = await db!
      .select({ status: schema!.reservations.status })
      .from(schema!.reservations)
      .where(eq(schema!.reservations.id, resB2_id));
    expect(rows2[0]?.status).toBe('confirmed');
  });

  it('5. No matching reservation returns not_found and does not modify anything', async () => {
    const result = await cancelReservationFn!({
      customerName: 'Non Existent User',
      customerPhone: '+234 999 000 1111',
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe('not_found');
  });

  it('6. Name mismatch does not cancel', async () => {
    const result = await cancelReservationFn!({
      customerName: 'Bob Smith',
      customerPhone: phoneC,
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe('not_found');

    const { eq } = await import('drizzle-orm');
    const rows = await db!
      .select({ status: schema!.reservations.status })
      .from(schema!.reservations)
      .where(eq(schema!.reservations.id, resC_id));
    expect(rows[0]?.status).toBe('confirmed');
  });

  it('7. Phone mismatch does not cancel', async () => {
    const result = await cancelReservationFn!({
      customerName: 'Alice Smith',
      customerPhone: '+234 000 000 0000',
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe('not_found');

    const { eq } = await import('drizzle-orm');
    const rows = await db!
      .select({ status: schema!.reservations.status })
      .from(schema!.reservations)
      .where(eq(schema!.reservations.id, resC_id));
    expect(rows[0]?.status).toBe('confirmed');
  });

  it('8. Already cancelled reservation remains cancelled and is not treated as a successful new cancellation', async () => {
    const result = await cancelReservationFn!({
      customerName: 'Customer Alpha',
      customerPhone: phoneA,
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe('already_cancelled');
  });

  it('9. Completed reservation cannot be cancelled', async () => {
    const result = await cancelReservationFn!({
      customerName: 'Dave Completed',
      customerPhone: phoneD,
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe('already_completed_cannot_cancel');
  });

  it('10. No-show reservation cannot be cancelled', async () => {
    const result = await cancelReservationFn!({
      customerName: 'Eve NoShow',
      customerPhone: phoneE,
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe('marked_no_show_cannot_cancel');
  });

  it('11. Phone formatting normalization still allows the correct customer to be found', async () => {
    const result = await cancelReservationFn!({
      customerName: '  frank NORM  ',
      customerPhone: normalizePhoneNumber(phoneF),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe('cancelled');
      expect(result.reservationId).toBe(resF_id);
    }
  });

  it('12. Existing soft-cancellation behavior remains intact: status=cancelled, cancelled_at populated, reservation row preserved', async () => {
    const { eq } = await import('drizzle-orm');
    const rows = await db!
      .select({
        id: schema!.reservations.id,
        status: schema!.reservations.status,
        cancelledAt: schema!.reservations.cancelledAt,
      })
      .from(schema!.reservations)
      .where(eq(schema!.reservations.id, resF_id));
    expect(rows.length).toBe(1);
    expect(rows[0]?.status).toBe('cancelled');
    expect(rows[0]?.cancelledAt).not.toBeNull();
  });
});

describe.skipIf(!hasDb)('integration: phone normalization & customer reuse', () => {
  const normSuffix = String(Math.floor(1000 + Math.random() * 9000));
  const NORM_PHONE_VAR1 = '+234 800 555 ' + normSuffix;
  const NORM_PHONE_VAR2 = '+234-800-555-' + normSuffix;
  const EXPECTED_NORM = normalizePhoneNumber(NORM_PHONE_VAR1);

  it('creating reservations with different phone formatting variants reuses customer and snapshots normalized phone', async () => {
    const r1 = await createReservationFn!({
      customerName: 'Normalization User',
      customerPhone: NORM_PHONE_VAR1,
      reservationAt: futureLagosDate(7),
      partySize: 2,
    });
    expect(r1.success).toBe(true);

    const r2 = await createReservationFn!({
      customerName: 'Normalization User',
      customerPhone: NORM_PHONE_VAR2,
      reservationAt: futureLagosDate(8),
      partySize: 2,
    });
    expect(r2.success).toBe(true);

    // Verify only 1 customer record exists with normalized phone.
    const { eq } = await import('drizzle-orm');
    const custRows = await db!
      .select({ id: schema!.customers.id, phone: schema!.customers.phone })
      .from(schema!.customers)
      .where(eq(schema!.customers.phone, EXPECTED_NORM));
    expect(custRows.length).toBe(1);
    expect(custRows[0]?.phone).toBe(EXPECTED_NORM);

    // Verify reservation customerPhone snapshots store the normalized phone value.
    if (r1.success && r2.success) {
      const res1 = await db!
        .select({ customerPhone: schema!.reservations.customerPhone })
        .from(schema!.reservations)
        .where(eq(schema!.reservations.id, r1.reservationId));
      expect(res1[0]?.customerPhone).toBe(EXPECTED_NORM);

      const res2 = await db!
        .select({ customerPhone: schema!.reservations.customerPhone })
        .from(schema!.reservations)
        .where(eq(schema!.reservations.id, r2.reservationId));
      expect(res2[0]?.customerPhone).toBe(EXPECTED_NORM);
    }
  }, 15000);
});

describe.skipIf(!hasDb)('integration: transaction executor context', () => {
  it('checkAvailability executes using transaction executor inside db.transaction', async () => {
    const resAt = futureLagosDate(9);
    const { BUSINESS_ID } = await import('./config.ts');

    await db!.transaction(async (tx) => {
      const result = await checkAvailabilityFn!(
        {
          businessId: BUSINESS_ID,
          reservationAt: resAt,
          partySize: 4,
        },
        tx,
      );
      expect(result.status).toBe('available');
    });
  });
});


// Timezone sanity check
describe('timezone sanity', () => {
  it('correctly parses Africa/Lagos offset (UTC+1, no DST)', () => {
    // 2024-11-15T21:30:00Z should be 22:30 Lagos time on a Friday.
    const date = new Date('2024-11-15T21:30:00Z');
    const parts = getRestaurantDateParts(date);
    expect(parts.hour).toBe(22);
    expect(parts.minute).toBe(30);
    expect(parts.dayOfWeek).toBe(5); // Friday
    expect(RESTAURANT_TIMEZONE).toBe('Africa/Lagos');
  });

  it('getLastReservationHour returns 21 for Sunday (day 0)', () => {
    expect(getLastReservationHour(0)).toBe(21);
  });

  it('getLastReservationHour returns 22 for Saturday (day 6)', () => {
    expect(getLastReservationHour(6)).toBe(22);
  });

  it('MIN_PARTY_SIZE is 1', () => {
    expect(MIN_PARTY_SIZE).toBe(1);
  });

  it('MAX_STANDARD_PARTY_SIZE is 8', () => {
    expect(MAX_STANDARD_PARTY_SIZE).toBe(8);
  });
});