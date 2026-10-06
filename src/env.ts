// src/env.ts
// ESM-safe environment loader.
//
// IMPORTANT: This file must be imported as the FIRST static import in src/main.ts.
//
// Problem: In ESM, all static imports are linked and evaluated in post-order DFS
// before any module body runs. This means a `dotenv.config()` call in main.ts's
// body fires AFTER src/db/index.ts has already evaluated `process.env.DATABASE_URL`.
//
// Solution: By placing this module first in main.ts's import list, its body
// (which calls dotenv.config) is guaranteed to execute before the bodies of
// sibling imports (agent.ts → ... → db/index.ts), because ESM evaluates siblings
// left-to-right in declaration order.
//
// This module intentionally has no imports from src/db/ or any other local module
// that reads environment variables at evaluation time.

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();
