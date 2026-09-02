import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import postgres from "postgres";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

function fixtureUuid(label) {
  const chars = createHash("sha256").update(`hr-pulse-self-service:${label}`).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16], 16) % 4];
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function waitForServer(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function productionReleaseEnabled() {
  if (process.env.HR_PULSE_SELF_SERVICE_ENABLED !== "true") return false;
  return process.env.NODE_ENV !== "production" || process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED === "true";
}

async function startHttpsProxy(targetPort, httpsPort, pfxPath, passphrase) {
  const server = https.createServer({ pfx: readFileSync(pfxPath), passphrase }, (request, response) => {
    const proxyRequest = http.request({
      hostname: "127.0.0.1",
      port: targetPort,
      path: request.url,
      method: request.method,
      headers: {
        ...request.headers,
        host: `127.0.0.1:${targetPort}`,
        "x-forwarded-host": request.headers.host,
        "x-forwarded-proto": "https",
      },
    }, (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    });
    proxyRequest.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.pipe(proxyRequest);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(httpsPort, "127.0.0.1", resolve);
  });
  return server;
}

async function checkRelease(port, httpsPort, selfServiceEnabled, realDataEnabled, expectedPortal) {
  const host = "127.0.0.1";
  const origin = `https://localhost:${httpsPort}`;
  const pfxPath = process.env.SELF_SERVICE_RELEASE_PFX;
  const pfxPassword = process.env.SELF_SERVICE_RELEASE_PFX_PASSWORD;
  if (!pfxPath || !pfxPassword) throw new Error("SELF_SERVICE_RELEASE_PFX and SELF_SERVICE_RELEASE_PFX_PASSWORD are required");
  const output = [];
  const child = spawn(process.execPath, [join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", HR_PULSE_SELF_SERVICE_ENABLED: selfServiceEnabled, HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED: realDataEnabled },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  let proxy;
  try {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalEnabled = process.env.HR_PULSE_SELF_SERVICE_ENABLED;
    const originalRealData = process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED;
    process.env.NODE_ENV = "production";
    process.env.HR_PULSE_SELF_SERVICE_ENABLED = selfServiceEnabled;
    process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED = realDataEnabled;
    if (productionReleaseEnabled() !== expectedPortal) throw new Error("Production release flags resolved to the wrong portal state");
    process.env.NODE_ENV = originalNodeEnv;
    process.env.HR_PULSE_SELF_SERVICE_ENABLED = originalEnabled;
    process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED = originalRealData;
    const response = await waitForServer(`http://${host}:${port}/self-service`);
    if (response.status !== 307) throw new Error(`Expected production authentication boundary status 307, received ${response.status}`);
    proxy = await startHttpsProxy(port, httpsPort, pfxPath, pfxPassword);
    const browser = await chromium.launch();
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/sign-in`);
      await page.getByLabel("Work email").fill(process.env.SELF_SERVICE_E2E_EMAIL || "self-service-employee@example.test");
      await page.getByLabel("Password").fill(process.env.SELF_SERVICE_E2E_PASSWORD || "SelfService!2026");
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForTimeout(3000);
      if (page.url().endsWith("/sign-in")) {
        const signInBody = await page.locator("body").innerText();
        throw new Error(`Production sign in did not complete: ${signInBody.slice(0, 240)}\nServer output: ${output.join("").slice(-1200)}`);
      }
      if (await page.getByText("pending access", { exact: false }).count()) throw new Error("Authenticated production fixture did not resolve organization access");
      if (page.url().includes("choose-organization")) throw new Error("Authenticated production fixture required organization selection");
      if (expectedPortal) {
        let portalResponse = await page.goto(`${origin}/self-service`);
        let body = await page.locator("body").innerText();
        if (!body.includes("Your work records, in one place")) {
          await page.waitForTimeout(1000);
          portalResponse = await page.goto(`${origin}/self-service`);
          body = await page.locator("body").innerText();
        }
        if (portalResponse?.status() !== 200 || !body.includes("Your work records, in one place")) throw new Error(`Enabled production portal did not render at ${page.url()}: ${body.slice(0, 700)}\nServer output: ${output.join("").slice(-1600)}`);
        const administratorContext = await browser.newContext({ ignoreHTTPSErrors: true });
        const administratorPage = await administratorContext.newPage();
        await administratorPage.goto(`${origin}/sign-in`);
        await administratorPage.getByLabel("Work email").fill(process.env.SELF_SERVICE_E2E_ADMINISTRATOR_EMAIL || "self-service-administrator@example.test");
        await administratorPage.getByLabel("Password").fill(process.env.SELF_SERVICE_E2E_PASSWORD || "SelfService!2026");
        await administratorPage.getByRole("button", { name: "Sign in" }).click();
        await administratorPage.waitForTimeout(1500);
        if (administratorPage.url().includes("choose-organization")) {
          await administratorPage.locator(`input[name="organizationId"][value="${fixtureUuid("organization")}"]`).check();
          await administratorPage.getByRole("button", { name: "Continue" }).click();
          await administratorPage.waitForTimeout(1000);
        }
        if (!administratorPage.url().endsWith("/dashboard")) throw new Error(`Administrator production sign in did not reach the dashboard: ${administratorPage.url()} ${(await administratorPage.locator("body").innerText()).slice(0, 300)}`);
        const administratorDownload = await administratorPage.request.get(`${origin}/api/payslips/${fixtureUuid("manager-payslip")}/download`);
        if (administratorDownload.status() !== 200) throw new Error(`Administrator payroll download regressed with status ${administratorDownload.status()}`);
        const administratorPayload = await administratorDownload.json();
        if (!administratorPayload.url || administratorPayload.expiresIn !== 60) throw new Error("Administrator payroll download lost its signed link contract");
        await administratorContext.close();
      } else {
        const portalResponse = await page.goto(`${origin}/self-service`);
        const body = await page.locator("body").innerText();
        if (portalResponse?.status() >= 500) throw new Error(`Disabled authenticated portal returned server failure ${portalResponse?.status()}`);
        if (body.includes("Your work records, in one place")) throw new Error("Disabled production release rendered portal data");
        if (await page.getByRole("link", { name: "My self service" }).count()) throw new Error("Disabled production release exposed self service navigation");
        const employeeDownload = await page.request.get(`${origin}/api/payslips/${fixtureUuid("payslip:0")}/download`);
        if (employeeDownload.status() === 200) throw new Error("Disabled production release allowed employee payslip download");
      }
    } finally {
      await browser.close();
    }
    const logs = output.join("");
    if (/self-service-employee@example\.test|₱|signed|storage_path/i.test(logs)) throw new Error("Production release output exposed private self service data");
    return response.status;
  } finally {
    if (proxy) await new Promise((resolve) => proxy.close(resolve));
    child.kill();
  }
}

const sql = postgres(databaseUrl, { max: 1 });
try {
  const disabled = await checkRelease(3101, 3441, "false", "false", false);
  const realDataDisabled = await checkRelease(3102, 3442, "true", "false", false);
  const enabled = await checkRelease(3103, 3443, "true", "true", true);

  const [schema] = await sql.unsafe(`
    select
      count(*) filter (where table_name = 'employees' and column_name = 'version' and is_nullable = 'NO')::int as employee_version,
      count(*) filter (where table_name = 'payouts' and column_name = 'payroll_period_end' and is_nullable = 'NO')::int as payout_period,
      count(*) filter (where table_name = 'payroll_preview_tokens' and column_name = 'payroll_period_end' and is_nullable = 'NO')::int as preview_period
    from information_schema.columns
    where table_schema = 'public'
  `);
  const [index] = await sql`select count(*)::int as count from pg_indexes where schemaname = 'public' and indexname = 'payouts_employee_period_cursor_idx'`;
  const [profileFunction] = await sql`select count(*)::int as count from information_schema.routines where routine_schema = 'public' and routine_name = 'update_self_service_profile'`;
  const [legacyEmployees] = await sql`
    select
      count(*) filter (where version < 1 or version is null)::int as invalid_versions,
      count(*) filter (where phone is not null and phone !~ '^[+][0-9]{7,15}$')::int as invalid_phones,
      count(*) filter (where preferred_name is not null and (btrim(preferred_name) = '' or char_length(preferred_name) > 200))::int as invalid_names
    from employees
  `;
  const [legacyPayouts] = await sql`select count(*) filter (where payroll_period_end is null)::int as missing_periods from payouts`;
  const legacy = { ...legacyEmployees, ...legacyPayouts };
  const organizationId = fixtureUuid("organization");
  const [privacy] = await sql`
    select count(*)::int as leaked_audit_rows
    from audit_events
    where organization_id = ${organizationId}
      and metadata::text ~* '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}|\\+[0-9]{7,15}|₱[0-9]|PHP[[:space:]]*[0-9]|self-service/|https?://)'
  `;

  if (schema.employee_version !== 1 || schema.payout_period !== 1 || schema.preview_period !== 1 || index.count !== 1 || profileFunction.count !== 1) throw new Error("Required self service migration objects are not live");
  if (legacy.invalid_versions || legacy.invalid_phones || legacy.invalid_names || legacy.missing_periods) throw new Error("Live data contains unnormalized legacy values");
  if (privacy.leaked_audit_rows) throw new Error("Audit metadata contains prohibited privacy fields");
  console.log(JSON.stringify({ release: { disabled, realDataDisabled, enabled }, migration: { schema, cursorIndex: index.count, profileFunction: profileFunction.count }, legacy, privacy }));
} finally {
  await sql.end();
}
