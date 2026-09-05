import { useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Calculator as CalculatorIcon,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  Info,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  useCreatePurchaseCheckout,
  useGetFinancialPolicy,
  useGetPurchasePaymentStatus,
  useQuotePartnerPurchase,
  useQuoteRentalDeal,
} from "../../../../lib/api-client-react/src/generated/api";
import type {
  FinancialPolicy,
  FinanceError,
  PurchaseQuote,
  PurchasePaymentStatusResponse,
  RentalQuote,
} from "../../../../lib/api-client-react/src/generated/api.schemas";
import { formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";

type CalculatorMode = "purchase" | "rental";
type Quote = PurchaseQuote | RentalQuote;
type PaymentMethod = "sbp" | "mir_pay";

const EMPTY_VALUE = "—";

function parseRub(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized || !/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatRate(rate: number | undefined): string {
  if (rate === undefined || !Number.isFinite(rate)) return EMPTY_VALUE;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(rate * 100)}%`;
}

function formatQuoteValue(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? EMPTY_VALUE : formatRub(value);
}

function errorData(error: unknown): unknown {
  if (!error || typeof error !== "object") return undefined;
  return "data" in error ? (error as { data?: unknown }).data : undefined;
}

function errorMessage(error: unknown): string {
  const data = errorData(error);
  if (data && typeof data === "object" && "errors" in data) {
    const errors = (data as { errors?: Array<{ message?: string }> }).errors;
    if (Array.isArray(errors) && errors[0]?.message) return "Сервер не подтвердил этот preview.";
  }
  if (error instanceof Error && error.message) return error.message;
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    return data.error;
  }
  return "Не удалось получить расчёт. Повторите попытку.";
}

function errorReasons(error: unknown): Array<{ code?: string; message?: string }> {
  const data = errorData(error);
  if (!data || typeof data !== "object") return [];
  const reasons = "reasons" in data ? (data as FinanceError).reasons : undefined;
  if (Array.isArray(reasons) && reasons.length > 0) return reasons;
  const quoteErrors = "errors" in data ? (data as { errors?: Array<{ code?: string; message?: string }> }).errors : undefined;
  if (Array.isArray(quoteErrors) && quoteErrors.length > 0) return quoteErrors;
  const code = "code" in data && typeof data.code === "string" ? data.code : undefined;
  return code ? [{ code, message: "Сервер отклонил запрос quote." }] : [];
}

function quoteErrors(quote: Quote | undefined): Array<{ code: string; message: string }> {
  if (!quote?.errors) return [];
  return quote.errors;
}

function friendlyCode(code: string): string {
  if (code === "MAX_REDEMPTION_EXCEEDED") return "Сумма списания выше допустимого максимума";
  if (code === "INSUFFICIENT_BALANCE") return "Недостаточно бонусного баланса";
  return code;
}

function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {children}
      </label>
      {hint ? <span className="text-[11px] text-muted-foreground/75">{hint}</span> : null}
    </div>
  );
}

function DataRow({
  label,
  value,
  emphasis = false,
  testId,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  testId?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-5 py-3", emphasis && "border-t border-white/15 pt-4")}>
      <span className={cn("text-sm", emphasis ? "font-semibold text-white" : "text-white/65")}>{label}</span>
      <span
        data-testid={testId}
        className={cn("text-right font-mono text-sm tabular-nums", emphasis ? "font-bold text-[#d3f36b]" : "text-white")}
      >
        {value}
      </span>
    </div>
  );
}

function SkeletonResult({ mode }: { mode: CalculatorMode }) {
  return (
    <div
      data-testid="quote-loading"
      role="status"
      aria-live="polite"
      className="rounded-[1.35rem] border border-foreground/10 bg-foreground p-6 text-background shadow-[0_18px_50px_-24px_hsl(var(--foreground)/0.55)]"
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-white/10" />
        <div className="space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
          <div className="h-2 w-44 animate-pulse rounded bg-white/10" />
        </div>
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="flex justify-between border-b border-white/10 py-3">
            <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-white/55">Сверяем финансовые правила {mode === "purchase" ? "покупки" : "аренды"}…</p>
    </div>
  );
}

function ResultError({
  title,
  message,
  reasons,
  onRetry,
}: {
  title: string;
  message: string;
  reasons?: Array<{ code?: string; message?: string }>;
  onRetry: () => void;
}) {
  return (
    <div
      data-testid="quote-error"
      role="alert"
      className="rounded-[1.35rem] border border-destructive/20 bg-destructive/5 p-6 text-destructive"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{title}</p>
          <p className="mt-1 text-sm text-destructive/80">{message}</p>
          {reasons && reasons.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm">
              {reasons.map((reason, index) => (
                <li key={`${reason.code ?? "reason"}-${index}`} className="rounded-lg border border-destructive/15 bg-background/50 px-3 py-2">
                  {reason.code ? <strong className="mr-2 font-mono text-[11px]">{reason.code}</strong> : null}
                  {reason.message ?? "Проверьте введённые данные."}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            data-testid="button-retry-quote"
            onClick={onRetry}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-destructive/25 px-3 py-2 text-xs font-bold transition-colors hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive/30"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Повторить расчёт
          </button>
        </div>
      </div>
    </div>
  );
}

function PolicyCard({ policy, isLoading, isError }: { policy?: FinancialPolicy; isLoading: boolean; isError: boolean }) {
  return (
    <aside data-testid="policy-card" className="rounded-[1.35rem] border border-primary/15 bg-primary/[0.045] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Активные правила</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Политика сервера, версия {isLoading ? "…" : policy?.version ?? "—"}.
          </p>
        </div>
      </div>
      {isError ? (
        <div data-testid="policy-error" className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/15 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Не удалось загрузить правила. Quote всё равно покажет серверный расчёт, если он доступен.
        </div>
      ) : (
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-primary/10 pt-4">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Макс. списание</dt>
            <dd data-testid="policy-redemption-rate" className="mt-1 font-mono text-sm font-bold text-foreground">
              {formatRate(policy?.purchaseRedemptionRate)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Комиссия</dt>
            <dd data-testid="policy-partner-fee-rate" className="mt-1 font-mono text-sm font-bold text-foreground">
              {formatRate(policy?.partnerFeeRate)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Аренда</dt>
            <dd data-testid="policy-rental-rate" className="mt-1 font-mono text-sm font-bold text-foreground">
              {formatRate(policy?.rentalBonusRate)}
            </dd>
          </div>
        </dl>
      )}
    </aside>
  );
}

function PurchaseResult({
  quote,
  onRetry,
  onCheckout,
  paymentMethod,
  onPaymentMethodChange,
  isCheckoutPending,
  checkoutError,
}: {
  quote?: PurchaseQuote;
  onRetry: () => void;
  onCheckout: () => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  isCheckoutPending: boolean;
  checkoutError?: unknown;
}) {
  const errors = quoteErrors(quote);
  if (!quote) return null;
  if (!quote.valid || errors.length > 0) {
    return (
      <div
        data-testid="purchase-quote-invalid"
        role="alert"
        className="rounded-[1.35rem] border border-amber-500/25 bg-amber-500/[0.07] p-6 text-amber-950 dark:text-amber-100"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-bold">Покупка не прошла проверку</p>
            <p className="mt-1 text-sm opacity-80">Измените сумму списания или пополните бонусный баланс.</p>
            <ul className="mt-4 space-y-2 text-sm">
              {errors.map((item) => (
                <li key={item.code} data-testid={`quote-error-${item.code}`} className="rounded-lg border border-amber-600/15 bg-background/40 px-3 py-2">
                  <span className="mr-2 font-mono text-[11px] font-bold">{item.code}</span>
                  {friendlyCode(item.code)}{item.message ? `: ${item.message}` : ""}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onRetry}
              data-testid="button-retry-invalid-quote"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-amber-600/25 px-3 py-2 text-xs font-bold transition-colors hover:bg-amber-500/10 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Обновить preview
            </button>
          </div>
        </div>
      </div>
    );
  }

  const breakdown = quote.breakdown;
  return (
    <div data-testid="purchase-quote" className="rounded-[1.35rem] border border-foreground/10 bg-foreground p-6 text-background shadow-[0_18px_50px_-24px_hsl(var(--foreground)/0.55)] md:p-7">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d3f36b]/15 text-[#d3f36b]">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-bold">Расчёт покупки</p>
            <p className="mt-1 text-xs text-white/55">Preview · политика v{quote.policyVersion}</p>
          </div>
        </div>
        <span data-testid="quote-status" className="rounded-full border border-[#d3f36b]/25 bg-[#d3f36b]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#d3f36b]">
          valid
        </span>
      </div>
      <div className="mt-3">
        <DataRow label="Gross-чек" value={formatQuoteValue(breakdown.grossRub)} testId="result-gross" />
        <DataRow label={`Лимит ${formatRate(quote.rates.maxRedemptionRate)}`} value={formatQuoteValue(breakdown.redemptionCapRub)} testId="result-redemption-cap" />
        <DataRow label="Баланс бонусов" value={formatQuoteValue(breakdown.balanceCapRub)} testId="result-balance" />
        <DataRow label="Введено списание" value={formatQuoteValue(quote.requestedBonusRub)} testId="result-requested-bonus" />
        <DataRow label="Разрешено к списанию" value={formatQuoteValue(breakdown.bonusRedeemedRub)} testId="result-approved-bonus" />
        <DataRow label="Net к оплате" value={formatQuoteValue(breakdown.netRub)} emphasis testId="result-net" />
        <DataRow label={`Комиссия партнёра · ${formatRate(quote.rates.partnerFeeRate)}`} value={formatQuoteValue(breakdown.partnerFeeRub)} testId="result-partner-fee" />
      </div>
      <div className="mt-5 flex items-start gap-2 border-t border-white/10 pt-4 text-xs leading-5 text-white/55">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d3f36b]" aria-hidden="true" />
        Комиссия — расчёт платформы, она не списывается с бонусного баланса.
      </div>
      <p data-testid="preview-notice" className="mt-3 text-[11px] leading-5 text-white/40">
        До подтверждения оплата и списание бонусов не выполняются. После подтверждения откроется защищённый checkout YooKassa, а сервер проверит его статус.
      </p>
      {checkoutError ? (
        <div data-testid="checkout-error" role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-xs text-red-100">
          {errorMessage(checkoutError)}
        </div>
      ) : null}
      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">Способ оплаты</p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Способ оплаты">
          <button
            type="button"
            role="radio"
            aria-checked={paymentMethod === "sbp"}
            data-testid="payment-method-sbp"
            onClick={() => onPaymentMethodChange("sbp")}
            className={cn(
              "rounded-xl border px-3 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[#d3f36b]/40",
              paymentMethod === "sbp" ? "border-[#d3f36b]/60 bg-[#d3f36b]/10 text-[#d3f36b]" : "border-white/10 text-white/65 hover:border-white/25 hover:text-white",
            )}
          >
            <span className="block text-xs font-bold">СБП</span>
            <span className="mt-1 block text-[10px] opacity-65">Оплата по QR</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={paymentMethod === "mir_pay"}
            data-testid="payment-method-mir-pay"
            onClick={() => onPaymentMethodChange("mir_pay")}
            className={cn(
              "rounded-xl border px-3 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[#d3f36b]/40",
              paymentMethod === "mir_pay" ? "border-[#d3f36b]/60 bg-[#d3f36b]/10 text-[#d3f36b]" : "border-white/10 text-white/65 hover:border-white/25 hover:text-white",
            )}
          >
            <span className="block text-xs font-bold">Mir Pay</span>
            <span className="mt-1 block text-[10px] opacity-65">Оплата через приложение</span>
          </button>
        </div>
      </div>
      <button
        type="button"
        data-testid="button-open-checkout"
        onClick={onCheckout}
        disabled={isCheckoutPending}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#d3f36b] px-5 py-4 text-sm font-extrabold text-[#172116] transition-all hover:bg-[#e1ff83] focus:outline-none focus:ring-2 focus:ring-[#d3f36b]/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isCheckoutPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        {isCheckoutPending ? "Открываем checkout…" : `Оплатить ${formatQuoteValue(breakdown.netRub)}`}
      </button>
      <p className="mt-3 text-center text-[10px] leading-4 text-white/40">
        Способ оплаты передаётся в YooKassa; доступность подтверждается настройками магазина.
      </p>
    </div>
  );
}

function PaymentStatusCard({
  data,
  isLoading,
  isError,
}: {
  data?: PurchasePaymentStatusResponse;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <div data-testid="payment-status-loading" className="rounded-[1.35rem] border border-primary/20 bg-primary/[0.05] p-6 text-sm text-muted-foreground">
        Проверяем результат оплаты у провайдера…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div data-testid="payment-status-error" role="alert" className="rounded-[1.35rem] border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        Не удалось проверить результат оплаты. Обновите страницу через несколько секунд.
      </div>
    );
  }
  const state = data.paymentStatus;
  const copy = state === "succeeded"
    ? { title: "Оплата подтверждена", message: "Платёж проверен ЮKassa. Бонусы списаны, операция попала в ledger.", tone: "border-primary/25 bg-primary/[0.06] text-primary" }
    : state === "canceled"
      ? { title: "Оплата отменена", message: "Провайдер не подтвердил оплату. Бонусный баланс не изменён.", tone: "border-amber-500/25 bg-amber-500/[0.07] text-amber-900 dark:text-amber-100" }
      : state === "failed"
        ? { title: "Оплата не прошла", message: data.message ?? "Провайдер отклонил оплату. Бонусный баланс не изменён.", tone: "border-destructive/20 bg-destructive/5 text-destructive" }
        : { title: "Платёж ожидает подтверждения", message: "ЮKassa ещё обрабатывает платёж. Мы повторно проверим его автоматически.", tone: "border-primary/20 bg-primary/[0.05] text-foreground" };
  return (
    <div data-testid={`payment-status-${state}`} role="status" className={cn("rounded-[1.35rem] border p-6", copy.tone)}>
      <p className="font-bold">{copy.title}</p>
      <p className="mt-2 text-sm opacity-80">{copy.message}</p>
      <p className="mt-4 font-mono text-[11px] opacity-65">Сделка #{data.deal.id} · {data.deal.providerPaymentStatus ?? state}</p>
    </div>
  );
}

function RentalResult({ quote }: { quote?: RentalQuote }) {
  if (!quote) return null;
  const errors = quoteErrors(quote);
  if (!quote.valid || errors.length > 0) {
    return (
      <div data-testid="rental-quote-invalid" role="alert" className="rounded-[1.35rem] border border-amber-500/25 bg-amber-500/[0.07] p-6 text-amber-950 dark:text-amber-100">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="font-bold">Сделка требует проверки</p>
            <ul className="mt-3 space-y-2 text-sm">
              {errors.map((item) => (
                <li key={item.code} className="rounded-lg border border-amber-600/15 bg-background/40 px-3 py-2">
                  <span className="mr-2 font-mono text-[11px] font-bold">{item.code}</span>
                  {item.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }
  const breakdown = quote.breakdown;
  return (
    <div data-testid="rental-quote" className="rounded-[1.35rem] border border-foreground/10 bg-foreground p-6 text-background shadow-[0_18px_50px_-24px_hsl(var(--foreground)/0.55)] md:p-7">
      <div className="flex items-start gap-3 border-b border-white/10 pb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d3f36b]/15 text-[#d3f36b]">
          <Landmark className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-bold">Расчёт сделки аренды</p>
          <p className="mt-1 text-xs text-white/55">Preview · политика v{quote.policyVersion}</p>
        </div>
      </div>
      <div className="mt-3">
        <DataRow label="Gross полной сделки" value={formatQuoteValue(breakdown.grossRub)} testId="rental-gross" />
        <DataRow label={`Комиссия landlord · ${formatRate(quote.rates.landlordFeeRate)}`} value={formatQuoteValue(breakdown.landlordFeeRub)} testId="rental-landlord-fee" />
        <DataRow label={`Bonus value арендатора · ${formatRate(quote.rates.tenantBonusRate)}`} value={formatQuoteValue(breakdown.tenantBonusRub)} testId="rental-tenant-bonus" />
        <DataRow label={`Bonus value landlord · ${formatRate(quote.rates.landlordBonusRate)}`} value={formatQuoteValue(breakdown.landlordBonusRub)} testId="rental-landlord-bonus" />
      </div>
      <div className="mt-5 flex items-start gap-2 border-t border-white/10 pt-4 text-xs leading-5 text-white/55">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d3f36b]" aria-hidden="true" />
        Комиссия — расчёт платформы, не списание с бонусного баланса.
      </div>
      <p data-testid="rental-preview-notice" className="mt-3 text-[11px] leading-5 text-white/40">
        Preview не проводит сделку и не начисляет бонусы.
      </p>
    </div>
  );
}

export default function Calculator() {
  const [mode, setMode] = useState<CalculatorMode>("purchase");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("mir_pay");
  const [purchaseGross, setPurchaseGross] = useState("");
  const [requestedBonus, setRequestedBonus] = useState("");
  const [rentalGross, setRentalGross] = useState("");
  const [submittedMode, setSubmittedMode] = useState<CalculatorMode | null>(null);
  const [paymentDealId] = useState(() => {
    const value = new URLSearchParams(window.location.search).get("payment");
    const id = value ? Number(value) : NaN;
    return Number.isInteger(id) && id > 0 ? id : 0;
  });

  const policy = useGetFinancialPolicy();
  const checkout = useCreatePurchaseCheckout();
  const paymentStatus = useGetPurchasePaymentStatus(paymentDealId, {
    query: {
      queryKey: ["/api/finance/purchases", paymentDealId, "status"],
      enabled: paymentDealId > 0,
      refetchInterval: (query) => {
        const current = query.state.data?.paymentStatus;
        return current === "pending" || current === "waiting_for_capture" ? 2500 : false;
      },
    },
  });
  const purchaseQuote = useQuotePartnerPurchase();
  const rentalQuote = useQuoteRentalDeal();

  const activeGross = mode === "purchase" ? purchaseGross : rentalGross;
  const activeNumber = parseRub(activeGross);
  const hasRequestedBonus = requestedBonus.trim().length > 0;
  const requestedNumber = hasRequestedBonus ? parseRub(requestedBonus) : null;
  const isRequestedInvalid = hasRequestedBonus && requestedNumber === null;
  const isValid = activeNumber !== null && !isRequestedInvalid;
  const isPending = purchaseQuote.isPending || rentalQuote.isPending;
  const activeQuote = submittedMode === "purchase" ? purchaseQuote.data : submittedMode === "rental" ? rentalQuote.data : undefined;
  const activeError = submittedMode === "purchase" ? purchaseQuote.error : submittedMode === "rental" ? rentalQuote.error : undefined;
  const activeIsError = submittedMode === "purchase" ? purchaseQuote.isError : submittedMode === "rental" ? rentalQuote.isError : false;

  function resetQuotes(nextMode: CalculatorMode) {
    setMode(nextMode);
    setSubmittedMode(null);
    purchaseQuote.reset();
    rentalQuote.reset();
  }

  function submitQuote() {
    if (!isValid || activeNumber === null) return;
    setSubmittedMode(mode);
    if (mode === "purchase") {
      purchaseQuote.mutate({
        data: {
          grossAmountRub: activeNumber,
          ...(requestedNumber !== null ? { requestedBonusRub: requestedNumber } : {}),
        },
      });
    } else {
      rentalQuote.mutate({ data: { grossAmountRub: activeNumber } });
    }
  }

  function openCheckout() {
    const quote = purchaseQuote.data;
    if (!quote?.valid) return;
    checkout.mutate({
      data: {
        grossAmountRub: quote.grossAmountRub,
        ...(quote.requestedBonusRub > 0 ? { requestedBonusRub: quote.requestedBonusRub } : {}),
        paymentMethod,
        idempotencyKey: crypto.randomUUID(),
      },
    }, {
      onSuccess: (result) => {
        if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
      },
    });
  }

  return (
    <motion.main
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="mx-auto min-h-[calc(100dvh-4rem)] w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12"
    >
      <header className="mb-8 grid gap-6 lg:grid-cols-[1fr_320px] lg:items-end">
        <div>
          <div className="mb-5 flex items-center gap-3 text-primary">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/10">
              <CalculatorIcon className="h-5 w-5" aria-hidden="true" />
            </div>
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]">Live Score / ЛоялТи</span>
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Финансовая модель</p>
          <h1 className="max-w-2xl text-3xl font-extrabold tracking-[-0.04em] text-foreground sm:text-5xl">
            Сначала цифры.<br />
            <span className="text-primary">Потом решение.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Прозрачный quote до операции: сколько можно списать, что останется к оплате и как выглядит экономика сделки.
          </p>
        </div>
        <PolicyCard policy={policy.data} isLoading={policy.isLoading} isError={policy.isError} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)] lg:items-start">
        <section className="trust-panel overflow-hidden p-5 sm:p-7" aria-labelledby="calculator-form-title">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <h2 id="calculator-form-title" className="text-lg font-bold tracking-tight text-foreground">
                Выберите операцию
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Все значения передаются на серверный quote.</p>
            </div>
            <div className="hidden h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground sm:flex">
              <FileCheck2 className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>

          <div role="tablist" aria-label="Режим калькулятора" className="mb-8 grid grid-cols-2 rounded-xl border border-border bg-muted/55 p-1">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "purchase"}
              data-testid="mode-purchase"
              onClick={() => resetQuotes("purchase")}
              className={cn(
                "rounded-lg px-3 py-3 text-left text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-primary/30",
                mode === "purchase" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="block">Покупка у партнёра</span>
              <span className="mt-1 block text-[10px] font-medium opacity-65">Списать бонусы с чека</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "rental"}
              data-testid="mode-rental"
              onClick={() => resetQuotes("rental")}
              className={cn(
                "rounded-lg px-3 py-3 text-left text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-primary/30",
                mode === "rental" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="block">Сделка аренды</span>
              <span className="mt-1 block text-[10px] font-medium opacity-65">Распределить bonus value</span>
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <FieldLabel htmlFor="gross-amount-input" hint="RUB">Gross-чек</FieldLabel>
              <div className="relative">
                <input
                  id="gross-amount-input"
                  data-testid="input-gross-amount"
                  aria-label={mode === "purchase" ? "Gross-чек покупки" : "Gross полной сделки аренды"}
                  aria-invalid={activeGross.length > 0 && activeNumber === null}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={activeGross}
                  onChange={(event) => {
                    if (mode === "purchase") setPurchaseGross(event.target.value);
                    else setRentalGross(event.target.value);
                    setSubmittedMode(null);
                    purchaseQuote.reset();
                    rentalQuote.reset();
                  }}
                  placeholder="Например, 18 500"
                  className="w-full rounded-2xl border border-border bg-input/45 px-5 py-5 pr-14 font-mono text-2xl font-bold tracking-tight text-foreground shadow-inner outline-none transition-all placeholder:text-muted-foreground/35 focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 font-mono text-lg font-bold text-muted-foreground">₽</span>
              </div>
              {activeGross.length > 0 && activeNumber === null ? (
                <p data-testid="gross-invalid" className="mt-2 text-xs font-medium text-destructive">
                  Введите положительную сумму с точностью до копейки.
                </p>
              ) : null}
            </div>

            {mode === "purchase" ? (
              <div>
                <FieldLabel htmlFor="requested-bonus-input" hint="необязательно">Списать бонусами</FieldLabel>
                <div className="relative">
                  <input
                    id="requested-bonus-input"
                    data-testid="input-requested-bonus"
                    aria-label="Желаемая сумма списания бонусов"
                    aria-invalid={isRequestedInvalid}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={requestedBonus}
                    onChange={(event) => {
                      setRequestedBonus(event.target.value);
                      setSubmittedMode(null);
                      purchaseQuote.reset();
                    }}
                    placeholder="Оставьте пустым для расчёта лимита"
                    className="w-full rounded-xl border border-border bg-input/30 px-4 py-3 pr-12 font-mono text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <WalletCards className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                </div>
                {isRequestedInvalid ? (
                  <p data-testid="requested-bonus-invalid" className="mt-2 text-xs font-medium text-destructive">
                    Укажите положительную сумму или оставьте поле пустым.
                  </p>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Сервер сравнит её с лимитом 15% от gross и доступным балансом.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-border/80 bg-muted/35 p-4">
                <div className="flex gap-3">
                  <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <p className="text-xs leading-5 text-muted-foreground">
                    Для сделки аренды бонусная ценность арендатора и landlord рассчитывается сервером по активной политике.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              data-testid="button-calculate"
              disabled={!isValid || isPending}
              onClick={submitQuote}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_-12px_hsl(var(--primary)/0.65)] transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
              {isPending ? "Считаем quote…" : "Рассчитать preview"}
            </button>
          </div>

          <div className="mt-7 flex items-start gap-2 border-t border-border pt-5 text-[11px] leading-5 text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Preview не имитирует успешную оплату: он только объясняет денежную механику операции. Денежные значения округляются
              сервером до копейки (0,01 ₽).
            </span>
          </div>
        </section>

        <section aria-live="polite" aria-label="Результат финансового расчёта" className="min-h-[220px]">
          {paymentDealId > 0 ? (
            <PaymentStatusCard data={paymentStatus.data} isLoading={paymentStatus.isLoading} isError={paymentStatus.isError} />
          ) : null}
          {isPending ? <SkeletonResult mode={mode} /> : null}
          {!isPending && activeIsError ? (
            <ResultError
             title={errorReasons(activeError).length > 0 ? "Quote отклонён сервером" : "Quote недоступен"}
              message={errorMessage(activeError)}
              reasons={errorReasons(activeError)}
              onRetry={submitQuote}
            />
          ) : null}
          {!isPending && !activeIsError && submittedMode === "purchase" ? (
            <PurchaseResult
              quote={purchaseQuote.data}
              onRetry={submitQuote}
              onCheckout={openCheckout}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
              isCheckoutPending={checkout.isPending}
              checkoutError={checkout.error}
            />
          ) : null}
          {!isPending && !activeIsError && submittedMode === "rental" ? <RentalResult quote={rentalQuote.data} /> : null}
          {!isPending && !activeQuote && !activeIsError ? (
            <div data-testid="quote-empty" className="flex min-h-[220px] flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-border bg-card/50 p-8 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <ArrowRight className="h-5 w-5 -rotate-45" aria-hidden="true" />
              </div>
              <p className="font-bold text-foreground">Здесь появится quote</p>
              <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">
                Введите gross-сумму и запустите preview, чтобы увидеть подтверждённые сервером значения.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </motion.main>
  );
}