// src/tools/check-availability.ts
// LiveKit tool wrapper for the checkAvailability reservation domain function.

import { tool } from '@livekit/agents';
import { z } from 'zod';
import { BUSINESS_ID } from '../reservations/config.ts';
import { checkAvailability } from '../reservations/availability.ts';

export const checkAvailabilityTool = tool({
  name: 'checkAvailability',
  description: [
    'Check whether a reservation slot is available at Presh\'s Kitchen.',
    'Always call this tool BEFORE promising availability to a customer.',
    'Never claim a slot is available without a successful response from this tool.',
    'The tool validates party size, date window, and restaurant opening hours.',
    'Parties of more than 8 guests require staff escalation — this tool will indicate that.',
    'The tool returns a structured result; use the status field to determine next steps.',
    'If status is "available", you may offer to proceed with booking.',
    'If status is "requires_escalation" with reason "capacity_model_undefined", explain that',
    'the system cannot confirm availability and that staff will need to assist.',
  ].join(' '),
  parameters: z.object({
    reservationAt: z
      .string()
      .describe(
        'ISO 8601 datetime string for the requested reservation (e.g. "2025-01-15T19:00:00+01:00").',
      ),
    partySize: z
      .number()
      .int()
      .min(1)
      .describe('Number of guests in the party (1–8 for standard bookings; 9+ requires escalation).'),
  }),
  execute: async (params) => {
    const { reservationAt, partySize } = params;

    let reservationDate: Date;
    try {
      reservationDate = new Date(reservationAt);
      if (isNaN(reservationDate.getTime())) {
        throw new Error('invalid date');
      }
    } catch {
      return {
        ok: false,
        status: 'invalid_request',
        reason: 'invalid_datetime_format',
      };
    }

    try {
      const result = await checkAvailability({
        businessId: BUSINESS_ID,
        reservationAt: reservationDate,
        partySize,
      });

      if (result.status === 'available') {
        return {
          ok: true,
          status: 'available',
          reservationAt: result.reservationAt,
          partySize: result.partySize,
        };
      }

      if (result.status === 'party_size_requires_escalation') {
        return {
          ok: false,
          status: 'requires_escalation',
          reason: 'party_size_requires_escalation',
        };
      }

      if (result.status === 'capacity_model_undefined') {
        return {
          ok: false,
          status: 'requires_escalation',
          reason: 'capacity_model_undefined',
        };
      }

      const statusMap: Record<string, string> = {
        restaurant_closed: 'unavailable',
        outside_reservation_window: 'unavailable',
        invalid_request: 'invalid_request',
      };

      return {
        ok: false,
        status: statusMap[result.status] ?? 'unavailable',
        reason: result.reason,
      };
    } catch (err) {
      console.error('[checkAvailabilityTool] Error:', err);
      return {
        ok: false,
        status: 'error',
        reason: 'availability_check_failed',
      };
    }
  },
});