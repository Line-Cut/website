"use client";

import { useActionState } from "react";
import { MapPin, Phone, Mail, Clock, MessageCircle } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { submitContact, type ContactState } from "@/app/actions/contact";
import { siteConfig, whatsappLink } from "@/lib/site-config";
import { SECTION_IDS } from "@/lib/content";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionary";

const initial: ContactState = { status: "idle" };

export function Contact({ dict, lang }: { dict: Dictionary["contact"]; lang: Locale }) {
  const [state, action, pending] = useActionState(submitContact, initial);

  return (
    <section id={SECTION_IDS.contact} className="bg-paper-2/40 py-20">
      <Container className="grid gap-12 lg:grid-cols-2">
        {/* Details */}
        <div className="flex flex-col gap-6">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{dict.heading}</h2>
          <p className="text-lg text-muted">{dict.intro}</p>
          <ul className="flex flex-col gap-4 text-ink/90">
            <li className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-accent" />
              {`${siteConfig.address.street}, ${siteConfig.address.city}`}
            </li>
            <li className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-accent" />
              <a href={`tel:${siteConfig.phone}`} dir="ltr">{siteConfig.phone}</a>
            </li>
            <li className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-accent" />
              <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
            </li>
            <li className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-accent" />
              {siteConfig.hours[lang]}
            </li>
          </ul>
          <div className="flex items-center gap-3">
            <Button asChild>
              <a href={whatsappLink(dict.whatsappMessage)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-5 w-5" />
                {dict.whatsapp}
              </a>
            </Button>
            <a href={siteConfig.social.instagram} aria-label="Instagram" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent">
              {/* Instagram icon — lucide-react v1 dropped brand icons */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
            </a>
            <a href={siteConfig.social.facebook} aria-label="Facebook" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent">
              {/* Facebook icon — lucide-react v1 dropped brand icons */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
              </svg>
            </a>
          </div>
          <p className="text-sm text-muted">{`${dict.businessId}: ${siteConfig.businessId}`}</p>
        </div>

        {/* Form */}
        <form action={action} className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-6">
          {state.status === "success" ? (
            <p role="status" aria-live="polite" className="rounded-md bg-accent/10 p-4 text-accent">{dict.success}</p>
          ) : null}
          {state.status === "error" && state.message ? (
            <p role="alert" className="rounded-md bg-accent/10 p-4 text-accent">{dict.errorGeneric}</p>
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            {dict.fields.name}
            <input name="name" required className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent" />
            {state.errors?.name ? <span className="text-xs text-accent">{dict.fieldErrors.required}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {dict.fields.email}
            <input name="email" type="email" required dir="ltr" className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent" />
            {state.errors?.email ? <span className="text-xs text-accent">{dict.fieldErrors.email}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {dict.fields.phone}
            <input name="phone" dir="ltr" className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {dict.fields.message}
            <textarea name="message" required rows={4} className="rounded-md border border-line bg-paper px-3 py-2 outline-none focus:border-accent" />
            {state.errors?.message ? <span className="text-xs text-accent">{dict.fieldErrors.message}</span> : null}
          </label>

          <Button type="submit" disabled={pending}>
            {pending ? dict.sending : dict.submit}
          </Button>
        </form>
      </Container>
    </section>
  );
}
