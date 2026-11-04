import Link from "next/link";
import { DoorOpen } from "lucide-react";
import Image from "next/image";
import type { StorefrontConfiguration } from "@/lib/storefront/config";

export function SiteFooter({
  identity,
}: {
  identity: StorefrontConfiguration["identity"];
}) {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <Link aria-label="DoorFlow — главная" className="brand" href="/">
          {identity.logoUrl ? (
            <Image alt={identity.publicName} height={42} src={identity.logoUrl} unoptimized width={150} />
          ) : (
            <>
              <span className="brand-mark" aria-hidden="true"><DoorOpen /></span>
              <span className="brand-word">{identity.publicName}</span>
            </>
          )}
        </Link>
        <div className="footer-store-contacts">
          {identity.phone && <a href={`tel:${identity.phone}`}>{identity.phone}</a>}
          {identity.email && <a href={`mailto:${identity.email}`}>{identity.email}</a>}
          {identity.locations.map((location, index) => (
            <address key={location.id ?? `${location.name}-${index}`}>
              {location.address}
              {location.businessHours && <span>{location.businessHours}</span>}
            </address>
          ))}
        </div>
        <nav aria-label="Навигация в подвале" className="footer-links">
          <Link href="/">Главная</Link>
          <Link href="/catalog">Каталог</Link>
          <Link href="/#collection">Модели</Link>
        </nav>
      </div>
    </footer>
  );
}
