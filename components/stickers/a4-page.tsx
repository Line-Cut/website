import Image from "next/image";

type Props = {
  srcs: string[];
  columns: number;
  gutterPct: number;
  marginPct: number;
  label?: string;
};

/**
 * Renders a single A4 sheet with a CSS grid of sticker thumbnails.
 * Pure presentational — no hooks, server-safe.
 * Parent is responsible for constraining the outer width.
 */
export function A4Page({ srcs, columns, gutterPct, marginPct, label }: Props) {
  return (
    <div
      className="relative aspect-[210/297] overflow-hidden bg-white border border-line"
      aria-label={label}
    >
      <div
        className="absolute inset-0"
        style={{ padding: `${marginPct}%` }}
      >
        <div
          className="h-full w-full"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: `${gutterPct}%`,
          }}
        >
          {srcs.map((src, i) => (
            <div key={i} className="relative aspect-square overflow-hidden">
              <Image
                src={src}
                alt=""
                fill
                unoptimized
                loading="lazy"
                className="object-contain"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
