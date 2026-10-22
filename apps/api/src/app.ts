import Fastify, { type FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { Prisma, type Loan, type PrismaClient } from "@prisma/client";
import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import {
  ApiError,
  indiaToday,
  loanSchema,
  loanStatus,
  phoneSchema,
} from "./domain.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}
export type AppOptions = {
  db: PrismaClient;
  secret: string;
  uploadDir: string;
  now?: () => Date;
  onOtp?: (phone: string, otp: string) => void;
  logger?: boolean;
  rateLimits?: boolean;
};
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export async function buildApp(options: AppOptions) {
  const { db, secret } = options;
  const uploadDir = resolve(options.uploadDir);
  const now = options.now ?? (() => new Date());
  await mkdir(uploadDir, { recursive: true });
  const app = Fastify({
    logger: options.logger ? { redact: ["req.headers.authorization"] } : false,
    bodyLimit: 6 * 1024 * 1024,
  });
  await app.register(jwt, {
    secret,
    sign: { expiresIn: "24h" },
    verify: { algorithms: ["HS256"] },
  });
  await app.register(rateLimit, {
    global: options.rateLimits !== false,
    max: 100,
    timeWindow: "1 minute",
  });
  await app.register(multipart, {
    limits: { fileSize: MAX_RECEIPT_BYTES, files: 1, fields: 3, parts: 4 },
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({
          code: "VALIDATION_ERROR",
          message: "Please check your input",
          fieldErrors: z.flattenError(error).fieldErrors,
        });
    const err = error as {
      statusCode?: number;
      code?: string;
      message?: string;
    };
    const status = err.statusCode ?? 500;
    if (status >= 500) request.log.error({ err: error }, "Request failed");
    return reply
      .code(status)
      .send({
        code:
          status === 401
            ? "UNAUTHORIZED"
            : status >= 500
              ? "INTERNAL_ERROR"
              : (err.code ?? "BAD_REQUEST"),
        message:
          status === 401
            ? "Please log in again"
            : status >= 500
              ? "Something went wrong. Please retry."
              : (err.message ?? "Invalid request"),
      });
  });
  const authenticate = async (request: FastifyRequest) => {
    await request.jwtVerify();
  };
  const hashOtp = (phone: string, otp: string) =>
    createHmac("sha256", secret).update(`${phone}:${otp}`).digest("hex");
  const lockPhone = async (tx: Prisma.TransactionClient, phone: string) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${phone}))::text`;
  };
  const authLimit =
    options.rateLimits === false ? false : { max: 10, timeWindow: "1 minute" };

  app.get("/health", async () => {
    await db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  });
  app.post(
    "/auth/request-otp",
    { config: { rateLimit: authLimit } },
    async (request, reply) => {
      const { phone } = z
        .object({ phone: phoneSchema })
        .strict()
        .parse(request.body);
      const otp = String(randomInt(100000, 1000000));
      await db.$transaction(async (tx) => {
        await lockPhone(tx, phone);
        const previous = await tx.otpChallenge.findUnique({ where: { phone } });
        const time = now();
        if (previous && time.getTime() - previous.sentAt.getTime() < 60000)
          throw new ApiError(
            429,
            "OTP_COOLDOWN",
            "Wait 60 seconds before requesting another OTP",
          );
        const data = {
          hash: hashOtp(phone, otp),
          expiresAt: new Date(time.getTime() + 300000),
          sentAt: time,
          attempts: 0,
        };
        await tx.otpChallenge.upsert({
          where: { phone },
          create: { phone, ...data },
          update: data,
        });
      });
      // The sole intentional OTP output: this assignment uses local mock SMS.
      if (options.onOtp) options.onOtp(phone, otp);
      else
        app.log.info(
          { phone: `******${phone.slice(-4)}`, otp },
          "MOCK OTP (local development only)",
        );
      return reply.send({
        message: "OTP printed in the local API console",
        expiresIn: 300,
        retryAfter: 60,
      });
    },
  );
  app.post(
    "/auth/verify-otp",
    { config: { rateLimit: authLimit } },
    async (request, reply) => {
      const { phone, otp } = z
        .object({
          phone: phoneSchema,
          otp: z.string().regex(/^\d{6}$/, "Enter the six-digit OTP"),
        })
        .strict()
        .parse(request.body);
      const result = await db.$transaction(async (tx) => {
        await lockPhone(tx, phone);
        const challenge = await tx.otpChallenge.findUnique({
          where: { phone },
        });
        if (!challenge || challenge.expiresAt <= now())
          return { error: "OTP expired. Request a new code." };
        if (challenge.attempts >= 5)
          return { error: "Too many attempts. Request a new code." };
        const valid = timingSafeEqual(
          Buffer.from(challenge.hash, "hex"),
          Buffer.from(hashOtp(phone, otp), "hex"),
        );
        if (!valid) {
          await tx.otpChallenge.update({
            where: { phone },
            data: { attempts: { increment: 1 } },
          });
          return { error: "Incorrect OTP" };
        }
        // Retain sentAt for the resend cooldown, but make the code unusable.
        await tx.otpChallenge.update({
          where: { phone },
          data: { expiresAt: now(), hash: "", attempts: 5 },
        });
        const user = await tx.user.upsert({
          where: { phone },
          create: { phone },
          update: {},
        });
        return { user: { id: user.id, phone: user.phone } };
      });
      if ("error" in result)
        throw new ApiError(400, "INVALID_OTP", result.error!);
      return reply.send({
        token: app.jwt.sign({ sub: result.user.id }),
        user: result.user,
      });
    },
  );
  app.get("/auth/me", { preHandler: authenticate }, async (request) => {
    const user = await db.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, phone: true },
    });
    if (!user) throw new ApiError(401, "UNAUTHORIZED", "Please log in again");
    return { user };
  });
  const serialize = (loan: Loan, today: string) => ({
    id: loan.id,
    friendName: loan.friendName,
    amount: loan.amount.toFixed(2),
    dueDate: loan.dueDate.toISOString().slice(0, 10),
    repaidAt: loan.repaidAt?.toISOString() ?? null,
    createdAt: loan.createdAt.toISOString(),
    hasReceipt: Boolean(loan.receiptPath),
    status: loanStatus(loan, today),
  });
  const ownedLoan = async (id: unknown, ownerId: string) => {
    const parsed = z.uuid().parse(id);
    const loan = await db.loan.findFirst({ where: { id: parsed, ownerId } });
    if (!loan) throw new ApiError(404, "NOT_FOUND", "Entry not found");
    return loan;
  };
  app.get("/loans", { preHandler: authenticate }, async (request) => {
    const today = indiaToday(now());
    const loans = await db.loan.findMany({
      where: { ownerId: request.user.sub },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return { loans: loans.map((loan) => serialize(loan, today)), today };
  });
  app.post("/loans", { preHandler: authenticate }, async (request, reply) => {
    if (!request.isMultipart())
      throw new ApiError(
        415,
        "MULTIPART_REQUIRED",
        "Send the entry as multipart form data",
      );
    const fields: Record<string, string> = {};
    let receipt: Buffer | undefined;
    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (part.fieldname !== "receipt")
          throw new ApiError(
            400,
            "INVALID_FILE_FIELD",
            "Use the receipt field for a photo",
          );
        const buffer = await part.toBuffer();
        const png = buffer
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg =
          buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
        if (
          !(png && part.mimetype === "image/png") &&
          !(jpeg && part.mimetype === "image/jpeg")
        )
          throw new ApiError(
            400,
            "INVALID_RECEIPT",
            "Choose a JPEG or PNG photo",
          );
        try {
          receipt = await sharp(buffer, { limitInputPixels: 25000000 })
            .rotate()
            .resize({
              width: 2000,
              height: 2000,
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({ quality: 85 })
            .toBuffer();
        } catch {
          throw new ApiError(
            400,
            "INVALID_RECEIPT",
            "The receipt photo could not be read",
          );
        }
      } else {
        if (part.fieldname in fields)
          throw new ApiError(
            400,
            "DUPLICATE_FIELD",
            "Send each entry field once",
          );
        fields[part.fieldname] = String(part.value);
      }
    }
    const data = loanSchema.parse(fields);
    const receiptPath = receipt ? `${randomUUID()}.jpg` : null;
    const file = receiptPath ? resolve(uploadDir, receiptPath) : null;
    try {
      if (file && receipt) await writeFile(file, receipt, { flag: "wx" });
      const loan = await db.loan.create({
        data: {
          ...data,
          dueDate: new Date(`${data.dueDate}T00:00:00Z`),
          ownerId: request.user.sub,
          receiptPath,
          receiptMime: receipt ? "image/jpeg" : null,
        },
      });
      return reply.code(201).send({ loan: serialize(loan, indiaToday(now())) });
    } catch (error) {
      if (file) await unlink(file).catch(() => undefined);
      throw error;
    }
  });
  app.patch<{ Params: { id: string } }>(
    "/loans/:id/repay",
    { preHandler: authenticate },
    async (request) => {
      const loan = await ownedLoan(request.params.id, request.user.sub);
      await db.loan.updateMany({
        where: { id: loan.id, ownerId: request.user.sub, repaidAt: null },
        data: { repaidAt: now() },
      });
      const updated = await ownedLoan(loan.id, request.user.sub);
      return { loan: serialize(updated, indiaToday(now())) };
    },
  );
  app.get("/summary", { preHandler: authenticate }, async (request) => {
    const today = indiaToday(now());
    const ownerId = request.user.sub;
    // One SQL statement uses one database snapshot for all three totals.
    const [sums] = await db.$queryRaw<
      Array<{
        totalLent: Prisma.Decimal;
        totalRepaid: Prisma.Decimal;
        overdueAmount: Prisma.Decimal;
      }>
    >`
      SELECT COALESCE(SUM(amount), 0) AS "totalLent",
             COALESCE(SUM(amount) FILTER (WHERE "repaidAt" IS NOT NULL), 0) AS "totalRepaid",
             COALESCE(SUM(amount) FILTER (WHERE "repaidAt" IS NULL AND "dueDate" < ${today}::date), 0) AS "overdueAmount"
      FROM "Loan" WHERE "ownerId" = ${ownerId}::uuid`;
    return {
      totalLent: sums.totalLent.toFixed(2),
      totalRepaid: sums.totalRepaid.toFixed(2),
      overdueAmount: sums.overdueAmount.toFixed(2),
      currency: "INR",
      today,
    };
  });
  app.get<{ Params: { id: string } }>(
    "/loans/:id/receipt",
    { preHandler: authenticate },
    async (request, reply) => {
      const loan = await ownedLoan(request.params.id, request.user.sub);
      if (!loan.receiptPath)
        throw new ApiError(404, "NOT_FOUND", "No receipt attached");
      let bytes: Buffer;
      try {
        bytes = await readFile(resolve(uploadDir, loan.receiptPath));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          throw new ApiError(404, "NOT_FOUND", "Receipt file is unavailable");
        throw error;
      }
      return reply
        .header("Cache-Control", "private, no-store")
        .header("X-Content-Type-Options", "nosniff")
        .type("image/jpeg")
        .send(bytes);
    },
  );
  await app.ready();
  return app;
}
