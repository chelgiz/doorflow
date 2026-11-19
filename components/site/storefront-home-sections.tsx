import {
  ArrowRight,
  BadgeCheck,
  ShieldCheck,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { DoorIllustration } from "@/components/door-illustration";
import type { StorefrontConfiguration } from "@/lib/storefront/config";

const benefitIcons = [ShieldCheck, Volume2, SlidersHorizontal, BadgeCheck];

export function StorefrontHomeSections({
  configuration,
}: {
  configuration: StorefrontConfiguration;
}) {
  const { home } = configuration;
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy-wrap">
            <span className="eyebrow">{home.eyebrow}</span>
            <h1>{home.heading}</h1>
            <p className="hero-copy">{home.subheading}</p>
            <div className="hero-actions">
              <Link className="button button-accent" href={home.primaryCtaHref}>
                {home.primaryCtaLabel} <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="button button-outline" href={home.secondaryCtaHref}>
                {home.secondaryCtaLabel}
              </Link>
            </div>
            <p className="hero-note">
              <BadgeCheck aria-hidden="true" />
              Замер по городу — бесплатно · Оплата после установки
            </p>
          </div>
          <div className="hero-visual">
            <div className="hero-art">
              {home.bannerAssetId ? (
                <Image
                  alt={home.bannerAlt}
                  className="storefront-banner-image"
                  height={900}
                  priority
                  sizes="(max-width: 760px) 100vw, 50vw"
                  src={`/api/store-assets/${home.bannerAssetId}`}
                  unoptimized
                  width={1200}
                />
              ) : (
                <DoorIllustration variant="graphite" label="Иллюстрация входной двери" />
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="container benefit-strip" aria-label="Преимущества магазина">
        {home.benefits.map(({ title, description }, index) => {
          const Icon = benefitIcons[index % benefitIcons.length];
          return (
            <div className="benefit" key={`${title}-${index}`}>
              <span className="benefit-icon"><Icon aria-hidden="true" /></span>
              <span><strong>{title}</strong><small>{description}</small></span>
            </div>
          );
        })}
      </section>

      {home.informationBlocks.length > 0 && (
        <section className="section" id="how-to-choose">
          <div className="container storefront-information">
            {home.informationBlocks.map((block, index) => (
              <article className="selection-panel" key={`${block.title}-${index}`}>
                <div>
                  <span className="eyebrow">{configuration.identity.publicName}</span>
                  <h2>{block.title}</h2>
                  <p>{block.body}</p>
                </div>
                {index === 0 && (
                  <Link className="button button-accent" href={home.primaryCtaHref}>
                    {home.primaryCtaLabel} <ArrowRight aria-hidden="true" />
                  </Link>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
