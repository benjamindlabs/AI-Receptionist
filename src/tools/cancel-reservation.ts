// src/tools/cancel-reservation.ts
// LiveKit tool wrapper for the cancelReservation domain function.

import { tool } from '@livekit/agents';
import { z } from 'zod';
import { cancelReservation } from '../reservations/cancel.ts';

export const cancelReservationTool = tool({
  name: 'cancelReservation',
  description: [
    'Cancel an existing reservation at Presh\'s Kitchen.',
    'Requires the customer\'s name and phone number used when booking.',
    'An optional reservation date/time (ISO 8601) can be provided if the customer specified one.',
    'The reservation record is NOT deleted — only the status is updated to cancelled.',
    'If the reservation is already cancelled or completed, the tool will indicate that.',
    'Do not assume cancellation succeeded until the tool returns ok=true.',
  ].join(' '),
  parameters: z.object({
    customerName: z
      .string()
      .min(1)
      .describe('Full name of the customer.'),
    customerPhone: z
      .string()
      .min(1)
      .describe('Phone number used when the reservation was created.'),
    reservationAt: z
      .string()
      .optional()
      .describe('Optional ISO 8601 datetime string for the specific reservation.'),
  }),
  execute: async (params) => {
    const { customerName, customerPhone, reservationAt } = params;

    try {
      const result = await cancelReservation({ customerName, customerPhone, reservationAt });

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
      console.error('[cancelReservationTool] Error:', err);
      return {
        ok: false,
        status: 'unexpected_error',
        reason: 'unexpected_error',
      };
    }
  },
});