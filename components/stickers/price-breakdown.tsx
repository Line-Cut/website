import type { PriceBreakdown as PriceBreakdownData } from "@/lib/stickers/pricing";
import { formatMoney } from "@/lib/stickers/format";
import type { Dictionary } from "@/lib/dictionary";

type Props = {
  breakdown: PriceBreakdownData;
  dict: Dictionary["stickers"]["pricing"];
  locale: "he" | "en";
};

/** Pure presentational — no hooks, server-safe. */
export function PriceBreakdown({ breakdown, dict, locale }: Props) {
  const isPricePending =
    breakdown.uniqueCount > 0 &&
    breakdown.sheetsSubtotal === 0 &&
    breakdown.setupFee === 0;

  return (
    <table className="w-full text-sm" aria-label={dict.heading}>
      <tbody>
        {/* Unique sticker count */}
        <tr>
          <td className="py-1 text-muted">{dict.uniqueCount}</td>
          <td className="py-1 text-end tabular-nums text-ink">
            <span dir="ltr" className="tabular-nums">
              {breakdown.uniqueCount}
            </span>
          </td>
        </tr>

        {/* Sheets per set */}
        <tr>
          <td className="py-1 text-muted">{dict.sheetsPerSet}</td>
          <td className="py-1 text-end tabular-nums text-ink">
            <span dir="ltr" className="tabular-nums">
              {breakdown.sheetsPerSet}
            </span>
          </td>
        </tr>

        {/* Total sheets */}
        <tr>
          <td className="py-1 text-muted">{dict.totalSheets}</td>
          <td className="py-1 text-end text-ink">
            <span dir="ltr" className="tabular-nums">
              {breakdown.totalSheets}
            </span>
          </td>
        </tr>

        {/* Per-sheet rate */}
        <tr>
          <td className="py-1 text-muted">{dict.perSheetRate}</td>
          <td className="py-1 text-end text-ink">
            <span dir="ltr" className="tabular-nums">
              {formatMoney(breakdown.perSheet, breakdown.currency, locale)}
            </span>
          </td>
        </tr>

        {/* Setup fee — only if non-zero */}
        {breakdown.setupFee > 0 && (
          <tr>
            <td className="py-1 text-muted">{dict.setupFee}</td>
            <td className="py-1 text-end text-ink">
              <span dir="ltr" className="tabular-nums">
                {formatMoney(breakdown.setupFee, breakdown.currency, locale)}
              </span>
            </td>
          </tr>
        )}

        {/* Divider */}
        <tr>
          <td colSpan={2} className="py-1">
            <hr className="border-line" />
          </td>
        </tr>

        {/* Total row */}
        <tr>
          <td className="py-1 font-semibold text-ink">{dict.total}</td>
          <td className="py-1 text-end font-bold text-ink">
            {isPricePending ? (
              <span className="text-sm font-normal text-muted">
                {dict.pricePending}
              </span>
            ) : (
              <span dir="ltr" className="tabular-nums">
                {formatMoney(breakdown.total, breakdown.currency, locale)}
              </span>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
