import {
  useGetScore, useGetScoreHistory, useGetScoreTimeline,
  useListLeases, useConfirmPayment, useRecordLatePayment, useCreateDispute,
  useListScoreDisputes,
  useListPassportShares, useCreatePassportShare, useRevokePassportShare,
} from "@workspace/api-client-react";
import { getGetScoreQueryKey, getGetScoreHistoryQueryKey, getGetScoreTimelineQueryKey, getListLeasesQueryKey, getListScoreDisputesQueryKey, getListPassportSharesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Link } from "wouter";
import { ShieldCheck, Share2, Info, ArrowUpRight, ArrowDownRight, CheckCircle2, Home, AlertCircle, Copy, Check } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const fmtShort = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const fmtRub = (n: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 0 }).format(n);

const TIER_CONFIG: Record<string, { label: string; color: string; badge: string }> = {
  premium:       { label: "Premium",        color: "hsl(226, 70%, 45%)", badge: "bg-primary/10 border-primary/20 text-primary" },
  high:          { label: "Надёжный",       color: "hsl(250, 50%, 50%)", badge: "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400" },
  above_average: { label: "Хороший",        color: "hsl(200, 60%, 50%)", badge: "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400" },
  average:       { label: "Средний",        color: "hsl(28, 74%, 52%)",  badge: "bg-secondary/10 border-secondary/20 text-secondary" },
  below_average: { label: "Начинающий",     color: "hsl(224, 25%, 45%)", badge: "bg-muted border-border text-muted-foreground" },
};

const itemV: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
};

// ─── score gauge ─────────────────────────────────────────────────────────────
// Signature segmented arc visualization
function PremiumScoreGauge({ score, color }: { score: number; color: string }) {
  const size = 300;
  const radius = 120;
  const cx = size / 2;
  const cy = size / 2 + 20;
  const startAngle = 140; // bottom left
  const endAngle = 400; // bottom right
  const totalTicks = 60;
  const scoreRatio = score / 1000;
  const activeTicks = Math.round(scoreRatio * totalTicks);

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size - 40 }}>
      <svg width={size} height={size - 40} viewBox={`0 0 ${size} ${size - 40}`} className="overflow-visible">
         {Array.from({ length: totalTicks }).map((_, i) => {
            const angle = startAngle + (i / (totalTicks - 1)) * (endAngle - startAngle);
            const rad = (angle * Math.PI) / 180;
            const isMajor = i % 10 === 0;
            const tickLength = isMajor ? 18 : 8;
            const x1 = cx + (radius - tickLength) * Math.cos(rad);
            const y1 = cy + (radius - tickLength) * Math.sin(rad);
            const x2 = cx + radius * Math.cos(rad);
            const y2 = cy + radius * Math.sin(rad);
            const isActive = i <= activeTicks;
            
            return (
              <motion.line 
                key={i} 
                initial={{ opacity: 0, strokeDasharray: "0, 100" }}
                animate={{ opacity: 1, strokeDasharray: "100, 0" }}
                transition={{ duration: 0.5, delay: i * 0.01 }}
                x1={x1} y1={y1} x2={x2} y2={y2} 
                stroke={isActive ? color : "currentColor"} 
                strokeWidth={isMajor ? 3 : 2} 
                className={isActive ? "" : "text-muted-foreground/30"} 
                strokeLinecap="round" 
              />
            )
         })}
      </svg>
      <div className="absolute flex flex-col items-center top-[110px]">
         <span className="text-6xl font-bold tracking-tighter" style={{ color }} data-testid="score-value"><AnimatedNumber value={score} /></span>
         <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-2">Live Score</span>
      </div>
    </div>
  );
}

// ─── timeline tooltip ────────────────────────────────────────────────────────
function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload?: { score?: number; description?: string; date?: string } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl bg-card border border-border p-4 shadow-lg text-xs">
      <p className="font-bold text-foreground text-lg tracking-tight mb-1">{d?.score}</p>
      {d?.description && <p className="text-muted-foreground font-semibold mb-2">{d.description}</p>}
      {d?.date && <p className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">{fmtShort.format(new Date(d.date))}</p>}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────
export default function ScorePage() {
  const qc = useQueryClient();
  const { data: score, isLoading } = useGetScore();
  const { data: history } = useGetScoreHistory();
  const { data: timeline } = useGetScoreTimeline();
  const { data: leases } = useListLeases();
  const { data: disputes, isLoading: disputesLoading } = useListScoreDisputes();
  const [actionError, setActionError] = useState<string | null>(null);
  const { data: passportShares, isLoading: passportSharesLoading } = useListPassportShares();

  const confirmPay = useConfirmPayment();
  const latePayMutation = useRecordLatePayment();
  const disputeMut = useCreateDispute();
  const createPassportShare = useCreatePassportShare();
  const revokePassportShare = useRevokePassportShare();

  const [copied, setCopied] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeText, setDisputeText] = useState("");
  const [disputeSent, setDisputeSent] = useState(false);
  const [actionLeaseId, setActionLeaseId] = useState<number | null>(null);
  const [passportToken, setPassportToken] = useState<string | null>(null);
  const [passportExpiryDays, setPassportExpiryDays] = useState("7");
  const [passportError, setPassportError] = useState<string | null>(null);
  const [selectedLeaseId, setSelectedLeaseId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedLeaseId === null && leases?.length) {
      setSelectedLeaseId(leases.find((lease) => lease.isActive)?.id ?? leases[0]!.id);
    }
  }, [leases, selectedLeaseId]);

  useEffect(() => {
    const activeShare = passportShares?.find((share) => share.status === "active");
    if (!activeShare || passportToken) return;
    try {
      const storedToken = localStorage.getItem(`live_passport_token_${activeShare.id}`);
      if (storedToken) setPassportToken(storedToken);
    } catch {
      // Private browsing can reject storage; creation still works in-memory.
    }
  }, [passportShares, passportToken]);

  const tier = score ? (TIER_CONFIG[score.tier] ?? TIER_CONFIG.average) : null;
  const tierColorHex = score ? (TIER_CONFIG[score.tier]?.color ?? "hsl(224, 25%, 45%)") : "hsl(224, 25%, 45%)";

  function invalidate() {
    qc.invalidateQueries({ queryKey: getGetScoreQueryKey() });
    qc.invalidateQueries({ queryKey: getGetScoreHistoryQueryKey() });
    qc.invalidateQueries({ queryKey: getGetScoreTimelineQueryKey() });
    qc.invalidateQueries({ queryKey: getListLeasesQueryKey() });
    qc.invalidateQueries({ queryKey: getListScoreDisputesQueryKey() });
    qc.invalidateQueries({ queryKey: getListPassportSharesQueryKey() });
  }

  async function handleConfirmPayment(leaseId: number) {
    setActionLeaseId(leaseId);
    setActionError(null);
    try { await confirmPay.mutateAsync({ id: leaseId }); invalidate(); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Не удалось записать оплату вовремя."); }
    finally { setActionLeaseId(null); }
  }

  async function handleDispute() {
    if (disputeText.trim().length < 10 || selectedLeaseId === null) return;
    setActionError(null);
    try {
      await disputeMut.mutateAsync({ data: { reason: disputeText.trim(), leaseId: selectedLeaseId } });
      setDisputeSent(true);
      setDisputeText("");
      setTimeout(() => { setDisputeOpen(false); setDisputeSent(false); }, 3000);
      invalidate();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось зарегистрировать спор.");
    }
  }

  function getPassportUrl(token = passportToken) {
    return token ? `${window.location.origin}${import.meta.env.BASE_URL}passport/${token}` : null;
  }

  async function ensurePassportToken(forceNew = false) {
    if (passportToken && !forceNew) return passportToken;
    setPassportError(null);
    try {
      const share = await createPassportShare.mutateAsync({ data: { expiresInDays: Number(passportExpiryDays) } });
      setPassportToken(share.token);
      try { localStorage.setItem(`live_passport_token_${share.id}`, share.token); } catch {}
      qc.invalidateQueries({ queryKey: getListPassportSharesQueryKey() });
      return share.token;
    } catch (error) {
      setPassportError(error instanceof Error ? error.message : "Не удалось создать ссылку. Попробуйте ещё раз.");
      return null;
    }
  }

  async function handleCopyPassport(tokenOverride?: string) {
    const token = tokenOverride ?? await ensurePassportToken();
    const url = getPassportUrl(token);
    if (!url) return;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setPassportError("Не удалось скопировать ссылку. Откройте её в новой вкладке и скопируйте вручную.");
    }
  }

  async function handleCreateNewPassport() {
    await ensurePassportToken(true);
  }

  async function handleOpenPassport() {
    const token = await ensurePassportToken();
    const url = getPassportUrl(token);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleSystemShare() {
    const token = await ensurePassportToken();
    const url = getPassportUrl(token);
    if (!url) return;
    if (!navigator.share) {
      await handleCopyPassport(token ?? undefined);
      return;
    }
    try {
      await navigator.share({ title: "Мой Live Passport", text: "Мой Live Score", url });
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        setPassportError("Системное меню «Поделиться» недоступно. Ссылка скопирована.");
        await handleCopyPassport(token ?? undefined);
      }
    }
  }

  async function handleRevokePassport(shareId: number) {
    setPassportError(null);
    try {
      await revokePassportShare.mutateAsync({ id: shareId });
      try { localStorage.removeItem(`live_passport_token_${shareId}`); } catch {}
      if (passportToken) setPassportToken(null);
      qc.invalidateQueries({ queryKey: getListPassportSharesQueryKey() });
    } catch (error) {
      setPassportError(error instanceof Error ? error.message : "Не удалось отозвать ссылку.");
    }
  }

  const chartData = timeline
    ? timeline.filter((_: unknown, i: number, arr: unknown[]) => arr.length <= 40 || i === 0 || i === arr.length - 1 || i % Math.ceil(arr.length / 38) === 0)
    : [];

  return (
    <motion.div className="space-y-6 md:space-y-10" initial="hidden" animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}>

      {/* ── Header ── */}
      <motion.div variants={itemV} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Рейтинг доверия</h1>
          <p className="text-muted-foreground font-semibold mt-2">Индекс надёжности в экосистеме аренды</p>
        </div>
        <Link href="/profile">
          <button className="self-start sm:self-auto px-5 py-2.5 rounded-xl bg-background border border-border text-foreground font-bold text-sm hover:bg-muted transition-all flex items-center gap-2 shadow-sm active:scale-[0.98]">
            <ShieldCheck className="w-4.5 h-4.5 text-primary" /> Центр верификации
          </button>
        </Link>
      </motion.div>

      {/* ── Score hero card ── */}
      <motion.div variants={itemV}>
        {isLoading ? (
          <div className="animate-pulse trust-panel h-80 bg-muted/50" />
        ) : score && tier ? (
          <div className="trust-panel overflow-hidden relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 blur-3xl rounded-full pointer-events-none translate-x-1/2 -translate-y-1/2" />
            <div className="p-8 md:p-12 flex flex-col md:flex-row items-center gap-12 relative z-10">
              <PremiumScoreGauge score={score.score} color={tierColorHex} />
              
              <div className="flex-1 space-y-6 text-center md:text-left">
                <div className={cn("inline-flex items-center px-4 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-widest", tier.badge)}>
                  {tier.label}
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Оценка вашей надёжности</h2>
                  <p className="text-base text-muted-foreground mt-2 font-medium max-w-lg leading-relaxed">
                    Индекс формируется на основе платежной дисциплины, уровня верификации и истории договоров аренды.
                  </p>
                </div>
                
                {score.activeLease && (
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/40 border border-border/50 inline-flex max-w-full text-left backdrop-blur-sm">
                    <div className="w-12 h-12 rounded-lg bg-background shadow-sm border border-border flex items-center justify-center shrink-0">
                      <Home className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <p className="text-base font-bold text-foreground truncate">{score.activeLease.address}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-semibold">
                        {fmtRub(score.activeLease.monthlyRentRub)}/мес · с {fmt.format(new Date(score.activeLease.startDate))}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </motion.div>

      {/* ── Dynamic Chart ── */}
      {actionError && (
        <motion.div variants={itemV} className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </motion.div>
      )}
      {score && (
        <motion.div variants={itemV} className="trust-panel p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground tracking-tight">Как рассчитан Live Score</h2>
              <p className="text-sm text-muted-foreground font-medium mt-2">База не смешивается с вкладом категорий: итог = база + категории, затем ограничение 0–1000.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center shrink-0">
              <div className="rounded-xl bg-muted/50 border border-border px-5 py-3">
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">База</p>
                <p className="text-2xl font-bold text-foreground mt-1">{score.baseScore}</p>
              </div>
              <div className="rounded-xl bg-muted/50 border border-border px-5 py-3">
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Категории</p>
                <p className={cn("text-2xl font-bold mt-1", score.categoryScore >= 0 ? "text-primary" : "text-destructive")}>{score.categoryScore > 0 ? "+" : ""}{score.categoryScore}</p>
              </div>
            </div>
          </div>
          <p className="text-xs font-semibold text-muted-foreground mt-5">Версия расчёта: {score.scoreVersion}. Повторный запрос тех же событий даёт тот же результат.</p>
        </motion.div>
      )}
      {chartData.length > 1 && (
        <motion.div variants={itemV} className="trust-panel p-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-foreground tracking-tight">Динамика рейтинга</h2>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-3 py-1 rounded bg-muted border border-border">12 месяцев</span>
          </div>
          <div className="h-64 -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={tierColorHex} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={tierColorHex} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="date"
                  tickFormatter={(v: string) => fmtShort.format(new Date(v))}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontWeight: 700 }}
                  axisLine={false} tickLine={false} dy={12}
                  interval="preserveStartEnd" />
                <YAxis domain={[400, 1000]}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontWeight: 700 }}
                  axisLine={false} tickLine={false} dx={-10} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="score"
                  stroke={tierColorHex} strokeWidth={3}
                  fill="url(#scoreGrad)" dot={{ r: 0 }} activeDot={{ r: 6, fill: tierColorHex, stroke: "hsl(var(--background))", strokeWidth: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* ── Grid: Components & Actions ── */}
      <div className="grid xl:grid-cols-2 gap-8">
        
        {/* Score Components */}
        {score && (
          <motion.div variants={itemV}>
            <h2 className="text-xl font-bold text-foreground tracking-tight mb-5">Структура рейтинга</h2>
            <div className="space-y-4">
              {score.components.map((comp) => {
                const pct = Math.min(100, Math.round((comp.score / comp.maxScore) * 100));
                return (
                  <div key={comp.key} className="trust-panel p-5 hover:border-primary/20 transition-colors group">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-base font-bold text-foreground">{comp.name}</span>
                      <span className={cn("text-base font-bold", comp.score < 0 ? "text-destructive" : "text-foreground")}>{comp.score}
                        <span className="text-muted-foreground font-semibold"> / {comp.minScore}…{comp.maxScore}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div className="h-full rounded-full group-hover:brightness-110 transition-all" style={{ backgroundColor: tierColorHex }}
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 1, ease: "easeOut" }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground font-semibold mt-2">{comp.capDescription}{comp.capApplied ? " · применён" : ""}</p>
                    {comp.events.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {comp.events.slice(-3).map((event) => (
                          <div key={event.id} className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate text-muted-foreground">{event.description}</span>
                            <span className={cn("font-bold shrink-0", event.scoreChange >= 0 ? "text-primary" : "text-destructive")}>{event.scoreChange > 0 ? "+" : ""}{event.scoreChange}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* History & Active Leases */}
        <motion.div variants={itemV} className="space-y-8">
          {leases && leases.filter(l => l.isActive).length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-foreground tracking-tight mb-5">Управление арендой</h2>
              <div className="space-y-4">
                {leases.filter(l => l.isActive).map(lease => (
                  <div key={lease.id} className="trust-panel p-5">
                    <div className="flex items-start justify-between mb-5">
                      <div>
                        <p className="font-bold text-foreground text-base tracking-tight">{lease.address}</p>
                        <p className="text-xs text-muted-foreground mt-1.5 font-semibold">
                          {lease.onTimePayments} оплат вовремя
                          {lease.latePayments > 0 && <span className="text-destructive"> · {lease.latePayments} просрочки</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                       <button
                        onClick={() => handleConfirmPayment(lease.id)}
                        disabled={confirmPay.isPending && actionLeaseId === lease.id}
                        className="flex-1 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm font-bold hover:bg-muted transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
                      >
                        {confirmPay.isPending && actionLeaseId === lease.id ? "..." : <><CheckCircle2 className="w-4.5 h-4.5 text-primary" /> Оплата вовремя</>}
                      </button>
                       <button
                         onClick={() => {
                           setActionError(null);
                           latePayMutation.mutate({ id: lease.id }, { onSuccess: invalidate, onError: (error) => setActionError(error instanceof Error ? error.message : "Не удалось записать просрочку.") });
                         }}
                         disabled={latePayMutation.isPending}
                        className="px-4 py-2.5 rounded-xl bg-background border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/5 hover:border-destructive/20 transition-all disabled:opacity-50 flex items-center justify-center shadow-sm active:scale-[0.98]"
                        title="Отметить просрочку"
                      >
                        <AlertCircle className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {history && history.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-foreground tracking-tight mb-5">История изменений</h2>
              <div className="trust-panel overflow-hidden">
                {history.slice(0, 5).map((e, i) => (
                  <div key={e.id} className={cn("flex items-center gap-4 px-5 py-4 hover:bg-muted/40 transition-colors", i < 4 && "border-b border-border")}>
                    <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center shrink-0",
                      e.scoreChange > 0 ? "bg-primary/5 border-primary/20 text-primary" : "bg-destructive/5 border-destructive/20 text-destructive")}>
                      {e.scoreChange > 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{e.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 font-bold uppercase tracking-widest">{fmtShort.format(new Date(e.createdAt))}</p>
                    </div>
                    <span className={cn("text-base font-bold shrink-0 tracking-tight", e.scoreChange > 0 ? "text-primary" : "text-destructive")}>
                      {e.scoreChange > 0 ? "+" : ""}{e.scoreChange}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

      </div>

      {/* ── Footer utilities ── */}
      <div className="grid xl:grid-cols-2 gap-8">
        {/* Passport share */}
        <motion.div variants={itemV} className="trust-panel p-8 bg-foreground text-background relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/20 blur-3xl rounded-full pointer-events-none" />
          <div className="flex items-start gap-6 relative z-10">
            <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20 backdrop-blur-md">
              <Share2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-xl mb-2 tracking-tight">Live Passport</h3>
              <p className="text-sm text-background/70 font-semibold mb-4">Ссылка создаётся для этого аккаунта, действует ограниченное время и в любой момент может быть отозвана.</p>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <label htmlFor="passport-expiry" className="text-xs font-bold text-background/70">Срок действия</label>
                <select id="passport-expiry" value={passportExpiryDays} onChange={(event) => setPassportExpiryDays(event.target.value)}
                  className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm font-bold text-white">
                  <option value="1" className="text-foreground">1 день</option>
                  <option value="7" className="text-foreground">7 дней</option>
                  <option value="30" className="text-foreground">30 дней</option>
                </select>
              </div>
              {passportError && <p className="text-sm text-red-200 font-semibold mb-4" role="alert">{passportError}</p>}
              <div className="flex flex-wrap gap-3">
                <button onClick={() => void handleCopyPassport()}
                  disabled={createPassportShare.isPending}
                  className="flex-1 min-w-[170px] py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-60">
                  {copied ? <><Check className="w-4 h-4" /> Скопировано</> : <><Copy className="w-4 h-4" /> Копировать ссылку</>}
                </button>
                <button onClick={handleOpenPassport} disabled={createPassportShare.isPending}
                  className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white font-bold text-sm hover:bg-white/20 transition-all flex items-center justify-center active:scale-[0.98] disabled:opacity-60">Открыть</button>
                <button onClick={handleSystemShare} disabled={createPassportShare.isPending}
                  className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white font-bold text-sm hover:bg-white/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60"><Share2 className="w-4 h-4" /> Поделиться</button>
                <button onClick={() => void handleCreateNewPassport()} disabled={createPassportShare.isPending}
                  className="w-full py-2.5 rounded-xl bg-transparent border border-white/20 text-background/80 font-bold text-xs hover:bg-white/10 transition-all active:scale-[0.98] disabled:opacity-60">Создать новую ссылку</button>
              </div>
              <div className="mt-6 space-y-2" data-testid="passport-share-list">
                <p className="text-xs font-bold uppercase tracking-widest text-background/50">Ссылки доступа</p>
                {passportSharesLoading ? <p className="text-sm text-background/60">Загружаем список…</p> : passportShares?.length ? passportShares.map((share) => (
                  <div key={share.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-xs">
                    <span className="text-background/80">
                      {share.status === "active" ? "Активна" : share.status === "revoked" ? "Отозвана" : "Истекла"} · до {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(share.expiresAt))}
                    </span>
                    {share.status === "active" && <button onClick={() => void handleRevokePassport(share.id)} disabled={revokePassportShare.isPending}
                      className="font-bold text-red-200 hover:text-white disabled:opacity-60">Отозвать</button>}
                  </div>
                )) : <p className="text-sm text-background/60">Активных ссылок пока нет.</p>}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Dispute */}
        <motion.div variants={itemV} className="trust-panel p-8 bg-muted/40">
          <div className="flex items-start gap-6">
            <div className="w-14 h-14 rounded-xl bg-background shadow-sm border border-border flex items-center justify-center shrink-0">
              <Info className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="flex-1 w-full">
              <h3 className="font-bold text-foreground text-xl mb-2 tracking-tight">Оспорить оценку</h3>
              <p className="text-sm text-muted-foreground font-semibold mb-6">Не согласны с изменением рейтинга или получили ошибочную просрочку?</p>
              
              {!disputeOpen && !disputeSent && (
                <div className="space-y-3">
                <label className="block text-xs font-bold text-muted-foreground">
                  Аренда, к которой относится спор
                  <select value={selectedLeaseId ?? ""} onChange={(event) => setSelectedLeaseId(Number(event.target.value))}
                    className="mt-2 w-full rounded-xl bg-background border border-border px-4 py-3 text-sm font-semibold text-foreground">
                    {leases?.filter((lease) => lease.isActive).map((lease) => <option key={lease.id} value={lease.id}>{lease.address}</option>)}
                  </select>
                </label>
                <button onClick={() => setDisputeOpen(true)}
                  className="w-full py-3 rounded-xl bg-background border border-border text-foreground font-bold text-sm hover:bg-muted transition-all shadow-sm active:scale-[0.98]">
                  Зарегистрировать спор
                </button>
                </div>
              )}
              {disputeOpen && !disputeSent && (
                <div className="space-y-4">
                  <textarea value={disputeText} onChange={e => setDisputeText(e.target.value)}
                    placeholder="Подробно опишите ситуацию..."
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground text-sm font-medium placeholder:font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none transition-all shadow-inner"
                    rows={3} />
                  <div className="flex gap-3">
                    <button onClick={handleDispute} disabled={disputeMut.isPending || disputeText.trim().length < 10}
                      className="flex-1 py-2.5 rounded-xl bg-foreground text-background font-bold text-sm hover:bg-foreground/90 transition-all disabled:opacity-50 active:scale-[0.98]">
                      Отправить в поддержку
                    </button>
                    <button onClick={() => { setDisputeOpen(false); setDisputeText(""); }}
                      className="px-5 py-2.5 rounded-xl bg-transparent border border-transparent text-muted-foreground font-bold text-sm hover:bg-muted transition-all active:scale-[0.98]">
                      Отмена
                    </button>
                  </div>
                </div>
              )}
              {disputeSent && (
                <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-3 text-primary text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> Спор зарегистрирован и передан модераторам.
                </div>
              )}
              {!disputesLoading && disputes && disputes.length > 0 && (
                <div className="mt-6 space-y-2" data-testid="score-disputes">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Мои споры</p>
                  {disputes.map((dispute) => (
                    <div key={dispute.id} className="rounded-xl border border-border bg-background px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-bold text-foreground">Спор по аренде #{dispute.leaseId}</span>
                        <span className="text-xs font-bold text-primary">{dispute.status === "created" ? "Создан" : dispute.status === "under_review" ? "На рассмотрении" : dispute.status === "resolved" ? "Одобрен" : "Отклонён"}</span>
                      </div>
                      {dispute.resolutionReason && <p className="text-xs text-muted-foreground mt-2">{dispute.resolutionReason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

    </motion.div>
  );
}
