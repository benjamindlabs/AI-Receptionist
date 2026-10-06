// src/server/vapi/handlers.ts
// Adapter layer between the Vapi HTTP layer and the existing reservation domain.
//
// This module is framework-agnostic: it receives already-validated arguments
// and returns a plain JSON-safe object.  It never imports Express/http types.
import { checkAvailability } from '../../reservations/availability.ts';
import { cancelReservation } from '../../reservations/cancel.ts';
import { BUSINESS_ID } from '../../reservations/config.ts';
import { createReservation } from '../../reservations/create.ts';
import type {
  CancelReservationArgs,
  CheckAvailabilityArgs,
  CreateReservationArgs,
} from './schemas.ts';

// ---------------------------------------------------------------------------
// Result type for handleCheckAvailability
// ---------------------------------------------------------------------------

export type CheckAvailabilityHandlerResult =
  | {
      ok: true;
      status: 'available';
      reservationAt: string;
      partySize: number;
      lastReservationHour: number;
    }
  | {
      ok: false;
      status: 'requires_escalation';
      reason: string;
    }
  | {
      ok: false;
      status: 'unavailable';
      reason: string;
    }
  | {
      ok: false;
      status: 'invalid_request';
      reason: string;
    }
  | {
      ok: false;
      status: 'error';
      reason: string;
    };

// ---------------------------------------------------------------------------
// handleCheckAvailability
// ---------------------------------------------------------------------------

/**
 * Receives validated check-availability arguments, calls the existing domain
 * function, and returns a stable JSON-safe result.
 *
 * Error details (stack traces, SQL, credentials) are never surfaced.
 */
export async function handleCheckAvailability(
  args: CheckAvailabilityArgs,
): Promise<CheckAvailabilityHandlerResult> {
  const { reservationAt: reservationAtStr, partySize } = args;

  // Convert the ISO string to a Date (already validated by schema as non-empty string).
  const reservationAt = new Date(reservationAtStr);
  if (isNaN(reservationAt.getTime())) {
    return {
      ok: false,
      status: 'invalid_request',
      reason: 'invalid_datetime_format',
    };
  }

  try {
    const result = await checkAvailability({
      businessId: BUSINESS_ID,
      reservationAt,
      partySize,
    });

    if (result.status === 'available') {
      return {
        ok: true,
        status: 'available',
        reservationAt: result.reservationAt,
        partySize: result.partySize,
        lastReservationHour: result.lastReservationHour,
      };
    }

    if (
      result.status === 'party_size_requires_escalation' ||
      result.status === 'capacity_model_undefined'
    ) {
      return {
        ok: false,
        status: 'requires_escalation',
        reason: result.reason,
      };
    }

    // restaurant_closed | outside_reservation_window | invalid_request
    const statusMap: Record<string, 'unavailable' | 'invalid_request'> = {
      restaurant_closed: 'unavailable',
      outside_reservation_window: 'unavailable',
      invalid_request: 'invalid_request',
    };

    const mappedStatus: 'unavailable' | 'invalid_request' =
      statusMap[result.status] ?? 'unavailable';

    return {
      ok: false,
      status: mappedStatus,
      reason: result.reason,
    };
  } catch (err) {
    console.error('[handleCheckAvailability] Unexpected error:', err);
    return {
      ok: false,
      status: 'error',
      reason: 'availability_check_failed',
    };
  }
}

// ---------------------------------------------------------------------------
// Result type for handleCreateReservation
// ---------------------------------------------------------------------------

export type CreateReservationHandlerResult =
  | {
      ok: true;
      status: 'confirmed';
      reservationId: string;
      reservationAt: string;
      partySize: number;
      customerName: string;
    }
  | {
      ok: false;
      status: 'not_confirmed' | 'invalid_request' | 'error';
      reason: string;
    };

// ---------------------------------------------------------------------------
// handleCreateReservation
// ---------------------------------------------------------------------------

/**
 * Receives validated create-reservation arguments, calls the existing domain
 * function, and returns a stable JSON-safe result.
 */
export async function handleCreateReservation(
  args: CreateReservationArgs,
): Promise<CreateReservationHandlerResult> {
  const {
    customerName,
    customerPhone,
    customerEmail,
    reservationAt: reservationAtStr,
    partySize,
    specialRequests,
  } = args;

  const reservationAt = new Date(reservationAtStr);
  if (isNaN(reservationAt.getTime())) {
    return {
      ok: false,
      status: 'invalid_request',
      reason: 'invalid_datetime_format',
    };
  }

  try {
    const result = await createReservation({
      customerName,
      customerPhone,
      customerEmail: customerEmail ?? null,
      reservationAt,
      partySize,
      specialRequests: specialRequests ?? null,
    });

    if (result.success) {
      return {
        ok: true,
        status: 'confirmed',
        reservationId: result.reservationId,
        reservationAt: result.reservationAt,
        partySize: result.partySize,
        customerName: result.customerName,
      };
    }

    return {
      ok: false,
      status: 'not_confirmed',
      reason: result.reason,
    };
  } catch (err) {
    console.error('[handleCreateReservation] Unexpected error:', err);
    return {
      ok: false,
      status: 'error',
      reason: 'reservation_creation_failed',
    };
  }
}

// ---------------------------------------------------------------------------
// Result type for handleCancelReservation
// ---------------------------------------------------------------------------

export type CancelReservationHandlerResult =
  | {
      ok: true;
      status: 'cancelled';
      reservationId: string;
      reservationAt: string;
      partySize: number;
    }
  | {
      ok: false;
      status: 'multiple_matches';
      reason: 'multiple_matches';
      matchingReservations: Array<{
        reservationId: string;
        reservationAt: string;
        partySize: number;
      }>;
    }
  | {
      ok: false;
      status:
        | 'not_found'
        | 'already_cancelled'
        | 'already_completed_cannot_cancel'
        | 'marked_no_show_cannot_cancel'
        | 'invalid_request'
        | 'unexpected_error'
        | 'error';
      reason: string;
    };

// ---------------------------------------------------------------------------
// handleCancelReservation
// ---------------------------------------------------------------------------

/**
 * Receives validated cancel-reservation arguments, calls the existing domain
 * function, and returns a stable JSON-safe result.
 */
export async function handleCancelReservation(
  args: CancelReservationArgs,
): Promise<CancelReservationHandlerResult> {
  const { customerName, customerPhone, reservationAt } = args;

  try {
    const result = await cancelReservation({
      customerName,
      customerPhone,
      reservationAt,
    });

    if (result.success) {
      return {
        ok: true,
        status: 'cancelled',
        reservationId: result.reservationId,
        reservationAt: result.reservationAt,
        partySize: result.partySize,
      };
    }

    if (result.status === 'multiple_matches') {
      return {
        ok: false,
        status: 'multiple_matches',
        reason: 'multiple_matches',
        matchingReservations: result.matchingReservations,
      };
    }

    return {
      ok: false,
      status: result.status,
      reason: result.reason,
    };
  } catch (err) {
    console.error('[handleCancelReservation] Unexpected error:', err);
    return {
      ok: false,
      status: 'unexpected_error',
      reason: 'reservation_cancellation_failed',
    };
  }
}

