# AGENTS.md — DoorFlow

## Проект

- DoorFlow — коммерческая платформа для магазинов входных дверей: витрина + CRM +
  заказы/замеры/оплаты/установки + админка.
- Стек: Next.js 16.4.5 (App Router), React 19.3.0, TypeScript 5, Prisma 7.10.1,
  PostgreSQL 17, Zod 4, Vitest 4. Tailwind подключён, но CSS почти весь кастомный
  в `app/globals.css` (~3 000 строк). Никаких UI-библиотек/framer-motion.
- Развёртывание: **одна установка + одна БД на магазин** (не мультитенант).
- Пилотный магазин: «ДверМонт» (slug `dvermont`), Екатеринбург.

## Структура

- `app/` — публичные роуты (`/`, `/catalog`, `/catalog/[slug]`), `app/admin/**`,
  API `app/api/**/route.ts`.
- `components/` — витрина (`product-card`, `door-configurator`, `lead-request-form`)
  и `components/admin/*`.
- `lib/` — `commerce/` (цены, лиды, модель), `admin/` (auth, schemas, audit),
  `storefront/` (config, theme, data, catalog), `db/` (prisma, config).
- `prisma/` — `schema.prisma` + `migrations/`.
- `scripts/` — `seed-pilot.ts`, `backup-postgres.mjs`, `restore-postgres.mjs`,
  `pg-client.mjs`, `create-admin.ts`, `postgres-connection.mjs`, `check-production-env.mjs`.
- `deploy/` — nginx + systemd шаблоны.
- Тесты — `*.test.ts` рядом с кодом.

## Состояние этапов

- **Этап 0 закрыт:** P1 Zod-URL crash (`b7a624b`); P2 бэкап через `pg_dump` 17 из
  контейнера + data-drill (`d8ce7ad`, `ca9281b`); P3 4 миграции + корректирующая
  `Storefront` (`a71f33d`), `migrate diff` пустой, интеграционные тесты включены.
- **Этап 1 закрыт:** витрина на реальных данных; премиальный визуальный слой +
  палитра «Медь» как пресет темы (`e8b8cab`); сквозной сценарий
  заявка → замер → заказ → оплата → установка; RBAC проверен; аналитика посчитана.
- **Этап 2 в работе:** 2.1 назначение менеджера (`b4d85a3`); впереди 2.2 первый
  контакт/SLA 2 ч, 2.3 напоминания, 2.4 причины отказа, 2.5 повторные касания.
- **SLA в рабочих часах:** срок первого контакта — 2 рабочих часа по расписанию
  `Пн–Пт 09:00–19:00, Сб 10:00–15:00` (Азия/Екатеринбург), выходные и ночь не
  считаются. Расписание и часовой пояс — в `lib/admin/working-hours.ts`.
- **Уведомления о заявках:** новая публичная заявка уходит в Telegram
  (`DOORFLOW_TELEGRAM_BOT_TOKEN`, `DOORFLOW_TELEGRAM_CHAT_IDS` через запятую);
  ошибки отправки не ломают форму — заявка уже сохранена.
- **Этап 6 в работе:** 6.1 API агрегатов `/api/admin/analytics` (`fd43ca9`,
  `532f3ab`), 6.2 страница `/admin/analytics` (`b65960b`), 6.3 блок сводки на
  главной.
- Пилотные данные: 2 заявки (MEASURED + SALE), 1 замер, 1 заказ 73 300 ₽,
  1 оплата 30 000 ₽ (остаток 43 300 ₽), 1 установка SCHEDULED; роли
  owner / manager / measurer / installer.

## Запрещено без явного разрешения владельца

- Миграции БД и любые изменения данных; бизнес-логика и продуктовая таксономия.
- `.env` и секреты; n8n и Docker-инфраструктура.
- Старые БД: `doorflow_readiness_*`, `doorflow_stage51_*`, `doorflow_stage5_test`.
- Документация `*.md` (включая этот файл) и бэклог.
- Git-история: никаких `reset --hard`, `rebase`, `push --force`, `clean`,
  `filter-branch`/`filter-repo`.

## Бэклог (отдельный список, не менять без владельца)

Открытые бизнес-вопросы: заказ из заявки на замер (откуда брать цену),
себестоимость для расчёта прибыли, аналитика (нет UI), rate-limit и
идемпотентные дубли, origin `localhost` vs `127.0.0.1`.

## Работа с БД

1. Свежий бэкап: `DOORFLOW_DB_CONTAINER=doorflow-postgres-1 node scripts/backup-postgres.mjs`.
2. `npx prisma migrate deploy` для `doorflow`.
3. То же отдельно для тестовой БД (`DATABASE_URL` → `doorflow_test`).
4. Проверка: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`
   → должно быть `No difference detected`.
5. После изменения схемы: `npx prisma generate`.
- Клиент `pg_dump`/`pg_restore` берётся из контейнера; локальный клиент 15.x с сервером 17
  не работает (мажорные версии должны совпадать).
- `doorflow_test` — отдельная БД для интеграционных тестов; миграции накатываются на неё
  отдельно, тесты пишут только туда.

## Проверки готовности

```bash
export DOORFLOW_TEST_DATABASE_URL='postgresql://doorflow:doorflow_local_only@127.0.0.1:54329/doorflow_test?schema=public'
npm test        # 137 passed, 30 файлов, 0 skipped (обновляется на каждом шаге)
npm run typecheck
npm run lint
npm run build
```
- Локальный сервер: `pkill -f next-server; rm -rf .next; npm run build; PORT=3000 npm run start`.
- `next start` порождает процесс `next-server` — убивать его, а не только `next start`,
  иначе старый процесс держит порт и отдаёт устаревший код.

## Скриншоты (playwright, dev-only)

- Логин в админку только через `request.post` с `origin: http://localhost:3000`
  (не через `127.0.0.1` — иначе 403 same-origin).
- `playwright` — dev-зависимость только для скриншотов, в прод не идёт.

## Стиль работы (требование владельца)

- Одна узкая задача за шаг; после шага — отчёт (что сделано / файлы / что работает /
  тесты / что осталось) и **остановка до подтверждения**.
- `grep`/`rg` вместо чтения файлов целиком.
- Пароли сотрудников показывать **один раз**; в БД только Argon2id-хеш.
- Коммит отдельным коммитом на каждый шаг.
- Не выдумывать цифры; не заявлять о готовности без проверки.
- Не придумывать бизнес-логику — предлагать 2–3 варианта и ждать решения.

## Особенности окружения

- Сервер видит свой origin как `http://localhost:3000`.
- `generated/prisma`, `.next`, `tsconfig.tsbuildinfo`, `node_modules` — артефакты, не коммитить.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
