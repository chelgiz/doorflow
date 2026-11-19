import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { DoorIllustration } from "@/components/door-illustration";
import type { Product } from "@/lib/products";

const priceFormatter = new Intl.NumberFormat("ru-RU");

/** «860 L / 860 R / 960 L / 960 R мм» → «860 и 960 мм» */
function formatDimensions(dimensions: string) {
  return dimensions.includes("860") && dimensions.includes("960")
    ? "860 и 960 мм"
    : dimensions;
}

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="product-card">
      <Link
        aria-label={`Подробнее о модели ${product.name}${product.isDemo ? " DEMO" : ""}`}
        className="product-art"
        href={`/catalog/${product.slug}`}
      >
        {product.isDemo && <span className="demo-badge">DEMO · ПРИМЕР</span>}
        {product.imageUrl ? (
          <>
            <Image
              alt={`Фото двери ${product.name}`}
              className="door-illustration product-image-main"
              height={480}
              src={product.imageUrl}
              unoptimized
              width={360}
            />
            {product.imageUrls[1] && (
              <Image
                alt={`Фото двери ${product.name} с другого ракурса`}
                className="door-illustration product-image-alt"
                height={480}
                src={product.imageUrls[1]}
                unoptimized
                width={360}
              />
            )}
          </>
        ) : (
          <DoorIllustration label={`Иллюстрация модели ${product.name}`} variant={product.variant} />
        )}
      </Link>
      <div className="product-info">
        <div className="product-meta">
          {product.series && <span>{product.series}</span>}
          <span>{product.categoryLabel}</span>
        </div>
        <h3>
          <Link href={`/catalog/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="product-description">{product.description}</p>
        <div className="product-specs" aria-label="Характеристики">
          {product.dimensions && (
            <span className="product-spec">{formatDimensions(product.dimensions)}</span>
          )}
          {product.steelThickness !== undefined && (
            <span className="product-spec">Сталь {product.steelThickness} мм</span>
          )}
          {product.sealContours !== undefined && (
            <span className="product-spec">{product.sealContours} контура</span>
          )}
        </div>
        <div className="product-bottom">
          <span>
            <small className="product-price-label">
              {product.isDemo ? "Цена-пример · DEMO" : "Цена от"}
            </small>
            <span className="product-price">{priceFormatter.format(product.price)} ₽</span>
          </span>
          <Link className="text-link" href={`/catalog/${product.slug}`}>
            Характеристики <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
