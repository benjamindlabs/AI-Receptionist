// src/tools/create-reservation.ts
// LiveKit tool wrapper for the createReservation domain function.

import { tool } from '@livekit/agents';
import { z } from 'zod';
import { createReservation } from '../reservations/create.ts';

export const createReservationTool = tool({
  name: 'createReservation',
  description: [
    'Create a confirmed reservation at Presh\'s Kitchen.',
    'Only call this tool after the customer has supplied all required details:',
    'name, phone number, date/time, and party size.',
    'This tool performs its own final validation — do not rely solely on a prior',
    'checkAvailability call for correctness.',
    'CRITICAL: Never tell the customer their reservation is confirmed until this tool',
    'returns ok=true. If it returns ok=false, explain the issue and offer alternatives.',
    'Do not call this tool speculatively or multiple times for the same booking.',
  ].join(' '),
  parameters: z.object({
    customerName: z.string().min(1).describe('Full name of the customer making the reservation.'),
    customerPhone: z
      .string()
      .min(1)
      .describe('Customer phone number including country code (e.g. "+234 800 555 1234").'),
    customerEmail: z
      .string()
      .nullable()
      .optional()
      .describe('Customer email address (optional).'),
    reservationAt: z
      .string()
      .describe(
        'ISO 8601 datetime string for the requested reservation (e.g. "2025-01-15T19:00:00+01:00").',
      ),
    partySize: z
      .number()
      .int()
      .min(1)
      .describe('Number of guests (1–8 for standard bookings).'),
    specialRequests: z
      .string()
      .nullable()
      .optional()
      .describe('Any special requests or dietary notes from the customer (optional).'),
  }),
  execute: async (params) => {
    const {
      customerName,
      customerPhone,
      customerEmail,
      reservationAt,
      partySize,
      specialRequests,
    } = params;

    let reservationDate: Date;
    try {
      reservationDate = new Date(reservationAt);
      if (isNaN(reservationDate.getTime())) {
        throw new Error('invalid date');
      }
    } catch {
      return {
        ok: false,
        status: 'not_confirmed',
        reason: 'invalid_datetime_format',
      };
    }

    try {
      const result = await createReservation({
        customerName,
        customerPhone,
        customerEmail: customerEmail ?? null,
        reservationAt: reservationDate,
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
      console.error('[createReservationTool] Error:', err);
      return {
        ok: false,
        status: 'not_confirmed',
        reason: 'unexpected_error',
      };
    }
  },
});