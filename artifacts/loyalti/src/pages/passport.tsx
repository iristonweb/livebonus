import { useParams } from "wouter";
import { getGetPassportQueryKey, useGetPassport } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ShieldCheck, CheckCircle2, Home, CalendarDays, CircleAlert } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}
const TIER_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  premium:       { label: "Premium",        color: "hsl(226, 70%, 65%)", bg: "hsl(226, 70%, 15%)" },
  high:          { label: "Надёжный",       color: "hsl(250, 60%, 75%)", bg: "hsl(250, 50%, 15%)" },
  above_average: { label: "Хороший",        color: "hsl(200, 70%, 60%)", bg: "hsl(200, 60%, 15%)" },
  average:       { label: "Средний",        color: "hsl(28, 80%, 60%)",  bg: "hsl(28, 70%, 15%)" },
  below_average: { label: "Начинающий",     color: "hsl(224, 20%, 60%)", bg: "hsl(224, 20%, 15%)" },
};

function PassportScoreGauge({ score, color }: { score: number; color: string }) {
  const size = 180;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.min(1, score / 1000));

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 drop-shadow-xl">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-white/10" />
        <circle
          cx={size/2} cy={size/2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-5xl font-bold text-white tracking-tighter">{score}</span>
        <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest mt-1">из 1000</span>
      </div>
    </div>
  );
}

function VerifiedBadge({ label, achieved }: { label: string; achieved: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors",
      achieved
        ? "bg-white/10 border-white/20 text-white backdrop-blur-sm"
        : "bg-white/5 border-white/5 text-white/30"
    )}>
      <CheckCircle2 className={cn("w-4 h-4", achieved ? "text-white" : "text-white/20")} />
      {label}
    </div>
  );
}

export default function PassportPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const isValidToken = /^[A-Za-z0-9_-]{40,80}$/.test(token);
  const { data: passport, isLoading, error } = useGetPassport(token, {
    query: { enabled: isValidToken, queryKey: getGetPassportQueryKey(token) },
  });

  const tier = passport ? (TIER_CONFIG[passport.tier] ?? TIER_CONFIG.below_average) : null;

  if (isValidToken && isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-foreground">
        <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (error || !passport) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-foreground text-center p-6">
        <div>
          <ShieldCheck className="w-16 h-16 text-white/20 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Паспорт недоступен</h1>
          <p className="text-white/50 text-base font-medium">Профиль не найден или доступ ограничен</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] font-sans bg-foreground text-white py-12 px-4 md:px-8 relative overflow-hidden">
      {/* Background Watermark */}
      <BrandMark className="absolute top-0 right-0 w-[800px] h-[800px] opacity-[0.03] text-white pointer-events-none translate-x-1/4 -translate-y-1/4" />
      
      <div className="max-w-3xl mx-auto relative z-10">
        
        {/* Header */}
        <motion.div
          className="flex items-center justify-between mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex items-center gap-4">
            <BrandMark type="primary" className="w-12 h-12 drop-shadow-lg" />
            <div>
              <p className="text-white font-bold text-xl tracking-tight leading-none">Live Score</p>
              <p className="text-white/50 text-[11px] font-bold uppercase tracking-widest mt-1">Housing Trust</p>
            </div>
          </div>
          <div className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 backdrop-blur-md text-white/90 text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm">
            <ShieldCheck className="w-4 h-4 text-primary" /> Live Passport
          </div>
        </motion.div>

        {/* Main Card */}
        <motion.div
          className="rounded-3xl border border-white/10 overflow-hidden mb-8 bg-white/5 backdrop-blur-xl shadow-2xl relative"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
        >
          {/* Subtle inner glow matching tier color */}
          <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none" style={{ background: `radial-gradient(circle at top right, ${tier?.color ?? 'white'}, transparent 50%)` }} />
          
          <div className="p-8 md:p-12 relative z-10">
            <div className="flex flex-col md:flex-row items-center gap-10 mb-10">
              <PassportScoreGauge score={passport.score} color={tier?.color ?? "hsl(226, 70%, 55%)"} />
              
              <div className="text-center md:text-left flex-1">
                <div className="inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest mb-4 border border-current shadow-sm" style={{ color: tier?.color ?? "white" }}>
                  {tier?.label}
                </div>
                 <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-3 flex items-center justify-center md:justify-start gap-3 drop-shadow-md">
                   Live Passport
                </h1>
                <p className="text-white/70 text-base font-semibold">
                  {passport.totalLeases} договоров аренды · {passport.activeLeases || 0} активных
                </p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold mt-5">Сформировано: {formatDate(passport.generatedAt)}</p>
              </div>
            </div>

            <div className="mb-10 p-6 rounded-2xl bg-black/20 border border-white/5">
              <p className="text-white/50 text-[11px] font-bold uppercase tracking-widest mb-4">Статусы верификации</p>
              <div className="flex flex-wrap gap-3">
                <VerifiedBadge label="Телефон" achieved={passport.isPhoneVerified} />
                <VerifiedBadge label="Личность" achieved={passport.isIdentityVerified} />
                <VerifiedBadge label="Доход" achieved={passport.isIncomeVerified} />
              </div>
            </div>

             <div>
               <p className="text-white/50 text-[11px] font-bold uppercase tracking-widest mb-5">Агрегированная история аренды</p>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                 {[
                   { label: "Всего договоров", value: passport.totalLeases, icon: Home },
                   { label: "Активных", value: passport.activeLeases, icon: Home },
                   { label: "Месяцев аренды", value: passport.totalTenureMonths, icon: CalendarDays },
                   { label: "Вовремя", value: passport.totalOnTimePayments, icon: CheckCircle2 },
                 ].map(({ label, value, icon: Icon }) => (
                   <div key={label} className="rounded-2xl bg-black/20 border border-white/5 p-4">
                     <Icon className="w-5 h-5 text-white/50 mb-3" />
                     <p className="text-2xl font-bold text-white">{value}</p>
                     <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mt-1">{label}</p>
                   </div>
                 ))}
               </div>
               {passport.totalLatePayments > 0 && (
                 <div className="mt-4 flex items-center gap-2 text-sm text-white/60">
                   <CircleAlert className="w-4 h-4" /> Просроченных платежей: {passport.totalLatePayments}
                 </div>
               )}
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
