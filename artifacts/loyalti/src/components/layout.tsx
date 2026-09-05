import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useGetMe, useGetScore } from "@workspace/api-client-react";
import { 
  Home, 
  ShieldCheck, 
  Wallet, 
  Store, 
  Tag, 
  Calculator, 
  LineChart, 
  UserCircle 
} from "lucide-react";
import { BrandMark } from "./brand-mark";

const TIER_LABEL: Record<string, string> = {
  premium: "Premium",
  high: "Надёжный",
  above_average: "Хороший",
  average: "Средний",
  below_average: "Начинающий",
};

const NAV_ITEMS = [
  { href: "/", label: "Обзор", icon: Home },
  { href: "/score", label: "Рейтинг доверия", icon: ShieldCheck },
  { href: "/wallet", label: "Транзакции", icon: Wallet },
  { href: "/partners", label: "Каталог", icon: Store },
  { href: "/offers", label: "Предложения", icon: Tag },
  { href: "/calculator", label: "Калькулятор", icon: Calculator },
  { href: "/admin", label: "Аналитика", icon: LineChart, adminOnly: true },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const { data: scoreData } = useGetScore();

  const initials = user?.name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() ?? "A";
  const tierLabel = scoreData ? (TIER_LABEL[scoreData.tier] ?? "Арендатор") : "Арендатор";

  return (
    <div className="min-h-[100dvh] flex bg-background selection:bg-primary/20 font-sans text-foreground">
      {/* ── Sidebar ── */}
      <aside className="hidden md:flex flex-col w-72 bg-sidebar border-r border-sidebar-border shrink-0 relative overflow-hidden">
        {/* Subtle geometric watermark for depth */}
        <BrandMark className="absolute -right-16 -top-16 w-64 h-64 opacity-[0.03] text-sidebar-primary pointer-events-none" />
        
        {/* Brand */}
        <div className="px-8 py-10 relative z-10">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer group">
              <BrandMark className="w-11 h-11 text-sidebar-primary drop-shadow-md" />
              <div>
                <h2 className="font-bold text-xl text-sidebar-foreground tracking-tight leading-none group-hover:text-sidebar-primary transition-colors">Live Score</h2>
                <p className="text-[10px] font-semibold text-sidebar-foreground/50 uppercase tracking-widest mt-1.5">Housing Trust</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-5 space-y-1.5 relative z-10">
          {NAV_ITEMS.filter(({ adminOnly }) => !adminOnly || user?.isAdmin === true).map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <div className={cn(
                  "flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer group",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}>
                  <Icon className={cn("w-4.5 h-4.5", active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70")} strokeWidth={active ? 2.5 : 2} />
                  <span className="flex-1">{label}</span>
                  {label === "Рейтинг доверия" && scoreData && (
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded",
                      active ? "bg-black/20 text-white" : "bg-sidebar-accent border border-sidebar-border text-sidebar-foreground/80",
                    )}>
                      {scoreData.score}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Profile card */}
        <div className="p-5 relative z-10">
          <Link href="/profile">
            <div className="flex items-center gap-3.5 p-3.5 rounded-xl border border-sidebar-border/50 hover:bg-sidebar-accent transition-colors cursor-pointer group bg-sidebar-accent/30 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-sidebar-primary/20 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-sidebar-primary">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-sidebar-foreground truncate">{user?.name ?? "Загрузка…"}</p>
                <p className="text-xs font-semibold text-sidebar-foreground/50 mt-0.5 truncate">{tierLabel}</p>
              </div>
            </div>
          </Link>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 min-w-0 flex flex-col relative z-10">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2.5 cursor-pointer">
              <BrandMark className="w-8 h-8 text-primary" />
              <span className="font-bold text-foreground text-base tracking-tight">Live Score</span>
            </div>
          </Link>
          <Link href="/profile">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center cursor-pointer border border-primary/20">
              <span className="text-xs font-bold text-primary">{initials}</span>
            </div>
          </Link>
        </header>

        <div className="flex-1 p-4 md:p-8 lg:p-10 max-w-6xl mx-auto w-full">
          {children}
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden sticky bottom-0 z-20 bg-card/95 backdrop-blur-md border-t border-border px-2 py-1.5 flex justify-around shadow-[0_-4px_24px_rgba(0,0,0,0.02)] pb-safe">
          {[
            { href: "/", label: "Обзор", icon: Home },
            { href: "/score", label: "Рейтинг", icon: ShieldCheck },
            { href: "/wallet", label: "История", icon: Wallet },
            { href: "/partners", label: "Каталог", icon: Store },
            { href: "/profile", label: "Профиль", icon: UserCircle },
          ].map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <div className={cn(
                  "flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl transition-all",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}>
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
                  <span className="text-[10px] font-bold">{label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
