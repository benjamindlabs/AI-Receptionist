import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { reservations } from '../db/schema.ts';
import { BUSINESS_ID } from './config.ts';
import { normalizePhoneNumber } from './rules.ts';

// ---------------------------------------------------------------------------
// Input / result types
// ---------------------------------------------------------------------------

export interface CancelReservationInput {
  customerName: string;
  customerPhone: string;
  reservationAt?: string | Date | null | undefined;
}

export type CancelReservationResult =
  | {
      success: true;
      status: 'cancelled';
      reservationId: string;
      reservationAt: string;
      partySize: number;
    }
  | {
      success: false;
      status: 'multiple_matches';
      reason: 'multiple_matches';
      matchingReservations: Array<{
        reservationId: string;
        reservationAt: string;
        partySize: number;
      }>;
    }
  | {
      success: false;
      status:
        | 'not_found'
        | 'already_cancelled'
        | 'already_completed_cannot_cancel'
        | 'marked_no_show_cannot_cancel'
        | 'invalid_request'
        | 'unexpected_error';
      reason: string;
    };

// ---------------------------------------------------------------------------
// Helper: execute cancellation
// ---------------------------------------------------------------------------

async function executeCancellation(
  r: typeof reservations.$inferSelect,
  executor = db,
): Promise<CancelReservationResult> {
  if (r.status === 'cancelled') {
    return { success: false, status: 'already_cancelled', reason: 'already_cancelled' };
  }
  if (r.status === 'completed') {
    return {
      success: false,
      status: 'already_completed_cannot_cancel',
      reason: 'already_completed_cannot_cancel',
    };
  }
  if (r.status === 'no_show') {
    return {
      success: false,
      status: 'marked_no_show_cannot_cancel',
      reason: 'marked_no_show_cannot_cancel',
    };
  }

  const now = new Date();
  await executor
    .update(reservations)
    .set({
      status: 'cancelled',
      cancelledAt: now,
      updatedAt: now,
    })
    .where(and(eq(reservations.id, r.id), eq(reservations.customerPhone, r.customerPhone)));

  return {
    success: true,
    status: 'cancelled',
    reservationId: r.id,
    reservationAt: r.reservationAt.toISOString(),
    partySize: r.partySize,
  };
}

// ---------------------------------------------------------------------------
// cancelReservation
// ---------------------------------------------------------------------------

export async function cancelReservation(
  input: CancelReservationInput,
  executor = db,
): Promise<CancelReservationResult> {
  const { customerName, customerPhone, reservationAt } = input;

  if (!customerName || !customerName.trim() || !customerPhone || !customerPhone.trim()) {
    return {
      success: false,
      status: 'invalid_request',
      reason: 'customerName and customerPhone are required',
    };
  }

  const normalizedPhone = normalizePhoneNumber(customerPhone);
  const normalizedName = customerName.trim().toLowerCase();

  let targetDateMs: number | null = null;
  if (reservationAt) {
    const d = typeof reservationAt === 'string' ? new Date(reservationAt) : reservationAt;
    if (isNaN(d.getTime())) {
      return {
        success: false,
        status: 'invalid_request',
        reason: 'invalid_datetime_format',
      };
    }
    targetDateMs = d.getTime();
  }

  const allReservations = await executor
    .select()
    .from(reservations)
    .where(eq(reservations.businessId, BUSINESS_ID));

  const customerMatches = allReservations.filter((r) => {
    const phoneMatch = normalizePhoneNumber(r.customerPhone) === normalizedPhone;
    const nameMatch = r.customerName.trim().toLowerCase() === normalizedName;
    return phoneMatch && nameMatch;
  });

  if (customerMatches.length === 0) {
    return { success: false, status: 'not_found', reason: 'not_found' };
  }

  // Case 3: reservationAt is provided
  if (targetDateMs !== null) {
    const dateMatches = customerMatches.filter((r) => r.reservationAt.getTime() === targetDateMs);

    if (dateMatches.length === 0) {
      return { success: false, status: 'not_found', reason: 'not_found' };
    }

    if (dateMatches.length === 1) {
      return await executeCancellation(dateMatches[0]!, executor);
    }

    const activeDateMatches = dateMatches.filter(
      (r) => r.status === 'pending' || r.status === 'confirmed',
    );
    if (activeDateMatches.length === 1) {
      return await executeCancellation(activeDateMatches[0]!, executor);
    }
    if (activeDateMatches.length > 1) {
      return {
        success: false,
        status: 'multiple_matches',
        reason: 'multiple_matches',
        matchingReservations: activeDateMatches.map((r) => ({
          reservationId: r.id,
          reservationAt: r.reservationAt.toISOString(),
          partySize: r.partySize,
        })),
      };
    }

    return await executeCancellation(dateMatches[0]!, executor);
  }

  // Case 1 & Case 2: reservationAt is NOT provided
  const activeMatches = customerMatches.filter(
    (r) => r.status === 'pending' || r.status === 'confirmed',
  );

  if (activeMatches.length === 1) {
    return await executeCancellation(activeMatches[0]!, executor);
  }

  if (activeMatches.length > 1) {
    return {
      success: false,
      status: 'multiple_matches',
      reason: 'multiple_matches',
      matchingReservations: activeMatches.map((r) => ({
        reservationId: r.id,
        reservationAt: r.reservationAt.toISOString(),
        partySize: r.partySize,
      })),
    };
  }

  // No active matches — check terminal status guards on existing customer reservations
  const alreadyCancelled = customerMatches.find((r) => r.status === 'cancelled');
  if (alreadyCancelled) {
    return { success: false, status: 'already_cancelled', reason: 'already_cancelled' };
  }

  const completed = customerMatches.find((r) => r.status === 'completed');
  if (completed) {
    return {
      success: false,
      status: 'already_completed_cannot_cancel',
      reason: 'already_completed_cannot_cancel',
    };
  }

  const noShow = customerMatches.find((r) => r.status === 'no_show');
  if (noShow) {
    return {
      success: false,
      status: 'marked_no_show_cannot_cancel',
      reason: 'marked_no_show_cannot_cancel',
    };
  }

  return { success: false, status: 'not_found', reason: 'not_found' };
}