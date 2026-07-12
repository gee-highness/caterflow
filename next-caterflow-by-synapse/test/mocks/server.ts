import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// Merge with nextApiHandlers if present for more accurate emulation
let allHandlers = handlers;
try {
  // Dynamically require to avoid TS/ESM issues in node test environment
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nextHandlers = require("./nextApiHandlers").nextApiHandlers;
  if (nextHandlers && Array.isArray(nextHandlers))
    allHandlers = [...handlers, ...nextHandlers];
} catch (e) {
  // ignore if not present
}

export const server = setupServer(...allHandlers);
