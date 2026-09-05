export function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

export function isAuthError(error: unknown): boolean {
  return getErrorStatus(error) === 401;
}

export function formatRate(rate: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(rate);
}

export function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}