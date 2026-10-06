// src/reservations/rules.ts
// Pure business-rule validation for Presh's Kitchen.
// No database access. No side effects.

// ---------------------------------------------------------------------------
// Named constants — single source of truth for all reservation limits
// ---------------------------------------------------------------------------

/** Minimum valid party size for any reservation. */
export const MIN_PARTY_SIZE = 1;

/** Maximum party size that can be booked automatically without staff. */
export const MAX_STANDARD_PARTY_SIZE = 8;

/**
 * Maximum number of calendar days in advance a reservation may be requested.
 * Evaluated in Africa/Lagos (restaurant timezone).
 */
export const MAX_RESERVATION_DAYS_AHEAD = 30;

/** Restaurant timezone identifier. */
export const RESTAURANT_TIMEZONE = 'Africa/Lagos';

/**
 * Last reservation time (24-hour) for days with a 21:00 cutoff.
 * Applies to: Sunday (0), Monday (1), Tuesday (2), Wednesday (3), Thursday (4).
 */
export const LAST_RESERVATION_HOUR_STANDARD = 21; // 9:00 PM

/**
 * Last reservation time (24-hour) for days with a 22:00 cutoff.
 * Applies to: Friday (5), Saturday (6).
 */
export const LAST_RESERVATION_HOUR_EXTENDED = 22; // 10:00 PM

/** Day-of-week values (0=Sunday…6=Saturday) that use the extended cutoff. */
export const EXTENDED_CUTOFF_DAYS = new Set([5, 6]); // Friday, Saturday

/**
 * Normalizes a customer phone number by stripping formatting punctuation
 * (spaces, parentheses, hyphens, dots) while preserving digits and any leading '+'.
 *
 * Examples:
 *   "+234 800 555 1234"   → "+2348005551234"
 *   "+234 (800) 555-1234" → "+2348005551234"
 *   "0800-555-1234"       → "08005551234"
 */
export function normalizePhoneNumber(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type PartySizeResult =
  | { valid: true; requiresEscalation: false }
  | { valid: false; requiresEscalation: true; reason: 'party_size_requires_escalation' }
  | { valid: false; requiresEscalation: false; reason: 'party_size_invalid' };

export type DateWindowResult =
  | { valid: true }
  | { valid: false; reason: 'reservation_in_past' | 'reservation_beyond_window' };

// ---------------------------------------------------------------------------
// validatePartySize
// ---------------------------------------------------------------------------

/**
 * Validates the requested party size against Presh's Kitchen booking rules.
 *
 * - Less than MIN_PARTY_SIZE  → invalid
 * - 1–MAX_STANDARD_PARTY_SIZE → valid standard reservation
 * - Greater than MAX_STANDARD_PARTY_SIZE → requires staff escalation
 */
export function validatePartySize(partySize: number): PartySizeResult {
  if (!Number.isInteger(partySize) || partySize < MIN_PARTY_SIZE) {
    return { valid: false, requiresEscalation: false, reason: 'party_size_invalid' };
  }
  if (partySize > MAX_STANDARD_PARTY_SIZE) {
    return { valid: false, requiresEscalation: true, reason: 'party_size_requires_escalation' };
  }
  return { valid: true, requiresEscalation: false };
}

// ---------------------------------------------------------------------------
// getRestaurantDateParts
// ---------------------------------------------------------------------------

/**
 * Decomposes a UTC Date into calendar parts in the restaurant timezone.
 * Uses Intl.DateTimeFormat which is available natively in Node >= 18.
 */
export function getRestaurantDateParts(date: Date): {
  year: number;
  month: number; // 1-based
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number; // 0=Sunday…6=Saturday
} {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: RESTAURANT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const parts = fmt.formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0';

  const weekdayStr = get('weekday'); // e.g. "Mon"
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
    dayOfWeek: weekdayMap[weekdayStr] ?? 0,
  };
}

// ---------------------------------------------------------------------------
// validateReservationDateWindow
// ---------------------------------------------------------------------------

/**
 * Validates that a reservation datetime is:
 * 1. Not in the past (compared to now in Africa/Lagos).
 * 2. No more than MAX_RESERVATION_DAYS_AHEAD calendar days from today in
 *    Africa/Lagos.
 *
 * Calendar-day semantics: compares calendar date strings, not raw milliseconds.
 */
export function validateReservationDateWindow(
  reservationAt: Date,
  now: Date = new Date(),
): DateWindowResult {
  // Reject past reservations (with one-minute grace for clock skew).
  const oneMinuteMs = 60_000;
  if (reservationAt.getTime() < now.getTime() - oneMinuteMs) {
    return { valid: false, reason: 'reservation_in_past' };
  }

  // Determine calendar dates in restaurant timezone.
  const todayParts = getRestaurantDateParts(now);
  const resParts = getRestaurantDateParts(reservationAt);

  // Build a plain-date value (YYYYMMDD integer) for clean calendar comparison.
  const toOrdinal = (y: number, m: number, d: number) => y * 10000 + m * 100 + d;

  const todayOrdinal = toOrdinal(todayParts.year, todayParts.month, todayParts.day);
  const resOrdinal = toOrdinal(resParts.year, resParts.month, resParts.day);

  // Calculate calendar-day difference via a midnight-normalised UTC date in the
  // restaurant's current calendar day.  We use the Intl-derived year/month/day
  // values (which are already in Lagos time) to build a UTC midnight for the
  // ordinal comparison baseline, giving us an exact integer day count without
  // any DST ambiguity (Africa/Lagos has no DST).
  const todayMidnight = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
  const resMidnight = Date.UTC(resParts.year, resParts.month - 1, resParts.day);
  const dayDiff = Math.round((resMidnight - todayMidnight) / 86_400_000);

  if (dayDiff < 0) {
    // Already caught by the timestamp check above, but be explicit.
    return { valid: false, reason: 'reservation_in_past' };
  }

  if (dayDiff > MAX_RESERVATION_DAYS_AHEAD) {
    return { valid: false, reason: 'reservation_beyond_window' };
  }

  // Validate that the ordinal comparison agrees (sanity guard).
  if (resOrdinal < todayOrdinal) {
    return { valid: false, reason: 'reservation_in_past' };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// getLastReservationHour
// ---------------------------------------------------------------------------

/**
 * Returns the last permitted reservation hour (24-hour) for a given
 * day-of-week (0=Sunday…6=Saturday).
 *
 * Sunday–Thursday: 21:00 (9 PM)
 * Friday–Saturday: 22:00 (10 PM)
 */
export function getLastReservationHour(dayOfWeek: number): number {
  return EXTENDED_CUTOFF_DAYS.has(dayOfWeek)
    ? LAST_RESERVATION_HOUR_EXTENDED
    : LAST_RESERVATION_HOUR_STANDARD;
}

/**
 * Returns true if a (hour, minute) pair is at or before the last reservation
 * time for that day.  Equality is allowed (e.g. 21:00 on Monday is valid).
 */
export function isWithinLastReservationTime(
  dayOfWeek: number,
  hour: number,
  minute: number,
): boolean {
  const lastHour = getLastReservationHour(dayOfWeek);
  return hour < lastHour || (hour === lastHour && minute === 0);
}
