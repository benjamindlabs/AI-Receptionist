// src/server/app.ts
// Lightweight HTTP server for Vapi custom-tool webhook endpoints.
//
// IMPORTANT: ../env.ts must be the first import so that dotenv is initialised
// before any module that reads process.env (including src/db/index.ts which
// reads DATABASE_URL at evaluation time).
//
// Uses only Node built-in modules so no additional dependencies are required.
import { createServer } from 'node:http';
import '../env.ts';
import { handleVapiRoutes } from './routes/vapi.ts';

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

const HEALTH_RESPONSE = JSON.stringify({ ok: true });

// ---------------------------------------------------------------------------
// HTTP request handler
// ---------------------------------------------------------------------------

const server = createServer((req, res) => {
  const method = req.method ?? '';
  const url = req.url ?? '';

  // Health check
  if (method === 'GET' && url === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(HEALTH_RESPONSE),
    });
    res.end(HEALTH_RESPONSE);
    return;
  }

  // Vapi routes
  if (handleVapiRoutes(req, res)) {
    return; // route was matched and handled
  }

  // 404
  const body = JSON.stringify({ error: 'not_found' });
  res.writeHead(404, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env['PORT'] || '3000', 10);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Listening on http://0.0.0.0:${String(PORT)}`);
});

server.on('error', (err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
