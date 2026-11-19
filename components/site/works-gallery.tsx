"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

export type WorkPhoto = {
  assetId: string;
  caption: string | null;
};

/** Галерея выполненных работ: сетка миниатюр и просмотр фото целиком. */
export function WorksGallery({ items }: { items: WorkPhoto[] }) {
  const [active, setActive] = useState<WorkPhoto | null>(null);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(null);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);

  return (
    <>
      <div className="works-grid">
        {items.map((item) => (
          <button
            aria-label={item.caption ? `Открыть фото: ${item.caption}` : "Открыть фото работы"}
            className="work-card"
            key={item.assetId}
            onClick={() => setActive(item)}
            type="button"
          >
            <Image
              alt={item.caption ?? "Установленная входная дверь"}
              height={750}
              loading="lazy"
              sizes="(max-width: 640px) 50vw, (max-width: 1100px) 33vw, 300px"
              src={`/api/store-assets/${item.assetId}`}
              unoptimized
              width={600}
            />
            {item.caption && <span className="work-caption">{item.caption}</span>}
          </button>
        ))}
      </div>

      {active && (
        <div
          aria-label="Просмотр фотографии"
          aria-modal="true"
          className="lightbox"
          onClick={() => setActive(null)}
          role="dialog"
        >
          <button
            aria-label="Закрыть фото"
            className="lightbox-close"
            onClick={() => setActive(null)}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
          <figure className="lightbox-figure" onClick={(event) => event.stopPropagation()}>
            <Image
              alt={active.caption ?? "Установленная входная дверь"}
              height={1500}
              sizes="(max-width: 900px) 92vw, 820px"
              src={`/api/store-assets/${active.assetId}`}
              unoptimized
              width={1200}
            />
            {active.caption && <figcaption>{active.caption}</figcaption>}
          </figure>
        </div>
      )}
    </>
  );
}
