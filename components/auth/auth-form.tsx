"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

type Props = {
  mode: "login" | "signup";
  lang: Locale;
  dict: Dictionary["auth"];
};

export function AuthForm({ mode: initialMode, lang, dict }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isLogin = mode === "login";

  function handleGoogleSignIn() {
    startTransition(async () => {
      setError(null);
      const supabase = createBrowserSupabaseClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/${lang}/auth/callback`,
        },
      });
      if (oauthError) {
        setError(dict.errors.generic);
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;

    startTransition(async () => {
      setError(null);
      const supabase = createBrowserSupabaseClient();

      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          // Map known auth failures to a clear message; everything else is generic.
          const msg = signInError.message?.toLowerCase() ?? "";
          if (
            msg.includes("invalid") ||
            msg.includes("credentials") ||
            msg.includes("email not confirmed")
          ) {
            setError(dict.errors.invalid_credentials);
          } else {
            setError(dict.errors.generic);
          }
          return;
        }
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) {
          setError(dict.errors.generic);
          return;
        }
      }

      router.push(`/${lang}/account/orders`);
    });
  }

  const heading = isLogin ? dict.login.heading : dict.signup.heading;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold text-ink">{heading}</h1>

      {/* Error live region */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent"
        >
          {error}
        </div>
      )}

      {/* Google sign-in */}
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleSignIn}
        disabled={isPending}
        className="w-full"
      >
        {dict.login.googleCta}
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        <span>or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {/* Email / password form */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {/* Email */}
        <div className="flex flex-col gap-1">
          <label htmlFor="auth-email" className="text-sm font-medium text-ink">
            {dict.login.emailLabel}
          </label>
          <input
            id="auth-email"
            type="email"
            dir="ltr"
            autoComplete={isLogin ? "email" : "email"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isPending}
            className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent disabled:opacity-60"
          />
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="auth-password"
            className="text-sm font-medium text-ink"
          >
            {dict.login.passwordLabel}
          </label>
          <div className="relative">
            <input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              dir="ltr"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isPending}
              className="h-11 w-full rounded-md border border-line bg-paper px-3 pe-10 outline-none focus:border-accent disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 end-0 flex items-center px-3 text-muted hover:text-ink"
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={isPending}
          className="w-full min-h-[44px]"
        >
          {isPending
            ? "…"
            : isLogin
              ? dict.login.submit
              : dict.signup.submit}
        </Button>
      </form>

      {/* Toggle between login and signup */}
      <p className="text-center text-sm text-muted">
        <button
          type="button"
          onClick={() => {
            setMode(isLogin ? "signup" : "login");
            setError(null);
          }}
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          {isLogin ? dict.login.toSignup : dict.signup.toLogin}
        </button>
      </p>
    </div>
  );
}
