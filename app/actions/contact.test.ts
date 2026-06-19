import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send: sendMock } };
  }),
}));

import { submitContact, type ContactState } from "@/app/actions/contact";

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}
const idle: ContactState = { status: "idle" };

describe("submitContact", () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.RESEND_API_KEY = "test";
    process.env.CONTACT_EMAIL = "to@example.com";
    process.env.CONTACT_FROM = "from@example.com";
  });

  it("returns validation errors for bad input", async () => {
    const res = await submitContact(idle, fd({ name: "", email: "x", message: "hi" }));
    expect(res.status).toBe("error");
    expect(res.errors?.email).toBeTruthy();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends and returns success for valid input", async () => {
    sendMock.mockResolvedValue({ error: null });
    const res = await submitContact(
      idle,
      fd({ name: "Dana", email: "dana@example.com", message: "I need 50 stickers please" }),
    );
    expect(res.status).toBe("success");
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("reports send failure", async () => {
    sendMock.mockResolvedValue({ error: { message: "boom" } });
    const res = await submitContact(
      idle,
      fd({ name: "Dana", email: "dana@example.com", message: "I need 50 stickers please" }),
    );
    expect(res.status).toBe("error");
    expect(res.message).toBe("send_failed");
  });
});
