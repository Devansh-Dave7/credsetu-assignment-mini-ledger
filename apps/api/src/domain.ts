import { z } from "zod";
import { Prisma } from "@prisma/client";

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^(?:\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  )
  .transform((v) => (v.startsWith("+91") ? v : `+91${v}`));
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return (
      Number.isFinite(d.getTime()) &&
      d.toISOString().slice(0, 10) === v &&
      v >= "1900-01-01" &&
      v <= "9999-12-31"
    );
  }, "Enter a valid calendar date");
export const loanSchema = z
  .object({
    friendName: z.string().trim().min(1, "Enter a friend name").max(80),
    amount: z
      .string()
      .regex(
        /^\d{1,10}(?:\.\d{1,2})?$/,
        "Enter an amount with at most two decimal places",
      )
      .refine(
        (v) => new Prisma.Decimal(v).gt(0),
        "Amount must be greater than zero",
      ),
    dueDate: dateSchema,
  })
  .strict();
export function indiaToday(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function loanStatus(
  loan: { repaidAt: Date | null; dueDate: Date },
  today: string,
) {
  return loan.repaidAt
    ? "REPAID"
    : loan.dueDate.toISOString().slice(0, 10) < today
      ? "OVERDUE"
      : "UNPAID";
}
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
