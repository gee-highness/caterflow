import "@testing-library/jest-dom";

// polyfills
import "whatwg-fetch";
if (typeof window !== "undefined" && !window.matchMedia) {
  const jestMock = (globalThis as any).jest;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jestMock
      ? jestMock.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jestMock.fn(),
          removeListener: jestMock.fn(),
          addEventListener: jestMock.fn(),
          removeEventListener: jestMock.fn(),
          dispatchEvent: jestMock.fn(),
        }))
      : (() => ({
          matches: false,
          media: "",
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }))(),
  });
}
// optional: configure MSW here for component tests
import { server } from "./mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
