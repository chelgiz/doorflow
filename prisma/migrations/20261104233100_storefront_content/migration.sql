ALTER TABLE "StoreLocation"
ADD COLUMN "businessHours" VARCHAR(300);

ALTER TABLE "StoreAsset"
DROP CONSTRAINT "StoreAsset_product_link_check";

ALTER TABLE "StoreAsset"
ADD CONSTRAINT "StoreAsset_product_link_check" CHECK (
  ("type" = 'PRODUCT_IMAGE' AND "productId" IS NOT NULL)
  OR ("type" IN ('STORE_LOGO', 'STORE_BANNER') AND "productId" IS NULL)
);

DROP INDEX "StoreAsset_one_logo_per_store_key";

CREATE TABLE "Storefront" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storeId" UUID NOT NULL,
  "draft" JSONB NOT NULL,
  "published" JSONB NOT NULL,
  "publishedAt" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Storefront_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Storefront_storeId_key" UNIQUE ("storeId"),
  CONSTRAINT "Storefront_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "Storefront" ("storeId", "draft", "published")
SELECT
  store."id",
  content.value,
  content.value
FROM "Store" AS store
CROSS JOIN LATERAL (
  SELECT jsonb_build_object(
    'identity', jsonb_build_object(
      'publicName', store."name",
      'logoUrl', CASE
        WHEN store."settings"->>'logoUrl' ~ '^/api/store-assets/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          THEN store."settings"->>'logoUrl'
        ELSE NULL
      END,
      'phone', left(store."settings"->>'contactPhone', 24),
      'email', CASE
        WHEN store."settings"->>'contactEmail' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
          THEN store."settings"->>'contactEmail'
        ELSE NULL
      END,
      'locations', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', location."id"::text,
            'name', location."name",
            'address', location."address",
            'phone', location."phone",
            'businessHours', location."businessHours"
          ) ORDER BY location."sortOrder", location."name"
        )
        FROM "StoreLocation" AS location
        WHERE location."storeId" = store."id" AND location."isActive" = TRUE
      ), '[]'::jsonb)
    ),
    'home', jsonb_build_object(
      'eyebrow', 'Каталог входных дверей',
      'heading', 'Надёжность начинается с входа.',
      'subheading', 'Сравните опубликованные магазином модели по отделке, размерам и доступной комплектации.',
      'bannerAssetId', NULL,
      'bannerAlt', '',
      'benefits', jsonb_build_array(
        jsonb_build_object('title', 'Уровни защиты', 'description', 'Подбор под задачу'),
        jsonb_build_object('title', 'Тепло и тишина', 'description', 'Варианты наполнения'),
        jsonb_build_object('title', 'Своя комплектация', 'description', 'Детали под ваш проём'),
        jsonb_build_object('title', 'Понятные характеристики', 'description', 'Всё важное в карточке')
      ),
      'informationBlocks', jsonb_build_array(
        jsonb_build_object('title', 'Подбор начинается с деталей', 'body', 'Сравните характеристики и комплектацию дверей в каталоге.')
      ),
      'primaryCtaLabel', 'Выбрать дверь',
      'primaryCtaHref', '/catalog',
      'secondaryCtaLabel', 'Как устроен подбор',
      'secondaryCtaHref', '#how-to-choose'
    ),
    'theme', jsonb_build_object(
      'preset', 'warm',
      'primaryColor', '#1d2927',
      'accentColor', '#99513a',
      'backgroundColor', '#f7f6f2',
      'textColor', '#1d2927'
    ),
    'seo', jsonb_build_object(
      'title', left(store."name", 70),
      'description', 'Каталог входных дверей и комплектаций магазина.'
    )
  ) AS value
) AS content;
