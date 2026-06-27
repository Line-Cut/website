import { Reveal } from "@/components/motion/reveal";
import { ProductCard } from "@/components/store/product-card";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import type { StoreProductView } from "@/lib/store/types";

export function ProductGrid({
  products,
  dict,
  lang,
}: {
  products: StoreProductView[];
  dict: Dictionary["store"];
  lang: Locale;
}) {
  if (products.length === 0) {
    return <p className="py-12 text-center text-muted">{dict.empty}</p>;
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3">
      {products.map((product, i) => (
        <Reveal key={product.id} delay={(i % 3) * 0.05}>
          <ProductCard product={product} dict={dict} lang={lang} />
        </Reveal>
      ))}
    </div>
  );
}
