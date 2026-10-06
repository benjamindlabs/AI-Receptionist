// src/reservations/availability.ts
// Database-backed availability check for Presh's Kitchen.

import { and, eq, ne } from 'drizzle-orm';
import { db, type DBExecutor } from '../db/index.ts';
import { businessHours, reservations } from '../db/schema.ts';
import {
  getLastReservationHour,
  getRestaurantDateParts,
  isWithinLastReservationTime,
  validatePartySize,
  validateReservationDateWindow,
} from './rules.ts';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type AvailabilityStatus =
  | 'available'
  | 'invalid_request'
  | 'restaurant_closed'
  | 'outside_reservation_window'
  | 'party_size_requires_escalation'
  | 'capacity_model_undefined';

export type AvailabilityResult =
  | {
      status: 'available';
      reservationAt: string;
      partySize: number;
      lastReservationHour: number;
    }
  | {
      status: Exclude<AvailabilityStatus, 'available'>;
      reason: string;
    };

// ---------------------------------------------------------------------------
// checkAvailability
// ---------------------------------------------------------------------------

export async function checkAvailability(
  params: {
    businessId: string;
    reservationAt: Date;
    partySize: number;
  },
  executor: DBExecutor = db,
): Promise<AvailabilityResult> {
  const { businessId, reservationAt, partySize } = params;

  // 1. Validate party size.
  const partySizeResult = validatePartySize(partySize);
  if (!partySizeResult.valid) {
    if (partySizeResult.requiresEscalation) {
      return { status: 'party_size_requires_escalation', reason: partySizeResult.reason };
    }
    return { status: 'invalid_request', reason: partySizeResult.reason };
  }

  // 2. Validate date window.
  const dateResult = validateReservationDateWindow(reservationAt);
  if (!dateResult.valid) {
    return { status: 'outside_reservation_window', reason: dateResult.reason };
  }

  // 3. Decompose the requested time in the restaurant timezone.
  const parts = getRestaurantDateParts(reservationAt);
  const { dayOfWeek, hour, minute } = parts;

  // 4. Load business hours for the relevant day from the database.
  const hoursRows = await executor
    .select()
    .from(businessHours)
    .where(
      and(
        eq(businessHours.businessId, businessId),
        eq(businessHours.dayOfWeek, dayOfWeek),
      ),
    )
    .limit(1);

  const dayHours = hoursRows[0];

  if (!dayHours) {
    return { status: 'restaurant_closed', reason: 'no_hours_record_for_day' };
  }

  if (dayHours.isClosed) {
    return { status: 'restaurant_closed', reason: 'day_marked_closed' };
  }

  // 5. Check open time.
  if (dayHours.openTime) {
    const timeParts = dayHours.openTime.split(':').map(Number);
    const openH = timeParts[0] ?? 0;
    const openM = timeParts[1] ?? 0;
    if (hour < openH || (hour === openH && minute < openM)) {
      return { status: 'restaurant_closed', reason: 'before_opening_time' };
    }
  }

  // 6. Check last reservation time (NOT close_time, which is a separate concept).
  if (!isWithinLastReservationTime(dayOfWeek, hour, minute)) {
    return { status: 'restaurant_closed', reason: 'after_last_reservation_time' };
  }

  // 7. Query existing active reservations.
  //    Physical seating capacity and reservation duration are NOT defined in
  //    the current Presh's Kitchen specification.  We therefore cannot
  //    calculate slot occupancy.  The rules above are the only enforceable
  //    constraints.  We return 'available' to mean "all known rules pass",
  //    not that a physical table is guaranteed.
  //
  //    If a capacity model is defined in future, use activeReservations to
  //    calculate occupancy for the requested time window.
  const activeReservations = await executor
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        eq(reservations.businessId, businessId),
        ne(reservations.status, 'cancelled'),
      ),
    );
  void activeReservations; // deliberately not used — no capacity model defined

  const lastReservationHour = getLastReservationHour(dayOfWeek);

  return {
    status: 'available',
    reservationAt: reservationAt.toISOString(),
    partySize,
    lastReservationHour,
  };
}