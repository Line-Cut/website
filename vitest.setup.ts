import "@testing-library/jest-dom/vitest";

// Polyfill IntersectionObserver for jsdom (used by framer-motion whileInView)
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver;
