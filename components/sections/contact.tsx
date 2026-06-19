"use client";

import { useActionState } from "react";
import { MapPin, Phone, Mail, Clock, MessageCircle } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { InstagramIcon, FacebookIcon } from "@/components/ui/social-icons";
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
              <InstagramIcon />
            </a>
            <a href={siteConfig.social.facebook} aria-label="Facebook" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent">
              <FacebookIcon />
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
            <p role="alert" aria-live="assertive" className="rounded-md bg-accent/10 p-4 text-accent">{dict.errorGeneric}</p>
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            {dict.fields.name}
            <input name="name" required className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent" />
            {state.errors?.name ? <span aria-live="polite" className="text-xs text-accent">{dict.fieldErrors.required}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {dict.fields.email}
            <input name="email" type="email" required dir="ltr" className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent" />
            {state.errors?.email ? <span aria-live="polite" className="text-xs text-accent">{dict.fieldErrors.email}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {dict.fields.phone}
            <input name="phone" dir="ltr" className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {dict.fields.message}
            <textarea name="message" required rows={4} className="rounded-md border border-line bg-paper px-3 py-2 outline-none focus:border-accent" />
            {state.errors?.message ? <span aria-live="polite" className="text-xs text-accent">{dict.fieldErrors.message}</span> : null}
          </label>

          <Button type="submit" disabled={pending}>
            {pending ? dict.sending : dict.submit}
          </Button>
        </form>
      </Container>
    </section>
  );
}
