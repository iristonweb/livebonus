import { isIP } from "node:net";

const YOOKASSA_API_URL =
  process.env.YOOKASSA_API_URL?.trim() || "https://api.yookassa.ru/v3";

const DEFAULT_YOOKASSA_WEBHOOK_CIDRS = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.156.11/32",
  "77.75.156.35/32",
  "2a02:5180::/32",
] as const;

function webhookAllowlist(): string[] {
  const configured = process.env.YOOKASSA_WEBHOOK_ALLOWED_CIDRS;
  if (configured !== undefined) {
    return configured.split(",").map((value) => value.trim()).filter(Boolean);
  }
  // A production deployment must explicitly declare the allowlist. Defaults
  // are retained only for non-production local/provider integration tests.
  return process.env.NODE_ENV === "production" ? [] : [...DEFAULT_YOOKASSA_WEBHOOK_CIDRS];
}

export type YooKassaPaymentStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";
export type SupportedPaymentMethod = "sbp" | "mir_pay";

export type YooKassaPayment = {
  id: string;
  status: YooKassaPaymentStatus | string;
  amount?: { value?: string; currency?: string };
  confirmation?: { confirmation_url?: string };
  metadata?: Record<string, string>;
  cancellation_details?: { reason?: string };
};

export type YooKassaRefund = {
  id: string;
  status: "pending" | "succeeded" | "canceled" | string;
  payment_id?: string;
};

export class YooKassaError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "YooKassaError";
    this.status = status;
  }
}

function ipv4ToBytes(value: string): number[] | null {
  const octets = value.split(".");
  if (octets.length !== 4) return null;
  const bytes = octets.map((octet) => Number(octet));
  return bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255) ? bytes : null;
}

function ipv6ToBytes(value: string): number[] | null {
  const normalized = value.toLowerCase();
  const parts = normalized.split("::");
  if (parts.length > 2) return null;

  const expand = (part: string): number[] | null => {
    if (!part) return [];
    const groups = part.split(":");
    const bytes: number[] = [];
    for (const group of groups) {
      if (group.includes(".")) {
        const ipv4 = ipv4ToBytes(group);
        if (!ipv4) return null;
        bytes.push(...ipv4);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      const number = Number.parseInt(group, 16);
      bytes.push(number >> 8, number & 0xff);
    }
    return bytes;
  };

  const left = expand(parts[0] ?? "");
  const right = expand(parts[1] ?? "");
  if (!left || !right) return null;
  if (parts.length === 1) {
    return left.length === 16 ? left : null;
  }
  const missingBytes = 16 - left.length - right.length;
  if (missingBytes < 2 || missingBytes % 2 !== 0) return null;
  return [...left, ...Array.from({ length: missingBytes }, () => 0), ...right];
}

function ipToBytes(value: string): number[] | null {
  const version = isIP(value);
  if (version === 4) return ipv4ToBytes(value);
  if (version === 6) return ipv6ToBytes(value);
  return null;
}

function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [network, prefixText] = cidr.split("/");
  const addressBytes = ipToBytes(ip);
  const networkBytes = ipToBytes(network ?? "");
  const prefix = Number(prefixText);
  if (
    !addressBytes
    || !networkBytes
    || addressBytes.length !== networkBytes.length
    || !Number.isInteger(prefix)
    || prefix < 0
    || prefix > addressBytes.length * 8
  ) {
    return false;
  }

  const fullBytes = Math.floor(prefix / 8);
  const remainingBits = prefix % 8;
  for (let index = 0; index < fullBytes; index += 1) {
    if (addressBytes[index] !== networkBytes[index]) return false;
  }
  if (remainingBits === 0) return true;
  const mask = 0xff << (8 - remainingBits);
  return (addressBytes[fullBytes] & mask) === (networkBytes[fullBytes] & mask);
}

/**
 * YooKassa does not sign webhook payloads. Its documented authenticity check
 * is the source IP allowlist; the payment is still fetched from the provider
 * before any settlement is attempted.
 */
export function isYooKassaWebhookIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return webhookAllowlist().some((cidr) => ipMatchesCidr(ip, cidr));
}

function getCredentials(): { shopId: string; secretKey: string } {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !secretKey) {
    throw new YooKassaError(503, "YooKassa credentials are not configured");
  }
  return { shopId, secretKey };
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const { shopId, secretKey } = getCredentials();
  const authorization = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const response = await fetch(`${YOOKASSA_API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${authorization}`,
      ...init.headers,
    },
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const description =
      payload && typeof payload === "object" && "description" in payload && typeof payload.description === "string"
        ? payload.description
        : "YooKassa API request failed";
    throw new YooKassaError(response.status, description);
  }
  return payload as T;
}

export async function createYooKassaPayment(input: {
  amountRub: number;
  description: string;
  returnUrl: string;
  idempotencyKey: string;
  paymentMethod: SupportedPaymentMethod;
  metadata: Record<string, string>;
}): Promise<YooKassaPayment> {
  return request<YooKassaPayment>("/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      amount: { value: input.amountRub.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: input.returnUrl },
      payment_method_data: { type: input.paymentMethod },
      description: input.description,
      metadata: input.metadata,
    }),
  });
}

export async function getYooKassaPayment(paymentId: string): Promise<YooKassaPayment> {
  return request<YooKassaPayment>(`/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
  });
}

export async function createYooKassaRefund(input: {
  paymentId: string;
  amountRub: number;
  idempotencyKey: string;
}): Promise<YooKassaRefund> {
  return request<YooKassaRefund>("/refunds", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      payment_id: input.paymentId,
      amount: { value: input.amountRub.toFixed(2), currency: "RUB" },
    }),
  });
}