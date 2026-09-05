import { useGetDashboardSummary, useGetDashboardActivity, useListOffers, useGetScore, useListPartners, useListLeases } from "@workspace/api-client-react";
import { formatRub, formatDateShort, CATEGORY_LABELS, STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, ChevronRight, Activity, TrendingUp, Tag, CircleAlert, RefreshCw } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { BrandMark } from "@/components/brand-mark";
import { PartnerLogo } from "@/components/partner-logo";

function SkeletonCard({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-muted border border-border", className)} />;
}

function DashboardBlockError({ testId, message, onRetry }: { testId: string; message: string; onRetry: () => void }) {
  return (
    <div data-testid={testId} role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{message}</p>
          <p className="mt-1 text-xs text-destructive/80">Этот блок не удалось обновить. Остальные данные остаются доступны.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-destructive/25 px-3 py-2 text-xs font-bold transition-colors hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive/30"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Повторить
          </button>
        </div>
      </div>
    </div>
  );
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 30 } }
};

const TIER_LABEL: Record<string, string> = {
  premium: "Premium",
  high: "Надёжный",
  above_average: "Хороший",
  average: "Средний",
  below_average: "Начинающий",
};

const CATEGORY_ACCENT: Record<string, string> = {
  rent: "hsl(226, 70%, 45%)",      // primary
  utilities: "hsl(215, 25%, 45%)", // slate
  transport: "hsl(28, 74%, 52%)",  // secondary/copper
  health: "hsl(173, 58%, 39%)",    // teal
  food: "hsl(350, 70%, 50%)",      // red
  other: "hsl(224, 25%, 45%)",     // muted-foreground
};

function daysUntilNextPayment(startDateIso: string): number {
  const start = new Date(startDateIso);
  const now = new Date();
  const dayOfMonth = start.getDate();
  const nextDue = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (nextDue <= now) nextDue.setMonth(nextDue.getMonth() + 1);
  return Math.max(1, Math.ceil((nextDue.getTime() - now.getTime()) / 86400000));
}

function dealTypeLabel(type?: string | null): string | null {
  if (type === "partner_purchase") return "Покупка у партнёра";
  if (type === "rental_deal") return "Сделка аренды";
  return null;
}

function settlementStatusLabel(status?: string | null): string | null {
  if (status === "settled") return "Подтверждена";
  if (status === "refunded") return "Возвращена";
  return null;
}

function operationSourceLabel(source?: string | null): string | null {
  if (source === "partner_purchase") return "списание бонусов";
  if (source === "rental_deal") return "начисление по аренде";
  if (source === "refund") return "обратная проводка";
  return source ?? null;
}

// Compact Gauge for the Hero Card
function CompactScoreGauge({ score, color }: { score: number; color: string }) {
  const size = 110;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.min(1, score / 1000));

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 drop-shadow-xl">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="currentColor" strokeWidth={6} className="text-white/10" />
        <circle
          cx={size/2} cy={size/2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tracking-tight text-white"><AnimatedNumber value={score} /></span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const summaryQuery = useGetDashboardSummary();
  const activityQuery = useGetDashboardActivity({ limit: 4 });
  const offersQuery = useListOffers();
  const scoreQuery = useGetScore();
  const partnersQuery = useListPartners();
  const leasesQuery = useListLeases();
  const { data: summary, isLoading: summaryLoading } = summaryQuery;
  const { data: activity, isLoading: activityLoading } = activityQuery;
  const { data: offers, isLoading: offersLoading } = offersQuery;
  const { data: scoreData, isLoading: scoreLoading } = scoreQuery;
  const { data: partners, isLoading: partnersLoading } = partnersQuery;
  const { data: leases, isLoading: leasesLoading } = leasesQuery;

  const activeLease = leases?.find(l => l.isActive);
  const topPartners = partners?.slice(0, 3) ?? [];
  const featuredOffer = offers?.[0];
  const daysUntilPay = activeLease ? daysUntilNextPayment(activeLease.startDate) : null;
  const bonusBalanceRub = summary?.bonusBalanceRub ?? summary?.rubEquivalent ?? null;

  return (
    <motion.div className="space-y-6 md:space-y-8" variants={containerVariants} initial="hidden" animate="show">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Обзор</h1>
      </div>

      {/* Fused Majestic Hero Card */}
      <motion.div variants={itemVariants}>
        {summaryLoading ? (
          <SkeletonCard className="h-64" />
        ) : summaryQuery.isError ? (
          <DashboardBlockError testId="dashboard-summary-error" message="Не удалось загрузить сводку баланса" onRetry={() => void summaryQuery.refetch()} />
        ) : summary ? (
          <div className="relative rounded-3xl overflow-hidden bg-foreground text-background shadow-2xl border border-foreground/90" data-testid="balance-card">
             {/* Deep gradient & abstract shield graphic */}
             <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground to-primary/20 pointer-events-none" />
             <div className="absolute top-0 right-0 w-[500px] h-[500px] opacity-[0.04] pointer-events-none translate-x-1/4 -translate-y-1/4 mix-blend-overlay">
                <BrandMark type="white" className="w-full h-full" />
             </div>
             
             <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row gap-10 md:items-end justify-between">
                 <div className="space-y-4">
                     <p className="text-xs font-bold uppercase tracking-widest text-background/60">Капитал доверия</p>
                     <div className="flex items-baseline gap-3">
                         <span className="text-5xl md:text-7xl font-bold tracking-tighter text-white drop-shadow-sm" data-testid="text-balance">
                            {bonusBalanceRub === null ? "—" : formatRub(bonusBalanceRub)}
                        </span>
                         <span className="text-2xl font-bold text-primary">бонусы</span>
                     </div>
                     <div className="flex flex-wrap items-center gap-3 pt-2">
                        <span className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest bg-white/10 text-white backdrop-blur-md border border-white/10">
                            {new Intl.NumberFormat("ru-RU").format(summary.pointsBalance)} legacy-баллов
                        </span>
                         {summary.bonusEarnedThisMonthRub != null && summary.bonusEarnedThisMonthRub > 0 && (
                           <span className="text-xs font-bold text-primary drop-shadow-sm">+{formatRub(summary.bonusEarnedThisMonthRub)} за месяц</span>
                        )}
                     </div>
                     {summary.nextStatus && summary.pointsToNextStatus != null && (
                       <div className="pt-3 max-w-xs">
                          <div className="flex items-center justify-between mb-2">
                             <span className="text-[10px] font-bold uppercase tracking-widest text-background/50">До статуса «{STATUS_LABELS[summary.nextStatus] ?? summary.nextStatus}»</span>
                             <span className="text-[10px] font-bold text-background/70">{new Intl.NumberFormat("ru-RU").format(summary.pointsToNextStatus)} б.</span>
                          </div>
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                             <div
                               className="h-full bg-primary transition-all duration-1000 ease-out"
                               style={{ width: `${Math.min(100, Math.round((summary.pointsBalance / (summary.pointsBalance + summary.pointsToNextStatus)) * 100))}%` }}
                               data-testid="status-progress-bar"
                             />
                          </div>
                       </div>
                     )}
                 </div>

                 <div className="hidden md:block w-px h-28 bg-gradient-to-b from-transparent via-white/10 to-transparent mx-4" />

                  <div className="flex flex-col md:items-end text-left md:text-right w-full md:w-auto mt-6 md:mt-0 pt-6 md:pt-0 border-t border-white/10 md:border-0">
                    {scoreLoading ? (
                      <div className="h-28 w-full animate-pulse rounded-2xl bg-white/10 md:w-72" role="status" aria-label="Загрузка рейтинга" />
                    ) : scoreQuery.isError ? (
                      <DashboardBlockError testId="dashboard-score-error" message="Live Score временно недоступен" onRetry={() => void scoreQuery.refetch()} />
                    ) : scoreData ? (
                      <div className="flex items-center md:flex-row-reverse gap-6">
                        <Link href="/score" aria-label="Открыть подробности Live Score">
                          <div className="cursor-pointer transition-transform hover:scale-105">
                            <CompactScoreGauge score={scoreData.score} color="hsl(226, 70%, 65%)" />
                          </div>
                        </Link>
                        <div className="md:mr-2">
                          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Live Score</p>
                          <p className="text-2xl font-bold text-white tracking-tight mb-1">{TIER_LABEL[scoreData.tier] ?? scoreData.tierLabel}</p>
                          <Link href="/score">
                            <span className="text-xs font-bold text-white/50 hover:text-white transition-colors flex items-center md:justify-end gap-1 uppercase tracking-wider">
                              Детали <ChevronRight className="w-3 h-3" />
                            </span>
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <DashboardBlockError testId="dashboard-score-error" message="Live Score временно недоступен" onRetry={() => void scoreQuery.refetch()} />
                    )}
                  </div>
             </div>
          </div>
        ) : (
          <DashboardBlockError testId="dashboard-summary-error" message="Сводка баланса временно недоступна" onRetry={() => void summaryQuery.refetch()} />
        )}
      </motion.div>

      {/* Secondary Supportive Stats Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Next payment */}
        <div className="trust-panel p-6 flex flex-col justify-between group">
          <div className="flex items-start justify-between mb-6">
            <h3 className="font-bold text-muted-foreground text-xs uppercase tracking-widest">Следующая оплата</h3>
            {daysUntilPay !== null && (
              <div className="px-2 py-1 rounded text-[10px] font-bold bg-muted text-foreground uppercase tracking-wider border border-border">
                Через {daysUntilPay} {daysUntilPay === 1 ? "день" : daysUntilPay < 5 ? "дня" : "дней"}
              </div>
            )}
          </div>
          <div>
            {leasesLoading ? (
              <div className="h-24 animate-pulse rounded-xl bg-muted/50" role="status" aria-label="Загрузка договоров" />
            ) : leasesQuery.isError ? (
              <DashboardBlockError testId="dashboard-leases-error" message="Не удалось загрузить договоры аренды" onRetry={() => void leasesQuery.refetch()} />
            ) : activeLease ? (
              <>
                <p className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-1">{formatRub(activeLease.monthlyRentRub)}</p>
                <p className="text-sm text-muted-foreground font-semibold mb-2 truncate">{activeLease.address}</p>
                <p className="text-xs text-muted-foreground font-medium mb-5">
                  Начисление появится только после подтверждения сделки
                </p>
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-foreground mb-1">Аренда</p>
                <p className="text-sm text-muted-foreground font-medium mb-5">Нет активного договора</p>
              </>
            )}
            <Link href="/score" className="block w-full rounded-xl bg-primary/10 py-2.5 text-center text-sm font-bold text-primary transition-all hover:bg-primary hover:text-primary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              Управление
            </Link>
          </div>
        </div>

        {/* Featured promo */}
        <div className="trust-panel p-6 flex flex-col justify-between bg-foreground text-background relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/20 blur-2xl rounded-full pointer-events-none group-hover:bg-secondary/30 transition-colors" />
          <div className="flex items-start justify-between mb-6 relative z-10">
            <h3 className="font-bold text-background/60 text-xs uppercase tracking-widest">
              Спецпредложение
            </h3>
            <Tag className="w-4 h-4 text-secondary" />
          </div>
          <div className="relative z-10">
            {offersLoading ? (
              <div className="h-24 animate-pulse rounded-xl bg-white/10" role="status" aria-label="Загрузка предложений" />
            ) : offersQuery.isError ? (
              <DashboardBlockError testId="dashboard-offers-error" message="Предложения временно недоступны" onRetry={() => void offersQuery.refetch()} />
            ) : (
              <>
                <h3 className="text-background font-bold text-2xl tracking-tight mb-2 leading-tight">{featuredOffer?.title ?? "Предложений пока нет"}</h3>
                <p className="text-background/70 font-semibold text-sm mb-5">
                  {featuredOffer ? `${featuredOffer.bonusMultiplier}× баллов · ${CATEGORY_LABELS[featuredOffer.category] ?? featuredOffer.category}` : "Новые предложения появятся здесь"}
                </p>
                <Link href="/offers" className="block w-full rounded-xl bg-secondary py-2.5 text-center text-sm font-bold text-secondary-foreground shadow-lg shadow-secondary/20 transition-all hover:bg-secondary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/60">
                  Смотреть
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Saved this month */}
        <div className="trust-panel p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between mb-6">
            <h3 className="font-bold text-muted-foreground text-xs uppercase tracking-widest">Бонусы за месяц</h3>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
             <p className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-1" data-testid="monthly-bonus-value">
                {summaryQuery.isError ? "—" : summary?.bonusEarnedThisMonthRub != null ? `+${formatRub(summary.bonusEarnedThisMonthRub)}` : "—"}
            </p>
             <p className="text-sm text-muted-foreground font-semibold mb-5">
                {summaryQuery.isError ? "Сводка временно недоступна" : `Подтверждено ledger · списано ${summary?.bonusRedeemedThisMonthRub != null ? formatRub(summary.bonusRedeemedThisMonthRub) : "—"}`}
             </p>
             <Link href="/wallet" className="block w-full rounded-xl bg-muted py-2.5 text-center text-sm font-bold text-foreground transition-all hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                 Аналитика
            </Link>
          </div>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
        {/* Recent activity */}
        <motion.div variants={itemVariants} className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-bold text-foreground tracking-tight">Недавние транзакции</h2>
            <Link href="/wallet">
              <span className="text-sm font-bold text-primary cursor-pointer hover:underline flex items-center gap-1">Все <ArrowRight className="w-3.5 h-3.5"/></span>
            </Link>
          </div>
          <div className="trust-panel overflow-hidden">
            {activityLoading ? (
              <div className="space-y-0">
                {[...Array(4)].map((_, i) => <div key={i} className="animate-pulse h-20 border-b border-border bg-muted/30" />)}
              </div>
             ) : activityQuery.isError ? (
               <div className="p-5"><DashboardBlockError testId="dashboard-activity-error" message="Не удалось загрузить операции" onRetry={() => void activityQuery.refetch()} /></div>
             ) : activity?.length ? (
              <div className="flex flex-col">
                {activity.map((item, idx) => {
                  const authoritativeValue = item.bonusValueRub ?? item.amountRubSigned;
                  const isPositive = authoritativeValue != null ? authoritativeValue >= 0 : item.pointsDelta >= 0;
                  const operationType = dealTypeLabel(item.dealType);
                  const operationStatus = settlementStatusLabel(item.settlementStatus);
                  return (
                  <div key={item.id} data-testid={`activity-item-${item.id}`} className={cn("flex items-center justify-between p-5 hover:bg-muted/40 transition-colors", idx !== activity.length - 1 && "border-b border-border")}>
                    <div className="flex items-center gap-4">
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border", 
                        isPositive ? "bg-primary/5 border-primary/20 text-primary" : "bg-muted border-border text-muted-foreground")}>
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-foreground tracking-tight">{item.description}</p>
                         <p className="text-xs font-semibold text-muted-foreground mt-1 uppercase tracking-wider">
                           {[operationType, operationStatus, operationSourceLabel(item.operationSource), formatDateShort(item.createdAt)].filter(Boolean).join(" · ")}
                         </p>
                      </div>
                    </div>
                     <div className="text-right">
                       <div className={cn("text-base font-bold tracking-tight", isPositive ? "text-primary" : "text-foreground")}>
                         {authoritativeValue != null
                           ? `${isPositive ? "+" : ""}${formatRub(authoritativeValue)}`
                           : `${item.pointsDelta >= 0 ? "+" : ""}${new Intl.NumberFormat("ru-RU").format(item.pointsDelta)} б.`}
                       </div>
                       {authoritativeValue != null && (
                         <div className="text-[10px] font-semibold text-muted-foreground">
                           {item.pointsDelta >= 0 ? "+" : ""}{new Intl.NumberFormat("ru-RU").format(item.pointsDelta)} legacy-б.
                         </div>
                       )}
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-10 text-center text-sm font-bold text-muted-foreground">Операций пока нет</div>
            )}
          </div>
        </motion.div>

        {/* Partners */}
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-bold text-foreground tracking-tight">Партнёры</h2>
            <Link href="/partners">
              <span className="text-sm font-bold text-primary cursor-pointer hover:underline flex items-center gap-1">Все <ArrowRight className="w-3.5 h-3.5"/></span>
            </Link>
          </div>
          <div className="flex flex-col gap-3">
             {partnersLoading ? (
               [...Array(3)].map((_, i) => <SkeletonCard key={i} className="h-20" />)
             ) : partnersQuery.isError ? (
               <DashboardBlockError testId="dashboard-partners-error" message="Не удалось загрузить партнёров" onRetry={() => void partnersQuery.refetch()} />
             ) : topPartners.length > 0 ? topPartners.map((partner) => {
              const accent = CATEGORY_ACCENT[partner.category] ?? CATEGORY_ACCENT.other;
              return (
                 <Link key={partner.id} href={`/partners/${partner.id}`} aria-label={`Открыть партнёра «${partner.name}»`} className="trust-panel p-4 flex items-center gap-4 hover:border-primary/30 transition-colors group shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <PartnerLogo
                    name={partner.name}
                    logoUrl={partner.logoUrl}
                    className="w-12 h-12 rounded-xl border text-xl"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-foreground group-hover:text-primary transition-colors truncate tracking-tight">{partner.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 font-bold uppercase tracking-widest">{CATEGORY_LABELS[partner.category] ?? partner.category}</p>
                  </div>
                  <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase shrink-0 border" style={{ backgroundColor: accent + "10", color: accent, borderColor: accent + "20" }}>
                    {partner.bonusMultiplier}×
                  </div>
                 </Link>
              );
            }) : (
               <div className="trust-panel p-5 text-sm font-semibold text-muted-foreground">Партнёров пока нет</div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
