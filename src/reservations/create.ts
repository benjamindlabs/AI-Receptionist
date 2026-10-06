// src/reservations/create.ts
// Customer lookup/create + transactional reservation creation.

import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { db } from '../db/index.ts';
import { customers, reservations } from '../db/schema.ts';
import { BUSINESS_ID } from './config.ts';
import {
  validatePartySize,
  validateReservationDateWindow,
  isWithinLastReservationTime,
  getRestaurantDateParts,
  normalizePhoneNumber,
} from './rules.ts';
import { checkAvailability } from './availability.ts';

// ---------------------------------------------------------------------------
// Input / result types
// ---------------------------------------------------------------------------

export interface CreateReservationInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  reservationAt: Date;
  partySize: number;
  specialRequests?: string | null;
}

export type CreateReservationResult =
  | {
      success: true;
      reservationId: string;
      reservationAt: string;
      partySize: number;
      customerName: string;
      status: 'confirmed';
    }
  | {
      success: false;
      reason: string;
    };

// ---------------------------------------------------------------------------
// createReservation
// ---------------------------------------------------------------------------

export async function createReservation(
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  const { customerName, customerPhone, customerEmail, reservationAt, partySize, specialRequests } =
    input;

  const normalizedPhone = normalizePhoneNumber(customerPhone);

  // ── Pre-transaction validation ─────────────────────────────────────────────

  const partySizeResult = validatePartySize(partySize);
  if (!partySizeResult.valid) {
    return {
      success: false,
      reason: partySizeResult.reason,
    };
  }

  const dateResult = validateReservationDateWindow(reservationAt);
  if (!dateResult.valid) {
    return { success: false, reason: dateResult.reason };
  }

  const parts = getRestaurantDateParts(reservationAt);
  if (!isWithinLastReservationTime(parts.dayOfWeek, parts.hour, parts.minute)) {
    return { success: false, reason: 'after_last_reservation_time' };
  }

  // ── Customer lookup / create ───────────────────────────────────────────────

  const existingCustomers = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, normalizedPhone))
    .limit(1);

  let customerId: string;

  if (existingCustomers.length > 0 && existingCustomers[0]) {
    // Reuse existing customer record.
    customerId = existingCustomers[0].id;

    // Update name / email only when the caller supplied different values, to
    // keep the record fresh without overwriting useful data with blanks.
    const existing = existingCustomers[0];
    const nameChanged = existing.name !== customerName;
    const emailChanged =
      customerEmail != null && customerEmail !== '' && existing.email !== customerEmail;

    if (nameChanged || emailChanged) {
      await db
        .update(customers)
        .set({
          name: nameChanged ? customerName : existing.name,
          email: emailChanged ? customerEmail : existing.email,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, customerId));
    }
  } else {
    // Create new customer with normalized phone.
    const inserted = await db
      .insert(customers)
      .values({
        name: customerName,
        phone: normalizedPhone,
        email: customerEmail ?? null,
      })
      .returning({ id: customers.id });

    const insertedRow = inserted[0];
    if (!insertedRow) {
      return { success: false, reason: 'customer_creation_failed' };
    }
    customerId = insertedRow.id;
  }

  // ── Transactional reservation creation ────────────────────────────────────

  try {
    const result = await db.transaction(async (tx) => {
      // Re-validate availability inside the transaction so the check and insert
      // are atomic. Pass transaction executor tx so availability check runs on tx.
      const availResult = await checkAvailability(
        {
          businessId: BUSINESS_ID,
          reservationAt,
          partySize,
        },
        tx,
      );

      if (availResult.status !== 'available') {
        return {
          success: false as const,
          reason: availResult.status === 'capacity_model_undefined'
            ? 'capacity_model_undefined'
            : availResult.reason ?? availResult.status,
        };
      }

      const inserted = await tx
        .insert(reservations)
        .values({
          businessId: BUSINESS_ID,
          customerId,
          reservationAt,
          partySize,
          status: 'confirmed',
          customerName,
          customerPhone: normalizedPhone,
          specialRequests: specialRequests ?? null,
        })

        .returning({
          id: reservations.id,
          reservationAt: reservations.reservationAt,
          partySize: reservations.partySize,
          customerName: reservations.customerName,
          status: reservations.status,
        });

      const row = inserted[0];
      if (!row) {
        return { success: false as const, reason: 'insert_failed' };
      }

      return {
        success: true as const,
        reservationId: row.id,
        reservationAt: row.reservationAt.toISOString(),
        partySize: row.partySize,
        customerName: row.customerName,
        status: 'confirmed' as const,
      };
    });

    return result;
  } catch (err: unknown) {
    // Detect PostgreSQL serialization failures so callers can retry safely.
    if (
      err instanceof postgres.PostgresError &&
      (err.code === '40001' || err.code === '40P01')
    ) {
      return { success: false, reason: 'serialization_failure_please_retry' };
    }

    console.error('[createReservation] Unexpected error:', err);
    return { success: false, reason: 'unexpected_error' };
  }
}