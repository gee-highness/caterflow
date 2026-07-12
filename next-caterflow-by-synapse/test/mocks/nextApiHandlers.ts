import { rest } from "msw";
import stockFixture from "../fixtures/stock.json";

export const nextApiHandlers = [
  rest.get("http://localhost:3000/api/stock", (req, res, ctx) => {
    return res(ctx.status(200), ctx.json(stockFixture));
  }),
  rest.post("http://localhost:3000/api/login", (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({ token: "test-token", user: { id: "u1", name: "Test User" } }),
    );
  }),
];
