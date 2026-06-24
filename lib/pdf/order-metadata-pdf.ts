import "server-only";

import { readFileSync } from "fs";
import { join } from "path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import bidiFactory from "bidi-js";
import type { CheckoutInput } from "@/lib/stickers/checkout-schema";

// ---------------------------------------------------------------------------
// The order "metadata" file (req: a PDF inside each order folder holding the
// client's details). Client names/addresses are usually Hebrew, so we embed a
// single TTF that covers Latin + Hebrew (DejaVuSans) and reorder each line into
// visual order with bidi-js before drawing — pdf-lib draws glyphs left→right
// with no built-in bidi. Every row is prefixed with an English label, so the
// line's base direction is LTR and the layout stays left-aligned and stable;
// embedded Hebrew runs are reversed into their correct visual order.
// ---------------------------------------------------------------------------

const bidi = bidiFactory();

let _fontBytes: Uint8Array | undefined;
function loadFontBytes(): Uint8Array {
  if (!_fontBytes) {
    // Wrap in a plain Uint8Array — pdf-lib's embedFont validator rejects a raw
    // Node Buffer (a Uint8Array subclass) in some runtimes.
    _fontBytes = new Uint8Array(
      readFileSync(join(process.cwd(), "lib/pdf/fonts/DejaVuSans.ttf")),
    );
  }
  return _fontBytes;
}

/** Reorder a (possibly mixed-direction) string into visual order for drawing. */
function toVisual(text: string): string {
  if (!text) return "";
  const levels = bidi.getEmbeddingLevels(text);
  return bidi.getReorderedString(text, levels);
}

export type OrderMetadataPdfInput = {
  orderId: string;
  delivery: CheckoutInput;
  copies: number;
  stickerCount: number;
  createdAtISO: string;
};

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

export async function buildOrderMetadataPdf(
  input: OrderMetadataPdfInput,
): Promise<Uint8Array> {
  const { orderId, delivery, copies, stickerCount, createdAtISO } = input;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(loadFontBytes(), { subset: true });

  const page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const ink = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.36, 0.36, 0.36);
  let y = PAGE_HEIGHT - MARGIN;

  function line(
    text: string,
    opts?: { size?: number; color?: ReturnType<typeof rgb>; gap?: number },
  ) {
    const size = opts?.size ?? 11;
    page.drawText(toVisual(text), {
      x: MARGIN,
      y,
      size,
      font: font as PDFFont,
      color: opts?.color ?? ink,
    });
    y -= opts?.gap ?? size + 7;
  }

  function spacer(h = 12) {
    y -= h;
  }

  const fullName = [delivery.firstName, delivery.lastName]
    .filter(Boolean)
    .join(" ");

  line("Line Cut — Order metadata", { size: 18 });
  spacer(6);
  line(`Order ID: ${orderId}`, { size: 10, color: muted });
  line(`Created:  ${createdAtISO}`, { size: 10, color: muted });
  spacer();

  line("Customer", { size: 13 });
  line(`Name:  ${fullName}`);
  line(`Phone: ${delivery.phone}`);
  line(`Email: ${delivery.email}`);
  spacer();

  line("Delivery", { size: 13 });
  line(`Method: ${delivery.method}`);
  if (delivery.method === "shipping") {
    if (delivery.addressLine1) line(`Address: ${delivery.addressLine1}`);
    if (delivery.addressLine2) line(`         ${delivery.addressLine2}`);
    if (delivery.city) line(`City: ${delivery.city}`);
    if (delivery.postalCode) line(`Postal code: ${delivery.postalCode}`);
    if (delivery.country) line(`Country: ${delivery.country}`);
  }
  if (delivery.notes) line(`Notes: ${delivery.notes}`);
  spacer();

  line("Order", { size: 13 });
  line(`Sticker designs: ${stickerCount}`);
  line(`Copies: ${copies}`);

  return doc.save();
}
