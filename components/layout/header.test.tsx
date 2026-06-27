import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./header";

let mockPathname = "/en";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const navDict = {
  services: "Services",
  why: "Why us",
  process: "Process",
  work: "Work",
  faq: "FAQ",
  contact: "Contact",
  cta: "WhatsApp",
  ctaMessage: "Hi",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  stickers: "Stickers",
  store: "Store",
  admin: "Admin",
} as const;

const authDict = {
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
  submitting: "Submitting...",
  checkEmail: "Check your email to confirm your account.",
  accountLink: "My account",
  accountMenu: "Account menu",
  ordersLink: "Orders",
  signOut: "Sign out",
  signedInAs: "Signed in as",
} as const;

beforeEach(() => {
  mockPathname = "/en";
});

describe("Header auth navigation", () => {
  it("shows login and signup inside the account menu when the user is logged out", () => {
    render(
      <Header lang="en" dict={navDict} authDict={authDict} user={null} />,
    );

    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/en/login",
    );
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/en/signup",
    );
  });

  it("shows order page and sign out inside the account menu when the user is logged in", () => {
    render(
      <Header
        lang="en"
        dict={navDict}
        authDict={authDict}
        user={{ email: "studio@example.com" }}
      />,
    );

    expect(screen.queryByText("studio@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("My account")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Account menu" }),
    );

    expect(screen.getByText("studio@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Signed in as")).not.toBeInTheDocument();
    expect(screen.queryByText("My account")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
      "href",
      "/en/account/orders",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();
  });

  it("shows home section navigation only on the localized home page", () => {
    mockPathname = "/en/stickers";

    render(
      <Header lang="en" dict={navDict} authDict={authDict} user={null} />,
    );

    expect(screen.queryByRole("link", { name: "Services" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "FAQ" })).not.toBeInTheDocument();
  });

  it("keeps home section navigation on the localized home page", () => {
    render(
      <Header lang="en" dict={navDict} authDict={authDict} user={null} />,
    );

    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "Services" })).toHaveAttribute(
      "href",
      "#services",
    );
  });

  it("keeps the account menu at the far end of the desktop actions", () => {
    render(
      <Header
        lang="en"
        dict={navDict}
        authDict={authDict}
        user={{ email: "studio@example.com" }}
      />,
    );

    const whatsapp = screen.getByRole("link", { name: "WhatsApp" });
    const accountMenu = screen.getByRole("button", { name: "Account menu" });

    expect(
      whatsapp.compareDocumentPosition(accountMenu) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
