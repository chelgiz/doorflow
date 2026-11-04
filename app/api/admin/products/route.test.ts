import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/admin/auth/login/route";
import { POST as logout } from "@/app/api/admin/auth/logout/route";
import { GET as getProducts, POST as createProduct } from "@/app/api/admin/products/route";
import { POST as uploadAsset } from "@/app/api/admin/assets/route";
import { DELETE as deleteAsset } from "@/app/api/admin/assets/[id]/route";
import { GET as getStoreAsset } from "@/app/api/store-assets/[id]/route";
import { PUT as updateProduct } from "@/app/api/admin/products/[id]/route";
import { PATCH as updateLeadStatus, GET as getLead } from "@/app/api/admin/leads/[id]/route";
import { POST as createPricingRule } from "@/app/api/admin/pricing-rules/route";
import { GET as getSettings, PATCH as updateSettings } from "@/app/api/admin/settings/route";
import { POST as createLocation } from "@/app/api/admin/locations/route";
import { GET as getUsers, POST as createUser } from "@/app/api/admin/users/route";
import { PUT as updateUser } from "@/app/api/admin/users/[id]/route";
import { GET as getMeasurements, POST as createMeasurement } from "@/app/api/admin/measurements/route";
import { GET as getMeasurement, PATCH as updateMeasurement } from "@/app/api/admin/measurements/[id]/route";
import { GET as getOrders, POST as createOrder } from "@/app/api/admin/orders/route";
import { GET as getOrder, PATCH as updateOrder } from "@/app/api/admin/orders/[id]/route";
import { POST as addOrderPayment } from "@/app/api/admin/orders/[id]/payments/route";
import { GET as getInstallations, POST as createInstallation } from "@/app/api/admin/installations/route";
import { GET as getInstallation, PATCH as updateInstallation } from "@/app/api/admin/installations/[id]/route";
import { POST as createCustomerActivity } from "@/app/api/admin/leads/[id]/activities/route";
import { POST as quote } from "@/app/api/quotes/route";
import { getPrismaClient } from "@/lib/db/prisma";
import { hashAdminPassword } from "@/lib/admin/password";
import { recordLoginFailure } from "@/lib/admin/auth";
import { getAdminStoreId } from "@/lib/db/config";
import { getPublicCatalogProducts } from "@/lib/storefront/catalog";

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

const databaseUrl = process.env.DOORFLOW_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
const originalEnv = {
  databaseUrl: process.env.DATABASE_URL,
  storeId: process.env.DOORFLOW_STORE_ID,
  demoMode: process.env.DOORFLOW_DEMO_MODE,
};

function request(
  path: string,
  method: string,
  body?: unknown,
  origin = "http://localhost",
  extraHeaders: Record<string, string> = {},
) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      origin,
      ...extraHeaders,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function imageRequest(path: string, contentType: string, body: Blob) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": contentType },
    body,
  });
}

integration("protected admin CRUD flow", () => {
  let storeId: string;
  let foreignStoreId: string | undefined;
  let ownerId: string;
  let employeeId: string;
  let productId: string;
  let groupId: string;
  let optionId: string;
  let leadId: string;
  const password = "LocalIntegrationPassword-2026!";

  beforeAll(async () => {
    if (!databaseUrl) return;
    const parsedUrl = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
      throw new Error("DOORFLOW_TEST_DATABASE_URL must point to a local test database");
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.DOORFLOW_DEMO_MODE = "false";
    storeId = randomUUID();
    process.env.DOORFLOW_STORE_ID = storeId;
    const prisma = getPrismaClient();
    const createdStore = await prisma.store.create({
      data: {
        id: storeId,
        slug: `admin-test-${randomUUID()}`,
        name: "Admin integration test store",
        isDemo: false,
      },
    });
    const owner = await prisma.adminUser.create({
      data: {
        storeId: createdStore.id,
        email: "owner@doorflow.test",
        passwordHash: await hashAdminPassword(password),
        role: "OWNER",
      },
    });
    ownerId = owner.id;
  });

  afterAll(async () => {
    if (storeId && databaseUrl) {
      const prisma = getPrismaClient();
      const storeIds = [storeId, foreignStoreId].filter((id): id is string => Boolean(id));
      await prisma.$executeRaw`ALTER TABLE "Order" DISABLE TRIGGER USER`;
      await prisma.$executeRaw`ALTER TABLE "OrderPayment" DISABLE TRIGGER USER`;
      await prisma.$executeRaw`ALTER TABLE "OperationAudit" DISABLE TRIGGER USER`;
      await prisma.$executeRaw`ALTER TABLE "CustomerActivity" DISABLE TRIGGER USER`;
      await prisma.$executeRaw`ALTER TABLE "Measurement" DISABLE TRIGGER USER`;
      await prisma.$executeRaw`ALTER TABLE "Installation" DISABLE TRIGGER USER`;
      try {
        await prisma.orderPayment.deleteMany({ where: { order: { storeId: { in: storeIds } } } });
        await prisma.installation.deleteMany({ where: { storeId: { in: storeIds } } });
        await prisma.measurement.deleteMany({ where: { storeId: { in: storeIds } } });
        await prisma.customerActivity.deleteMany({ where: { storeId: { in: storeIds } } });
        await prisma.operationAudit.deleteMany({ where: { storeId: { in: storeIds } } });
        await prisma.order.deleteMany({ where: { storeId: { in: storeIds } } });
        await prisma.lead.deleteMany({ where: { storeId: { in: storeIds } } });
        await prisma.storeAsset.deleteMany({ where: { storeId: { in: storeIds } } });
        await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
      } finally {
        await prisma.$executeRaw`ALTER TABLE "Order" ENABLE TRIGGER USER`;
        await prisma.$executeRaw`ALTER TABLE "OrderPayment" ENABLE TRIGGER USER`;
        await prisma.$executeRaw`ALTER TABLE "OperationAudit" ENABLE TRIGGER USER`;
        await prisma.$executeRaw`ALTER TABLE "CustomerActivity" ENABLE TRIGGER USER`;
        await prisma.$executeRaw`ALTER TABLE "Measurement" ENABLE TRIGGER USER`;
        await prisma.$executeRaw`ALTER TABLE "Installation" ENABLE TRIGGER USER`;
      }
      await prisma.$disconnect();
      globalThis.doorflowPrisma = undefined;
    }
    cookieState.value = undefined;
    process.env.DATABASE_URL = originalEnv.databaseUrl;
    process.env.DOORFLOW_STORE_ID = originalEnv.storeId;
    process.env.DOORFLOW_DEMO_MODE = originalEnv.demoMode;
  });

  it("atomically counts concurrent login failures and disables admin access in demo mode", async () => {
    const email = "parallel-login@doorflow.test";
    await Promise.all(
      Array.from({ length: 12 }, () => recordLoginFailure(storeId, email)),
    );

    const subjectHash = createHash("sha256")
      .update(`${storeId}:${email}`)
      .digest("hex");
    const prisma = getPrismaClient();
    const attempt = await prisma.adminLoginAttempt.findUnique({
      where: { storeId_subjectHash: { storeId, subjectHash } },
      select: { attempts: true, blockedUntil: true },
    });
    expect(attempt?.attempts).toBe(12);
    expect(attempt?.blockedUntil).toBeInstanceOf(Date);

    process.env.DOORFLOW_DEMO_MODE = "true";
    expect(getAdminStoreId()).toBeNull();
    process.env.DOORFLOW_DEMO_MODE = "false";
  });

  it("authenticates, enforces roles, and persists product, pricing, settings, location, and lead changes", async () => {
    const unauthorized = await getProducts();
    expect(unauthorized.status).toBe(401);
    expect((await getUsers()).status).toBe(401);

    const badLogin = await login(request("/api/admin/auth/login", "POST", {
      email: "owner@doorflow.test",
      password: "wrong password",
    }));
    expect(badLogin.status).toBe(401);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failedAttempt = await login(request("/api/admin/auth/login", "POST", {
        email: "unknown@doorflow.test",
        password,
      }));
      expect(failedAttempt.status).toBe(401);
    }
    const limitedAttempt = await login(request("/api/admin/auth/login", "POST", {
      email: "unknown@doorflow.test",
      password,
    }));
    expect(limitedAttempt.status).toBe(429);

    const loginResponse = await login(request("/api/admin/auth/login", "POST", {
      email: " OWNER@DOORFLOW.TEST ",
      password,
    }));
    expect(loginResponse.status).toBe(200);
    expect(cookieState.value).toBeTruthy();

    const forbiddenOrigin = await createProduct(request("/api/admin/products", "POST", {}, "https://attacker.test"));
    expect(forbiddenOrigin.status).toBe(403);

    const createResponse = await createProduct(request("/api/admin/products", "POST", {
      slug: "admin-test-door",
      model: "ADMIN-001",
      name: "Integration door",
      description: "Test-only product",
      category: "apartment",
      basePriceMinor: 2_000_000,
      costMinor: 1_000_000,
      manufacturerId: null,
      specifications: { dimensions: "2000 × 800 мм" },
      isActive: true,
      optionGroups: [{
        key: "lock-set",
        label: "Lock set",
        selectionMode: "SINGLE",
        required: true,
        minSelections: 1,
        maxSelections: 1,
        sortOrder: 0,
        isActive: true,
        options: [{
          key: "standard",
          label: "Standard lock",
          priceMinor: 100_000,
          pricingUnit: "PER_DOOR",
          isActive: true,
          sortOrder: 0,
        }],
      }],
    }));
    const created = await createResponse.json();
    expect(createResponse.status).toBe(201);
    productId = created.product.id;
    groupId = created.product.optionGroups[0].id;
    optionId = created.product.optionGroups[0].options[0].id;
    expect(created.product.basePriceMinor).toBe(2_000_000);
    const imageBytes = await sharp({
      create: { width: 40, height: 60, channels: 3, background: "#24312e" },
    }).png().toBuffer();
    const imageUploadResponse = await uploadAsset(imageRequest(
      `/api/admin/assets?productId=${productId}`,
      "image/png",
      new Blob([imageBytes], { type: "image/png" }),
    ));
    expect(imageUploadResponse.status).toBe(201);
    const productImage = (await imageUploadResponse.json()).asset as { id: string; url: string };
    expect(productImage.url).toBe(`/api/store-assets/${productImage.id}`);
    const publicImageResponse = await getStoreAsset(request(productImage.url, "GET"), {
      params: Promise.resolve({ id: productImage.id }),
    });
    expect(publicImageResponse.status).toBe(200);
    expect(publicImageResponse.headers.get("content-type")).toBe("image/webp");
    const invalidImageResponse = await uploadAsset(imageRequest(
      `/api/admin/assets?productId=${productId}`,
      "image/png",
      new Blob(["not an image"], { type: "image/png" }),
    ));
    expect(invalidImageResponse.status).toBe(415);
    const publicProducts = await getPublicCatalogProducts();
    expect(publicProducts.map(({ slug }) => slug)).toContain("admin-test-door");
    expect(publicProducts.find(({ slug }) => slug === "admin-test-door")?.isDemo).toBe(false);

    const invalidPrice = await createProduct(request("/api/admin/products", "POST", {
      slug: "invalid-door",
      model: "BAD",
      name: "Bad price",
      description: "Invalid client-controlled price",
      category: "apartment",
      basePriceMinor: -1,
      costMinor: null,
      manufacturerId: null,
      specifications: {},
      isActive: false,
      optionGroups: [],
    }));
    expect(invalidPrice.status).toBe(400);

    const ruleResponse = await createPricingRule(request("/api/admin/pricing-rules", "POST", {
      key: "delivery",
      label: "Delivery",
      method: "FIXED",
      priceMinor: 50_000,
      maxQuantity: 1,
      isActive: true,
    }));
    expect(ruleResponse.status).toBe(201);
    const rule = (await ruleResponse.json()).rule;

    const validQuoteRequest = new Request("http://localhost/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productSlug: "admin-test-door",
        quantity: 1,
        selections: { [groupId]: [optionId] },
        services: { [rule.id]: 1 },
      }),
    });
    const calculated = await (await quote(validQuoteRequest)).json();
    expect(calculated.quote.totalPriceMinor).toBe(2_150_000);
    expect(calculated.quote.isDemo).toBe(false);

    const productBeforeUpdate = created.product;
    const updateResponse = await updateProduct(
      request(`/api/admin/products/${productId}`, "PUT", {
        slug: productBeforeUpdate.slug,
        model: productBeforeUpdate.model,
        name: "Updated integration door",
        description: productBeforeUpdate.description,
        category: productBeforeUpdate.category,
        basePriceMinor: 2_250_000,
        costMinor: productBeforeUpdate.costMinor,
        manufacturerId: null,
        specifications: productBeforeUpdate.specifications,
        isActive: false,
        optionGroups: [{
          key: "lock-set",
          label: "Lock set",
          selectionMode: "SINGLE",
          required: true,
          minSelections: 1,
          maxSelections: 1,
          sortOrder: 0,
          isActive: true,
          options: [{
            key: "standard",
            label: "Standard lock",
            priceMinor: 100_000,
            pricingUnit: "PER_DOOR",
            isActive: true,
            sortOrder: 0,
          }],
        }],
      }),
      { params: Promise.resolve({ id: productId }) },
    );
    expect(updateResponse.status).toBe(200);
    expect((await updateResponse.json()).product.isActive).toBe(false);
    expect((await getPublicCatalogProducts()).map(({ slug }) => slug)).not.toContain("admin-test-door");
    const removeProductImageResponse = await deleteAsset(
      request(`/api/admin/assets/${productImage.id}`, "DELETE"),
      { params: Promise.resolve({ id: productImage.id }) },
    );
    expect(removeProductImageResponse.status).toBe(200);
    expect((await getStoreAsset(request(productImage.url, "GET"), {
      params: Promise.resolve({ id: productImage.id }),
    })).status).toBe(404);

    const lead = await getPrismaClient().lead.create({
      data: {
        storeId,
        type: "MEASUREMENT",
        customerName: "Admin API customer",
        phone: "+79000000011",
        address: "Test address",
        personalDataConsentAt: new Date(),
        consentNoticeVersion: "test-v1",
        statusHistory: { create: { to: "NEW" } },
      },
    });
    leadId = lead.id;
    const transition = await updateLeadStatus(
      request(`/api/admin/leads/${leadId}`, "PATCH", {
        status: "CONTACTED",
        note: "Called the customer",
      }),
      { params: Promise.resolve({ id: leadId }) },
    );
    expect(transition.status).toBe(200);
    const leadDetail = await getLead(request(`/api/admin/leads/${leadId}`, "GET"), {
      params: Promise.resolve({ id: leadId }),
    });
    const detailResult = await leadDetail.json();
    expect(detailResult.lead.status).toBe("CONTACTED");
    expect(detailResult.lead.statusHistory).toHaveLength(2);
    expect(detailResult.lead.statusHistory[1].changedBy.email).toBe("owner@doorflow.test");

    const concurrentLead = await getPrismaClient().lead.create({
      data: {
        storeId,
        type: "MEASUREMENT",
        customerName: "Concurrent status test",
        phone: "+79000000014",
        personalDataConsentAt: new Date(),
        consentNoticeVersion: "test-v1",
        statusHistory: { create: { to: "NEW" } },
      },
    });
    const concurrentStatusResponses = await Promise.all([
      updateLeadStatus(request(`/api/admin/leads/${concurrentLead.id}`, "PATCH", {
        status: "IN_PROGRESS",
      }), { params: Promise.resolve({ id: concurrentLead.id }) }),
      updateLeadStatus(request(`/api/admin/leads/${concurrentLead.id}`, "PATCH", {
        status: "CONTACTED",
      }), { params: Promise.resolve({ id: concurrentLead.id }) }),
    ]);
    const concurrentStatuses = concurrentStatusResponses.map(({ status }) => status);
    expect(concurrentStatuses.every((status) => status === 200 || status === 409)).toBe(true);
    expect(concurrentStatuses).toContain(200);
    const concurrentLeadAfter = await getPrismaClient().lead.findUniqueOrThrow({
      where: { id: concurrentLead.id },
      include: { statusHistory: { orderBy: { changedAt: "asc" } } },
    });
    for (let index = 1; index < concurrentLeadAfter.statusHistory.length; index += 1) {
      expect(concurrentLeadAfter.statusHistory[index].from)
        .toBe(concurrentLeadAfter.statusHistory[index - 1].to);
    }

    const settingsResponse = await updateSettings(request("/api/admin/settings", "PATCH", {
      name: "Integration Store Updated",
      contactPhone: "+7 900 000-00-00",
      contactEmail: "store@doorflow.test",
      logoUrl: "https://doorflow.test/logo.svg",
    }));
    expect(settingsResponse.status).toBe(200);
    expect((await getPrismaClient().store.findUnique({ where: { id: storeId } }))?.name)
      .toBe("Integration Store Updated");
    const logoBytes = await sharp({
      create: { width: 48, height: 24, channels: 3, background: "#a18a70" },
    }).png().toBuffer();
    const logoUploadResponse = await uploadAsset(imageRequest(
      "/api/admin/assets?type=logo",
      "image/png",
      new Blob([logoBytes], { type: "image/png" }),
    ));
    expect(logoUploadResponse.status).toBe(201);
    const uploadedLogo = (await logoUploadResponse.json()).asset as { id: string; url: string };
    const settingsAfterLogo = await getSettings();
    expect((await settingsAfterLogo.json()).settings.logoUrl).toBe(uploadedLogo.url);
    const removeLogoResponse = await deleteAsset(
      request(`/api/admin/assets/${uploadedLogo.id}`, "DELETE"),
      { params: Promise.resolve({ id: uploadedLogo.id }) },
    );
    expect(removeLogoResponse.status).toBe(200);
    expect((await getPrismaClient().store.findUnique({ where: { id: storeId } }))?.settings)
      .toMatchObject({ logoUrl: null });

    const locationResponse = await createLocation(request("/api/admin/locations", "POST", {
      name: "Main branch",
      address: "Test store address",
      phone: null,
      isActive: true,
      sortOrder: 0,
    }));
    expect(locationResponse.status).toBe(201);
    expect(await getPrismaClient().storeLocation.count({ where: { storeId } })).toBe(1);

    const employeeResponse = await createUser(request("/api/admin/users", "POST", {
      email: "manager@doorflow.test",
      password: "LocalManagerPassword-2026!",
      role: "MANAGER",
    }));
    expect(employeeResponse.status).toBe(201);
    const employeeResult = await employeeResponse.json();
    employeeId = employeeResult.user.id;
    expect(employeeResult.user.passwordHash).toBeUndefined();
    const usersResponse = await getUsers();
    expect(usersResponse.status).toBe(200);
    expect((await usersResponse.json()).users).toHaveLength(2);
    const promoteResponse = await updateUser(request(`/api/admin/users/${employeeId}`, "PUT", {
      role: "ADMIN",
      isActive: true,
    }), { params: Promise.resolve({ id: employeeId }) });
    expect((await promoteResponse.json()).user.role).toBe("ADMIN");
    const demoteResponse = await updateUser(request(`/api/admin/users/${employeeId}`, "PUT", {
      role: "MANAGER",
      isActive: true,
    }), { params: Promise.resolve({ id: employeeId }) });
    expect((await demoteResponse.json()).user.role).toBe("MANAGER");
    const ownerUpdate = await updateUser(request(`/api/admin/users/${ownerId}`, "PUT", {
      role: "MANAGER",
      isActive: true,
    }), { params: Promise.resolve({ id: ownerId }) });
    expect(ownerUpdate.status).toBe(404);

    await logout(request("/api/admin/auth/logout", "POST"));
    const managerLogin = await login(request("/api/admin/auth/login", "POST", {
      email: "manager@doorflow.test",
      password: "LocalManagerPassword-2026!",
    }));
    expect(managerLogin.status).toBe(200);
    const roleForbidden = await createProduct(request("/api/admin/products", "POST", {}));
    expect(roleForbidden.status).toBe(403);
    const settingsForbidden = await updateSettings(request("/api/admin/settings", "PATCH", {
      name: "Manager must not update this",
      contactPhone: null,
      contactEmail: null,
      logoUrl: null,
    }));
    expect(settingsForbidden.status).toBe(403);
    expect((await getUsers()).status).toBe(403);

    const logoutResponse = await logout(request("/api/admin/auth/logout", "POST"));
    expect(logoutResponse.status).toBe(200);
    expect(cookieState.value).toBeUndefined();
    expect((await getProducts()).status).toBe(401);

    const ownerLogin = await login(request("/api/admin/auth/login", "POST", {
      email: "owner@doorflow.test",
      password,
    }));
    expect(ownerLogin.status).toBe(200);
    const disableResponse = await updateUser(request(`/api/admin/users/${employeeId}`, "PUT", {
      role: "MANAGER",
      isActive: false,
    }), { params: Promise.resolve({ id: employeeId }) });
    expect(disableResponse.status).toBe(200);
    await logout(request("/api/admin/auth/logout", "POST"));
    const disabledLogin = await login(request("/api/admin/auth/login", "POST", {
      email: "manager@doorflow.test",
      password: "LocalManagerPassword-2026!",
    }));
    expect(disabledLogin.status).toBe(401);
    expect((await login(request("/api/admin/auth/login", "POST", {
      email: "owner@doorflow.test",
      password,
    }))).status).toBe(200);

    const measurerCreate = await createUser(request("/api/admin/users", "POST", {
      email: "measurer@doorflow.test",
      password: "LocalMeasurerPassword-2026!",
      role: "MEASURER",
    }));
    expect(measurerCreate.status).toBe(201);
    const measurerId = (await measurerCreate.json()).user.id as string;
    const installerCreate = await createUser(request("/api/admin/users", "POST", {
      email: "installer@doorflow.test",
      password: "LocalInstallerPassword-2026!",
      role: "INSTALLER",
    }));
    expect(installerCreate.status).toBe(201);
    const installerId = (await installerCreate.json()).user.id as string;

    const plannedAt = new Date(Date.now() + 86_400_000).toISOString();
    const measurementResponse = await createMeasurement(request("/api/admin/measurements", "POST", {
      leadId,
      assignedMeasurerId: measurerId,
      scheduledAt: plannedAt,
      address: "Test address, entrance 2",
    }));
    expect(measurementResponse.status).toBe(201);
    const measurementId = (await measurementResponse.json()).measurement.id as string;
    const unassignedMeasurementResponse = await createMeasurement(request("/api/admin/measurements", "POST", {
      leadId,
      assignedMeasurerId: null,
      scheduledAt: plannedAt,
      address: "Test address, entrance 3",
    }));
    expect(unassignedMeasurementResponse.status).toBe(201);
    const unassignedMeasurementId = (await unassignedMeasurementResponse.json()).measurement.id as string;
    expect((await getMeasurements(request("/api/admin/measurements", "GET"))).status).toBe(200);
    const manualCall = await createCustomerActivity(request(`/api/admin/leads/${leadId}/activities`, "POST", {
      type: "CALL",
      body: "Сотрудник зафиксировал исходящий звонок; вызов выполнялся вне DoorFlow.",
    }), { params: Promise.resolve({ id: leadId }) });
    expect(manualCall.status).toBe(201);
    const customerTimeline = await getLead(request(`/api/admin/leads/${leadId}`, "GET"), {
      params: Promise.resolve({ id: leadId }),
    });
    expect((await customerTimeline.json()).customerHistory.activities).toHaveLength(1);

    await logout(request("/api/admin/auth/logout", "POST"));
    const measurerLogin = await login(request("/api/admin/auth/login", "POST", {
      email: "measurer@doorflow.test",
      password: "LocalMeasurerPassword-2026!",
    }));
    expect(measurerLogin.status).toBe(200);
    expect((await getOrders(request("/api/admin/orders", "GET"))).status).toBe(403);
    expect((await getLead(request(`/api/admin/leads/${leadId}`, "GET"), {
      params: Promise.resolve({ id: leadId }),
    })).status).toBe(403);
    const ownMeasurements = await getMeasurements(request("/api/admin/measurements", "GET"));
    expect((await ownMeasurements.json()).measurements.map((item: { id: string }) => item.id))
      .toEqual([measurementId]);
    const foreignMeasurement = await getMeasurement(request(`/api/admin/measurements/${unassignedMeasurementId}`, "GET"), {
      params: Promise.resolve({ id: unassignedMeasurementId }),
    });
    expect(foreignMeasurement.status).toBe(404);
    const forbiddenAssignment = await updateMeasurement(request(`/api/admin/measurements/${measurementId}`, "PATCH", {
      assignedMeasurerId: null,
    }), { params: Promise.resolve({ id: measurementId }) });
    expect(forbiddenAssignment.status).toBe(403);
    const measured = await updateMeasurement(request(`/api/admin/measurements/${measurementId}`, "PATCH", {
      status: "IN_PROGRESS",
      results: { widthMm: 880, heightMm: 2050, openingType: "brick" },
      comments: "Замер выполняется.",
    }), { params: Promise.resolve({ id: measurementId }) });
    expect(measured.status).toBe(200);
    const completedMeasurement = await updateMeasurement(request(`/api/admin/measurements/${measurementId}`, "PATCH", {
      status: "COMPLETED",
      results: { widthMm: 880, heightMm: 2050, openingType: "brick" },
      comments: "Результат сохранён.",
    }), { params: Promise.resolve({ id: measurementId }) });
    expect((await completedMeasurement.json()).measurement.status).toBe("COMPLETED");
    expect((await getPrismaClient().lead.findUnique({ where: { id: leadId } }))?.status).toBe("MEASURED");
    await logout(request("/api/admin/auth/logout", "POST"));
    expect((await login(request("/api/admin/auth/login", "POST", {
      email: "owner@doorflow.test",
      password,
    }))).status).toBe(200);

    const orderLead = await getPrismaClient().lead.create({
      data: {
        storeId,
        productId,
        type: "ORDER",
        customerName: "Order snapshot customer",
        phone: "+79000000012",
        address: "Snapshot address",
        selectedConfiguration: {
          quantity: 1,
          selections: { [groupId]: [optionId] },
          services: { [rule.id]: 1 },
        },
        quoteSnapshot: calculated.quote,
        personalDataConsentAt: new Date(),
        consentNoticeVersion: "test-v1",
        statusHistory: { create: { to: "NEW" } },
      },
    });
    const newOrderResponse = await createOrder(request("/api/admin/orders", "POST", {
      leadId: orderLead.id,
      discountMinor: 10_000,
      costMinor: 1_300_000,
      prepaymentMinor: 250_000,
    }));
    expect(newOrderResponse.status).toBe(201);
    const createdOrder = (await newOrderResponse.json()).order as {
      id: string;
      subtotalMinor: number;
      discountMinor: number;
      totalMinor: number;
      costMinor: number;
      prepaymentMinor: number;
      balanceMinor: number;
      sourceQuoteSnapshot: { totalPriceMinor: number };
      payments: Array<{ amountMinor: number }>;
    };
    expect(createdOrder.subtotalMinor).toBe(2_150_000);
    expect(createdOrder.discountMinor).toBe(10_000);
    expect(createdOrder.totalMinor).toBe(2_140_000);
    expect(createdOrder.costMinor).toBe(1_300_000);
    expect(createdOrder.prepaymentMinor).toBe(250_000);
    expect(createdOrder.balanceMinor).toBe(1_890_000);
    expect(createdOrder.sourceQuoteSnapshot.totalPriceMinor).toBe(2_150_000);
    expect((await getPrismaClient().lead.findUnique({ where: { id: orderLead.id } }))?.status).toBe("SALE");
    expect(createdOrder.payments).toHaveLength(1);
    expect((await createOrder(request("/api/admin/orders", "POST", {
      leadId: orderLead.id,
    }))).status).toBe(409);

    await expect(getPrismaClient().order.update({
      where: { id: createdOrder.id },
      data: { totalMinor: BigInt(1) },
    })).rejects.toThrow();
    const paymentIdempotencyKey = randomUUID();
    const paymentPayload = {
      amountMinor: 100_000,
      note: "Внесённая дополнительная предоплата",
    };
    const paymentResponse = await addOrderPayment(request(
      `/api/admin/orders/${createdOrder.id}/payments`,
      "POST",
      paymentPayload,
      "http://localhost",
      { "Idempotency-Key": paymentIdempotencyKey },
    ), {
      params: Promise.resolve({ id: createdOrder.id }),
    });
    expect(paymentResponse.status).toBe(201);
    const paidOrder = (await paymentResponse.json()).order;
    expect(paidOrder.prepaymentMinor).toBe(350_000);
    expect(paidOrder.balanceMinor).toBe(1_790_000);
    expect(paidOrder.payments).toHaveLength(2);
    const paymentReplay = await addOrderPayment(request(
      `/api/admin/orders/${createdOrder.id}/payments`,
      "POST",
      paymentPayload,
      "http://localhost",
      { "Idempotency-Key": paymentIdempotencyKey },
    ), { params: Promise.resolve({ id: createdOrder.id }) });
    expect(paymentReplay.status).toBe(201);
    expect((await paymentReplay.json()).order.payments).toHaveLength(2);
    const conflictingPaymentReplay = await addOrderPayment(request(
      `/api/admin/orders/${createdOrder.id}/payments`,
      "POST",
      { ...paymentPayload, amountMinor: 200_000 },
      "http://localhost",
      { "Idempotency-Key": paymentIdempotencyKey },
    ), { params: Promise.resolve({ id: createdOrder.id }) });
    expect(conflictingPaymentReplay.status).toBe(409);
    const excessivePayment = await addOrderPayment(request(`/api/admin/orders/${createdOrder.id}/payments`, "POST", {
      amountMinor: 2_000_000,
    }), { params: Promise.resolve({ id: createdOrder.id }) });
    expect(excessivePayment.status).toBe(422);
    await expect(getPrismaClient().orderPayment.deleteMany({ where: { orderId: createdOrder.id } }))
      .rejects.toThrow();
    await expect(getPrismaClient().order.delete({ where: { id: createdOrder.id } })).rejects.toThrow();

    const secondOrderLead = await getPrismaClient().lead.create({
      data: {
        storeId,
        productId,
        type: "ORDER",
        customerName: "Unassigned installation customer",
        phone: "+79000000013",
        address: "Unassigned installation address",
        selectedConfiguration: {
          quantity: 1,
          selections: { [groupId]: [optionId] },
          services: { [rule.id]: 1 },
        },
        quoteSnapshot: calculated.quote,
        personalDataConsentAt: new Date(),
        consentNoticeVersion: "test-v1",
        statusHistory: { create: { to: "NEW" } },
      },
    });
    const secondOrderResponse = await createOrder(request("/api/admin/orders", "POST", {
      leadId: secondOrderLead.id,
    }));
    expect(secondOrderResponse.status).toBe(201);
    const secondOrderId = (await secondOrderResponse.json()).order.id as string;
    const installationResponse = await createInstallation(request("/api/admin/installations", "POST", {
      orderId: createdOrder.id,
      assignedInstallerId: installerId,
      scheduledAt: plannedAt,
      address: "Install address",
    }));
    expect(installationResponse.status).toBe(201);
    const installationId = (await installationResponse.json()).installation.id as string;
    const unassignedInstallationResponse = await createInstallation(request("/api/admin/installations", "POST", {
      orderId: secondOrderId,
      assignedInstallerId: null,
      scheduledAt: plannedAt,
      address: "Other install address",
    }));
    expect(unassignedInstallationResponse.status).toBe(201);
    const unassignedInstallationId = (await unassignedInstallationResponse.json()).installation.id as string;
    expect((await getOrders(request("/api/admin/orders", "GET"))).status).toBe(200);
    expect((await getInstallations(request("/api/admin/installations", "GET"))).status).toBe(200);

    await logout(request("/api/admin/auth/logout", "POST"));
    expect((await login(request("/api/admin/auth/login", "POST", {
      email: "installer@doorflow.test",
      password: "LocalInstallerPassword-2026!",
    }))).status).toBe(200);
    expect((await getMeasurements(request("/api/admin/measurements", "GET"))).status).toBe(403);
    expect((await getOrders(request("/api/admin/orders", "GET"))).status).toBe(403);
    const ownInstallations = await getInstallations(request("/api/admin/installations", "GET"));
    expect((await ownInstallations.json()).installations.map((item: { id: string }) => item.id))
      .toEqual([installationId]);
    expect((await getInstallation(request(`/api/admin/installations/${unassignedInstallationId}`, "GET"), {
      params: Promise.resolve({ id: unassignedInstallationId }),
    })).status).toBe(404);
    const installProgress = await updateInstallation(request(`/api/admin/installations/${installationId}`, "PATCH", {
      status: "IN_PROGRESS",
      result: "Начали подготовку проёма.",
      comments: "Материалы проверены.",
    }), { params: Promise.resolve({ id: installationId }) });
    expect(installProgress.status).toBe(200);
    const installComplete = await updateInstallation(request(`/api/admin/installations/${installationId}`, "PATCH", {
      status: "COMPLETED",
      result: "Дверь установлена и проверена.",
      comments: "Работы завершены.",
    }), { params: Promise.resolve({ id: installationId }) });
    expect((await installComplete.json()).installation.status).toBe("COMPLETED");
    await expect(getPrismaClient().installation.delete({ where: { id: installationId } })).rejects.toThrow();
    await logout(request("/api/admin/auth/logout", "POST"));
    expect((await login(request("/api/admin/auth/login", "POST", {
      email: "owner@doorflow.test",
      password,
    }))).status).toBe(200);
    for (const status of ["IN_PROGRESS", "READY", "COMPLETED"]) {
      const orderStatus = await updateOrder(request(`/api/admin/orders/${createdOrder.id}`, "PATCH", { status }), {
        params: Promise.resolve({ id: createdOrder.id }),
      });
      expect(orderStatus.status).toBe(200);
    }
    const completedOrder = await getOrder(request(`/api/admin/orders/${createdOrder.id}`, "GET"), {
      params: Promise.resolve({ id: createdOrder.id }),
    });
    const completedResult = await completedOrder.json();
    expect(completedResult.order.status).toBe("COMPLETED");
    expect(completedResult.order.installation.status).toBe("COMPLETED");
    expect(completedResult.audit.length).toBeGreaterThanOrEqual(5);
    expect((await getPrismaClient().lead.findUnique({ where: { id: orderLead.id } }))?.status).toBe("COMPLETED");

    const prisma = getPrismaClient();
    const foreignStore = await prisma.store.create({
      data: {
        slug: `foreign-test-${randomUUID()}`,
        name: "Separate integration test store",
        isDemo: false,
      },
    });
    foreignStoreId = foreignStore.id;
    const foreignOwner = await prisma.adminUser.create({
      data: {
        storeId: foreignStore.id,
        email: "foreign-owner@doorflow.test",
        passwordHash: await hashAdminPassword("LocalForeignStorePassword-2026!"),
        role: "OWNER",
      },
    });
    const foreignProduct = await prisma.product.create({
      data: {
        storeId: foreignStore.id,
        slug: "foreign-test-door",
        model: "FOREIGN-001",
        name: "Foreign store test product",
        description: "Test fixture",
        category: "test",
        basePriceMinor: BigInt(100_000),
        currency: "RUB",
        specifications: {},
        isDemo: false,
      },
    });
    const foreignMeasurementLead = await prisma.lead.create({
      data: {
        storeId: foreignStore.id,
        type: "MEASUREMENT",
        customerName: "Foreign test customer",
        phone: "+79000000015",
        address: "Foreign test address",
        personalDataConsentAt: new Date(),
        consentNoticeVersion: "test-v1",
        statusHistory: { create: { to: "NEW" } },
      },
    });
    const foreignOrderLead = await prisma.lead.create({
      data: {
        storeId: foreignStore.id,
        type: "ORDER",
        customerName: "Foreign order test customer",
        phone: "+79000000016",
        address: "Foreign order address",
        personalDataConsentAt: new Date(),
        consentNoticeVersion: "test-v1",
        statusHistory: { create: { to: "NEW" } },
      },
    });
    const foreignOrder = await prisma.order.create({
      data: {
        storeId: foreignStore.id,
        leadId: foreignOrderLead.id,
        managerId: foreignOwner.id,
        createdById: foreignOwner.id,
        customerName: foreignOrderLead.customerName,
        phone: foreignOrderLead.phone,
        address: foreignOrderLead.address,
        configurationSnapshot: {},
        sourceQuoteSnapshot: {},
        subtotalMinor: BigInt(100_000),
        totalMinor: BigInt(100_000),
        balanceMinor: BigInt(100_000),
      },
    });
    const foreignMeasurementRecord = await prisma.measurement.create({
      data: {
        storeId: foreignStore.id,
        leadId: foreignMeasurementLead.id,
        createdById: foreignOwner.id,
        scheduledAt: new Date(Date.now() + 86_400_000),
        address: "Foreign measurement address",
      },
    });
    const foreignInstallation = await prisma.installation.create({
      data: {
        storeId: foreignStore.id,
        orderId: foreignOrder.id,
        createdById: foreignOwner.id,
        scheduledAt: new Date(Date.now() + 172_800_000),
        address: "Foreign installation address",
      },
    });

    const scopedProducts = await getProducts();
    expect((await scopedProducts.json()).products.map((item: { id: string }) => item.id))
      .not.toContain(foreignProduct.id);
    expect((await getLead(request(`/api/admin/leads/${foreignMeasurementLead.id}`, "GET"), {
      params: Promise.resolve({ id: foreignMeasurementLead.id }),
    })).status).toBe(404);
    expect((await getMeasurement(request(`/api/admin/measurements/${foreignMeasurementRecord.id}`, "GET"), {
      params: Promise.resolve({ id: foreignMeasurementRecord.id }),
    })).status).toBe(404);
    expect((await getOrder(request(`/api/admin/orders/${foreignOrder.id}`, "GET"), {
      params: Promise.resolve({ id: foreignOrder.id }),
    })).status).toBe(404);
    expect((await getInstallation(request(`/api/admin/installations/${foreignInstallation.id}`, "GET"), {
      params: Promise.resolve({ id: foreignInstallation.id }),
    })).status).toBe(404);
  });
});
