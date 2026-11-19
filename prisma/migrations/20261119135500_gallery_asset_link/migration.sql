-- Галерея выполненных работ: фото галереи, как логотип и баннер, не привязаны
-- к товару, поэтому расширяем проверку связей.
ALTER TABLE "StoreAsset" DROP CONSTRAINT "StoreAsset_product_link_check";

ALTER TABLE "StoreAsset"
ADD CONSTRAINT "StoreAsset_product_link_check" CHECK (
  (
    ("type" = 'PRODUCT_IMAGE' AND "productId" IS NOT NULL)
    OR (
      "type" IN ('STORE_LOGO', 'STORE_BANNER', 'GALLERY_IMAGE')
      AND "productId" IS NULL
    )
  )
);
