// src/server/routes/vapi.ts
// Vapi custom-tool webhook routes.
//
// Registers handlers on an IncomingMessage/ServerResponse compatible router
// interface.  Only POST /api/vapi/check-availability is implemented here;
// create-reservation and cancel-reservation will be added separately.
//
// Vapi response contract (from Vapi SDK ToolCallResult type):
//   - Always return HTTP 200 for Vapi tool-call results.
//   - Body: { results: [{ toolCallId, name, result }] }
//   - toolCallId must match the id from the incoming tool call.
//   - name must be the function name from the incoming tool call.
//   - result must be a STRING (serialize objects with JSON.stringify).
//   - Use error (string) instead of result for tool-call failures if desired.
//   - 4xx is reserved for malformed HTTP requests (not tool-call failures).
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  handleCancelReservation,
  handleCheckAvailability,
  handleCreateReservation,
} from '../vapi/handlers.ts';
import {
  cancelReservationArgsSchema,
  checkAvailabilityArgsSchema,
  createReservationArgsSchema,
  vapiToolCallRequestSchema,
} from '../vapi/schemas.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read and JSON-parse the full request body. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new SyntaxError('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/** Send a JSON response with the given status code. */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Parse function.arguments from a Vapi tool call.
 * Vapi may send a JSON-encoded string or an already-decoded object.
 */
function parseToolArguments(raw: string | Record<string, unknown>): unknown {
  if (typeof raw === 'string') {
    return JSON.parse(raw);
  }
  return raw;
}

// ---------------------------------------------------------------------------
// POST /api/vapi/check-availability
// ---------------------------------------------------------------------------

async function handleCheckAvailabilityRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // 1. Parse request body.
  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'invalid_json', message: 'Request body is not valid JSON.' });
    return;
  }

  // 2. Validate the Vapi envelope.
  const envelopeResult = vapiToolCallRequestSchema.safeParse(rawBody);
  if (!envelopeResult.success) {
    sendJson(res, 400, {
      error: 'invalid_request',
      message: 'Malformed Vapi tool-call request.',
      details: envelopeResult.error.flatten(),
    });
    return;
  }

  const toolCallList = envelopeResult.data.message.toolCallList;

  // 3. Process each tool call in the list and build the Vapi results array.
  // ToolCallResult shape (from Vapi SDK ToolCallResult type):
  //   { toolCallId: string; name: string; result?: string; error?: string }
  // result must be a string — serialize structured data with JSON.stringify.
  const results: Array<{ toolCallId: string; name: string; result: string }> = [];

  for (const toolCall of toolCallList) {
    const toolCallId = toolCall.id;

    // Parse function arguments.
    let rawArgs: unknown;
    try {
      rawArgs = parseToolArguments(toolCall.function.arguments);
    } catch {
      results.push({
        toolCallId,
        name: toolCall.function.name,
        result: JSON.stringify({
          ok: false,
          status: 'invalid_request',
          reason: 'invalid_arguments_json',
        }),
      });
      continue;
    }

    // Validate arguments against the check-availability schema.
    const argsResult = checkAvailabilityArgsSchema.safeParse(rawArgs);
    if (!argsResult.success) {
      results.push({
        toolCallId,
        name: toolCall.function.name,
        result: JSON.stringify({
          ok: false,
          status: 'invalid_request',
          reason: 'invalid_arguments',
          details: argsResult.error.flatten(),
        }),
      });
      continue;
    }

    // Delegate to the framework-agnostic handler.
    const handlerResult = await handleCheckAvailability(argsResult.data);
    results.push({
      toolCallId,
      name: toolCall.function.name,
      result: JSON.stringify(handlerResult),
    });
  }

  // 4. Return Vapi-compliant response (always HTTP 200 for tool-call results).
  sendJson(res, 200, { results });
}

// ---------------------------------------------------------------------------
// POST /api/vapi/create-reservation
// ---------------------------------------------------------------------------

async function handleCreateReservationRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // 1. Parse request body.
  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'invalid_json', message: 'Request body is not valid JSON.' });
    return;
  }

  // 2. Validate the Vapi envelope.
  const envelopeResult = vapiToolCallRequestSchema.safeParse(rawBody);
  if (!envelopeResult.success) {
    sendJson(res, 400, {
      error: 'invalid_request',
      message: 'Malformed Vapi tool-call request.',
      details: envelopeResult.error.flatten(),
    });
    return;
  }

  const toolCallList = envelopeResult.data.message.toolCallList;
  const results: Array<{ toolCallId: string; name: string; result: string }> = [];

  for (const toolCall of toolCallList) {
    const toolCallId = toolCall.id;

    let rawArgs: unknown;
    try {
      rawArgs = parseToolArguments(toolCall.function.arguments);
    } catch {
      results.push({
        toolCallId,
        name: toolCall.function.name,
        result: JSON.stringify({
          ok: false,
          status: 'invalid_request',
          reason: 'invalid_arguments_json',
        }),
      });
      continue;
    }

    const argsResult = createReservationArgsSchema.safeParse(rawArgs);
    if (!argsResult.success) {
      results.push({
        toolCallId,
        name: toolCall.function.name,
        result: JSON.stringify({
          ok: false,
          status: 'invalid_request',
          reason: 'invalid_arguments',
          details: argsResult.error.flatten(),
        }),
      });
      continue;
    }

    const handlerResult = await handleCreateReservation(argsResult.data);
    results.push({
      toolCallId,
      name: toolCall.function.name,
      result: JSON.stringify(handlerResult),
    });
  }

  sendJson(res, 200, { results });
}

// ---------------------------------------------------------------------------
// POST /api/vapi/cancel-reservation
// ---------------------------------------------------------------------------

async function handleCancelReservationRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // 1. Parse request body.
  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'invalid_json', message: 'Request body is not valid JSON.' });
    return;
  }

  // 2. Validate the Vapi envelope.
  const envelopeResult = vapiToolCallRequestSchema.safeParse(rawBody);
  if (!envelopeResult.success) {
    sendJson(res, 400, {
      error: 'invalid_request',
      message: 'Malformed Vapi tool-call request.',
      details: envelopeResult.error.flatten(),
    });
    return;
  }

  const toolCallList = envelopeResult.data.message.toolCallList;
  const results: Array<{ toolCallId: string; name: string; result: string }> = [];

  for (const toolCall of toolCallList) {
    const toolCallId = toolCall.id;

    let rawArgs: unknown;
    try {
      rawArgs = parseToolArguments(toolCall.function.arguments);
    } catch {
      results.push({
        toolCallId,
        name: toolCall.function.name,
        result: JSON.stringify({
          ok: false,
          status: 'invalid_request',
          reason: 'invalid_arguments_json',
        }),
      });
      continue;
    }

    const argsResult = cancelReservationArgsSchema.safeParse(rawArgs);
    if (!argsResult.success) {
      results.push({
        toolCallId,
        name: toolCall.function.name,
        result: JSON.stringify({
          ok: false,
          status: 'invalid_request',
          reason: 'invalid_arguments',
          details: argsResult.error.flatten(),
        }),
      });
      continue;
    }

    const handlerResult = await handleCancelReservation(argsResult.data);
    results.push({
      toolCallId,
      name: toolCall.function.name,
      result: JSON.stringify(handlerResult),
    });
  }

  sendJson(res, 200, { results });
}

// ---------------------------------------------------------------------------
// Route dispatcher — called by app.ts for matched paths
// ---------------------------------------------------------------------------

export function handleVapiRoutes(req: IncomingMessage, res: ServerResponse): boolean {
  const method = req.method ?? '';
  const url = req.url ?? '';

  if (method === 'POST' && url === '/api/vapi/check-availability') {
    handleCheckAvailabilityRoute(req, res).catch((err: unknown) => {
      console.error('[vapi] Unhandled error in check-availability route:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error', message: 'An unexpected error occurred.' });
      }
    });
    return true; // route matched
  }

  if (method === 'POST' && url === '/api/vapi/create-reservation') {
    handleCreateReservationRoute(req, res).catch((err: unknown) => {
      console.error('[vapi] Unhandled error in create-reservation route:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error', message: 'An unexpected error occurred.' });
      }
    });
    return true; // route matched
  }

  if (method === 'POST' && url === '/api/vapi/cancel-reservation') {
    handleCancelReservationRoute(req, res).catch((err: unknown) => {
      console.error('[vapi] Unhandled error in cancel-reservation route:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error', message: 'An unexpected error occurred.' });
      }
    });
    return true; // route matched
  }

  return false; // route not matched
}

