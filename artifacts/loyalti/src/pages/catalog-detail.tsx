import { getGetOfferQueryKey, getGetPartnerQueryKey, useGetOffer, useGetPartner } from "@workspace/api-client-react";
import { ArrowLeft, ArrowRight, CircleAlert, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { Link, useRoute } from "wouter";
import { PartnerLogo } from "@/components/partner-logo";
import { CATEGORY_LABELS, daysUntil, formatRub } from "@/lib/format";

function parseId(value?: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function DetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-testid="catalog-detail-error" role="alert" className="trust-panel mx-auto flex max-w-xl flex-col items-center p-8 text-center">
      <CircleAlert className="h-8 w-8 text-destructive" aria-hidden="true" />
      <p className="mt-4 text-lg font-bold text-foreground">Карточка временно недоступна</p>
      <p className="mt-2 text-sm font-medium text-muted-foreground">Попробуйте обновить данные ещё раз.</p>
      <button
        type="button"
        data-testid="catalog-detail-retry"
        onClick={() => void onRetry()}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-bold text-background transition-colors hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Повторить
      </button>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/partners" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Вернуться к каталогу
    </Link>
  );
}

export function PartnerDetail() {
  const [, params] = useRoute("/partners/:id");
  const id = parseId(params?.id);
  const partner = useGetPartner(id, { query: { queryKey: getGetPartnerQueryKey(id), retry: false } });

  if (!id || partner.isError) {
    return <div className="space-y-6"><BackLink />{partner.isError ? <DetailError onRetry={partner.refetch} /> : <DetailError onRetry={() => Promise.resolve()} />}</div>;
  }
  if (partner.isLoading) {
    return <div className="space-y-6"><BackLink /><div className="trust-panel h-64 animate-pulse bg-muted/50" /></div>;
  }
  if (!partner.data) {
    return <div className="space-y-6"><BackLink /><DetailError onRetry={partner.refetch} /></div>;
  }

  const data = partner.data;
  return (
    <motion.main className="mx-auto max-w-3xl space-y-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <BackLink />
      <section className="trust-panel p-6 sm:p-10" aria-labelledby="partner-detail-title">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <PartnerLogo name={data.name} logoUrl={data.logoUrl} className="h-20 w-20 shrink-0 rounded-2xl border text-3xl" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{CATEGORY_LABELS[data.category] ?? data.category}</p>
            <h1 id="partner-detail-title" className="mt-2 text-3xl font-bold tracking-tight text-foreground">{data.name}</h1>
            <p className="mt-3 text-sm font-medium leading-6 text-muted-foreground">{data.description ?? "Партнёр программы лояльности Live Score."}</p>
            {(data.address || data.city) && <p className="mt-4 text-sm font-semibold text-foreground">{[data.city, data.address].filter(Boolean).join(", ")}</p>}
          </div>
          <span className="shrink-0 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm font-bold text-foreground">{data.bonusMultiplier}× баллов</span>
        </div>
        <Link href={`/offers?category=${data.category}`} className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:w-auto">
          Смотреть предложения
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </motion.main>
  );
}

export function OfferDetail() {
  const [, params] = useRoute("/offers/:id");
  const id = parseId(params?.id);
  const offer = useGetOffer(id, { query: { queryKey: getGetOfferQueryKey(id), retry: false } });

  if (!id || offer.isError) {
    return <div className="space-y-6"><Link href="/offers" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Вернуться к предложениям</Link>{offer.isError ? <DetailError onRetry={offer.refetch} /> : <DetailError onRetry={() => Promise.resolve()} />}</div>;
  }
  if (offer.isLoading) {
    return <div className="space-y-6"><Link href="/offers" className="inline-flex items-center gap-2 text-sm font-bold text-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Вернуться к предложениям</Link><div className="trust-panel h-64 animate-pulse bg-muted/50" /></div>;
  }
  if (!offer.data) {
    return <div className="space-y-6"><Link href="/offers" className="inline-flex items-center gap-2 text-sm font-bold text-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Вернуться к предложениям</Link><DetailError onRetry={offer.refetch} /></div>;
  }

  const data = offer.data;
  const days = daysUntil(data.expiresAt);
  return (
    <motion.main className="mx-auto max-w-3xl space-y-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Link href="/offers" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Вернуться к предложениям
      </Link>
      <section className="trust-panel p-6 sm:p-10" aria-labelledby="offer-detail-title">
        <div className="flex items-start gap-4">
          <PartnerLogo name={data.partnerName} logoUrl={data.partnerLogoUrl} className="h-16 w-16 shrink-0 rounded-2xl border text-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{data.partnerName}</p>
            <h1 id="offer-detail-title" className="mt-2 text-3xl font-bold tracking-tight text-foreground">{data.title}</h1>
          </div>
          <span className="shrink-0 rounded-lg bg-foreground px-3 py-1.5 text-sm font-bold text-background">{data.bonusMultiplier}×</span>
        </div>
        <p className="mt-6 text-sm font-medium leading-6 text-muted-foreground">{data.description ?? "Получите повышенное начисление бонусов при оплате у партнёра."}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/40 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Срок действия</p><p className="mt-1 font-bold text-foreground">{days === 0 ? "Истекает сегодня" : `Осталось ${days} дн.`}</p></div>
          {data.minAmountRub != null && <div className="rounded-xl border border-border bg-muted/40 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Минимальная сумма</p><p className="mt-1 font-bold text-foreground">{formatRub(data.minAmountRub)}</p></div>}
        </div>
        <Link href="/calculator" className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:w-auto">
          Перейти к оплате
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </motion.main>
  );
}