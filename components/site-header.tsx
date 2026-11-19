"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { DoorOpen, Menu, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { StorefrontConfiguration } from "@/lib/storefront/config";

const navigation = [
  { href: "/catalog", label: "Каталог" },
  { href: "/#works", label: "Наши работы" },
  { href: "/delivery", label: "Доставка и монтаж" },
  { href: "/warranty", label: "Гарантия и оплата" },
  { href: "/contacts", label: "Контакты" },
];

export function SiteHeader({
  identity,
}: {
  identity: StorefrontConfiguration["identity"];
}) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link aria-label="DoorFlow — главная" className="brand" href="/">
          {identity.logoUrl ? (
            <Image alt={identity.publicName} height={42} src={identity.logoUrl} unoptimized width={150} />
          ) : (
            <>
              <span className="brand-mark"><DoorOpen aria-hidden="true" /></span>
              <span className="brand-word">{identity.publicName}</span>
            </>
          )}
        </Link>

        <nav aria-label="Основная навигация" className="desktop-nav">
          {navigation.map((item) => (
            <Link href={item.href} key={item.label}>
              {item.label}
            </Link>
          ))}
        </nav>

        {identity.phone && <a className="header-contact" href={`tel:${identity.phone}`}>{identity.phone}</a>}
        <Link className="button header-cta" href="/catalog">Смотреть каталог</Link>

        <Dialog.Root>
          <Dialog.Trigger aria-label="Открыть меню" className="mobile-menu-trigger">
            <Menu aria-hidden="true" />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="mobile-overlay" />
            <Dialog.Content className="mobile-panel">
              <div className="mobile-panel-head">
                <Link aria-label="DoorFlow — главная" className="brand" href="/">
                  {identity.logoUrl ? (
                    <Image alt={identity.publicName} height={42} src={identity.logoUrl} unoptimized width={150} />
                  ) : (
                    <>
                      <span className="brand-mark"><DoorOpen aria-hidden="true" /></span>
                      <span className="brand-word">{identity.publicName}</span>
                    </>
                  )}
                </Link>
                <Dialog.Close aria-label="Закрыть меню" className="mobile-close">
                  <X aria-hidden="true" />
                </Dialog.Close>
              </div>
              <Dialog.Title className="sr-only">Навигация DoorFlow</Dialog.Title>
              <Dialog.Description className="sr-only">
                Ссылки на каталог и разделы витрины.
              </Dialog.Description>
              <nav aria-label="Мобильная навигация" className="mobile-nav">
                {navigation.map((item) => (
                  <Dialog.Close asChild key={item.label}>
                    <Link href={item.href}>{item.label}</Link>
                  </Dialog.Close>
                ))}
              </nav>
              <Dialog.Close asChild>
                <Link className="button button-accent" href="/catalog">
                  Перейти в каталог
                </Link>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
