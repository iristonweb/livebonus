export function formatPoints(points: number): string {
  return new Intl.NumberFormat("ru-RU").format(points) + " баллов";
}

export function formatRub(amount: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

export function daysUntil(iso: string): number {
  const now = new Date();
  const target = new Date(iso);
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export const CATEGORY_LABELS: Record<string, string> = {
  rent: "Аренда",
  utilities: "ЖКХ",
  transport: "Транспорт",
  health: "Здоровье",
  food: "Еда",
  other: "Прочее",
};

export const CATEGORY_MULTIPLIERS: Record<string, string> = {
  rent: "2.0×",
  utilities: "2.0×",
  transport: "1.5×",
  health: "1.3×",
  food: "1.0×",
  other: "1.0×",
};

export const STATUS_LABELS: Record<string, string> = {
  novice: "Новичок",
  silver: "Серебро",
  gold: "Золото",
  platinum: "Платина",
};

export const STATUS_COLORS: Record<string, string> = {
  novice: "text-slate-500",
  silver: "text-blue-500",
  gold: "text-amber-500",
  platinum: "text-purple-500",
};

export const CATEGORY_COLORS: Record<string, string> = {
  rent: "bg-indigo-50 text-indigo-700",
  utilities: "bg-teal-50 text-teal-700",
  transport: "bg-amber-50 text-amber-700",
  health: "bg-rose-50 text-rose-700",
  food: "bg-fuchsia-50 text-fuchsia-700",
  other: "bg-slate-100 text-slate-700",
};
