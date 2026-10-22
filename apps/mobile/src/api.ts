export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000"
).replace(/\/$/, "");
export type User = { id: string; phone: string };
export type Loan = {
  id: string;
  friendName: string;
  amount: string;
  dueDate: string;
  status: "UNPAID" | "OVERDUE" | "REPAID";
  repaidAt: string | null;
  hasReceipt: boolean;
};
export type Summary = {
  totalLent: string;
  totalRepaid: string;
  overdueAmount: string;
  currency: "INR";
  today: string;
};
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    onUnauthorized?: () => void;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const isForm = options.body instanceof FormData;
    const response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(!isForm && options.body
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: options.body
        ? isForm
          ? (options.body as FormData)
          : JSON.stringify(options.body)
        : undefined,
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && options.token) options.onUnauthorized?.();
      throw new RequestError(
        data.message ?? "Request failed. Please retry.",
        response.status,
        data.fieldErrors,
      );
    }
    return data as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      "Cannot reach the API. Check your connection and retry.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}
export const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please retry.";
export const money = (value: string) =>
  `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
