import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isOwnerEmail } from "./is-owner";

describe("isOwnerEmail", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns false when OWNER_NOTIFY_EMAIL is not set", () => {
    delete process.env.OWNER_NOTIFY_EMAIL;
    expect(isOwnerEmail("admin@example.com")).toBe(false);
  });

  it("returns false when email is null", () => {
    process.env.OWNER_NOTIFY_EMAIL = "admin@example.com";
    expect(isOwnerEmail(null)).toBe(false);
  });

  it("returns false when email is undefined", () => {
    process.env.OWNER_NOTIFY_EMAIL = "admin@example.com";
    expect(isOwnerEmail(undefined)).toBe(false);
  });

  it("returns true for an exact match", () => {
    process.env.OWNER_NOTIFY_EMAIL = "admin@example.com";
    expect(isOwnerEmail("admin@example.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    process.env.OWNER_NOTIFY_EMAIL = "Admin@Example.COM";
    expect(isOwnerEmail("admin@example.com")).toBe(true);
    expect(isOwnerEmail("ADMIN@EXAMPLE.COM")).toBe(true);
  });

  it("matches when the email is in a comma-separated list", () => {
    process.env.OWNER_NOTIFY_EMAIL = "owner1@example.com, owner2@example.com , owner3@example.com";
    expect(isOwnerEmail("owner1@example.com")).toBe(true);
    expect(isOwnerEmail("owner2@example.com")).toBe(true);
    expect(isOwnerEmail("owner3@example.com")).toBe(true);
  });

  it("returns false for an email not in the allow-list", () => {
    process.env.OWNER_NOTIFY_EMAIL = "owner@example.com";
    expect(isOwnerEmail("other@example.com")).toBe(false);
  });

  it("returns false for empty email string", () => {
    process.env.OWNER_NOTIFY_EMAIL = "owner@example.com";
    expect(isOwnerEmail("")).toBe(false);
  });

  it("returns false when OWNER_NOTIFY_EMAIL is empty string", () => {
    process.env.OWNER_NOTIFY_EMAIL = "";
    expect(isOwnerEmail("owner@example.com")).toBe(false);
  });

  it("handles whitespace around emails in the list", () => {
    process.env.OWNER_NOTIFY_EMAIL = "  owner@example.com  ,  other@example.com  ";
    expect(isOwnerEmail("owner@example.com")).toBe(true);
    expect(isOwnerEmail("other@example.com")).toBe(true);
  });
});
