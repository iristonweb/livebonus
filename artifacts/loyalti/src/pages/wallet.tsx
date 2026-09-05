import { useMemo, useState } from "react";
import { useListFinancialLedger, useListTransactions } from "@workspace/api-client-react";
import type { FinancialLedgerEntry, Transaction } from "@workspace/api-client-react";
import { formatRub, formatDateShort, CATEGORY_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Activity, ArrowDownRight, ArrowUpRight, CircleAlert, RotateCcw } from "lucide-react";
import { EmptySearch } from "@/components/illustrations";

const CATEGORIES = ["all", "rent", "utilities", "transport", "health", "food", "other"] as const;
const CAT_LABELS: Record<string, string> = { all: "Все операции", ...CATEGORY_LABELS };

const CAT_COLORS: Record<string, string> = {
  rent: "bg-primary/10 text-primary border-primary/20",
  utilities: "bg-slate-500/10 text-slate-500 border-slate-500/20 dark:text-slate-400",
  transport: "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400",
  health: "bg-teal-500/10 text-teal-600 border-teal-500/20 dark:text-teal-400",
  food: "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
  other: "bg-muted text-muted-foreground border-border",
};

function dealTypeLabel(type?: string | null): string {
  if (type === "partner_purchase") return "Покупка у партнёра";
  if (type === "rental_deal") return "Сделка аренды";
  return "Legacy-операция";
}

function statusLabel(status?: string | null): string | null {
  if (status === "settled") return "подтверждена";
  if (status === "refunded") return "возвращена";
  if (status === "pending") return "ожидает оплаты";
  if (status === "payment_failed") return "оплата не прошла";
  if (status === "cancelled") return "отменена";
  return null;
}

function sourceLabel(source?: string | null): string | null {
  if (source === "partner_purchase") return "списание бонусов";
  if (source === "rental_deal") return "начисление по аренде";
  if (source === "refund") return "обратная проводка";
  return source ?? null;
}

function signedTransactionValue(tx: Transaction): number {
  if (tx.bonusValueRub !== undefined) return tx.bonusValueRub;
  if (tx.amountRubSigned !== undefined) return tx.amountRubSigned;
  return tx.pointsEarned >= 0 ? tx.amountRub : -tx.amountRub;
}

type WalletRow =
  | { kind: "ledger"; entry: FinancialLedgerEntry }
  | { kind: "legacy"; tx: Transaction };

function walletRowCreatedAt(row: WalletRow): string {
  return row.kind === "ledger" ? row.entry.createdAt : row.tx.createdAt;
}

function LedgerRow({ entry, isLast }: { entry: FinancialLedgerEntry; isLast: boolean }) {
  const signedValue = entry.amountRubSigned;
  const isPositive = signedValue >= 0;
  const composition = [
    entry.dealGrossAmountRub != null ? `Gross ${formatRub(entry.dealGrossAmountRub)}` : null,
    entry.dealNetAmountRub != null ? `Net ${formatRub(entry.dealNetAmountRub)}` : null,
    entry.dealBonusRedeemedRub != null && entry.dealBonusRedeemedRub > 0 ? `Списано ${formatRub(entry.dealBonusRedeemedRub)}` : null,
    entry.dealTenantBonusRub != null && entry.dealTenantBonusRub > 0 ? `Арендатору ${formatRub(entry.dealTenantBonusRub)}` : null,
    entry.dealLandlordBonusRub != null && entry.dealLandlordBonusRub > 0 ? `Арендодателю ${formatRub(entry.dealLandlordBonusRub)}` : null,
    entry.dealFeeAmountRub != null && entry.dealFeeAmountRub > 0 ? `Комиссия ${formatRub(entry.dealFeeAmountRub)}` : null,
  ].filter(Boolean).join(" · ");
  const metadata = [
    dealTypeLabel(entry.dealType),
    statusLabel(entry.settlementStatus),
    sourceLabel(entry.source),
    entry.reversalOfId ? "reversal" : null,
    entry.providerRefundStatus === "succeeded" ? "возврат у провайдера подтверждён" : null,
    entry.providerPaymentStatus === "succeeded" ? "платёж подтверждён" : null,
    formatDateShort(entry.createdAt),
  ].filter(Boolean).join(" · ");

  return (
    <div data-testid={`ledger-row-${entry.id}`} className={cn("flex items-start gap-4 px-6 py-5 hover:bg-muted/40 transition-colors", !isLast && "border-b border-border")}>
      <div className={cn("w-12 h-12 rounded-xl border flex items-center justify-center shrink-0", isPositive ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border")}>
        {entry.reversalOfId ? <RotateCcw className="w-5 h-5" aria-hidden="true" /> : <Activity className="w-5 h-5" aria-hidden="true" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-foreground truncate tracking-tight">{dealTypeLabel(entry.dealType)}</p>
        <p className="text-[11px] font-bold text-muted-foreground mt-1 uppercase tracking-wider">{metadata}</p>
        {composition ? <p className="text-xs text-muted-foreground mt-2 leading-5">{composition}</p> : null}
        <p className="text-[10px] text-muted-foreground/75 mt-1 font-mono truncate">{entry.reference}</p>
        {entry.dealIdempotencyKey ? (
          <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono truncate">idempotency: {entry.dealIdempotencyKey}</p>
        ) : null}
      </div>
      <div className="text-right shrink-0">
        <p className={cn("text-xl font-bold tracking-tight", isPositive ? "text-primary" : "text-foreground")}>
          {isPositive ? "+" : ""}{formatRub(signedValue)}
        </p>
        {entry.balanceAfterRub != null ? <p className="text-xs font-semibold text-muted-foreground mt-1">Баланс {formatRub(entry.balanceAfterRub)}</p> : null}
      </div>
    </div>
  );
}

function LegacyTransactionRow({ tx, isLast }: { tx: Transaction; isLast: boolean }) {
  const signedValue = signedTransactionValue(tx);
  const isPositive = signedValue >= 0;
  const category = tx.category ?? "other";
  return (
    <div data-testid={`transaction-row-${tx.id}`} className={cn("flex items-start gap-5 px-6 py-5 hover:bg-muted/40 transition-colors", !isLast && "border-b border-border")}>
      <div className={cn("w-12 h-12 rounded-xl border flex items-center justify-center font-bold text-lg shrink-0", CAT_COLORS[category] || CAT_COLORS.other)}>
        {(CATEGORY_LABELS[category] ?? category).charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-foreground truncate tracking-tight">{tx.description}</p>
        <div className="flex items-center gap-2.5 mt-1.5">
          {tx.partnerName && <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider truncate">{tx.partnerName}</span>}
          {tx.partnerName && <span className="w-1 h-1 rounded-full bg-border" />}
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{formatDateShort(tx.createdAt)}</span>
          {tx.operationSource && <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{sourceLabel(tx.operationSource)}</span>}
        </div>
        {tx.dealType || tx.settlementStatus ? (
          <p className="text-xs text-muted-foreground mt-2">{[dealTypeLabel(tx.dealType), statusLabel(tx.settlementStatus)].filter(Boolean).join(" · ")}</p>
        ) : <p className="text-xs text-muted-foreground mt-2">Старая запись без финансовой проводки</p>}
      </div>
      <div className="text-right shrink-0">
        <p className={cn("text-xl font-bold tracking-tight", isPositive ? "text-primary" : "text-foreground")}>
          {isPositive ? "+" : ""}{formatRub(signedValue)}
        </p>
        <p className="text-xs font-semibold text-muted-foreground mt-1">
          {tx.pointsEarned >= 0 ? "+" : ""}{new Intl.NumberFormat("ru-RU").format(tx.pointsEarned)} legacy-б.
        </p>
      </div>
    </div>
  );
}

export default function Wallet() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const { data: ledger, isLoading: ledgerLoading, isError: ledgerError } = useListFinancialLedger({ limit: 100 });
  const { data: transactions, isLoading: transactionsLoading } = useListTransactions(
    activeCategory !== "all" ? { category: activeCategory } : {},
    { query: { queryKey: ["transactions", activeCategory] } },
  );

  const filteredLedger = useMemo(() => {
    return (ledger ?? []).filter((entry) => {
      if (activeCategory === "all") return true;
      if (activeCategory === "rent") return entry.dealType === "rental_deal";
      if (activeCategory === "other") return entry.dealType === "partner_purchase" || entry.dealType === null;
      return false;
    });
  }, [activeCategory, ledger]);
  const useLedger = filteredLedger.length > 0;
  const legacyRows = useMemo(
    () => (transactions ?? []).filter((tx) => !useLedger || !tx.operationSource),
    [transactions, useLedger],
  );
  const walletRows = useMemo<WalletRow[]>(
    () => [
      ...filteredLedger.map((entry) => ({ kind: "ledger" as const, entry })),
      ...legacyRows.map((tx) => ({ kind: "legacy" as const, tx })),
    ].sort((a, b) => Date.parse(walletRowCreatedAt(b)) - Date.parse(walletRowCreatedAt(a))),
    [filteredLedger, legacyRows],
  );
  const totalValues = walletRows.map((row) => row.kind === "ledger" ? row.entry.amountRubSigned : signedTransactionValue(row.tx));
  const totalEarned = totalValues.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const totalSpent = totalValues.filter((value) => value < 0).reduce((sum, value) => sum + Math.abs(value), 0);
  const isLoading = ledgerLoading || transactionsLoading;

  return (
    <motion.div
      className="space-y-8 max-w-5xl mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Транзакции</h1>
          <p className="text-sm text-muted-foreground mt-2 font-semibold">Денежная история бонусного баланса и legacy-записи</p>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div className="trust-panel p-6 bg-card relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5 pl-2">
              <ArrowUpRight className="w-4 h-4 text-primary" /> Поступления
            </p>
            <p className="text-3xl md:text-4xl font-bold text-foreground tracking-tight pl-2">+{formatRub(totalEarned)}</p>
          </div>
          <div className="trust-panel p-6 bg-card relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-destructive" />
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5 pl-2">
              <ArrowDownRight className="w-4 h-4 text-destructive" /> Списания
            </p>
            <p className="text-3xl md:text-4xl font-bold text-foreground tracking-tight pl-2">-{formatRub(totalSpent)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5" role="group" aria-label="Фильтр операций" aria-controls="wallet-operations">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            data-testid={`filter-${category}`}
            type="button"
            aria-pressed={activeCategory === category}
            onClick={() => setActiveCategory(category)}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-bold transition-all border shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              activeCategory === category ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:bg-muted",
            )}
          >
            {CAT_LABELS[category]}
          </button>
        ))}
        <span className="sr-only" role="status" aria-live="polite">
          Выбрана категория: {CAT_LABELS[activeCategory]}
        </span>
      </div>

      {ledgerError ? (
        <div data-testid="ledger-error" role="alert" className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
          <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>Денежный ledger временно недоступен. Показываем legacy-историю без неподтверждённых денежных выводов.</span>
        </div>
      ) : null}

      <div id="wallet-operations" className="trust-panel overflow-hidden">
        {isLoading ? (
          <div className="space-y-0">{[...Array(6)].map((_, index) => <div key={index} className="animate-pulse bg-muted/30 h-24 border-b border-border" />)}</div>
        ) : walletRows.length ? (
          <div className="flex flex-col">
            {walletRows.map((row, index) => row.kind === "ledger"
              ? <LedgerRow key={`ledger-${row.entry.id}`} entry={row.entry} isLast={index === walletRows.length - 1} />
              : <LegacyTransactionRow key={`legacy-${row.tx.id}`} tx={row.tx} isLast={index === walletRows.length - 1} />)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground bg-card">
            <EmptySearch className="w-24 h-24 mb-6" />
            <p className="text-lg font-bold text-foreground tracking-tight">Транзакции не найдены</p>
            <p className="text-sm mt-2 font-medium">В этой категории пока нет операций</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}