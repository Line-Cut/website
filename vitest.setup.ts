import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Polyfill IntersectionObserver for jsdom (used by framer-motion whileInView)
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver;

// Polyfill URL.createObjectURL / revokeObjectURL — jsdom does not implement them.
// Always assign as vi.fn() spies so tests can assert lifecycle calls.
Object.defineProperty(URL, "createObjectURL", {
  writable: true,
  configurable: true,
  value: vi.fn((blob: Blob | MediaSource) => {
    const name = blob instanceof File ? blob.name : "file";
    return `blob:http://localhost/${name}`;
  }),
});

Object.defineProperty(URL, "revokeObjectURL", {
  writable: true,
  configurable: true,
  value: vi.fn(),
});
