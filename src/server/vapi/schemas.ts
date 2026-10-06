// src/server/vapi/schemas.ts
// Zod schemas for Vapi custom-tool request validation.
//
// Shapes are derived directly from:
//   - The Vapi tool-call webhook request format (toolCallId + function.arguments)
//   - The existing checkAvailability domain function signature in
//     src/reservations/availability.ts
//
// Do NOT add fields that the domain function does not accept.
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Vapi tool-call request body
// ---------------------------------------------------------------------------

/**
 * A single tool call as sent by Vapi inside the request body.
 * Vapi places user-supplied arguments inside `function.arguments` as a string
 * that must be JSON.parsed, or sometimes already as an object. We accept both.
 */
const vapiToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    arguments: z.union([
      z.string(), // Vapi sometimes sends a JSON-encoded string
      z.record(z.string(), z.unknown()), // or already as an object
    ]),
  }),
});

/**
 * Full Vapi server-message body for a tool-calls event.
 * Only `message.toolCallList` is required; other envelope fields are ignored.
 */
export const vapiToolCallRequestSchema = z.object({
  message: z.object({
    type: z.string().optional(),
    toolCallList: z.array(vapiToolCallSchema).min(1),
  }),
});

export type VapiToolCallRequest = z.infer<typeof vapiToolCallRequestSchema>;
export type VapiToolCall = z.infer<typeof vapiToolCallSchema>;

// ---------------------------------------------------------------------------
// check-availability arguments
// ---------------------------------------------------------------------------

/**
 * Arguments extracted from the tool call for the checkAvailability domain
 * function.  Fields match exactly what checkAvailability() accepts:
 *
 *   businessId   - omitted here; injected from BUSINESS_ID constant in handler
 *   reservationAt - ISO 8601 string; converted to Date in handler
 *   partySize    - positive integer
 */
export const checkAvailabilityArgsSchema = z.object({
  reservationAt: z
    .string()
    .min(1, 'reservationAt is required')
    .describe('ISO 8601 datetime string for the requested reservation.'),
  partySize: z
    .number()
    .int('partySize must be an integer')
    .min(1, 'partySize must be at least 1')
    .describe('Number of guests in the party.'),
});

export type CheckAvailabilityArgs = z.infer<typeof checkAvailabilityArgsSchema>;

// ---------------------------------------------------------------------------
// create-reservation arguments
// ---------------------------------------------------------------------------

/**
 * Arguments extracted from the tool call for the createReservation domain
 * function in src/reservations/create.ts.
 */
export const createReservationArgsSchema = z.object({
  customerName: z
    .string()
    .min(1, 'customerName is required')
    .describe('Full name of the customer placing the reservation.'),
  customerPhone: z
    .string()
    .min(1, 'customerPhone is required')
    .describe('Phone number of the customer.'),
  customerEmail: z
    .string()
    .nullable()
    .optional()
    .describe('Email address of the customer (optional).'),
  reservationAt: z
    .string()
    .min(1, 'reservationAt is required')
    .describe('ISO 8601 datetime string for the reservation.'),
  partySize: z
    .number()
    .int('partySize must be an integer')
    .min(1, 'partySize must be at least 1')
    .describe('Number of guests in the party.'),
  specialRequests: z
    .string()
    .nullable()
    .optional()
    .describe('Special requests or notes for the reservation (optional).'),
});

export type CreateReservationArgs = z.infer<typeof createReservationArgsSchema>;

// ---------------------------------------------------------------------------
// cancel-reservation arguments
// ---------------------------------------------------------------------------

/**
 * Arguments extracted from the tool call for the cancelReservation domain
 * function in src/reservations/cancel.ts.
 */
export const cancelReservationArgsSchema = z.object({
  customerName: z
    .string()
    .min(1, 'customerName is required')
    .describe('Full name of the customer whose reservation is to be cancelled.'),
  customerPhone: z
    .string()
    .min(1, 'customerPhone is required')
    .describe('Phone number used when making the reservation.'),
  reservationAt: z
    .string()
    .optional()
    .describe('Optional ISO 8601 datetime string of the specific reservation to cancel.'),
});

export type CancelReservationArgs = z.infer<typeof cancelReservationArgsSchema>;

