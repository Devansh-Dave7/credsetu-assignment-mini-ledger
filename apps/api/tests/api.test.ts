import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { buildApp, MAX_RECEIPT_BYTES } from "../src/app.js";
import { createDb } from "../src/db.js";
import { indiaToday, dateSchema } from "../src/domain.js";
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.pathname.endsWith("_test")
)
  throw new Error("Tests require a local database whose name ends in _test");
const db = createDb(url.toString());
let app: Awaited<ReturnType<typeof buildApp>>;
let uploadDir: string;
let time = new Date("2026-10-22T12:00:00Z");
const codes = new Map<string, string>();
const secret = "test-secret-with-at-least-32-characters";
const phone = "9876543210";
const createApp = () =>
  buildApp({
    db,
    secret,
    uploadDir,
    now: () => time,
    onOtp: (p, otp) => codes.set(p, otp),
    rateLimits: false,
  });
const headers = (token: string) => ({ authorization: `Bearer ${token}` });
async function login(number = phone) {
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/auth/request-otp",
        payload: { phone: number },
      })
    ).statusCode,
  ).toBe(200);
  const response = await app.inject({
    method: "POST",
    url: "/auth/verify-otp",
    payload: { phone: number, otp: codes.get(`+91${number}`) },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    token: string;
    user: { id: string; phone: string };
  };
}
function form(
  fields: Record<string, string>,
  file?: { bytes: Buffer; mime: string },
) {
  const boundary = "miniledger-test-boundary";
  const parts: Buffer[] = Object.entries(fields).map(([key, value]) =>
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
    ),
  );
  if (file)
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="receipt"; filename="photo"\r\nContent-Type: ${file.mime}\r\n\r\n`,
      ),
      file.bytes,
      Buffer.from("\r\n"),
    );
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
async function createLoan(
  token: string,
  fields = { friendName: "Rahul", amount: "1000.10", dueDate: "2026-10-21" },
  file?: { bytes: Buffer; mime: string },
) {
  const body = form(fields, file);
  return app.inject({
    method: "POST",
    url: "/loans",
    headers: { ...headers(token), "content-type": body.contentType },
    payload: body.payload,
  });
}
beforeAll(async () => {
  uploadDir = await mkdtemp(join(tmpdir(), "miniledger-tests-"));
  app = await createApp();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  time = new Date("2026-10-22T12:00:00Z");
  codes.clear();
  await db.loan.deleteMany();
  await db.user.deleteMany();
  await db.otpChallenge.deleteMany();
});
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
  if (
    uploadDir &&
    resolve(uploadDir).startsWith(resolve(tmpdir(), "miniledger-tests-"))
  )
    await rm(uploadDir, { recursive: true, force: true });
});
describe("authentication", () => {
  it("normalizes phone, does not expose OTP, restores user and rejects reuse", async () => {
    const sent = await app.inject({
      method: "POST",
      url: "/auth/request-otp",
      payload: { phone: "+91 98765 43210" },
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json()).not.toHaveProperty("otp");
    const payload = { phone, otp: codes.get(`+91${phone}`) };
    const verified = await app.inject({
      method: "POST",
      url: "/auth/verify-otp",
      payload,
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().user.phone).toBe(`+91${phone}`);
    expect(
      (
        await app.inject({
          url: "/auth/me",
          headers: headers(verified.json().token),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "POST", url: "/auth/verify-otp", payload }))
        .statusCode,
    ).toBe(400);
  });
  it("rejects invalid phone input and expired tokens", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/request-otp",
          payload: { phone: "123" },
        })
      ).statusCode,
    ).toBe(400);
    const { user } = await login();
    const expired = app.jwt.sign({ sub: user.id }, { expiresIn: -1 });
    expect(
      (await app.inject({ url: "/loans", headers: headers(expired) }))
        .statusCode,
    ).toBe(401);
  });
  it("enforces cooldown and invalidates earlier codes when resending", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/request-otp",
      payload: { phone },
    });
    const previous = codes.get(`+91${phone}`);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/request-otp",
          payload: { phone },
        })
      ).statusCode,
    ).toBe(429);
    time = new Date(time.getTime() + 61000);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/request-otp",
          payload: { phone },
        })
      ).statusCode,
    ).toBe(200);
    // Verify the database holds only a hash, never the original OTP.
    const challenge = await db.otpChallenge.findUniqueOrThrow({
      where: { phone: `+91${phone}` },
    });
    expect(challenge.hash).not.toBe(previous);
    expect(challenge.hash).toHaveLength(64);
  });
  it("expires a code after five minutes", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/request-otp",
      payload: { phone },
    });
    time = new Date(time.getTime() + 300001);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/verify-otp",
          payload: { phone, otp: codes.get(`+91${phone}`) },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("allows only five incorrect attempts", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/request-otp",
      payload: { phone },
    });
    const correct = codes.get(`+91${phone}`)!;
    const wrong = correct === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i++)
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/auth/verify-otp",
            payload: { phone, otp: wrong },
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/verify-otp",
          payload: { phone, otp: correct },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await db.otpChallenge.findUniqueOrThrow({
          where: { phone: `+91${phone}` },
        })
      ).attempts,
    ).toBe(5);
  });
  it("consumes a code once under concurrent verification", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/request-otp",
      payload: { phone },
    });
    const responses = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: "POST",
          url: "/auth/verify-otp",
          payload: { phone, otp: codes.get(`+91${phone}`) },
        }),
      ),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400]);
  });
});
describe("loans and totals", () => {
  it("requires login for all private endpoints", async () => {
    for (const path of ["/loans", "/summary", "/auth/me"])
      expect((await app.inject({ url: path })).statusCode).toBe(401);
  });
  it("keeps decimal accuracy, marks full repayment once and excludes repaid overdue loans", async () => {
    const { token } = await login();
    const a = await createLoan(token, {
      friendName: " Asha ",
      amount: "0.10",
      dueDate: "2026-10-21",
    });
    const b = await createLoan(token, {
      friendName: "Vijay",
      amount: "0.20",
      dueDate: "2026-10-22",
    });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json().loan.friendName).toBe("Asha");
    expect(a.json().loan.status).toBe("OVERDUE");
    expect(b.json().loan.status).toBe("UNPAID");
    expect(
      (await app.inject({ url: "/summary", headers: headers(token) })).json(),
    ).toMatchObject({
      totalLent: "0.30",
      totalRepaid: "0.00",
      overdueAmount: "0.10",
    });
    const repay = () =>
      app.inject({
        method: "PATCH",
        url: `/loans/${a.json().loan.id}/repay`,
        headers: headers(token),
      });
    const first = await repay();
    time = new Date(time.getTime() + 1000);
    const again = await repay();
    expect(again.json().loan.repaidAt).toBe(first.json().loan.repaidAt);
    expect(
      (await app.inject({ url: "/summary", headers: headers(token) })).json(),
    ).toMatchObject({
      totalLent: "0.30",
      totalRepaid: "0.10",
      overdueAmount: "0.00",
    });
  });
  it("handles India midnight and calendar validation", async () => {
    expect(indiaToday(new Date("2026-10-22T18:29:59Z"))).toBe("2026-10-22");
    expect(indiaToday(new Date("2026-10-22T18:30:00Z"))).toBe("2026-10-23");
    expect(dateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(dateSchema.safeParse("2028-02-29").success).toBe(true);
    const { token } = await login();
    await createLoan(token, {
      friendName: "Today",
      amount: "1",
      dueDate: "2026-10-22",
    });
    time = new Date("2026-10-22T18:30:00Z");
    expect(
      (await app.inject({ url: "/summary", headers: headers(token) })).json()
        .overdueAmount,
    ).toBe("1.00");
  });
  it.each([
    { friendName: "", amount: "1", dueDate: "2026-10-22" },
    { friendName: "A", amount: "-1", dueDate: "2026-10-22" },
    { friendName: "A", amount: "0", dueDate: "2026-10-22" },
    { friendName: "A", amount: "1.001", dueDate: "2026-10-22" },
    { friendName: "A", amount: "1", dueDate: "2026-02-30" },
  ])("rejects invalid entry %j", async (fields) => {
    const { token } = await login();
    expect((await createLoan(token, fields)).statusCode).toBe(400);
    expect(await db.loan.count()).toBe(0);
  });
  it("isolates users including repayment", async () => {
    const a = await login();
    const loan = await createLoan(a.token);
    const b = await login("8765432109");
    expect(
      (await app.inject({ url: "/loans", headers: headers(b.token) })).json()
        .loans,
    ).toEqual([]);
    expect(
      (await app.inject({ url: "/summary", headers: headers(b.token) })).json()
        .totalLent,
    ).toBe("0.00");
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/loans/${loan.json().loan.id}/repay`,
          headers: headers(b.token),
        })
      ).statusCode,
    ).toBe(404);
  });
  it("persists records across app and database-client restart", async () => {
    const { token } = await login();
    await createLoan(token);
    await app.close();
    await db.$disconnect();
    app = await createApp();
    expect(
      (await app.inject({ url: "/loans", headers: headers(token) })).json()
        .loans,
    ).toHaveLength(1);
  });
});
describe("receipts", () => {
  const image = () =>
    sharp({
      create: { width: 20, height: 20, channels: 3, background: "#EEEEEE" },
    })
      .png()
      .toBuffer();
  it("stores an image, authorizes viewing and preserves it across restart", async () => {
    const { token } = await login();
    const response = await createLoan(token, undefined, {
      bytes: await image(),
      mime: "image/png",
    });
    expect(response.statusCode).toBe(201);
    const id = response.json().loan.id;
    expect(response.json().loan.hasReceipt).toBe(true);
    const receipt = await app.inject({
      url: `/loans/${id}/receipt`,
      headers: headers(token),
    });
    expect(receipt.statusCode).toBe(200);
    expect(receipt.headers["content-type"]).toContain("image/jpeg");
    expect((await sharp(receipt.rawPayload).metadata()).format).toBe("jpeg");
    expect((await app.inject({ url: `/loans/${id}/receipt` })).statusCode).toBe(
      401,
    );
    const other = await login("8765432109");
    expect(
      (
        await app.inject({
          url: `/loans/${id}/receipt`,
          headers: headers(other.token),
        })
      ).statusCode,
    ).toBe(404);
    await app.close();
    app = await createApp();
    expect(
      (
        await app.inject({
          url: `/loans/${id}/receipt`,
          headers: headers(token),
        })
      ).statusCode,
    ).toBe(200);
  });
  it("rejects fake images, type mismatch, oversized files and leaves no loan", async () => {
    const { token } = await login();
    const files = [
      { bytes: Buffer.from("fake photo"), mime: "image/jpeg" },
      { bytes: await image(), mime: "image/jpeg" },
      { bytes: Buffer.alloc(MAX_RECEIPT_BYTES + 1), mime: "image/png" },
    ];
    for (const file of files) {
      const response = await createLoan(token, undefined, file);
      expect([400, 413]).toContain(response.statusCode);
    }
    expect(await db.loan.count()).toBe(0);
  });
  it("cleans up files if database creation fails", async () => {
    const { token } = await login();
    const before = await readdir(uploadDir);
    vi.spyOn(db.loan, "create").mockRejectedValueOnce(
      new Error("simulated DB failure"),
    );
    expect(
      (
        await createLoan(token, undefined, {
          bytes: await image(),
          mime: "image/png",
        })
      ).statusCode,
    ).toBe(500);
    expect(await readdir(uploadDir)).toEqual(before);
    expect(await db.loan.count()).toBe(0);
  });
});
