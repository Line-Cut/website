# Bundled font for server-side PDF generation

`DejaVuSans.ttf` is vendored here so the order **metadata PDF** (`lib/pdf/order-metadata-pdf.ts`)
can embed a single regular-weight font that covers **both Latin and Hebrew** (client names and
addresses are usually Hebrew, and standard PDF base-14 fonts have no Hebrew glyphs).

- **Why this font:** it's the only freely-redistributable TTF on hand that covers Latin + digits +
  the Hebrew block in one regular weight. (Noto Sans Hebrew covers Hebrew only, not Latin.)
- **License:** DejaVu Fonts License (Bitstream Vera derivative) — permissive, redistributable.
- **Runtime access:** read via `fs.readFileSync(path.join(process.cwd(), "lib/pdf/fonts/DejaVuSans.ttf"))`.
  It must ship with the serverless function — see `outputFileTracingIncludes` in `next.config.ts`.
