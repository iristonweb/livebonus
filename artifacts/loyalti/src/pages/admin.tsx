import { useEffect, useMemo, useState } from "react";
import { exportBalanceReconciliation, exportCatalogAuditLog, useGetMe, useGetEconomics, useGetEconomicsAudit, useListPaymentReconciliation, useResolvePaymentReconciliation, useListBalanceReconciliation, useGetBalanceReconciliation, useCorrectBalanceReconciliation, useListPartners, useListOffers, useListCatalogAuditLog, useCreatePartner, useCreateOffer, useUpdatePartner, useUpdateOffer, useDeletePartner, useDeleteOffer, useCleanupPartnerLogos, useListPartnerLogoCleanupHistory, useListVerificationQueue, useDecideVerification, useListAdminScoreDisputes, useDecideScoreDispute } from "@workspace/api-client-react";
import type { EconomicsAuditDiscrepancy, PartnerLogoCleanupResult } from "@workspace/api-client-react";
import { formatRub, CATEGORY_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { getGetEconomicsAuditQueryKey, getGetEconomicsQueryKey, getListCatalogAuditLogQueryKey, getListPaymentReconciliationQueryKey, getListBalanceReconciliationQueryKey, getGetBalanceReconciliationQueryKey, getListPartnersQueryKey, getListOffersQueryKey, getListPartnerLogoCleanupHistoryQueryKey, getListVerificationQueueQueryKey, getGetMeQueryKey, getListAdminScoreDisputesQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Clock3, Download, Eye, FileClock, History, Pencil, RefreshCw, ShieldAlert, Trash2, WalletCards, X } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { getStoredToken } from "./auth";
import { Link } from "wouter";
import { PartnerLogo } from "@/components/partner-logo";

const PAYMENT_RECONCILIATION_REFRESH_INTERVAL_MS = 5_000;
const BALANCE_RECONCILIATION_DETAIL_REFRESH_INTERVAL_MS = 5_000;
const ECONOMICS_AUDIT_DEFAULT_LIMIT = 25;

const CATEGORIES = [
  { value: "rent", label: "Аренда" },
  { value: "utilities", label: "ЖКХ" },
  { value: "transport", label: "Транспорт" },
  { value: "health", label: "Здоровье" },
  { value: "food", label: "Еда" },
  { value: "other", label: "Прочее" },
];

function MetricCard({ label, value, sub, highlight, isPositive, rawValue }: { label: string; value: string; sub?: string; highlight?: boolean; isPositive?: boolean; rawValue?: number }) {
  return (
    <div className="trust-panel p-6 flex flex-col justify-between relative overflow-hidden group hover:border-primary/20 transition-colors">
      {highlight && <div className={cn("absolute top-0 left-0 w-1.5 h-full", isPositive ? "bg-primary" : "bg-destructive")} />}
      <div className={cn(highlight && "pl-2")}>
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">{label}</p>
        <p className={cn("text-3xl font-bold tracking-tight", highlight ? (isPositive ? "text-primary" : "text-destructive") : "text-foreground")}>
          {rawValue !== undefined ? <AnimatedNumber value={rawValue} /> : value}
        </p>
        {sub && <p className="text-[11px] font-semibold mt-2 text-muted-foreground uppercase tracking-wider">{sub}</p>}
      </div>
    </div>
  );
}

function rateLabel(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function dealTypeLabel(type: string): string {
  return type === "partner_purchase" ? "Покупки у партнёров" : "Арендные сделки";
}

function auditDealTypeLabel(type: string): string {
  return type === "partner_purchase" ? "Покупка у партнёра" : "Арендная сделка";
}

function auditDealStatusLabel(status: string): string {
  return status === "refunded" ? "Возвращена" : "Проведена";
}

function economicsAuditCodeLabel(code: string): string {
  const labels: Record<string, string> = {
    deal_amounts_mismatch: "Суммы сделки",
    missing_ledger_posting: "Нет проводки",
    ledger_amount_mismatch: "Сумма проводки",
    duplicate_ledger_posting: "Дублирующая проводка",
    missing_refund_reversal: "Нет сторно возврата",
    refund_reversal_amount_mismatch: "Сумма сторно",
    duplicate_refund_reversal: "Дублирующее сторно",
    orphan_refund_reversal: "Осиротевшее сторно",
  };
  return labels[code] ?? code;
}

function economicsAuditFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    grossAmountRub: "Gross-сумма",
    bonusRedeemedRub: "Списано бонусами",
    netAmountRub: "Net-сумма",
    feeAmountRub: "Комиссия",
    tenantBonusRub: "Бонус арендатору",
    landlordBonusRub: "Бонус арендодателю",
  };
  if (field.startsWith("refund_reversal:")) return `Сторно проводки #${field.slice("refund_reversal:".length)}`;
  return labels[field] ?? field;
}

function auditRubLabel(value: number | null): string {
  return value === null ? "Нет значения" : formatRub(value);
}

function EconomicsAuditDiscrepancyCard({ discrepancy }: { discrepancy: EconomicsAuditDiscrepancy }) {
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-foreground">{economicsAuditFieldLabel(discrepancy.field)}</p>
          <p className="text-xs font-semibold text-destructive mt-1">{economicsAuditCodeLabel(discrepancy.code)}</p>
        </div>
        <span className="rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-destructive">
          Расхождение
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-lg bg-background/70 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ожидается</p>
          <p className="text-sm font-bold text-foreground mt-1">{auditRubLabel(discrepancy.expectedRub)}</p>
          {discrepancy.expectedCount !== undefined && <p className="text-[11px] text-muted-foreground mt-1">Количество: {discrepancy.expectedCount}</p>}
        </div>
        <div className="rounded-lg bg-background/70 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">В ledger</p>
          <p className="text-sm font-bold text-foreground mt-1">{auditRubLabel(discrepancy.actualRub)}</p>
          {discrepancy.actualCount !== undefined && <p className="text-[11px] text-muted-foreground mt-1">Количество: {discrepancy.actualCount}</p>}
        </div>
      </div>
      <p className="text-xs font-medium text-muted-foreground mt-3">{discrepancy.message}</p>
    </div>
  );
}

function EconomicsAuditDealCard({ deal }: {
  deal: {
    dealId: number;
    kind: string;
    status: string;
    amounts: {
      grossAmountRub: number;
      bonusRedeemedRub: number;
      netAmountRub: number;
      feeAmountRub: number;
      landlordBonusRub: number;
      tenantBonusRub: number;
    };
    discrepancies: EconomicsAuditDiscrepancy[];
  };
}) {
  return (
    <div className="trust-panel p-5 md:p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-foreground">Сделка #{deal.dealId}</h3>
            <span className="rounded-md border border-border bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{auditDealTypeLabel(deal.kind)}</span>
            <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">{auditDealStatusLabel(deal.status)}</span>
          </div>
          <p className="text-xs font-semibold text-destructive mt-2">{deal.discrepancies.length} проблемных полей</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2 text-xs">
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Gross</p><p className="font-bold text-foreground mt-1">{formatRub(deal.amounts.grossAmountRub)}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Net</p><p className="font-bold text-foreground mt-1">{formatRub(deal.amounts.netAmountRub)}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Комиссия</p><p className="font-bold text-foreground mt-1">{formatRub(deal.amounts.feeAmountRub)}</p></div>
        </div>
      </div>
      <div className="space-y-3 mt-5">
        {deal.discrepancies.map((discrepancy, index) => <EconomicsAuditDiscrepancyCard key={`${discrepancy.code}-${discrepancy.field}-${index}`} discrepancy={discrepancy} />)}
      </div>
    </div>
  );
}

function paymentQueueStatusLabel(status: string): string {
  if (status === "pending") return "Ожидает статуса";
  if (status === "payment_failed") return "Ошибка оплаты";
  return "Отменена";
}

function paymentQueueStatusClass(status: string): string {
  if (status === "pending") return "bg-amber-500/10 text-amber-700 border-amber-500/20";
  if (status === "payment_failed") return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-muted text-muted-foreground border-border";
}

function paymentQueueKindLabel(kind: string): string {
  return kind === "partner_purchase" ? "Покупка у партнёра" : "Арендная сделка";
}

function paymentMethodLabel(method: string): string {
  return method === "sbp" ? "СБП · QR" : method === "mir_pay" ? "Mir Pay" : "Не указан";
}

type ReconciliationStatus = "all" | "consistent" | "rounding_difference" | "mismatch" | "unmigrated";

function reconciliationStatusLabel(status: string): string {
  if (status === "consistent") return "Совпадает";
  if (status === "rounding_difference") return "Разница округления";
  if (status === "unmigrated") return "Не мигрирован";
  return "Расхождение";
}

function reconciliationStatusClass(status: string): string {
  if (status === "consistent") return "bg-primary/10 text-primary border-primary/20";
  if (status === "rounding_difference") return "bg-amber-500/10 text-amber-700 border-amber-500/20";
  if (status === "unmigrated") return "bg-muted text-muted-foreground border-border";
  return "bg-destructive/10 text-destructive border-destructive/20";
}

function rubOrDash(value: number | null): string {
  return value === null ? "—" : formatRub(value);
}

function reconciliationDifferenceLabel(value: number | null): string {
  return value === null ? "Нет денежного баланса" : formatRub(value);
}

function correctionTargetLabel(target: string): string {
  return target === "monetary" ? "денежный баланс" : "баланс в баллах";
}

function balanceCorrectionErrorMessage(error: unknown): string {
  const apiError = error as { status?: number; data?: unknown };
  const body = apiError.data && typeof apiError.data === "object"
    ? apiError.data as { code?: string; error?: string }
    : {};
  if (apiError.status === 409) {
    if (body.code === "RECONCILIATION_ALREADY_CONSISTENT") {
      return "Исправление не применено: баланс уже согласован. Обновите данные перед повторной проверкой.";
    }
    if (body.code === "RECONCILIATION_ROUNDING_ONLY") {
      return "Исправление не применено: осталось только допустимое расхождение округления до 0,40 ₽.";
    }
    if (body.code === "MONETARY_BALANCE_REQUIRED") {
      return "Исправление не применено: для синхронизации баллов нужен денежный баланс.";
    }
    return "Исправление не применено: ключ идемпотентности уже использован для другой операции. Обновите данные и начните новую проверку.";
  }
  if (apiError.status === 400 && body.error) return `Не удалось применить исправление: ${body.error}`;
  return error instanceof Error ? error.message : "Не удалось применить исправление";
}

function auditValueLabel(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function auditActionLabel(action: string): string {
  return action === "create" ? "Создание" : action === "update" ? "Изменение" : "Удаление";
}

function auditEntityLabel(entityType: string): string {
  return entityType === "partner" ? "Партнёр" : "Оффер";
}

function cleanupErrorMessage(error: unknown): string {
  const apiError = error as { status?: number; data?: unknown };
  const body = apiError.data && typeof apiError.data === "object"
    ? apiError.data as { error?: string }
    : {};
  if (apiError.status === 403) return "Операция доступна только администраторам.";
  if (body.error) return body.error;
  return error instanceof Error ? error.message : "Не удалось выполнить проверку логотипов";
}

function catalogAuditExportErrorMessage(error: unknown): string {
  const apiError = error as { data?: unknown };
  const body = apiError.data && typeof apiError.data === "object"
    ? apiError.data as { error?: string; message?: string }
    : {};
  const reason = body.error ?? body.message;
  if (reason) return `Не удалось скачать журнал: ${reason}`;
  if (typeof apiError.data === "string") {
    return "Не удалось скачать журнал: сервер вернул неожиданный ответ. Повторите попытку.";
  }
  return "Не удалось скачать журнал: соединение прервалось. Повторите попытку.";
}

function reconciliationExportErrorMessage(error: unknown): string {
  const apiError = error as { data?: unknown };
  const body = apiError.data && typeof apiError.data === "object"
    ? apiError.data as { error?: string; message?: string }
    : {};
  const reason = body.error ?? body.message;
  return reason
    ? `Не удалось скачать сверку: ${reason}`
    : "Не удалось скачать сверку: соединение прервалось. Повторите попытку.";
}

function reconciliationExportFilename(from: string, to: string): string {
  if (!from && !to) return "balance-reconciliation.csv";
  return `balance-reconciliation-${from || "all"}-${to || "now"}.csv`;
}

function CleanupPathList({
  title,
  paths,
  emptyLabel,
}: {
  title: string;
  paths: string[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
        <span className="text-xs font-bold text-foreground">{paths.length}</span>
      </div>
      {paths.length ? (
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
          {paths.map(path => (
            <li key={path} className="break-all rounded-lg border border-border/70 bg-background px-3 py-2 font-mono text-xs text-foreground">
              {path}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm font-semibold text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

function formatCleanupTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function LogoCleanupHistoryEntry({
  entry,
}: {
  entry: {
    id: number;
    adminName: string;
    mode: "dry_run" | "confirmed";
    scanned: number;
    referenced: number;
    orphaned: string[];
    removed: string[];
    failed: Array<{ path: string; error: string }>;
    createdAt: string;
  };
}) {
  const modeLabel = entry.mode === "dry_run" ? "Dry-run" : "Подтверждённая очистка";
  const affectedPaths = [...new Set([
    ...entry.orphaned,
    ...entry.removed,
    ...entry.failed.map((item) => item.path),
  ])];

  return (
    <article className="trust-panel p-5" data-testid={`logo-cleanup-history-${entry.id}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-foreground">{modeLabel}</h3>
            <span className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
              entry.mode === "dry_run" ? "bg-amber-500/10 text-amber-700" : "bg-primary/10 text-primary",
            )}>
              {entry.mode}
            </span>
          </div>
          <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
            {entry.adminName} · {formatCleanupTimestamp(entry.createdAt)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Проверено</p>
            <p className="mt-1 text-sm font-bold text-foreground">{entry.scanned}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Привязано</p>
            <p className="mt-1 text-sm font-bold text-foreground">{entry.referenced}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Пути</p>
            <p className="mt-1 text-sm font-bold text-foreground">{affectedPaths.length}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <CleanupPathList title="Кандидаты" paths={entry.orphaned} emptyLabel="Кандидатов нет." />
        <CleanupPathList title="Удалённые" paths={entry.removed} emptyLabel="Удаление не выполнялось." />
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4" data-testid={`logo-cleanup-failures-${entry.id}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-destructive">Ошибки</p>
            <span className="text-xs font-bold text-destructive">{entry.failed.length}</span>
          </div>
          {entry.failed.length ? (
            <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
              {entry.failed.map((item, index) => (
                <li
                  key={`${item.path}-${index}`}
                  className="rounded-lg border border-destructive/20 bg-background px-3 py-2"
                  data-testid={`logo-cleanup-failure-${entry.id}-${index}`}
                >
                  <p className="break-all font-mono text-xs text-foreground">{item.path}</p>
                  <p className="mt-1 text-xs font-semibold text-destructive">{item.error}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm font-semibold text-muted-foreground">Ошибок нет.</p>
          )}
        </div>
      </div>
    </article>
  );
}

function EconomicsTable({ rows, kind }: {
  rows: Array<{
    dealCount: number;
    grossTurnoverRub: number;
    netTurnoverRub: number;
    netRevenueRub: number;
    contributionProfitRub: number;
    contributionMarginPercent: number;
    averageCheckRub: number;
    partnerName?: string;
    category?: string;
    type?: string;
  }>;
  kind: "partner" | "category" | "deal";
}) {
  if (!rows.length) {
    return <p className="text-sm font-semibold text-muted-foreground py-8 text-center">Нет подтверждённых сделок за период</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <th className="pb-3 pr-4">{kind === "partner" ? "Партнёр" : kind === "category" ? "Категория" : "Тип сделки"}</th>
            <th className="pb-3 px-3 text-right">Сделки</th>
            <th className="pb-3 px-3 text-right">Gross</th>
            <th className="pb-3 px-3 text-right">Net</th>
            <th className="pb-3 px-3 text-right">Средний чек</th>
            <th className="pb-3 pl-3 text-right">Вклад</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const title = kind === "partner"
              ? row.partnerName
              : kind === "category"
                ? CATEGORY_LABELS[row.category ?? ""] ?? row.category
                : dealTypeLabel(row.type ?? "");
            return (
              <tr key={`${title}-${index}`} className="border-b border-border/70 last:border-0">
                <td className="py-3 pr-4 font-bold text-foreground whitespace-nowrap">{title}</td>
                <td className="py-3 px-3 text-right font-semibold text-muted-foreground">{row.dealCount}</td>
                <td className="py-3 px-3 text-right font-semibold text-foreground whitespace-nowrap">{formatRub(row.grossTurnoverRub)}</td>
                <td className="py-3 px-3 text-right font-semibold text-foreground whitespace-nowrap">{formatRub(row.netTurnoverRub)}</td>
                <td className="py-3 px-3 text-right font-semibold text-muted-foreground whitespace-nowrap">{formatRub(row.averageCheckRub)}</td>
                <td className={cn("py-3 pl-3 text-right font-bold whitespace-nowrap", row.contributionProfitRub < 0 ? "text-destructive" : "text-primary")}>{formatRub(row.contributionProfitRub)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Tab = "analytics" | "payments" | "verification" | "reconciliation" | "partners" | "offers" | "logoCleanup" | "audit" | "dealAudit" | "scoreDisputes";
type PartnerForm = {
  name: string;
  category: string;
  bonusMultiplier: string;
  description: string;
  city: string;
  logoUrl: string;
  logoObjectPath: string;
  logoFile: File | null;
};

const EMPTY_PARTNER_FORM: PartnerForm = {
  name: "",
  category: "rent",
  bonusMultiplier: "2",
  description: "",
  city: "",
  logoUrl: "",
  logoObjectPath: "",
  logoFile: null,
};

type OfferForm = {
  partnerId: string;
  title: string;
  bonusMultiplier: string;
  category: string;
  expiresAt: string;
  description: string;
};

const EMPTY_OFFER_FORM: OfferForm = {
  partnerId: "",
  title: "",
  bonusMultiplier: "2",
  category: "rent",
  expiresAt: "",
  description: "",
};

export default function Admin() {
  const [activeTab, setActiveTab] = useState<Tab>("analytics");
  const qc = useQueryClient();
  const currentMonth = useMemo(() => {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, []);
  const [periodType, setPeriodType] = useState<"day" | "week" | "month" | "custom">("month");
  const [fromDate, setFromDate] = useState(currentMonth.from);
  const [toDate, setToDate] = useState(currentMonth.to);
  const { data: user, isLoading: userLoading } = useGetMe();
  const isAdmin = user?.isAdmin === true;
  const disputeQueueParams = useMemo(() => ({ status: "open" as const }), []);
  const {
    data: disputeQueue,
    isLoading: disputeQueueLoading,
    isError: disputeQueueError,
    refetch: refetchDisputeQueue,
  } = useListAdminScoreDisputes(disputeQueueParams, {
    query: {
      enabled: isAdmin,
      queryKey: getListAdminScoreDisputesQueryKey(disputeQueueParams),
      staleTime: 0,
      refetchInterval: 10_000,
    },
  });
  const [disputeDecisionReason, setDisputeDecisionReason] = useState<Record<number, string>>({});
  const [disputeDecisionError, setDisputeDecisionError] = useState<string | null>(null);
  const decideScoreDispute = useDecideScoreDispute({
    mutation: {
      onMutate: () => setDisputeDecisionError(null),
      onSuccess: () => void qc.invalidateQueries({ queryKey: getListAdminScoreDisputesQueryKey(disputeQueueParams) }),
      onError: (error) => setDisputeDecisionError(error instanceof Error ? error.message : "Не удалось сохранить решение по спору"),
    },
  });
  const verificationQueueParams = useMemo(() => ({ status: "pending" as const }), []);
  const {
    data: verificationQueue,
    isLoading: verificationQueueLoading,
    isFetching: verificationQueueFetching,
    isError: verificationQueueError,
    refetch: refetchVerificationQueue,
  } = useListVerificationQueue(verificationQueueParams, {
    query: {
      enabled: isAdmin,
      queryKey: getListVerificationQueueQueryKey(verificationQueueParams),
      staleTime: 0,
      refetchInterval: 10_000,
    },
  });
  const [verificationComments, setVerificationComments] = useState<Record<number, string>>({});
  const [verificationDecisionError, setVerificationDecisionError] = useState<string | null>(null);
  const decideVerification = useDecideVerification({
    mutation: {
      onMutate: () => setVerificationDecisionError(null),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListVerificationQueueQueryKey(verificationQueueParams) });
        void qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (error) => setVerificationDecisionError(error instanceof Error ? error.message : "Не удалось принять решение"),
    },
  });
  const [economicsStatus, setEconomicsStatus] = useState<"all" | "settled" | "refunded">("all");
  const economicsParams = useMemo(() => ({
    from: fromDate,
    to: toDate,
    period: periodType,
    status: economicsStatus,
  }), [fromDate, toDate, periodType, economicsStatus]);
  const { data: econ, isLoading, isFetching, isError: economicsError, refetch: refetchEconomics } = useGetEconomics(
    economicsParams,
    { query: { enabled: isAdmin, queryKey: getGetEconomicsQueryKey(economicsParams), staleTime: 0 } },
  );
  const [economicsAuditLimit, setEconomicsAuditLimit] = useState<25 | 50 | 100>(ECONOMICS_AUDIT_DEFAULT_LIMIT);
  const [economicsAuditOffset, setEconomicsAuditOffset] = useState(0);
  const [economicsAuditSnapshotAt, setEconomicsAuditSnapshotAt] = useState<string | null>(null);
  const economicsAuditParams = useMemo(() => ({
    limit: economicsAuditLimit,
    offset: economicsAuditOffset,
    ...(economicsAuditSnapshotAt ? { snapshotAt: economicsAuditSnapshotAt } : {}),
  }), [economicsAuditLimit, economicsAuditOffset, economicsAuditSnapshotAt]);
  const {
    data: economicsAudit,
    isLoading: economicsAuditLoading,
    isFetching: economicsAuditFetching,
    isError: economicsAuditError,
    refetch: refetchEconomicsAudit,
  } = useGetEconomicsAudit(
    economicsAuditParams,
    {
      query: {
        enabled: isAdmin,
        queryKey: getGetEconomicsAuditQueryKey(economicsAuditParams),
        staleTime: 0,
      },
    },
  );
  useEffect(() => {
    if (economicsAudit && !economicsAuditFetching && economicsAuditSnapshotAt === null) {
      setEconomicsAuditSnapshotAt(economicsAudit.snapshotAt);
    }
  }, [economicsAudit, economicsAuditFetching, economicsAuditSnapshotAt]);
  const { data: partners, isLoading: partnersLoading } = useListPartners(undefined, { query: { enabled: isAdmin, queryKey: getListPartnersQueryKey() } });
  const { data: offers, isLoading: offersLoading } = useListOffers(undefined, { query: { enabled: isAdmin, queryKey: getListOffersQueryKey() } });
  const [logoCleanupHistoryStatus, setLogoCleanupHistoryStatus] = useState<"all" | "failed">("all");
  const logoCleanupHistoryParams = useMemo(() => ({
    limit: 50,
    status: logoCleanupHistoryStatus,
  }), [logoCleanupHistoryStatus]);
  const {
    data: logoCleanupHistory,
    isLoading: logoCleanupHistoryLoading,
    isFetching: logoCleanupHistoryFetching,
    isError: logoCleanupHistoryError,
    refetch: refetchLogoCleanupHistory,
  } = useListPartnerLogoCleanupHistory(logoCleanupHistoryParams, {
    query: {
      enabled: isAdmin,
      queryKey: getListPartnerLogoCleanupHistoryQueryKey(logoCleanupHistoryParams),
      staleTime: 0,
    },
  });
  const [auditEntityType, setAuditEntityType] = useState<"all" | "partner" | "offer">("all");
  const [auditAction, setAuditAction] = useState<"all" | "create" | "update" | "delete">("all");
  const auditParams = useMemo(() => ({
    limit: 100,
    ...(auditEntityType === "all" ? {} : { entityType: auditEntityType }),
    ...(auditAction === "all" ? {} : { action: auditAction }),
  }), [auditAction, auditEntityType]);
  const {
    data: auditLog,
    isLoading: auditLoading,
    isFetching: auditFetching,
    isError: auditError,
    refetch: refetchAudit,
  } = useListCatalogAuditLog(auditParams, {
    query: {
      enabled: isAdmin,
      queryKey: getListCatalogAuditLogQueryKey(auditParams),
      staleTime: 0,
    },
  });
  const [auditExporting, setAuditExporting] = useState(false);
  const [auditExportError, setAuditExportError] = useState<string | null>(null);
  const exportAuditLog = async () => {
    setAuditExporting(true);
    setAuditExportError(null);
    try {
      const csv = await exportCatalogAuditLog({
        ...(auditEntityType === "all" ? {} : { entityType: auditEntityType }),
        ...(auditAction === "all" ? {} : { action: auditAction }),
      });
      const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "catalog-audit-log.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setAuditExportError(catalogAuditExportErrorMessage(error));
    } finally {
      setAuditExporting(false);
    }
  };
  const [paymentQueueStatus, setPaymentQueueStatus] = useState<"all" | "pending" | "payment_failed" | "cancelled">("all");
  const paymentQueueParams = useMemo(() => ({
    status: paymentQueueStatus,
    limit: 100,
    offset: 0,
  }), [paymentQueueStatus]);
  const {
    data: paymentQueue,
    isLoading: paymentQueueLoading,
    isFetching: paymentQueueFetching,
    isError: paymentQueueError,
    refetch: refetchPaymentQueue,
  } = useListPaymentReconciliation(paymentQueueParams, {
    query: {
      enabled: isAdmin,
      queryKey: getListPaymentReconciliationQueryKey(paymentQueueParams),
      staleTime: 0,
        refetchInterval: PAYMENT_RECONCILIATION_REFRESH_INTERVAL_MS,
        refetchIntervalInBackground: true,
    },
  });
  const [lastKnownPaymentQueue, setLastKnownPaymentQueue] = useState<typeof paymentQueue>(undefined);
  useEffect(() => {
    if (paymentQueue) {
      setLastKnownPaymentQueue(paymentQueue);
    }
  }, [paymentQueue]);
  const [paymentResolutionMessage, setPaymentResolutionMessage] = useState<string | null>(null);
  const [paymentResolutionError, setPaymentResolutionError] = useState<string | null>(null);
  const resolvePayment = useResolvePaymentReconciliation({
    mutation: {
      onMutate: () => {
        setPaymentResolutionMessage(null);
        setPaymentResolutionError(null);
      },
      onSuccess: (result) => {
        setPaymentResolutionMessage(result.message ?? "Проверка платежа завершена");
        void qc.invalidateQueries({ queryKey: getListPaymentReconciliationQueryKey() });
        void refetchPaymentQueue();
      },
      onError: (error) => {
        setPaymentResolutionError(error instanceof Error ? error.message : "Не удалось проверить платёж");
      },
    },
  });

  const [reconciliationStatus, setReconciliationStatus] = useState<ReconciliationStatus>("mismatch");
  const [reconciliationFromDate, setReconciliationFromDate] = useState("");
  const [reconciliationToDate, setReconciliationToDate] = useState("");
  const [reconciliationLimit, setReconciliationLimit] = useState<25 | 50 | 100>(25);
  const [reconciliationOffset, setReconciliationOffset] = useState(0);
  const reconciliationParams = useMemo(() => ({
    status: reconciliationStatus,
    limit: reconciliationLimit,
    offset: reconciliationOffset,
  }), [reconciliationLimit, reconciliationOffset, reconciliationStatus]);
  const {
    data: reconciliationReport,
    isLoading: reconciliationLoading,
    isFetching: reconciliationFetching,
    isError: reconciliationError,
    refetch: refetchReconciliation,
  } = useListBalanceReconciliation(reconciliationParams, {
    query: {
      enabled: isAdmin,
      queryKey: getListBalanceReconciliationQueryKey(reconciliationParams),
      staleTime: 0,
      retry: false,
    },
  });
  const [reconciliationExporting, setReconciliationExporting] = useState(false);
  const [reconciliationExportError, setReconciliationExportError] = useState<string | null>(null);
  const exportReconciliation = async () => {
    setReconciliationExporting(true);
    setReconciliationExportError(null);
    try {
      // Buffer the complete response before creating a download. If the
      // server fails after streaming starts, response.text() rejects and no
      // incomplete CSV is offered to the administrator.
      const csv = await exportBalanceReconciliation({
        status: reconciliationStatus,
        ...(reconciliationFromDate ? { from: reconciliationFromDate } : {}),
        ...(reconciliationToDate ? { to: reconciliationToDate } : {}),
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = reconciliationExportFilename(reconciliationFromDate, reconciliationToDate);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setReconciliationExportError(reconciliationExportErrorMessage(error));
    } finally {
      setReconciliationExporting(false);
    }
  };
  const [selectedReconciliationUserId, setSelectedReconciliationUserId] = useState<number | null>(null);
  const {
    data: reconciliationDetail,
    isLoading: reconciliationDetailLoading,
    isFetching: reconciliationDetailFetching,
    isError: reconciliationDetailError,
    refetch: refetchReconciliationDetail,
  } = useGetBalanceReconciliation(selectedReconciliationUserId ?? 0, {
    query: {
      enabled: isAdmin && selectedReconciliationUserId !== null,
      queryKey: getGetBalanceReconciliationQueryKey(selectedReconciliationUserId ?? 0),
      staleTime: 0,
      retry: false,
      refetchInterval: BALANCE_RECONCILIATION_DETAIL_REFRESH_INTERVAL_MS,
      refetchIntervalInBackground: true,
    },
  });
  const [correctionTarget, setCorrectionTarget] = useState<"monetary" | "points">("monetary");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionConfirmOpen, setCorrectionConfirmOpen] = useState(false);
  const [correctionMessage, setCorrectionMessage] = useState<string | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  useEffect(() => {
    if (reconciliationDetailError || (reconciliationDetail && !reconciliationDetail.canCorrect)) {
      setCorrectionConfirmOpen(false);
      setCorrectionReason("");
    }
  }, [reconciliationDetail, reconciliationDetailError]);
  const correctBalance = useCorrectBalanceReconciliation({
    mutation: {
      onMutate: () => {
        setCorrectionMessage(null);
        setCorrectionError(null);
      },
      onSuccess: (result) => {
        setCorrectionMessage(result.idempotent
          ? "Это исправление уже было применено ранее. Новая запись в историю не добавлена."
          : "Исправление применено и добавлено в неизменяемую историю.");
        setCorrectionReason("");
        void qc.invalidateQueries({ queryKey: getListBalanceReconciliationQueryKey() });
        if (selectedReconciliationUserId !== null) {
          void qc.invalidateQueries({ queryKey: getGetBalanceReconciliationQueryKey(selectedReconciliationUserId) });
          void refetchReconciliationDetail();
        }
      },
      onError: (error) => {
        setCorrectionError(balanceCorrectionErrorMessage(error));
      },
    },
  });
  const selectReconciliationUser = (userId: number) => {
    setSelectedReconciliationUserId(userId);
    setCorrectionMessage(null);
    setCorrectionError(null);
    setCorrectionReason("");
    setCorrectionConfirmOpen(false);
    correctBalance.reset();
    if (window.innerWidth < 1024) {
      window.setTimeout(() => document.getElementById("reconciliation-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  };
  const resetReconciliationPage = () => {
    setReconciliationOffset(0);
    setSelectedReconciliationUserId(null);
    setCorrectionConfirmOpen(false);
    correctBalance.reset();
  };
  const refreshReconciliation = async () => {
    await Promise.all([
      refetchReconciliation(),
      selectedReconciliationUserId === null ? Promise.resolve() : refetchReconciliationDetail(),
    ]);
  };
  const requestBalanceCorrection = () => {
    const reason = correctionReason.trim();
    if (selectedReconciliationUserId === null || reason.length < 3 || reason.length > 500 || !reconciliationDetail?.canCorrect) return;
    setCorrectionConfirmOpen(true);
  };
  const submitBalanceCorrection = () => {
    const reason = correctionReason.trim();
    if (selectedReconciliationUserId === null || reason.length < 3 || reason.length > 500 || !reconciliationDetail?.canCorrect) return;
    setCorrectionConfirmOpen(false);
    const idempotencyKey = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `balance-correction-${selectedReconciliationUserId}-${Date.now()}`;
    correctBalance.mutate({
      userId: selectedReconciliationUserId,
      data: { target: correctionTarget, reason, idempotencyKey },
    });
  };

  // Partner form state
  const [partnerForm, setPartnerForm] = useState<PartnerForm>(EMPTY_PARTNER_FORM);
  const [editingPartnerId, setEditingPartnerId] = useState<number | null>(null);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const refreshPartners = () => {
    qc.invalidateQueries({ queryKey: getListPartnersQueryKey() });
    qc.invalidateQueries({ queryKey: ["partners"] });
    qc.invalidateQueries({ queryKey: getListOffersQueryKey() });
  };
  const resetPartnerForm = () => {
    setEditingPartnerId(null);
    setPartnerForm(EMPTY_PARTNER_FORM);
    setLogoUploadError(null);
  };
  useEffect(() => {
    if (!partnerForm.logoFile) {
      setLogoPreviewUrl("");
      return;
    }
    const previewUrl = URL.createObjectURL(partnerForm.logoFile);
    setLogoPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [partnerForm.logoFile]);
  const uploadPartnerLogo = async (file: File): Promise<string> => {
    const token = getStoredToken();
    const response = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      }),
    });
    const upload = await response.json().catch(() => null);
    if (!response.ok || !upload?.uploadURL || !upload?.objectPath) {
      throw new Error(upload?.error || "Не удалось подготовить загрузку логотипа");
    }
    const putResponse = await fetch(upload.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putResponse.ok) {
      throw new Error("Не удалось загрузить логотип в хранилище");
    }
    return upload.objectPath;
  };
  const submitPartner = async () => {
    setLogoUploadError(null);
    setIsUploadingLogo(true);
    try {
      const logoObjectPath = partnerForm.logoFile
        ? await uploadPartnerLogo(partnerForm.logoFile)
        : partnerForm.logoObjectPath.trim();
      const commonData = {
        name: partnerForm.name,
        category: partnerForm.category as any,
        bonusMultiplier: parseFloat(partnerForm.bonusMultiplier) || 2,
      };
      if (editingPartnerId) {
        updatePartner.mutate({
          id: editingPartnerId,
          data: {
            ...commonData,
            description: partnerForm.description.trim() || null,
            logoUrl: logoObjectPath ? null : partnerForm.logoUrl.trim() || null,
            logoObjectPath: logoObjectPath || null,
            city: partnerForm.city.trim() || null,
          },
        });
      } else {
        createPartner.mutate({
          data: {
            ...commonData,
            ...(partnerForm.description.trim() ? { description: partnerForm.description.trim() } : {}),
            ...(partnerForm.logoUrl.trim() && !logoObjectPath ? { logoUrl: partnerForm.logoUrl.trim() } : {}),
            ...(logoObjectPath ? { logoObjectPath } : {}),
            ...(partnerForm.city.trim() ? { city: partnerForm.city.trim() } : {}),
          },
        });
      }
    } catch (error) {
      setLogoUploadError(error instanceof Error ? error.message : "Не удалось загрузить логотип");
    } finally {
      setIsUploadingLogo(false);
    }
  };
  const createPartner = useCreatePartner({ mutation: { onSuccess: () => { refreshPartners(); refreshAudit(); resetPartnerForm(); } } });
  const updatePartner = useUpdatePartner({ mutation: { onSuccess: () => { refreshPartners(); refreshAudit(); resetPartnerForm(); } } });
  const deletePartner = useDeletePartner({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListPartnersQueryKey() }); refreshAudit(); } } });

  const [logoCleanupResult, setLogoCleanupResult] = useState<PartnerLogoCleanupResult | null>(null);
  const [logoCleanupConfirmOpen, setLogoCleanupConfirmOpen] = useState(false);
  const [logoCleanupMessage, setLogoCleanupMessage] = useState<string | null>(null);
  const [logoCleanupError, setLogoCleanupError] = useState<string | null>(null);
  const cleanupLogos = useCleanupPartnerLogos({
    mutation: {
      onMutate: () => {
        setLogoCleanupMessage(null);
        setLogoCleanupError(null);
      },
      onSuccess: (result) => {
        setLogoCleanupResult(result);
        void qc.invalidateQueries({ queryKey: getListPartnerLogoCleanupHistoryQueryKey(logoCleanupHistoryParams) });
        setLogoCleanupConfirmOpen(false);
        setLogoCleanupMessage(result.dryRun
          ? "Проверка завершена. Удаление не выполнялось."
          : `Очистка завершена: удалено ${result.removed.length} из ${result.orphaned.length} осиротевших объектов.`);
      },
      onError: (error) => {
        setLogoCleanupError(cleanupErrorMessage(error));
      },
    },
  });
  const requestLogoCleanupReview = () => {
    setLogoCleanupConfirmOpen(false);
    cleanupLogos.mutate({ data: { dryRun: true } });
  };
  const confirmLogoCleanup = () => {
    if (!logoCleanupResult?.dryRun || logoCleanupResult.orphaned.length === 0 || cleanupLogos.isPending) return;
    cleanupLogos.mutate({ data: { dryRun: false } });
  };

  // Offer form state
  const [offerForm, setOfferForm] = useState<OfferForm>(EMPTY_OFFER_FORM);
  const [editingOfferId, setEditingOfferId] = useState<number | null>(null);
  const resetOfferForm = () => {
    setEditingOfferId(null);
    setOfferForm(EMPTY_OFFER_FORM);
  };
  const refreshAudit = () => qc.invalidateQueries({ queryKey: getListCatalogAuditLogQueryKey() });
  const createOffer = useCreateOffer({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListOffersQueryKey() }); refreshAudit(); resetOfferForm(); } } });
  const updateOffer = useUpdateOffer({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListOffersQueryKey() }); refreshAudit(); resetOfferForm(); } } });
  const deleteOffer = useDeleteOffer({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListOffersQueryKey() }); refreshAudit(); } } });
  const submitOffer = () => {
    const data = {
      partnerId: parseInt(offerForm.partnerId),
      title: offerForm.title,
      bonusMultiplier: parseFloat(offerForm.bonusMultiplier) || 2,
      category: offerForm.category as any,
      expiresAt: new Date(offerForm.expiresAt).toISOString(),
      description: offerForm.description || undefined,
    };
    if (editingOfferId !== null) {
      updateOffer.mutate({ id: editingOfferId, data });
    } else {
      createOffer.mutate({ data });
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "analytics", label: "Метрики" },
    { key: "payments", label: `Платежи${paymentQueue?.summary?.requiresReview ? ` (${paymentQueue.summary.requiresReview})` : ""}` },
    { key: "verification", label: `Верификация${verificationQueue?.length ? ` (${verificationQueue.length})` : ""}` },
    { key: "reconciliation", label: `Сверка балансов${reconciliationReport?.summary?.mismatch ? ` (${reconciliationReport.summary.mismatch})` : ""}` },
    { key: "partners", label: `Партнёры${partners ? ` (${partners.length})` : ""}` },
    { key: "offers", label: `Офферы${offers ? ` (${offers.length})` : ""}` },
    { key: "logoCleanup", label: "Логотипы" },
    { key: "audit", label: `Журнал${auditLog ? ` (${auditLog.length})` : ""}` },
    { key: "dealAudit", label: `Сделки${economicsAudit?.discrepantDeals ? ` (${economicsAudit.discrepantDeals})` : ""}` },
    { key: "scoreDisputes", label: `Споры${disputeQueue?.length ? ` (${disputeQueue.length})` : ""}` },
  ];
  const openPaymentReconciliation = () => {
    setPaymentQueueStatus("pending");
    setActiveTab("payments");
    window.setTimeout(() => {
      document.getElementById("payment-reconciliation")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };
  const paymentQueueForAlert = lastKnownPaymentQueue ?? paymentQueue;
  const confirmedAwaitingReconciliation = paymentQueueForAlert?.summary.confirmedAwaitingReconciliation ?? 0;
  const confirmedAwaitingReconciliationLastUpdatedAt = paymentQueueForAlert?.summary.confirmedAwaitingReconciliationLastUpdatedAt ?? null;
  const paymentQueueIsStale = paymentQueueError && lastKnownPaymentQueue !== undefined;
  const economicsAuditPage = economicsAudit
    ? Math.floor(economicsAudit.offset / economicsAudit.limit) + 1
    : 1;
  const economicsAuditTotalPages = economicsAudit
    ? Math.max(1, Math.ceil(economicsAudit.checkedDeals / economicsAudit.limit))
    : 1;
  const economicsAuditHasPreviousPage = economicsAuditOffset > 0;
  const economicsAuditHasNextPage = economicsAudit
    ? economicsAudit.offset + economicsAudit.results.length < economicsAudit.checkedDeals
    : false;
  const startNewEconomicsAuditReview = () => {
    setEconomicsAuditOffset(0);
    setEconomicsAuditSnapshotAt(null);
  };
  const goToEconomicsAuditPage = (direction: "previous" | "next") => {
    setEconomicsAuditOffset((currentOffset) => {
      const nextOffset = direction === "previous"
        ? currentOffset - economicsAuditLimit
        : currentOffset + economicsAuditLimit;
      return Math.max(0, nextOffset);
    });
  };

  if (userLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-10 h-10 rounded border-2 border-border border-t-primary animate-spin" aria-label="Проверяем доступ" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <motion.div
        className="min-h-[50vh] flex items-center justify-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="trust-panel max-w-lg w-full p-8 md:p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mt-6">
            Доступ ограничен
          </h1>
          <p className="text-sm text-muted-foreground font-medium mt-3 leading-relaxed">
            Аналитика платформы доступна только администраторам. Обратитесь к администратору, если вам нужен этот раздел.
          </p>
          <Link href="/">
            <div className="inline-flex items-center gap-2 mt-8 px-5 py-3 rounded-xl bg-foreground text-background font-bold text-sm hover:bg-foreground/90 transition-colors cursor-pointer">
              <ArrowLeft className="w-4 h-4" />
              Вернуться к обзору
            </div>
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-8 max-w-6xl mx-auto" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Аналитика платформы</h1>
        <p className="text-sm text-muted-foreground font-semibold mt-2">Финансовые метрики и управление инфраструктурой</p>
      </div>

      {confirmedAwaitingReconciliation > 0 && (
        <div
          className="trust-panel border-amber-500/30 bg-amber-500/5 p-5 md:p-6"
          role="alert"
          data-testid="payment-reconciliation-alert"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
                <CircleAlert className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {confirmedAwaitingReconciliation} подтверждённых платежа ожидают сверки
                </p>
                <p className="text-xs font-semibold text-muted-foreground mt-1.5">
                  Баланс не изменён автоматически. Последнее обновление:{" "}
                  <span data-testid="payment-reconciliation-last-updated">
                    {confirmedAwaitingReconciliationLastUpdatedAt
                    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(confirmedAwaitingReconciliationLastUpdatedAt))
                    : "не зафиксировано"}
                  </span>
                </p>
                {paymentQueueIsStale && (
                  <p
                    className="text-xs font-bold text-amber-700 mt-1.5"
                    data-testid="payment-reconciliation-stale"
                  >
                    Отчёт временно устарел — ожидается повторное обновление
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={openPaymentReconciliation}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              Открыть записи
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex p-1.5 bg-input/50 rounded-xl border border-border w-fit shadow-inner">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-5 py-2.5 rounded-lg text-sm font-bold transition-all active:scale-[0.98]",
              activeTab === tab.key
                ? "bg-background text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SCORE DISPUTES MODERATION TAB */}
      {activeTab === "scoreDisputes" && (
        <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="score-disputes-admin">
          <div className="trust-panel p-5 md:p-6">
            <h2 className="text-xl font-bold text-foreground">Модерация Live Score</h2>
            <p className="text-sm text-muted-foreground font-medium mt-2">Решение меняет score только один раз. Причина сохраняется в audit trail и показывается пользователю без внутренних данных.</p>
            {disputeDecisionError && <p className="mt-4 text-sm font-semibold text-destructive" role="alert">{disputeDecisionError}</p>}
          </div>
          {disputeQueueLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, index) => <div key={index} className="animate-pulse trust-panel h-44 bg-muted/50" />)}</div>
          ) : disputeQueueError ? (
            <div className="trust-panel p-8 text-center">
              <CircleAlert className="w-8 h-8 mx-auto text-destructive" />
              <p className="text-sm font-semibold text-muted-foreground mt-3">Очередь споров недоступна.</p>
              <button type="button" className="mt-4 px-5 py-3 rounded-xl bg-foreground text-background text-sm font-bold" onClick={() => void refetchDisputeQueue()}>Повторить</button>
            </div>
          ) : disputeQueue?.length ? (
            <div className="space-y-4">
              {disputeQueue.map((dispute) => (
                <div key={dispute.id} className="trust-panel p-5 md:p-6">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-foreground">Спор #{dispute.id}</h3>
                        <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-600">{dispute.status === "created" ? "Создан" : "На рассмотрении"}</span>
                      </div>
                      <p className="text-xs font-semibold text-muted-foreground mt-2">{dispute.userName ?? `Пользователь #${dispute.userId}`} · {dispute.leaseAddress ?? `Аренда #${dispute.leaseId}`}</p>
                    </div>
                    <span className="text-xs font-bold text-muted-foreground">Версия {dispute.version}</span>
                  </div>
                  <p className="mt-4 rounded-xl bg-muted/40 p-4 text-sm font-medium text-foreground">{dispute.reason}</p>
                  <textarea
                    value={disputeDecisionReason[dispute.id] ?? ""}
                    onChange={(event) => setDisputeDecisionReason((current) => ({ ...current, [dispute.id]: event.target.value }))}
                    placeholder="Причина решения (минимум 5 символов)"
                    rows={2}
                    className="mt-4 w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground"
                    aria-label={`Причина решения по спору ${dispute.id}`}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-50"
                      disabled={decideScoreDispute.isPending || (disputeDecisionReason[dispute.id] ?? "").trim().length < 5}
                      onClick={() => decideScoreDispute.mutate({ id: dispute.id, data: { status: "under_review", reason: disputeDecisionReason[dispute.id]!.trim(), expectedVersion: dispute.version } })}>Взять в работу</button>
                    <button type="button" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      disabled={decideScoreDispute.isPending || (disputeDecisionReason[dispute.id] ?? "").trim().length < 5}
                      onClick={() => decideScoreDispute.mutate({ id: dispute.id, data: { status: "resolved", reason: disputeDecisionReason[dispute.id]!.trim(), expectedVersion: dispute.version } })}>Одобрить и компенсировать</button>
                    <button type="button" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      disabled={decideScoreDispute.isPending || (disputeDecisionReason[dispute.id] ?? "").trim().length < 5}
                      onClick={() => decideScoreDispute.mutate({ id: dispute.id, data: { status: "rejected", reason: disputeDecisionReason[dispute.id]!.trim(), expectedVersion: dispute.version } })}>Отклонить</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="trust-panel p-10 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto text-primary" />
              <h2 className="text-xl font-bold text-foreground mt-4">Очередь пуста</h2>
              <p className="text-sm text-muted-foreground mt-2">Новых споров на модерацию нет.</p>
            </div>
          )}
        </motion.div>
      )}

      {/* ANALYTICS TAB */}
      {activeTab === "analytics" && (
        <>
          <div className="trust-panel p-5 md:p-6">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <CalendarDays className="w-4 h-4 text-primary" />
                Период отчёта
              </div>
              <label className="flex-1 text-xs font-bold text-muted-foreground">
                Статус
                <select className="mt-2 w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold" value={economicsStatus} onChange={e => setEconomicsStatus(e.target.value as typeof economicsStatus)}>
                  <option value="all">Все подтверждённые</option>
                  <option value="settled">Только проведённые</option>
                  <option value="refunded">Только возвращённые</option>
                </select>
              </label>
              <label className="flex-1 text-xs font-bold text-muted-foreground">
                Срез
                <select className="mt-2 w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold" value={periodType} onChange={e => setPeriodType(e.target.value as typeof periodType)}>
                  <option value="month">Месяц</option>
                  <option value="week">Неделя</option>
                  <option value="day">День</option>
                  <option value="custom">Произвольный период</option>
                </select>
              </label>
              <label className="flex-1 text-xs font-bold text-muted-foreground">
                От
                <input className="mt-2 w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold" type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPeriodType("custom"); }} />
              </label>
              <label className="flex-1 text-xs font-bold text-muted-foreground">
                До
                <input className="mt-2 w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold" type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPeriodType("custom"); }} />
              </label>
              <button className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-foreground text-background text-sm font-bold disabled:opacity-50" onClick={() => refetchEconomics()} disabled={isFetching} title="Обновить отчёт">
                <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
                Обновить
              </button>
            </div>
            <p className="text-xs text-muted-foreground font-semibold mt-4">Все даты указаны в UTC. В отчёт попадают только подтверждённые сделки и проводки, а не обычные бонусные транзакции.</p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => <div key={i} className="animate-pulse trust-panel h-32 bg-muted/50" />)}
            </div>
          ) : economicsError ? (
            <div className="trust-panel p-8 text-center">
              <CircleAlert className="w-8 h-8 mx-auto text-destructive" />
              <h2 className="text-lg font-bold text-foreground mt-4">Не удалось загрузить финансовый отчёт</h2>
              <p className="text-sm text-muted-foreground mt-2">Проверьте период и попробуйте обновить данные.</p>
              <button className="mt-5 px-5 py-3 rounded-xl bg-foreground text-background text-sm font-bold" onClick={() => refetchEconomics()}>Повторить</button>
            </div>
          ) : econ ? (
            <motion.div className="space-y-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="trust-panel p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Правила расчёта</h2>
                    <p className="text-sm text-foreground font-semibold mt-3">Действующая политика в RUB, версия подтверждается на стороне финансового ядра.</p>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground px-3 py-2 rounded-lg bg-muted/50">{econ.confirmedLedgerEntries} проводок в срезе</span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
                  {[
                    ["Максимум списания", rateLabel(econ.policy.purchaseMaxRedemptionRate)],
                    ["Комиссия партнёра", `${rateLabel(econ.policy.partnerFeeRate)} после бонусов`],
                    ["Комиссия арендодателя", `${rateLabel(econ.policy.landlordFeeRate)} от сделки`],
                    ["Бонусы по аренде", `${rateLabel(econ.policy.rentalTenantBonusRate)} арендатор + ${rateLabel(econ.policy.rentalLandlordBonusRate)} арендодатель`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-border p-4 bg-muted/20">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
                      <p className="text-base font-bold text-foreground mt-2">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {econ.period.isEmpty ? (
                <div className="trust-panel p-10 text-center">
                  <CalendarDays className="w-9 h-9 mx-auto text-muted-foreground" />
                  <h2 className="text-xl font-bold text-foreground mt-4">За этот период нет подтверждённых сделок</h2>
                  <p className="text-sm text-muted-foreground mt-2">Измените даты или выберите другой срез. Финансовые карточки не показываются для пустого периода.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    <MetricCard label="Gross-оборот" value={formatRub(econ.summary.grossTurnoverRub)} sub={`${econ.summary.dealCount} сделок`} />
                    <MetricCard label="Net-оборот" value={formatRub(econ.summary.netTurnoverRub)} sub="после списания бонусов" />
                    <MetricCard label="Net revenue" value={formatRub(econ.summary.netRevenueRub)} sub={`партнёры ${formatRub(econ.summary.partnerCommissionRub)} · аренда ${formatRub(econ.summary.landlordCommissionRub)}`} />
                    <MetricCard label="Contribution profit" value={formatRub(econ.summary.contributionProfitRub)} sub="до операционных расходов" highlight isPositive={econ.summary.contributionProfitRub >= 0} />
                    <MetricCard label="Начислено бонусов" value={formatRub(econ.summary.bonusLiabilityCostRub)} sub={`арендатор ${formatRub(econ.summary.tenantBonusAccruedRub)} · арендодатель ${formatRub(econ.summary.landlordBonusAccruedRub)}`} />
                    <MetricCard label="Списано бонусов" value={formatRub(econ.summary.bonusRedeemedRub)} sub="подтверждённые покупки" />
                    <MetricCard label="Возвраты" value={formatRub(econ.summary.refundsRub)} sub="положительная величина возвратов" />
                    <MetricCard label="Остаточная задолженность" value={formatRub(econ.summary.outstandingBonusLiabilityRub)} sub="текущий баланс обязательств" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-6">
                    <MetricCard label="Contribution margin" value={`${econ.summary.contributionMarginPercent.toFixed(1)}%`} sub="profit / net revenue" highlight isPositive={econ.summary.contributionProfitRub >= 0} />
                    <div className="trust-panel p-6 flex items-center">
                      <div>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Граница показателя</p>
                        <p className="text-sm font-semibold text-foreground mt-3">Операционные расходы не ведутся в системе. Это contribution profit, а не чистая прибыль.</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid lg:grid-cols-2 gap-8">
                    <div className="trust-panel p-6 md:p-8">
                      <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-5">По типу сделки</h2>
                      <EconomicsTable rows={econ.byDealType} kind="deal" />
                    </div>
                    <div className="trust-panel p-6 md:p-8">
                      <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-5">По категориям</h2>
                      <EconomicsTable rows={econ.byCategory} kind="category" />
                    </div>
                  </div>
                  <div className="trust-panel p-6 md:p-8">
                    <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-5">Вклад по партнёрам</h2>
                    <EconomicsTable rows={econ.byPartner} kind="partner" />
                  </div>
                </>
                )}
            </motion.div>
          ) : null}
        </>
      )}

      {/* PAYMENT RECONCILIATION TAB */}
      {activeTab === "payments" && (
        <motion.div id="payment-reconciliation" className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="trust-panel p-6 md:p-8">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              <div className="flex gap-4">
                <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0">
                  <CircleAlert className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground tracking-tight">Очередь сверки платежей</h2>
                  <p className="text-sm text-muted-foreground font-medium mt-1.5 max-w-2xl leading-relaxed">
                    Здесь отображаются незавершённые сделки и ошибки ответа провайдера. Проверка повторно запрашивает статус у провайдера и проводит сделку только после его подтверждения; возвраты из списка не запускаются.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <label className="text-xs font-bold text-muted-foreground">
                  Фильтр
                  <select
                    className="mt-2 min-w-44 px-3 py-2.5 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold"
                    value={paymentQueueStatus}
                    onChange={e => setPaymentQueueStatus(e.target.value as typeof paymentQueueStatus)}
                  >
                    <option value="all">Все незавершённые</option>
                    <option value="pending">Ожидают статуса</option>
                    <option value="payment_failed">Ошибки оплаты</option>
                    <option value="cancelled">Отменённые</option>
                  </select>
                </label>
                <button
                  className="mt-5 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-bold disabled:opacity-50"
                  onClick={() => refetchPaymentQueue()}
                  disabled={paymentQueueFetching}
                  title="Обновить очередь"
                >
                  <RefreshCw className={cn("w-4 h-4", paymentQueueFetching && "animate-spin")} />
                  Обновить
                </button>
              </div>
            </div>
            {paymentResolutionMessage && (
              <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary" role="status">
                {paymentResolutionMessage}
              </div>
            )}
            {paymentResolutionError && (
              <div className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive" role="alert">
                {paymentResolutionError}
              </div>
            )}
          </div>

          {paymentQueueLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="animate-pulse trust-panel h-24 bg-muted/50" />)}
            </div>
          ) : paymentQueueError ? (
            <div className="trust-panel p-8 text-center">
              <CircleAlert className="w-8 h-8 mx-auto text-destructive" />
              <h2 className="text-lg font-bold text-foreground mt-4">Не удалось загрузить очередь платежей</h2>
              <p className="text-sm text-muted-foreground mt-2">Данные не изменены. Проверьте доступ администратора и повторите запрос.</p>
              <button className="mt-5 px-5 py-3 rounded-xl bg-foreground text-background text-sm font-bold" onClick={() => refetchPaymentQueue()}>Повторить</button>
            </div>
          ) : paymentQueue ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="Требуют проверки" value={String(paymentQueue.summary.requiresReview)} sub="pending + ошибки" highlight={paymentQueue.summary.requiresReview > 0} isPositive={false} />
                <MetricCard label="Ожидают статуса" value={String(paymentQueue.summary.pending)} sub="у провайдера" />
                <MetricCard label="Ошибки оплаты" value={String(paymentQueue.summary.paymentFailed)} sub="нужна проверка причины" />
                <MetricCard label="Отменены" value={String(paymentQueue.summary.cancelled)} sub="без проводки" />
              </div>

              {paymentQueue.items.length ? (
                <div className="space-y-3">
                  {paymentQueue.items.map(item => (
                    <div key={item.id} className="trust-panel p-5 md:p-6">
                      <div className="flex flex-col xl:flex-row xl:items-center gap-5">
                        <div className="flex items-start gap-4 min-w-0 flex-1">
                          <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center shrink-0", paymentQueueStatusClass(item.status))}>
                            {item.status === "pending" ? <Clock3 className="w-4 h-4" /> : <CircleAlert className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-bold text-foreground">Сделка #{item.id}</span>
                              <span className={cn("px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider", paymentQueueStatusClass(item.status))}>
                                {paymentQueueStatusLabel(item.status)}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-foreground mt-2 truncate">{item.userName} · {item.userPhone}</p>
                            <p className="text-xs font-semibold text-muted-foreground mt-1">
                              {paymentQueueKindLabel(item.kind)}{item.partnerName ? ` · ${item.partnerName}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 xl:min-w-[560px]">
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Quote</p>
                            <p className="text-sm font-bold text-foreground mt-1">{formatRub(item.netAmountRub)}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Gross {formatRub(item.grossAmountRub)} · бонус {formatRub(item.bonusRedeemedRub)}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Комиссия {formatRub(item.feeAmountRub)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Provider ID</p>
                            <p className="text-sm font-bold text-foreground mt-1 truncate max-w-32" title={item.providerPaymentId ?? "Не назначен"}>{item.providerPaymentId ?? "Не назначен"}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{item.paymentProvider ?? "Провайдер не указан"} · {paymentMethodLabel(item.paymentMethod)}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Статус: {item.providerPaymentStatus ?? "не получен"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ключ запроса</p>
                            <p className="text-sm font-mono font-bold text-foreground mt-1 truncate max-w-40" title={item.idempotencyKey}>{item.idempotencyKey}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Политика v{item.policyVersion}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Создана</p>
                            <p className="text-sm font-bold text-foreground mt-1">{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.createdAt))}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Причина</p>
                            <p className="text-xs font-semibold text-foreground mt-1 line-clamp-2">{item.reviewReason}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border/70 pt-4">
                        <p className="text-[11px] text-muted-foreground">
                          {item.providerRefundStatus ? `Возврат: ${item.providerRefundStatus}` : "История возврата и проводок не изменяется этой проверкой"}
                        </p>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!item.providerPaymentId || resolvePayment.isPending}
                          onClick={() => resolvePayment.mutate({ id: item.id })}
                        >
                          <RefreshCw className={cn("h-4 w-4", resolvePayment.isPending && resolvePayment.variables?.id === item.id && "animate-spin")} />
                          {resolvePayment.isPending && resolvePayment.variables?.id === item.id
                            ? "Проверяем…"
                            : item.providerPaymentId ? "Проверить у провайдера" : "Нет ID провайдера"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="trust-panel p-10 text-center">
                  <CircleAlert className="w-8 h-8 mx-auto text-primary" />
                  <h2 className="text-xl font-bold text-foreground mt-4">В этой очереди нет платежей</h2>
                  <p className="text-sm text-muted-foreground mt-2">Все сделки выбранного типа находятся в согласованном состоянии.</p>
                </div>
              )}
            </>
          ) : null}
        </motion.div>
      )}

      {/* VERIFICATION QUEUE TAB */}
      {activeTab === "verification" && (
        <motion.div id="verification-review" className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="trust-panel p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <ShieldAlert className="h-5 w-5 text-amber-600" />
                  <h2 className="text-xl font-bold text-foreground">Очередь верификации</h2>
                </div>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-muted-foreground">
                  Проверяйте только необходимые метаданные и документ. Решение необратимо, а отказ требует понятного комментария для пользователя.
                </p>
              </div>
              <button type="button" onClick={() => refetchVerificationQueue()} disabled={verificationQueueFetching} className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background disabled:opacity-50">
                <RefreshCw className={cn("h-4 w-4", verificationQueueFetching && "animate-spin")} /> Обновить
              </button>
            </div>
          </div>
          {verificationDecisionError ? <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive" role="alert">{verificationDecisionError}</div> : null}
          {verificationQueueLoading ? (
            <div className="space-y-4">{[1, 2].map((item) => <div key={item} className="trust-panel h-44 animate-pulse bg-muted/50" />)}</div>
          ) : verificationQueueError ? (
            <div className="trust-panel p-10 text-center">
              <CircleAlert className="mx-auto h-8 w-8 text-destructive" />
              <h2 className="mt-4 text-xl font-bold text-foreground">Очередь недоступна</h2>
              <p className="mt-2 text-sm text-muted-foreground">Проверьте соединение и повторите загрузку.</p>
              <button type="button" onClick={() => refetchVerificationQueue()} className="mt-5 rounded-xl bg-foreground px-5 py-3 text-sm font-bold text-background">Повторить</button>
            </div>
          ) : verificationQueue?.length ? (
            <div className="space-y-4">
              {verificationQueue.map((item) => {
                const comment = verificationComments[item.id] ?? "";
                const isCurrent = decideVerification.isPending
                  && decideVerification.variables?.userId === item.user?.id
                  && decideVerification.variables?.verificationType === item.verificationType;
                return (
                  <article key={item.id} className="trust-panel p-5 md:p-6" data-testid={`verification-application-${item.id}`}>
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold text-foreground">{item.verificationType === "identity" ? "Паспортные данные" : "Подтверждение дохода"}</h3>
                          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">На проверке</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-muted-foreground">{item.user?.name ?? "Пользователь"} · {item.user?.phone ?? "Телефон скрыт"}</p>
                        <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                          <div><p className="font-bold uppercase tracking-wider text-muted-foreground">Файл</p><p className="mt-1 break-all font-semibold text-foreground">{item.fileName}</p></div>
                          <div><p className="font-bold uppercase tracking-wider text-muted-foreground">Размер</p><p className="mt-1 font-semibold text-foreground">{(item.fileSize / 1024 / 1024).toFixed(2)} МБ · {item.contentType}</p></div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted"
                        onClick={async () => {
                          const response = await fetch(`/api/users/verifications/${item.id}/document`, { headers: { Authorization: `Bearer ${getStoredToken() ?? ""}` } });
                          if (!response.ok) { setVerificationDecisionError("Документ недоступен. Обновите очередь."); return; }
                          const url = URL.createObjectURL(await response.blob());
                          window.open(url, "_blank", "noopener,noreferrer");
                          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                        }}
                      ><Eye className="h-4 w-4" /> Открыть документ</button>
                    </div>
                    <div className="mt-5 border-t border-border/70 pt-4">
                      <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Комментарий решения
                        <textarea
                          value={comment}
                          onChange={(event) => setVerificationComments((current) => ({ ...current, [item.id]: event.target.value }))}
                          placeholder="При отказе укажите, что нужно исправить"
                          maxLength={1000}
                          rows={2}
                          className="mt-2 w-full rounded-xl border border-border bg-input/30 px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap justify-end gap-3">
                        <button type="button" disabled={decideVerification.isPending} onClick={() => {
                          if (comment.trim().length < 3) { setVerificationDecisionError("Для отказа нужен комментарий не короче 3 символов."); return; }
                          decideVerification.mutate({ userId: item.user?.id ?? 0, verificationType: item.verificationType, data: { approved: false, comment: comment.trim() } });
                        }} className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm font-bold text-destructive disabled:opacity-50">Отклонить</button>
                        <button type="button" disabled={decideVerification.isPending || !item.user?.id} onClick={() => decideVerification.mutate({ userId: item.user?.id ?? 0, verificationType: item.verificationType, data: { approved: true, comment: comment.trim() || undefined } })} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
                          {isCurrent ? "Сохраняем…" : "Одобрить"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="trust-panel p-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
              <h2 className="mt-4 text-xl font-bold text-foreground">Очередь пуста</h2>
              <p className="mt-2 text-sm text-muted-foreground">Новых заявок на проверку нет.</p>
            </div>
          )}
        </motion.div>
      )}

      {/* BALANCE RECONCILIATION TAB */}
      {activeTab === "reconciliation" && (
        <motion.div id="reconciliation-review" className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="trust-panel p-5 md:p-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <WalletCards className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-bold text-foreground">Сверка балансов</h2>
                </div>
                <p className="text-sm text-muted-foreground font-medium mt-2 max-w-2xl">
                  Сравнение денежного и legacy-баланса пользователей. Исправления создают неизменяемую запись аудита.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  onClick={() => void exportReconciliation()}
                  disabled={reconciliationExporting}
                >
                  <Download className={cn("w-4 h-4", reconciliationExporting && "animate-pulse")} />
                  {reconciliationExporting ? "Подготовка…" : "Скачать CSV"}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                  onClick={() => void refreshReconciliation()}
                  disabled={reconciliationFetching || reconciliationDetailFetching}
                >
                  <RefreshCw className={cn("w-4 h-4", reconciliationFetching && "animate-spin")} />
                  Обновить
                </button>
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Период истории исправлений</p>
                <p className="text-xs font-medium text-muted-foreground">
                  Даты необязательны и включаются в выгрузку по UTC. Классификация выше применяется без изменений.
                </p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-muted-foreground">
                  Дата начала
                  <input
                    type="date"
                    value={reconciliationFromDate}
                    max={reconciliationToDate || undefined}
                    onChange={e => setReconciliationFromDate(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-input/50 px-3 py-2.5 text-sm font-semibold text-foreground"
                    aria-label="Дата начала истории исправлений"
                  />
                </label>
                <label className="text-xs font-bold text-muted-foreground">
                  Дата окончания
                  <input
                    type="date"
                    value={reconciliationToDate}
                    min={reconciliationFromDate || undefined}
                    onChange={e => setReconciliationToDate(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-input/50 px-3 py-2.5 text-sm font-semibold text-foreground"
                    aria-label="Дата окончания истории исправлений"
                  />
                </label>
              </div>
              {(reconciliationFromDate || reconciliationToDate) && (
                <p className="mt-3 text-xs font-semibold text-muted-foreground">
                  Повторная попытка использует выбранный период: {reconciliationFromDate || "с начала"} — {reconciliationToDate || "по настоящее время"}.
                </p>
              )}
            </div>
            {reconciliationExportError && (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive sm:flex-row sm:items-center sm:justify-between" role="alert">
                <div className="flex items-start gap-2">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{reconciliationExportError}</span>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-destructive/20 bg-background px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
                  onClick={() => void exportReconciliation()}
                  disabled={reconciliationExporting}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", reconciliationExporting && "animate-spin")} />
                  Повторить экспорт
                </button>
              </div>
            )}
          </div>

          {reconciliationReport && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MetricCard label="Всего пользователей" value={String(reconciliationReport.summary.totalUsers)} />
              <MetricCard label="Совпадают" value={String(reconciliationReport.summary.consistent)} highlight isPositive />
              <MetricCard label="Округление" value={String(reconciliationReport.summary.roundingDifference)} />
              <MetricCard label="Расхождение" value={String(reconciliationReport.summary.mismatch)} highlight isPositive={false} />
              <MetricCard label="Не мигрированы" value={String(reconciliationReport.summary.unmigrated)} />
            </div>
          )}

          <div className="trust-panel p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Очередь проверки</p>
                <p className="text-sm text-muted-foreground font-medium mt-1">Фильтр применяется на сервере и сохраняется при обновлении данных.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="text-xs font-bold text-muted-foreground">
                  Классификация
                  <select
                    className="mt-2 w-full sm:min-w-48 px-3 py-2.5 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold"
                    value={reconciliationStatus}
                    onChange={e => {
                      setReconciliationStatus(e.target.value as ReconciliationStatus);
                      resetReconciliationPage();
                    }}
                  >
                    <option value="mismatch">Расхождение</option>
                    <option value="unmigrated">Не мигрированы</option>
                    <option value="rounding_difference">Разница округления</option>
                    <option value="consistent">Совпадают</option>
                    <option value="all">Все классификации</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-muted-foreground">
                  На странице
                  <select
                    className="mt-2 w-full sm:min-w-28 px-3 py-2.5 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold"
                    value={reconciliationLimit}
                    onChange={e => {
                      setReconciliationLimit(Number(e.target.value) as 25 | 50 | 100);
                      resetReconciliationPage();
                    }}
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          {reconciliationLoading ? (
            <div className="grid lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="animate-pulse trust-panel h-24 bg-muted/50" />)}</div>
              <div className="lg:col-span-2 animate-pulse trust-panel min-h-80 bg-muted/50" />
            </div>
          ) : reconciliationError ? (
            <div className="trust-panel p-8 text-center" role="alert">
              <CircleAlert className="w-8 h-8 mx-auto text-destructive" />
              <h2 className="text-lg font-bold text-foreground mt-4">Не удалось загрузить данные сверки</h2>
              <p className="text-sm text-muted-foreground mt-2">Сервис временно не ответил. Выбранные параметры сохранены — повторите загрузку.</p>
              <button
                type="button"
                className="mt-5 px-5 py-3 rounded-xl bg-foreground text-background text-sm font-bold disabled:opacity-50"
                onClick={() => void refetchReconciliation()}
                disabled={reconciliationFetching}
              >
                {reconciliationFetching ? "Загрузка…" : "Повторить"}
              </button>
            </div>
          ) : (
            <div className="grid lg:grid-cols-5 gap-6 items-start">
              <div className="lg:col-span-3 space-y-3">
                {reconciliationReport?.items.length ? (
                  <>
                    <div className="hidden md:block trust-panel overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            <th className="p-4">Пользователь</th>
                            <th className="p-4">Статус</th>
                            <th className="p-4 text-right">Баллы</th>
                            <th className="p-4 text-right">Баланс</th>
                            <th className="p-4 text-right">Разница</th>
                            <th className="p-4 text-right"> </th>
                          </tr>
                        </thead>
                        <tbody>
                          {reconciliationReport.items.map(item => (
                            <tr
                              key={item.userId}
                              className={cn(
                                "border-b border-border/70 last:border-0 transition-colors",
                                selectedReconciliationUserId === item.userId ? "bg-primary/5" : "hover:bg-muted/40",
                              )}
                            >
                              <td className="p-4 min-w-48">
                                <button type="button" className="text-left" onClick={() => selectReconciliationUser(item.userId)}>
                                  <p className="font-bold text-foreground">{item.name || "Без имени"}</p>
                                  <p className="text-xs text-muted-foreground mt-1">{item.phone} · ID #{item.userId}</p>
                                </button>
                              </td>
                              <td className="p-4">
                                <span className={cn("inline-flex px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap", reconciliationStatusClass(item.status))}>
                                  {reconciliationStatusLabel(item.status)}
                                </span>
                              </td>
                              <td className="p-4 text-right font-bold text-foreground whitespace-nowrap">{item.pointsBalance.toLocaleString("ru-RU")}</td>
                              <td className="p-4 text-right font-semibold text-foreground whitespace-nowrap">{rubOrDash(item.bonusBalanceRub)}</td>
                              <td className={cn("p-4 text-right font-bold whitespace-nowrap", item.differenceRub && item.differenceRub !== 0 ? "text-destructive" : "text-muted-foreground")}>{reconciliationDifferenceLabel(item.differenceRub)}</td>
                              <td className="p-4 text-right">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
                                  onClick={() => selectReconciliationUser(item.userId)}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Открыть
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="md:hidden space-y-3">
                      {reconciliationReport.items.map(item => (
                        <button
                          type="button"
                          key={item.userId}
                          className={cn("w-full trust-panel p-4 text-left transition-colors", selectedReconciliationUserId === item.userId && "border-primary bg-primary/5")}
                          onClick={() => selectReconciliationUser(item.userId)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-foreground truncate">{item.name || "Без имени"}</p>
                              <p className="text-xs text-muted-foreground mt-1">{item.phone} · ID #{item.userId}</p>
                            </div>
                            <span className={cn("shrink-0 px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider", reconciliationStatusClass(item.status))}>
                              {reconciliationStatusLabel(item.status)}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-border/70">
                            <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Баллы</p><p className="text-sm font-bold mt-1">{item.pointsBalance.toLocaleString("ru-RU")}</p></div>
                            <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Баланс</p><p className="text-sm font-bold mt-1">{rubOrDash(item.bonusBalanceRub)}</p></div>
                            <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Разница</p><p className="text-sm font-bold mt-1">{reconciliationDifferenceLabel(item.differenceRub)}</p></div>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Показано {reconciliationOffset + 1}–{reconciliationOffset + reconciliationReport.items.length} из {reconciliationReport.summary[reconciliationStatus === "all" ? "totalUsers" : reconciliationStatus === "rounding_difference" ? "roundingDifference" : reconciliationStatus]}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-50"
                          disabled={reconciliationOffset === 0 || reconciliationFetching}
                          onClick={() => setReconciliationOffset(Math.max(0, reconciliationOffset - reconciliationLimit))}
                        >
                          <ChevronLeft className="w-4 h-4" /> Назад
                        </button>
                        <span className="text-xs font-bold text-muted-foreground min-w-16 text-center">Стр. {Math.floor(reconciliationOffset / reconciliationLimit) + 1}</span>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-50"
                          disabled={reconciliationFetching || reconciliationOffset + reconciliationReport.items.length >= (reconciliationStatus === "all" ? reconciliationReport.summary.totalUsers : reconciliationReport.summary[reconciliationStatus === "rounding_difference" ? "roundingDifference" : reconciliationStatus])}
                          onClick={() => setReconciliationOffset(reconciliationOffset + reconciliationLimit)}
                        >
                          Вперёд <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="trust-panel p-10 text-center">
                    <WalletCards className="w-8 h-8 mx-auto text-primary" />
                    <h2 className="text-xl font-bold text-foreground mt-4">По этому фильтру пользователей нет</h2>
                    <p className="text-sm text-muted-foreground mt-2">Выберите другую классификацию, чтобы продолжить проверку.</p>
                  </div>
                )}
              </div>

              <div id="reconciliation-detail" className="lg:col-span-2 lg:sticky lg:top-6">
                {selectedReconciliationUserId === null ? (
                  <div className="trust-panel p-8 text-center">
                    <Eye className="w-8 h-8 mx-auto text-muted-foreground" />
                    <h2 className="text-lg font-bold text-foreground mt-4">Выберите пользователя</h2>
                    <p className="text-sm text-muted-foreground mt-2">Откройте запись слева, чтобы увидеть баланс и историю исправлений.</p>
                  </div>
                ) : reconciliationDetailLoading ? (
                  <div className="trust-panel p-8 animate-pulse min-h-96 bg-muted/50" />
                ) : reconciliationDetailError || !reconciliationDetail ? (
                  <div className="trust-panel p-8 text-center">
                    <CircleAlert className="w-8 h-8 mx-auto text-destructive" />
                    <h2 className="text-lg font-bold text-foreground mt-4">Не удалось загрузить пользователя</h2>
                    <p className="text-sm text-muted-foreground mt-2">Запись могла измениться. Обновите данные и повторите.</p>
                    <button className="mt-5 px-5 py-3 rounded-xl bg-foreground text-background text-sm font-bold" onClick={() => void refetchReconciliationDetail()}>Обновить данные</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="trust-panel p-5 md:p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-lg font-bold text-foreground truncate">{reconciliationDetail.name || "Без имени"}</p>
                          <p className="text-xs text-muted-foreground mt-1">{reconciliationDetail.phone} · ID #{reconciliationDetail.userId}</p>
                        </div>
                        <span className={cn("shrink-0 px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider", reconciliationStatusClass(reconciliationDetail.status))}>
                          {reconciliationStatusLabel(reconciliationDetail.status)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-5">
                        <div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Баллы сейчас</p><p className="text-lg font-bold mt-1">{reconciliationDetail.pointsBalance.toLocaleString("ru-RU")}</p></div>
                        <div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Денежный баланс</p><p className="text-lg font-bold mt-1">{rubOrDash(reconciliationDetail.bonusBalanceRub)}</p></div>
                        <div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ожидается по legacy</p><p className="text-lg font-bold mt-1">{formatRub(reconciliationDetail.expectedBalanceRub)}</p></div>
                        <div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Разница</p><p className="text-lg font-bold mt-1">{reconciliationDifferenceLabel(reconciliationDetail.differenceRub)}</p></div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-4">Эквивалент legacy: {reconciliationDetail.legacyEquivalentPoints === null ? "—" : `${reconciliationDetail.legacyEquivalentPoints.toLocaleString("ru-RU")} баллов`}</p>
                    </div>

                    <div className="trust-panel p-5 md:p-6">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-primary" />
                        <h3 className="text-base font-bold text-foreground">История исправлений</h3>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Только чтение · записи нельзя изменить или удалить</p>
                      {reconciliationDetail.corrections.length ? (
                        <div className="space-y-3 mt-5">
                          {reconciliationDetail.corrections.map(correction => (
                            <div key={correction.id} className="rounded-xl border border-border bg-muted/20 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs font-bold text-foreground">{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(correction.createdAt))}</p>
                                  <p className="text-[11px] text-muted-foreground mt-1">Оператор #{correction.operatorUserId} · коррекция #{correction.id}</p>
                                </div>
                                <span className="px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold">{correctionTargetLabel(correction.correctionTarget)}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                                <p className="text-muted-foreground">Баллы: <span className="font-bold text-foreground">{correction.beforePointsBalance.toLocaleString("ru-RU")} → {correction.afterPointsBalance.toLocaleString("ru-RU")}</span></p>
                                <p className="text-muted-foreground">Баланс: <span className="font-bold text-foreground">{rubOrDash(correction.beforeBonusBalanceRub)} → {formatRub(correction.afterBonusBalanceRub)}</span></p>
                              </div>
                              <p className="text-xs text-foreground mt-3"><span className="text-muted-foreground">Причина:</span> {correction.reason}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-5">Исправлений ещё не было.</p>
                      )}
                    </div>

                    <div className={cn("trust-panel p-5 md:p-6", !reconciliationDetail.canCorrect && "bg-muted/30")}>
                      <h3 className="text-base font-bold text-foreground">Исправление баланса</h3>
                      {!reconciliationDetail.canCorrect ? (
                        <p className="text-sm text-muted-foreground mt-2">Исправление не требуется: текущие значения уже согласованы или отличаются только в пределах допустимого округления.</p>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground mt-2">Выберите значение, которое нужно сохранить. Операция будет записана в аудит.</p>
                          <div className="space-y-2 mt-4">
                            <label className="flex items-start gap-3 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/40">
                              <input type="radio" name="correction-target" value="monetary" checked={correctionTarget === "monetary"} onChange={() => setCorrectionTarget("monetary")} className="mt-1" />
                              <span><span className="block text-sm font-bold text-foreground">Сохранить денежный баланс</span><span className="block text-xs text-muted-foreground mt-1">Баллы будут пересчитаны по ставке 0,80 ₽.</span></span>
                            </label>
                            <label className="flex items-start gap-3 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/40">
                              <input type="radio" name="correction-target" value="points" checked={correctionTarget === "points"} onChange={() => setCorrectionTarget("points")} className="mt-1" />
                              <span><span className="block text-sm font-bold text-foreground">Сохранить баланс в баллах</span><span className="block text-xs text-muted-foreground mt-1">Денежная сумма будет синхронизирована с баллами.</span></span>
                            </label>
                          </div>
                          <label className="block mt-4">
                            <span className="text-xs font-bold text-muted-foreground">Причина исправления</span>
                            <textarea
                              className="mt-2 w-full min-h-24 px-3 py-2.5 rounded-xl bg-input/50 border border-border text-foreground text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-y"
                              placeholder="Опишите источник расхождения"
                              minLength={3}
                              maxLength={500}
                              value={correctionReason}
                              onChange={e => setCorrectionReason(e.target.value)}
                            />
                            <span className={cn("block text-[11px] mt-1 text-right", correctionReason.trim().length > 500 || (correctionReason.length > 0 && correctionReason.trim().length < 3) ? "text-destructive" : "text-muted-foreground")}>
                              {correctionReason.length}/500 · минимум 3 символа
                            </span>
                          </label>
                          {correctionError && (
                            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm font-semibold text-destructive" role="alert">
                              <p>{correctionError}</p>
                              <button type="button" className="mt-2 underline underline-offset-2" onClick={() => void refetchReconciliationDetail()}>Обновить данные</button>
                            </div>
                          )}
                          {correctionMessage && (
                            <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm font-semibold text-primary" role="status">
                              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                              <span>{correctionMessage}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            className="w-full mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={correctionReason.trim().length < 3 || correctionReason.trim().length > 500 || correctBalance.isPending || reconciliationDetailFetching}
                            onClick={requestBalanceCorrection}
                          >
                            {correctBalance.isPending ? "Применяем…" : "Проверить и исправить"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {correctionConfirmOpen && reconciliationDetail && !reconciliationDetailError && reconciliationDetail.canCorrect && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="correction-confirm-title">
              <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-5 md:p-6 shadow-xl">
                <h2 id="correction-confirm-title" className="text-lg font-bold text-foreground">Подтвердить исправление?</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Для пользователя {reconciliationDetail.name || reconciliationDetail.phone} будет сохранён {correctionTargetLabel(correctionTarget)}. Остальное значение пересчитается.
                </p>
                <div className="rounded-xl bg-muted/50 p-3 mt-4 text-sm">
                  <p className="font-bold text-foreground">Причина</p>
                  <p className="text-muted-foreground mt-1 break-words">{correctionReason.trim()}</p>
                </div>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5">
                  <button type="button" className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted" onClick={() => setCorrectionConfirmOpen(false)}>Отмена</button>
                  <button type="button" className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background hover:opacity-90 disabled:opacity-50" disabled={correctBalance.isPending || reconciliationDetailFetching || !reconciliationDetail.canCorrect} onClick={submitBalanceCorrection}>
                    {correctBalance.isPending ? "Применяем…" : "Подтвердить исправление"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* PARTNERS TAB */}
      {activeTab === "partners" && (
        <motion.div className="grid lg:grid-cols-5 gap-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Create partner form */}
          <div className="lg:col-span-2 trust-panel p-6 md:p-8 h-fit">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{editingPartnerId ? "Редактирование партнёра" : "Регистрация партнёра"}</h2>
              {editingPartnerId && (
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" onClick={resetPartnerForm} aria-label="Отменить редактирование">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="space-y-4">
              <input
                className="w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                placeholder="Название *"
                value={partnerForm.name}
                onChange={e => setPartnerForm(f => ({ ...f, name: e.target.value }))}
              />
              <select
                className="w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                value={partnerForm.category}
                onChange={e => setPartnerForm(f => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <div className="flex gap-3">
                <input
                  className="flex-1 px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  placeholder="Множитель (напр. 2)"
                  type="number" min="1" max="10" step="0.1"
                  value={partnerForm.bonusMultiplier}
                  onChange={e => setPartnerForm(f => ({ ...f, bonusMultiplier: e.target.value }))}
                />
                <input
                  className="flex-1 px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  placeholder="Город"
                  value={partnerForm.city}
                  onChange={e => setPartnerForm(f => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest" htmlFor="partner-logo-file">Логотип бренда</label>
                <input
                  id="partner-logo-file"
                  className="w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-semibold"
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setPartnerForm(f => ({ ...f, logoFile: file, logoObjectPath: "", logoUrl: "" }));
                    }
                  }}
                />
                <input
                  id="partner-logo-url"
                  className="w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  placeholder="https://example.com/logo.svg (необязательно)"
                  type="url"
                  value={partnerForm.logoUrl}
                  onChange={e => setPartnerForm(f => ({ ...f, logoUrl: e.target.value, logoObjectPath: "", logoFile: null }))}
                />
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3 bg-muted/20">
                  <PartnerLogo
                    name={partnerForm.name}
                    logoUrl={logoPreviewUrl || (partnerForm.logoObjectPath ? `/api/storage${partnerForm.logoObjectPath}` : partnerForm.logoUrl)}
                    className="w-14 h-14 rounded-xl bg-muted border border-border text-foreground shrink-0 text-2xl"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">Предпросмотр</p>
                    <p className="text-[11px] text-muted-foreground mt-1 truncate">
                      {partnerForm.logoFile?.name || partnerForm.logoObjectPath || partnerForm.logoUrl.trim() || "Будет показана первая буква названия"}
                    </p>
                  </div>
                </div>
                {logoUploadError && <p className="text-xs font-semibold text-destructive">{logoUploadError}</p>}
              </div>
              <textarea
                className="w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none transition-all"
                placeholder="Описание"
                rows={3}
                value={partnerForm.description}
                onChange={e => setPartnerForm(f => ({ ...f, description: e.target.value }))}
              />
              <button
                className="w-full py-3.5 rounded-xl bg-foreground text-background font-bold text-sm hover:bg-foreground/90 transition-all disabled:opacity-50 active:scale-[0.98] shadow-md"
                 disabled={!partnerForm.name || isUploadingLogo || createPartner.isPending || updatePartner.isPending}
                 onClick={submitPartner}
              >
                 {isUploadingLogo || createPartner.isPending || updatePartner.isPending ? "Сохраняем…" : editingPartnerId ? "Сохранить изменения" : "Добавить партнёра"}
              </button>
            </div>
          </div>

          {/* Partner list */}
          <div className="lg:col-span-3 trust-panel p-6 md:p-8">
            <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-6">Реестр партнёров</h2>
            {partnersLoading ? (
              <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="animate-pulse h-16 rounded-xl bg-muted/50 border border-border" />)}</div>
            ) : partners?.length ? (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                {partners.map(p => (
                  <div key={p.id} className="flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted/40 transition-colors shadow-sm">
                    <PartnerLogo name={p.name} logoUrl={p.logoUrl ?? ""} className="w-12 h-12 rounded-lg bg-muted border border-border text-foreground text-lg shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-foreground truncate tracking-tight">{p.name}</p>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{CATEGORY_LABELS[p.category] ?? p.category} · {p.bonusMultiplier}×</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="w-10 h-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center active:scale-[0.95]"
                        onClick={() => {
                          setEditingPartnerId(p.id);
                          setPartnerForm({
                            name: p.name,
                            category: p.category,
                            bonusMultiplier: String(p.bonusMultiplier),
                            description: p.description ?? "",
                            city: p.city ?? "",
                            logoUrl: p.logoObjectPath ? "" : p.logoUrl ?? "",
                            logoObjectPath: p.logoObjectPath ?? "",
                            logoFile: null,
                          });
                        }}
                        aria-label={`Редактировать ${p.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        className="w-10 h-10 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center shrink-0 active:scale-[0.95]"
                        onClick={() => deletePartner.mutate({ id: p.id })}
                        aria-label={`Удалить ${p.name}`}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-semibold text-muted-foreground text-center py-12">Список пуст</p>
            )}
          </div>
        </motion.div>
      )}

      {/* OFFERS TAB */}
      {activeTab === "offers" && (
        <motion.div className="grid lg:grid-cols-5 gap-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Create or edit offer form */}
          <div className="lg:col-span-2 trust-panel p-6 md:p-8 h-fit">
            <div className="flex items-center justify-between gap-3 mb-6">
              <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{editingOfferId !== null ? "Редактирование оффера" : "Публикация оффера"}</h2>
              {editingOfferId !== null && (
                <button className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground" onClick={resetOfferForm}>
                  <X className="w-3.5 h-3.5" /> Отмена
                </button>
              )}
            </div>
            <div className="space-y-4">
              <select
                className="w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                value={offerForm.partnerId}
                onChange={e => setOfferForm(f => ({ ...f, partnerId: e.target.value }))}
              >
                <option value="">Выберите партнёра *</option>
                {partners?.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </select>
              <input
                className="w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                placeholder="Заголовок *"
                value={offerForm.title}
                onChange={e => setOfferForm(f => ({ ...f, title: e.target.value }))}
              />
              <select
                className="w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                value={offerForm.category}
                onChange={e => setOfferForm(f => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <div className="flex gap-3">
                <input
                  className="flex-1 px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  placeholder="Множитель"
                  type="number" min="1" max="10" step="0.1"
                  value={offerForm.bonusMultiplier}
                  onChange={e => setOfferForm(f => ({ ...f, bonusMultiplier: e.target.value }))}
                />
                <input
                  className="flex-1 px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-muted-foreground transition-all"
                  type="date"
                  value={offerForm.expiresAt}
                  onChange={e => setOfferForm(f => ({ ...f, expiresAt: e.target.value }))}
                />
              </div>
              <textarea
                className="w-full px-4 py-3 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none transition-all"
                placeholder="Условия"
                rows={3}
                value={offerForm.description}
                onChange={e => setOfferForm(f => ({ ...f, description: e.target.value }))}
              />
              <button
                className="w-full py-3.5 rounded-xl bg-foreground text-background font-bold text-sm hover:bg-foreground/90 transition-all disabled:opacity-50 active:scale-[0.98] shadow-md"
                disabled={!offerForm.partnerId || !offerForm.title || !offerForm.expiresAt || createOffer.isPending || updateOffer.isPending}
                onClick={submitOffer}
              >
                {createOffer.isPending || updateOffer.isPending ? "Сохраняем…" : editingOfferId !== null ? "Сохранить изменения" : "Опубликовать"}
              </button>
            </div>
          </div>

          {/* Offer list */}
          <div className="lg:col-span-3 trust-panel p-6 md:p-8">
            <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-6">Активные офферы</h2>
            {offersLoading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse h-16 rounded-xl bg-muted/50 border border-border" />)}</div>
            ) : offers?.length ? (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                {offers.map(o => (
                  <div key={o.id} className="flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted/40 transition-colors shadow-sm">
                    <div className="w-12 h-12 rounded-lg bg-background border border-border shadow-sm flex items-center justify-center font-bold text-foreground text-sm shrink-0">
                      {o.bonusMultiplier}×
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-foreground truncate tracking-tight">{o.title}</p>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{o.partnerName} · до {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(o.expiresAt))}</p>
                    </div>
                    <button
                      className="w-10 h-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center shrink-0 active:scale-[0.95]"
                      onClick={() => {
                        setEditingOfferId(o.id);
                        setOfferForm({
                          partnerId: String(o.partnerId),
                          title: o.title,
                          bonusMultiplier: String(o.bonusMultiplier),
                          category: o.category,
                          expiresAt: o.expiresAt.slice(0, 10),
                          description: o.description ?? "",
                        });
                      }}
                      aria-label={`Редактировать ${o.title}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      className="w-10 h-10 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center shrink-0 active:scale-[0.95]"
                      onClick={() => deleteOffer.mutate({ id: o.id })}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-semibold text-muted-foreground text-center py-12">Список пуст</p>
            )}
          </div>
        </motion.div>
      )}

      {/* LOGO CLEANUP TAB */}
      {activeTab === "logoCleanup" && (
        <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="logo-cleanup-panel">
          <div className="trust-panel p-5 md:p-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Проверка логотипов</h2>
                  <p className="text-sm text-muted-foreground font-medium mt-2 max-w-2xl leading-relaxed">
                    Найдите файлы логотипов, которые больше не привязаны к партнёрам. Сначала выполняется безопасная проверка без удаления; удалить можно только после просмотра её результата.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
                onClick={requestLogoCleanupReview}
                disabled={cleanupLogos.isPending}
                data-testid="logo-cleanup-dry-run"
              >
                <RefreshCw className={cn("w-4 h-4", cleanupLogos.isPending && "animate-spin")} />
                {cleanupLogos.isPending ? "Проверяем…" : "Запустить проверку"}
              </button>
            </div>
            {logoCleanupMessage && (
              <div className="mt-5 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary" role="status">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{logoCleanupMessage}</span>
              </div>
            )}
            {logoCleanupError && (
              <div className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive" role="alert">
                {logoCleanupError}
              </div>
            )}
          </div>

          {!logoCleanupResult ? (
            <div className="trust-panel p-10 text-center">
              <ShieldAlert className="w-8 h-8 mx-auto text-muted-foreground" />
              <h2 className="text-xl font-bold text-foreground mt-4">Проверка ещё не запускалась</h2>
              <p className="text-sm text-muted-foreground mt-2">Запустите dry-run, чтобы увидеть, какие объекты будут затронуты.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Последний результат</p>
                  <p className="text-sm font-semibold text-foreground mt-1">
                    {logoCleanupResult.dryRun ? "Предпросмотр — файлы ещё не удалялись" : "Очистка подтверждена и выполнена"}
                  </p>
                </div>
                {logoCleanupResult.dryRun && logoCleanupResult.orphaned.length > 0 && (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-bold text-destructive-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setLogoCleanupConfirmOpen(true)}
                    disabled={cleanupLogos.isPending}
                    data-testid="logo-cleanup-confirm-open"
                  >
                    <Trash2 className="w-4 h-4" />
                    Подтвердить удаление ({logoCleanupResult.orphaned.length})
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <MetricCard label="Проверено" value={String(logoCleanupResult.scanned)} sub="управляемых объектов" />
                <MetricCard label="Привязано" value={String(logoCleanupResult.referenced)} sub="используются партнёрами" />
                <MetricCard label="Осиротело" value={String(logoCleanupResult.orphaned.length)} sub="кандидаты на удаление" highlight={logoCleanupResult.orphaned.length > 0} isPositive={false} />
                <MetricCard label="Удалено" value={String(logoCleanupResult.removed.length)} sub="после подтверждения" highlight={logoCleanupResult.removed.length > 0} isPositive />
                <MetricCard label="Ошибки" value={String(logoCleanupResult.failed.length)} sub="не удалось удалить" highlight={logoCleanupResult.failed.length > 0} isPositive={false} />
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <CleanupPathList
                  title="Осиротевшие пути"
                  paths={logoCleanupResult.orphaned}
                  emptyLabel="Осиротевших объектов не найдено."
                />
                <CleanupPathList
                  title="Удалённые пути"
                  paths={logoCleanupResult.removed}
                  emptyLabel={logoCleanupResult.dryRun ? "В dry-run удаление не выполняется." : "Объекты не удалены."}
                />
              </div>

              {logoCleanupResult.failed.length > 0 && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
                  <div className="flex items-center gap-2">
                    <CircleAlert className="w-4 h-4 text-destructive" />
                    <p className="text-xs font-bold uppercase tracking-widest text-destructive">Ошибки удаления</p>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {logoCleanupResult.failed.map(item => (
                      <li key={item.path} className="rounded-lg border border-destructive/20 bg-background px-3 py-2">
                        <p className="break-all font-mono text-xs text-foreground">{item.path}</p>
                        <p className="mt-1 text-xs font-semibold text-destructive">{item.error}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {logoCleanupResult.dryRun && logoCleanupResult.orphaned.length === 0 && (
                <div className="trust-panel p-8 text-center">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-primary" />
                  <h2 className="text-lg font-bold text-foreground mt-4">Осиротевших логотипов нет</h2>
                  <p className="text-sm text-muted-foreground mt-2">Удаление не требуется.</p>
                </div>
              )}
            </>
          )}

          {logoCleanupConfirmOpen && logoCleanupResult?.dryRun && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="logo-cleanup-confirm-title">
              <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-5 md:p-6 shadow-xl">
                <h2 id="logo-cleanup-confirm-title" className="text-lg font-bold text-foreground">Подтвердить удаление?</h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Будут удалены только {logoCleanupResult.orphaned.length} объекта, которые сейчас не привязаны к партнёрам. Сервер повторно проверит список перед удалением.
                </p>
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm font-semibold text-amber-800">
                  Это действие нельзя отменить.
                </div>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5">
                  <button
                    type="button"
                    className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted"
                    onClick={() => setLogoCleanupConfirmOpen(false)}
                    disabled={cleanupLogos.isPending}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-destructive px-4 py-2.5 text-sm font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                    onClick={confirmLogoCleanup}
                    disabled={cleanupLogos.isPending}
                    data-testid="logo-cleanup-confirm"
                  >
                    {cleanupLogos.isPending ? "Удаляем…" : "Удалить найденные объекты"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <section className="space-y-4" aria-labelledby="logo-cleanup-history-title" data-testid="logo-cleanup-history">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  <h2 id="logo-cleanup-history-title" className="text-xl font-bold text-foreground">История проверок</h2>
                </div>
                <p className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground">
                  Неизменяемая история запусков: кто выполнял проверку, в каком режиме и какие пути были найдены.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <label htmlFor="logo-cleanup-history-status" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Показать
                  </label>
                  <select
                    id="logo-cleanup-history-status"
                    className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    value={logoCleanupHistoryStatus}
                    onChange={(event) => setLogoCleanupHistoryStatus(event.target.value as "all" | "failed")}
                    data-testid="logo-cleanup-history-status"
                  >
                    <option value="all">Все запуски</option>
                    <option value="failed">Только с ошибками</option>
                  </select>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-50"
                    onClick={() => void refetchLogoCleanupHistory()}
                    disabled={logoCleanupHistoryFetching}
                  >
                    <RefreshCw className={cn("w-4 h-4", logoCleanupHistoryFetching && "animate-spin")} />
                    Обновить историю
                  </button>
                </div>
                {logoCleanupHistoryStatus === "failed" && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive"
                    data-testid="logo-cleanup-history-filter-active"
                  >
                    Показаны только запуски с ошибками удаления
                  </span>
                )}
              </div>
            </div>

            {logoCleanupHistoryLoading ? (
              <div className="space-y-3" aria-label="Загрузка истории">
                {[...Array(2)].map((_, index) => <div key={index} className="trust-panel h-36 animate-pulse bg-muted/50" />)}
              </div>
            ) : logoCleanupHistoryError ? (
              <div className="trust-panel p-8 text-center" role="alert">
                <CircleAlert className="mx-auto h-8 w-8 text-destructive" />
                <p className="mt-3 text-sm font-semibold text-destructive">Не удалось загрузить историю запусков.</p>
                <button
                  type="button"
                  className="mt-4 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background"
                  onClick={() => void refetchLogoCleanupHistory()}
                >
                  Повторить
                </button>
              </div>
            ) : logoCleanupHistory?.length ? (
              <div className="space-y-3">
                {logoCleanupHistory.map((entry) => <LogoCleanupHistoryEntry key={entry.id} entry={entry} />)}
              </div>
            ) : (
              <div className="trust-panel p-8 text-center">
                <History className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold text-muted-foreground">
                  {logoCleanupHistoryStatus === "failed"
                    ? "Запусков с ошибками удаления не найдено."
                    : "История запусков пока пуста."}
                </p>
              </div>
            )}
          </section>
        </motion.div>
      )}

      {/* AUDIT TAB */}
      {activeTab === "audit" && (
        <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="trust-panel p-5 md:p-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileClock className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-bold text-foreground">Журнал изменений каталога</h2>
                </div>
                <p className="text-sm text-muted-foreground font-medium mt-2">
                  Кто, когда и что изменил в партнёрах и офферах. История доступна только администраторам.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-bold text-muted-foreground">
                  Сущность
                  <select
                    className="mt-2 min-w-36 px-3 py-2.5 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold"
                    value={auditEntityType}
                    onChange={e => setAuditEntityType(e.target.value as typeof auditEntityType)}
                  >
                    <option value="all">Все</option>
                    <option value="partner">Партнёры</option>
                    <option value="offer">Офферы</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-muted-foreground">
                  Действие
                  <select
                    className="mt-2 min-w-36 px-3 py-2.5 rounded-xl bg-input/50 border border-border text-foreground text-sm font-semibold"
                    value={auditAction}
                    onChange={e => setAuditAction(e.target.value as typeof auditAction)}
                  >
                    <option value="all">Все</option>
                    <option value="create">Создание</option>
                    <option value="update">Изменение</option>
                    <option value="delete">Удаление</option>
                  </select>
                </label>
                <button
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-bold disabled:opacity-50"
                  onClick={() => refetchAudit()}
                  disabled={auditFetching}
                  title="Обновить журнал"
                >
                  <RefreshCw className={cn("w-4 h-4", auditFetching && "animate-spin")} />
                  Обновить
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm font-bold hover:bg-muted disabled:opacity-50"
                  onClick={() => void exportAuditLog()}
                  disabled={auditExporting}
                  title="Скачать отфильтрованный журнал"
                >
                  <Download className={cn("w-4 h-4", auditExporting && "animate-pulse")} />
                  {auditExporting ? "Подготовка…" : "Скачать CSV"}
                </button>
              </div>
            </div>
            {auditExportError && (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive sm:flex-row sm:items-center sm:justify-between" role="alert">
                <div className="flex items-start gap-2">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{auditExportError}</span>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-destructive/20 bg-background px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
                  onClick={() => void exportAuditLog()}
                  disabled={auditExporting}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", auditExporting && "animate-spin")} />
                  Повторить экспорт
                </button>
              </div>
            )}
          </div>

          {auditLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="animate-pulse trust-panel h-28 bg-muted/50" />)}</div>
          ) : auditError ? (
            <div className="trust-panel p-8 text-center">
              <CircleAlert className="w-8 h-8 mx-auto text-destructive" />
              <h2 className="text-lg font-bold text-foreground mt-4">Не удалось загрузить журнал</h2>
              <p className="text-sm text-muted-foreground mt-2">Проверьте доступ администратора и повторите запрос.</p>
              <button className="mt-5 px-5 py-3 rounded-xl bg-foreground text-background text-sm font-bold" onClick={() => refetchAudit()}>Повторить</button>
            </div>
          ) : auditLog?.length ? (
            <div className="space-y-3">
              {auditLog.map(entry => (
                <div key={entry.id} className="trust-panel p-5 md:p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-foreground">{entry.entityName}</span>
                        <span className="px-2 py-1 rounded-md border border-primary/20 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
                          {auditEntityLabel(entry.entityType)}
                        </span>
                        <span className="px-2 py-1 rounded-md border border-border bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                          {auditActionLabel(entry.action)}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-muted-foreground mt-2">
                        {entry.adminName}{entry.adminPhone ? ` · ${entry.adminPhone}` : ""} · {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:max-w-[65%] lg:justify-end">
                      {Object.entries(entry.changes).map(([field, change]) => (
                        <span key={field} className="text-xs font-semibold text-foreground bg-muted/60 border border-border rounded-lg px-3 py-2">
                          <span className="text-muted-foreground">{field}:</span> {auditValueLabel(change.from)} → {auditValueLabel(change.to)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="trust-panel p-10 text-center">
              <FileClock className="w-8 h-8 mx-auto text-primary" />
              <h2 className="text-xl font-bold text-foreground mt-4">История пока пуста</h2>
              <p className="text-sm text-muted-foreground mt-2">Изменения партнёров и офферов появятся здесь после публикации.</p>
            </div>
          )}
        </motion.div>
      )}

      {/* HISTORICAL DEAL AUDIT TAB */}
      {activeTab === "dealAudit" && (
        <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="economics-audit-panel">
          <div className="trust-panel p-5 md:p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Аудит исторических сделок</h2>
                  <p className="text-sm text-muted-foreground font-medium mt-2 max-w-2xl leading-relaxed">
                    Проверка подтверждённых сделок и проводок ledger. Раздел доступен только для просмотра: финансовые записи здесь нельзя изменить.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
                onClick={startNewEconomicsAuditReview}
                disabled={economicsAuditFetching}
                title="Обновить аудит сделок"
              >
                <RefreshCw className={cn("w-4 h-4", economicsAuditFetching && "animate-spin")} />
                Новый срез
              </button>
            </div>
          </div>

          {economicsAuditLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, index) => <div key={index} className="animate-pulse trust-panel h-36 bg-muted/50" />)}</div>
          ) : economicsAuditError ? (
            <div className="trust-panel p-8 text-center">
              <CircleAlert className="w-8 h-8 mx-auto text-destructive" />
              <h2 className="text-lg font-bold text-foreground mt-4">Не удалось загрузить аудит сделок</h2>
              <p className="text-sm text-muted-foreground mt-2">Данные не изменены. Проверьте доступ администратора и повторите запрос.</p>
              <button type="button" className="mt-5 px-5 py-3 rounded-xl bg-foreground text-background text-sm font-bold" onClick={() => void refetchEconomicsAudit()}>Повторить</button>
            </div>
          ) : economicsAudit ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <MetricCard label="Проверено" value={String(economicsAudit.checkedDeals)} sub="подтверждённых сделок" />
                <MetricCard label="Без расхождений" value={String(economicsAudit.cleanDeals)} sub="ledger согласован" highlight isPositive />
                <MetricCard label="С расхождениями" value={String(economicsAudit.discrepantDeals)} sub="требуют просмотра" highlight={economicsAudit.discrepantDeals > 0} isPositive={false} />
              </div>

              <div className="trust-panel p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">История сделок</p>
                  <p className="text-xs font-semibold text-muted-foreground mt-1">
                    Страница {economicsAuditPage} из {economicsAuditTotalPages} · показываем {economicsAudit.results.length} из {economicsAudit.checkedDeals}
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground mt-1">
                    Срез зафиксирован: {new Date(economicsAudit.snapshotAt).toLocaleString("ru-RU", { timeZone: "UTC" })} UTC · новые сделки появятся после нового среза
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-muted-foreground">
                    На странице
                    <select
                      className="ml-2 rounded-lg border border-border bg-input/50 px-2.5 py-2 text-sm font-semibold text-foreground"
                      value={economicsAuditLimit}
                      onChange={(event) => {
                        setEconomicsAuditLimit(Number(event.target.value) as 25 | 50 | 100);
                        setEconomicsAuditOffset(0);
                      }}
                      aria-label="Количество сделок на странице"
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => goToEconomicsAuditPage("previous")}
                    disabled={!economicsAuditHasPreviousPage || economicsAuditFetching}
                    aria-label="Предыдущая страница аудита"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Назад
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => goToEconomicsAuditPage("next")}
                    disabled={!economicsAuditHasNextPage || economicsAuditFetching}
                    aria-label="Следующая страница аудита"
                  >
                    Вперёд
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {economicsAudit.discrepantDeals > 0 ? (
                <section className="space-y-4" aria-labelledby="economics-audit-discrepancies-title">
                  <div>
                    <h2 id="economics-audit-discrepancies-title" className="text-[11px] font-bold uppercase tracking-widest text-destructive">Расхождения на странице · {economicsAudit.discrepancies.length}</h2>
                    <p className="text-sm text-muted-foreground font-medium mt-1">Каждая запись показывает сделку, поле, ожидаемое значение и фактическую сумму в ledger. Итоговое число расхождений указано выше по всей истории.</p>
                  </div>
                  {economicsAudit.results.filter(deal => deal.discrepancies.length > 0).length ? (
                    <div className="space-y-3">
                      {economicsAudit.results.filter(deal => deal.discrepancies.length > 0).map(deal => <EconomicsAuditDealCard key={deal.dealId} deal={deal} />)}
                    </div>
                  ) : (
                    <div className="trust-panel p-6 text-center">
                      <p className="text-sm font-semibold text-muted-foreground">На этой странице расхождений нет. Перейдите на другую страницу, чтобы продолжить просмотр.</p>
                    </div>
                  )}
                </section>
              ) : (
                <div className="trust-panel p-8 text-center">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-primary" />
                  <h2 className="text-xl font-bold text-foreground mt-4">Расхождений не найдено</h2>
                  <p className="text-sm text-muted-foreground mt-2">Все проверенные исторические сделки согласованы с проводками ledger.</p>
                </div>
              )}

              <section className="trust-panel p-5 md:p-6" aria-labelledby="economics-audit-clean-title">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 id="economics-audit-clean-title" className="text-[11px] font-bold uppercase tracking-widest text-primary">Чистые сделки · {economicsAudit.cleanDeals}</h2>
                    <p className="text-sm text-muted-foreground font-medium mt-1">Проверены без финансовых расхождений. В списке ниже — только текущая страница.</p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                </div>
                {economicsAudit.results.filter(deal => deal.discrepancies.length === 0).length ? (
                  <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {economicsAudit.results.filter(deal => deal.discrepancies.length === 0).map(deal => (
                      <div key={deal.dealId} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-foreground">Сделка #{deal.dealId}</p>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">{auditDealStatusLabel(deal.status)}</span>
                        </div>
                        <p className="text-xs font-semibold text-muted-foreground mt-1">{auditDealTypeLabel(deal.kind)} · {formatRub(deal.amounts.grossAmountRub)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-muted-foreground mt-4">Чистых сделок в проверенном наборе нет.</p>
                )}
              </section>
            </>
          ) : null}
        </motion.div>
      )}
    </motion.div>
  );
}
