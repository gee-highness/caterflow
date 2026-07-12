import { rest } from "msw";

// Example API handlers for simulated data
export const handlers = [
  rest.get("/api/stock", (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({ items: [{ id: "1", name: "Rice", qty: 100 }] }),
    );
  }),
  rest.post("/api/login", (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({ token: "test-token", user: { id: "u1", name: "Test User" } }),
    );
  }),
];
