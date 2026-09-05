import { useListPartners } from "@workspace/api-client-react";
import { CATEGORY_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { EmptyList } from "@/components/illustrations";
import { PartnerLogo } from "@/components/partner-logo";
import { Link, useLocation, useSearch } from "wouter";
import { Check, Copy, X } from "lucide-react";
import { useState } from "react";

const CATEGORIES = ["all", "rent", "utilities", "transport", "health", "food", "other"] as const;
const CAT_LABELS: Record<string, string> = { all: "Все категории", ...CATEGORY_LABELS };

function getCategoryFromSearch(search: string) {
  const category = new URLSearchParams(search).get("category");
  return CATEGORIES.includes(category as (typeof CATEGORIES)[number]) ? category! : "all";
}

const BORDER_COLORS: Record<string, string> = {
  rent: "border-primary",
  utilities: "border-slate-400",
  transport: "border-orange-400",
  health: "border-teal-500",
  food: "border-red-500",
  other: "border-border",
};

const ICON_COLORS: Record<string, string> = {
  rent: "bg-primary/10 text-primary border-primary/20",
  utilities: "bg-slate-500/10 text-slate-500 border-slate-500/20 dark:text-slate-400",
  transport: "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400",
  health: "bg-teal-500/10 text-teal-600 border-teal-500/20 dark:text-teal-400",
  food: "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
  other: "bg-muted text-muted-foreground border-border",
};

export default function Partners() {
  const [, setLocation] = useLocation();
  const activeCategory = getCategoryFromSearch(useSearch());
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const { data: partners, isLoading, isError, refetch } = useListPartners(
    activeCategory !== "all" ? { category: activeCategory } : {},
    { query: { queryKey: ["partners", activeCategory], retry: false } }
  );

  async function handleCopyLink() {
    setCopyStatus("idle");
    const url = new URL(window.location.href);
    url.search = activeCategory === "all" ? "" : new URLSearchParams({ category: activeCategory }).toString();
    url.hash = "";

    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(url.toString());
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <motion.div 
      className="space-y-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Каталог партнёров</h1>
          <p className="text-sm text-muted-foreground font-semibold mt-2">Повышенный кэшбэк при оплате сервисов</p>
        </div>
        <button
          type="button"
          data-testid="partner-copy-link"
          onClick={handleCopyLink}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs font-bold shadow-sm transition-all hover:bg-muted active:scale-[0.98] sm:shrink-0"
        >
          {copyStatus === "copied" ? <Check className="w-4 h-4 text-emerald-600" /> : copyStatus === "error" ? <X className="w-4 h-4 text-destructive" /> : <Copy className="w-4 h-4" />}
          {copyStatus === "copied" ? "Ссылка скопирована" : copyStatus === "error" ? "Не удалось скопировать" : "Скопировать ссылку"}
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {copyStatus === "copied" ? "Ссылка на текущую категорию скопирована" : copyStatus === "error" ? "Не удалось скопировать ссылку. Проверьте разрешения браузера" : ""}
      </p>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            data-testid={`partner-filter-${cat}`}
            aria-pressed={activeCategory === cat}
            onClick={() => setLocation(cat === "all" ? "/partners" : `/partners?category=${cat}`)}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-bold transition-all border shadow-sm active:scale-[0.98]",
              activeCategory === cat
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {CAT_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Partners grid */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse trust-panel h-48 bg-muted/50" />
          ))}
        </div>
      ) : isError ? (
        <div data-testid="partners-error" role="alert" className="trust-panel flex flex-col items-center justify-center p-8 text-center">
          <p className="text-lg font-bold text-foreground">Не удалось загрузить каталог партнёров</p>
          <p className="mt-2 max-w-md text-sm font-medium text-muted-foreground">
            Сервис временно недоступен. Повторите попытку, чтобы снова увидеть актуальный каталог.
          </p>
          <button
            type="button"
            data-testid="partners-retry"
            onClick={() => void refetch()}
            className="mt-5 rounded-xl bg-foreground px-5 py-2.5 text-sm font-bold text-background transition-colors hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            Повторить
          </button>
        </div>
      ) : partners?.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {partners.map((partner) => {
            const borderClass = BORDER_COLORS[partner.category] || BORDER_COLORS.other;
            const iconClass = ICON_COLORS[partner.category] || ICON_COLORS.other;
            
            return (
              <Link
                key={partner.id}
                href={`/partners/${partner.id}`}
                aria-label={`Открыть карточку партнёра «${partner.name}»`}
                data-testid={`partner-card-${partner.id}`}
                data-category={partner.category}
                className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <motion.div
                  whileHover={{ y: -4, scale: 1.01 }}
                  className={cn("trust-panel p-6 relative flex flex-col justify-between min-h-[180px] group transition-all duration-300 border-l-[6px] shadow-md hover:shadow-xl hover:border-r-border/80", borderClass)}
                >
                  <div className="flex justify-between items-start">
                    <PartnerLogo
                      name={partner.name}
                      logoUrl={partner.logoUrl}
                      className={cn("w-14 h-14 rounded-xl border flex items-center justify-center font-bold text-2xl shadow-sm", iconClass)}
                    />
                    <div className="px-3 py-1.5 bg-background border border-border rounded-lg text-[11px] font-bold text-foreground uppercase tracking-wider shadow-sm">
                      <span data-testid={`partner-multiplier-${partner.id}`}>{partner.bonusMultiplier}×</span>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h3 className="text-xl font-bold text-foreground tracking-tight truncate">{partner.name}</h3>
                    <div className="mt-2">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                        {CATEGORY_LABELS[partner.category] ?? partner.category}
                      </span>
                    </div>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground trust-panel">
          <EmptyList className="w-24 h-24 mb-6" />
          <p className="text-lg font-bold text-foreground tracking-tight">Партнёров не найдено</p>
          <p className="text-sm mt-2 font-medium">В этой категории пока нет предложений</p>
        </div>
      )}
    </motion.div>
  );
}
