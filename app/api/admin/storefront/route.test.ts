import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { revalidateTag } from "next/cache";
import sharp from "sharp";
import { POST as login } from "@/app/api/admin/auth/login/route";
import { POST as logout } from "@/app/api/admin/auth/logout/route";
import { GET as getStorefront, PUT as saveStorefront } from "@/app/api/admin/storefront/route";
import { POST as publishStorefront } from "@/app/api/admin/storefront/publish/route";
import { GET as getAdminThemeCss } from "@/app/api/admin/storefront/theme.css/route";
import { POST as uploadAsset } from "@/app/api/admin/assets/route";
import { DELETE as deleteAsset } from "@/app/api/admin/assets/[id]/route";
import { GET as getStoreAsset } from "@/app/api/store-assets/[id]/route";
import { GET as getPublicThemeCss } from "@/app/api/storefront/theme.css/route";
import { getPrismaClient } from "@/lib/db/prisma";
import { hashAdminPassword } from "@/lib/admin/password";
import { getPublicStorefront } from "@/lib/storefront/data";
import {
  defaultStorefrontConfiguration,
  type StorefrontConfiguration,
} from "@/lib/storefront/config";

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/headers")>();
  return {
    ...actual,
    cookies: vi.fn(async () => ({
      get: () => cookieState.value ? { value: cookieState.value } : undefined,
      set: (_name: string, value: string) => { cookieState.value = value; },
      delete: () => { cookieState.value = undefined; },
    })),
  };
});
vi.mock("next/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/cache")>();
  return {
    ...actual,
    cacheLife: vi.fn(),
    cacheTag: vi.fn(),
    revalidateTag: vi.fn(),
  };
});
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn(async () => {}) };
});

const databaseUrl = process.env.DOORFLOW_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
const originalEnv = {
  databaseUrl: process.env.DATABASE_URL,
  storeId: process.env.DOORFLOW_STORE_ID,
  demoMode: process.env.DOORFLOW_DEMO_MODE,
};
const password = "LocalStorefrontPassword-2026!";

function request(path: string, method: string, body?: unknown, origin = "http://localhost") {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function binaryRequest(path: string, contentType: string, body: Buffer, origin = "http://localhost") {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { origin, "content-type": contentType },
    body: new Uint8Array(body),
  });
}

integration("storefront access, isolation, draft and publication", () => {
  let storeId: string;
  let foreignStoreId: string;
  let ownerId: string;
  let adminId: string;
  let managerId: string;
  let foreignLocationId: string;

  beforeAll(async () => {
    if (!databaseUrl) return;
    const parsedUrl = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
      throw new Error("DOORFLOW_TEST_DATABASE_URL must point to a local test database");
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.DOORFLOW_DEMO_MODE = "false";
    storeId = randomUUID();
    foreignStoreId = randomUUID();
    process.env.DOORFLOW_STORE_ID = storeId;
    const prisma = getPrismaClient();
    await prisma.store.create({
      data: { id: storeId, slug: `storefront-${randomUUID()}`, name: "Storefront test shop" },
    });
    const foreignStore = await prisma.store.create({
      data: { id: foreignStoreId, slug: `other-${randomUUID()}`, name: "Other shop" },
    });
    const initialStorefront = structuredClone(defaultStorefrontConfiguration);
    initialStorefront.identity.publicName = "Storefront test shop";
    initialStorefront.seo.title = "Storefront test shop";
    await prisma.storefront.create({
      data: {
        storeId,
        draft: initialStorefront,
        published: initialStorefront,
      },
    });
    const foreignStorefront = structuredClone(defaultStorefrontConfiguration);
    foreignStorefront.identity.publicName = "Other shop";
    foreignStorefront.seo.title = "Other shop";
    await prisma.storefront.create({
      data: {
        storeId: foreignStoreId,
        draft: foreignStorefront,
        published: foreignStorefront,
      },
    });
    const owner = await prisma.adminUser.create({
      data: {
        storeId,
        email: "storefront-owner@doorflow.test",
        passwordHash: await hashAdminPassword(password),
        role: "OWNER",
      },
    });
    ownerId = owner.id;
    const admin = await prisma.adminUser.create({
      data: {
        storeId,
        email: "storefront-admin@doorflow.test",
        passwordHash: await hashAdminPassword(password),
        role: "ADMIN",
      },
    });
    adminId = admin.id;
    const manager = await prisma.adminUser.create({
      data: {
        storeId,
        email: "storefront-manager@doorflow.test",
        passwordHash: await hashAdminPassword(password),
        role: "MANAGER",
      },
    });
    managerId = manager.id;
    const foreignLocation = await prisma.storeLocation.create({
      data: {
        storeId: foreignStore.id,
        name: "Другая точка",
        address: "Чужой адрес",
      },
    });
    foreignLocationId = foreignLocation.id;
  });

  afterAll(async () => {
    if (storeId && databaseUrl) {
      const prisma = getPrismaClient();
      const storeIds = [storeId, foreignStoreId];
      await prisma.storeAsset.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
      await prisma.$disconnect();
      globalThis.doorflowPrisma = undefined;
    }
    cookieState.value = undefined;
    process.env.DATABASE_URL = originalEnv.databaseUrl;
    process.env.DOORFLOW_STORE_ID = originalEnv.storeId;
    process.env.DOORFLOW_DEMO_MODE = originalEnv.demoMode;
  });

  it("keeps drafts private, publishes by store, and restricts image access", async () => {
    expect((await getStorefront()).status).toBe(401);
    const imageBytes = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 4,
        background: { r: 120, g: 90, b: 60, alpha: 1 },
      },
    }).png().toBuffer();
    expect((await uploadAsset(binaryRequest(
      "/api/admin/assets?type=storefront-logo",
      "image/png",
      imageBytes,
    ))).status).toBe(401);
    expect((await publishStorefront(
      request("/api/admin/storefront/publish", "POST", undefined, "https://untrusted.example"),
    )).status).toBe(403);
    const ownerLogin = await login(request("/api/admin/auth/login", "POST", {
      email: "storefront-owner@doorflow.test",
      password,
    }));
    expect(ownerLogin.status).toBe(200);
    const themeQuery = new URLSearchParams({
      preset: defaultStorefrontConfiguration.theme.preset,
      primaryColor: defaultStorefrontConfiguration.theme.primaryColor,
      accentColor: defaultStorefrontConfiguration.theme.accentColor,
      backgroundColor: defaultStorefrontConfiguration.theme.backgroundColor,
      textColor: defaultStorefrontConfiguration.theme.textColor,
    });
    const adminThemeCss = await getAdminThemeCss(
      request(`/api/admin/storefront/theme.css?${themeQuery}`, "GET"),
    );
    expect(adminThemeCss.status).toBe(200);
    expect(await adminThemeCss.text()).toContain("--paper:#f7f6f2");

    const initialResponse = await getStorefront();
    expect(initialResponse.status).toBe(200);
    const initial = await initialResponse.json();
    const uploadedLogo = await uploadAsset(binaryRequest(
      "/api/admin/assets?type=storefront-logo",
      "image/png",
      imageBytes,
    ));
    expect(uploadedLogo.status).toBe(201);
    const logoAsset = (await uploadedLogo.json()).asset as { id: string; url: string };
    const uploadedBanner = await uploadAsset(binaryRequest(
      "/api/admin/assets?type=storefront-banner",
      "image/png",
      imageBytes,
    ));
    expect(uploadedBanner.status).toBe(201);
    const bannerAsset = (await uploadedBanner.json()).asset as { id: string; url: string };
    const unusedUpload = await uploadAsset(binaryRequest(
      "/api/admin/assets?type=storefront-logo",
      "image/png",
      imageBytes,
    ));
    const unusedAsset = (await unusedUpload.json()).asset as { id: string };
    expect(unusedUpload.status).toBe(201);
    expect((await deleteAsset(
      request(`/api/admin/assets/${unusedAsset.id}`, "DELETE"),
      { params: Promise.resolve({ id: unusedAsset.id }) },
    )).status).toBe(200);

    const draft = structuredClone(initial.draft) as StorefrontConfiguration;
    draft.identity.publicName = "Draft shop name";
    draft.identity.phone = "+7 900 000-00-53";
    draft.identity.email = "shop@stage53.test";
    draft.identity.logoUrl = logoAsset.url;
    draft.home.heading = "A changed but unpublished heading";
    draft.home.bannerAssetId = bannerAsset.id;
    draft.home.bannerAlt = "Door storefront test banner";

    const saved = await saveStorefront(request("/api/admin/storefront", "PUT", draft));
    expect(saved.status).toBe(200);
    expect((await getPublicStorefront())?.identity.publicName).toBe("Storefront test shop");
    expect((await getStoreAsset(
      request(`/api/store-assets/${logoAsset.id}`, "GET"),
      { params: Promise.resolve({ id: logoAsset.id }) },
    )).status).toBe(200);
    expect((await getStoreAsset(
      request(`/api/store-assets/${bannerAsset.id}`, "GET"),
      { params: Promise.resolve({ id: bannerAsset.id }) },
    )).status).toBe(200);
    expect(await (await getPublicThemeCss()).text()).toContain("#99513a");

    const foreignAssetId = randomUUID();
    await getPrismaClient().storeAsset.create({
      data: {
        id: foreignAssetId,
        storeId: foreignStoreId,
        type: "STORE_BANNER",
        contentType: "image/webp",
        byteSize: 1,
        sha256: "a".repeat(64),
        data: Buffer.from([1]),
      },
    });
    const privateAsset = await getStoreAsset(
      request(`/api/store-assets/${foreignAssetId}`, "GET"),
      { params: Promise.resolve({ id: foreignAssetId }) },
    );
    expect(privateAsset.status).toBe(404);
    const foreignAssetDelete = await deleteAsset(
      request(`/api/admin/assets/${foreignAssetId}`, "DELETE"),
      { params: Promise.resolve({ id: foreignAssetId }) },
    );
    expect(foreignAssetDelete.status).toBe(404);
    await logout(request("/api/admin/auth/logout", "POST"));
    expect((await getStoreAsset(
      request(`/api/store-assets/${logoAsset.id}`, "GET"),
      { params: Promise.resolve({ id: logoAsset.id }) },
    )).status).toBe(404);
    expect((await getStoreAsset(
      request(`/api/store-assets/${bannerAsset.id}`, "GET"),
      { params: Promise.resolve({ id: bannerAsset.id }) },
    )).status).toBe(404);
    expect((await getAdminThemeCss(
      request(`/api/admin/storefront/theme.css?${themeQuery}`, "GET"),
    )).status).toBe(404);
    expect((await login(request("/api/admin/auth/login", "POST", {
      email: "storefront-admin@doorflow.test",
      password,
    }))).status).toBe(200);
    const adminUpload = await uploadAsset(binaryRequest(
      "/api/admin/assets?type=storefront-banner",
      "image/png",
      imageBytes,
    ));
    expect(adminUpload.status).toBe(201);
    const adminAsset = (await adminUpload.json()).asset as { id: string };
    expect((await deleteAsset(
      request(`/api/admin/assets/${adminAsset.id}`, "DELETE"),
      { params: Promise.resolve({ id: adminAsset.id }) },
    )).status).toBe(200);
    const invalidTenantDraft = {
      ...draft,
      home: { ...draft.home, bannerAssetId: foreignAssetId },
      identity: {
        ...draft.identity,
        locations: [{
          id: foreignLocationId,
          name: "Чужая точка",
          address: "Чужой адрес",
          phone: null,
          businessHours: null,
        }],
      },
    };
    expect((await saveStorefront(request("/api/admin/storefront", "PUT", invalidTenantDraft))).status).toBe(422);
    const adminDraft = structuredClone(draft);
    adminDraft.home.heading = "Admin updated draft heading";
    expect((await saveStorefront(request("/api/admin/storefront", "PUT", adminDraft))).status).toBe(200);
    expect((await getPublicStorefront())?.home.heading).toBe(
      defaultStorefrontConfiguration.home.heading,
    );
    expect((await publishStorefront(request("/api/admin/storefront/publish", "POST"))).status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith(`storefront:${storeId}`, { expire: 0 });
    const publicConfiguration = await getPublicStorefront();
    expect(publicConfiguration?.identity.publicName).toBe("Draft shop name");
    expect(publicConfiguration?.home.bannerAssetId).toBe(bannerAsset.id);

    const publishedLogo = await getStoreAsset(
      request(`/api/store-assets/${logoAsset.id}`, "GET"),
      { params: Promise.resolve({ id: logoAsset.id }) },
    );
    expect(publishedLogo.status).toBe(200);
    const publishedBanner = await getStoreAsset(
      request(`/api/store-assets/${bannerAsset.id}`, "GET"),
      { params: Promise.resolve({ id: bannerAsset.id }) },
    );
    expect(publishedBanner.status).toBe(200);

    const secondDraft = structuredClone(adminDraft);
    secondDraft.home.heading = "Second unpublished heading";
    secondDraft.theme = {
      ...secondDraft.theme,
      preset: "custom",
      accentColor: "#315f4c",
    };
    expect((await saveStorefront(request("/api/admin/storefront", "PUT", secondDraft))).status).toBe(200);
    expect((await getPublicStorefront())?.home.heading).toBe("Admin updated draft heading");
    expect(await (await getPublicThemeCss()).text()).toContain("--accent:#99513a");
    expect((await publishStorefront(request("/api/admin/storefront/publish", "POST"))).status).toBe(200);
    expect((await getPublicStorefront())?.home.heading).toBe("Second unpublished heading");
    expect(await (await getPublicThemeCss()).text()).toContain("--accent:#315f4c");

    await logout(request("/api/admin/auth/logout", "POST"));
    const publishedAsset = await getStoreAsset(
      request(`/api/store-assets/${logoAsset.id}`, "GET"),
      { params: Promise.resolve({ id: logoAsset.id }) },
    );
    expect(publishedAsset.status).toBe(200);

    expect((await login(request("/api/admin/auth/login", "POST", {
      email: "storefront-manager@doorflow.test",
      password,
    }))).status).toBe(200);
    expect((await getStorefront()).status).toBe(403);
    expect((await saveStorefront(request(
      "/api/admin/storefront",
      "PUT",
      defaultStorefrontConfiguration,
    ))).status).toBe(403);
    expect((await publishStorefront(request("/api/admin/storefront/publish", "POST"))).status).toBe(403);
    expect((await uploadAsset(binaryRequest(
      "/api/admin/assets?type=storefront-logo",
      "image/png",
      imageBytes,
    ))).status).toBe(403);
    expect((await deleteAsset(
      request(`/api/admin/assets/${logoAsset.id}`, "DELETE"),
      { params: Promise.resolve({ id: logoAsset.id }) },
    )).status).toBe(403);
    await logout(request("/api/admin/auth/logout", "POST"));

    process.env.DOORFLOW_STORE_ID = foreignStoreId;
    expect((await getPublicStorefront())?.identity.publicName).toBe("Other shop");
    process.env.DOORFLOW_STORE_ID = storeId;
    expect(ownerId).toBeTruthy();
    expect(adminId).toBeTruthy();
    expect(managerId).toBeTruthy();
  });
});
