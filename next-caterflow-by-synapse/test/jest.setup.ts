import "@testing-library/jest-dom";

// polyfills
import "whatwg-fetch";

const createMatchMedia = () => {
  const fn = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => false),
  });

  return Object.assign(fn, {
    // allow callers to override the default behavior if needed in tests
    _mockImplementation: fn,
  });
};

const matchMediaMock = createMatchMedia();

const target = typeof window !== "undefined" ? window : globalThis;
if (!("matchMedia" in target)) {
  Object.defineProperty(target, "matchMedia", {
    writable: true,
    configurable: true,
    value: matchMediaMock,
  });
}

// optional: configure MSW here for component tests
import { server } from "./mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
