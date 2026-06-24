import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthForm } from "./auth-form";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithOAuth = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      signInWithPassword: (...args: unknown[]) =>
        mockSignInWithPassword(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
    },
  }),
}));

// ---------------------------------------------------------------------------
// Test dict
// ---------------------------------------------------------------------------

const dict = {
  login: {
    heading: "Sign in to your account",
    emailLabel: "Email",
    passwordLabel: "Password",
    submit: "Sign in",
    googleCta: "Continue with Google",
    toSignup: "Don't have an account? Sign up",
  },
  signup: {
    heading: "Create an account",
    submit: "Sign up",
    toLogin: "Already have an account? Sign in",
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    invalid_credentials: "Invalid email or password.",
  },
  or: "or",
  showPassword: "Show password",
  hidePassword: "Hide password",
  submitting: "Submitting…",
  checkEmail: "Check your email to confirm your account.",
  accountLink: "My account",
  accountMenu: "Account menu",
  ordersLink: "Orders",
  signOut: "Sign out",
  signedInAs: "Signed in as",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm(mode: "login" | "signup" = "login") {
  return render(<AuthForm mode={mode} lang="en" dict={dict} />);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockPush.mockClear();
  mockSignInWithPassword.mockClear();
  mockSignUp.mockClear();
  mockSignInWithOAuth.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuthForm", () => {
  it("renders email and password fields with visible labels in login mode", () => {
    renderForm("login");
    expect(screen.getByLabelText(dict.login.emailLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dict.login.passwordLabel)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.login.submit }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.login.googleCta }),
    ).toBeInTheDocument();
  });

  it("renders signup heading when mode=signup", () => {
    renderForm("signup");
    expect(
      screen.getByRole("heading", { name: dict.signup.heading }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.signup.submit }),
    ).toBeInTheDocument();
  });

  it("signInWithPassword error → aria-live error shown; router.push NOT called", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid login credentials" },
    });

    renderForm("login");

    fireEvent.change(screen.getByLabelText(dict.login.emailLabel), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText(dict.login.passwordLabel), {
      target: { value: "wrong-password" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: dict.login.submit }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("signInWithPassword success → router.push to account orders", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: "u1" }, session: {} },
      error: null,
    });

    renderForm("login");

    fireEvent.change(screen.getByLabelText(dict.login.emailLabel), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText(dict.login.passwordLabel), {
      target: { value: "correct-password" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: dict.login.submit }).closest("form")!,
    );

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "correct-password",
      });
      expect(mockPush).toHaveBeenCalledWith("/en/account/orders");
    });
  });

  it("signUp success → router.push to account orders", async () => {
    mockSignUp.mockResolvedValueOnce({
      data: { user: { id: "u2" }, session: {} },
      error: null,
    });

    renderForm("signup");

    fireEvent.change(screen.getByLabelText(dict.login.emailLabel), {
      target: { value: "newuser@example.com" },
    });
    fireEvent.change(screen.getByLabelText(dict.login.passwordLabel), {
      target: { value: "newpassword123" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: dict.signup.submit }).closest("form")!,
    );

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "newuser@example.com",
        password: "newpassword123",
      });
      expect(mockPush).toHaveBeenCalledWith("/en/account/orders");
    });
  });

  it("Google button calls signInWithOAuth with google provider", async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({ data: {}, error: null });

    renderForm("login");

    fireEvent.click(screen.getByRole("button", { name: dict.login.googleCta }));

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          options: expect.objectContaining({
            // NEXT_PUBLIC_SITE_URL is unset in tests → falls back to the live
            // origin; the locale-scoped callback path must always be present.
            redirectTo: expect.stringContaining("/en/auth/callback"),
          }),
        }),
      );
    });
  });

  it("Google OAuth error → aria-live error shown", async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: null,
      error: { message: "OAuth failed" },
    });

    renderForm("login");

    fireEvent.click(screen.getByRole("button", { name: dict.login.googleCta }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert").textContent).toBe(dict.errors.generic);
    });
  });

  it("toggle link switches mode between login and signup", async () => {
    renderForm("login");

    expect(
      screen.getByRole("heading", { name: dict.login.heading }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: dict.login.toSignup }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: dict.signup.heading }),
      ).toBeInTheDocument();
    });
  });
});
