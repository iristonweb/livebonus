import { useListOffers } from "@workspace/api-client-react";
import { CATEGORY_LABELS, daysUntil } from "@/lib/format";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { EmptyList } from "@/components/illustrations";
import { PartnerLogo } from "@/components/partner-logo";
import { Link, useLocation, useSearch } from "wouter";
import { Check, Copy, X } from "lucide-react";
import { useState } from "react";

const CATEGORIES = ["all", "rent", "utilities", "transport", "health", "food", "other"] as const;
const CAT_LABELS: Record<string, string> = { all: "Все", ...CATEGORY_LABELS };

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

export default function Offers() {
  const [, setLocation] = useLocation();
  const activeCategory = getCategoryFromSearch(useSearch());
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const { data: offers, isLoading, isError, refetch } = useListOffers(
    activeCategory !== "all" ? { category: activeCategory } : {},
    { query: { queryKey: ["offers", activeCategory], retry: false } }
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
      className="space-y-8 max-w-4xl mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Спецпредложения</h1>
          <p className="text-sm text-muted-foreground font-semibold mt-2">Ограниченные по времени множители баллов</p>
        </div>
        <button
          type="button"
          data-testid="offer-copy-link"
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
            data-testid={`offer-filter-${cat}`}
            aria-pressed={activeCategory === cat}
            onClick={() => setLocation(cat === "all" ? "/offers" : `/offers?category=${cat}`)}
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

      {isLoading ? (
        <div className="space-y-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse trust-panel h-32 bg-muted/50" />
          ))}
        </div>
      ) : isError ? (
        <div data-testid="offers-error" role="alert" className="trust-panel flex flex-col items-center justify-center p-8 text-center">
          <p className="text-lg font-bold text-foreground">Не удалось загрузить предложения</p>
          <p className="mt-2 max-w-md text-sm font-medium text-muted-foreground">
            Каталог временно недоступен. Повторите попытку, чтобы снова увидеть актуальные предложения.
          </p>
          <button
            type="button"
            data-testid="offers-retry"
            onClick={() => void refetch()}
            className="mt-5 rounded-xl bg-foreground px-5 py-2.5 text-sm font-bold text-background transition-colors hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            Повторить
          </button>
        </div>
      ) : offers?.length ? (
        <div className="space-y-5">
          {offers.map((offer) => {
            const days = daysUntil(offer.expiresAt);
            const urgent = days <= 7;
            const borderClass = BORDER_COLORS[offer.category] || BORDER_COLORS.other;

            return (
              <Link
                key={offer.id}
                href={`/offers/${offer.id}`}
                aria-label={`Открыть предложение «${offer.title}»`}
                data-testid={`offer-item-${offer.id}`}
                data-category={offer.category}
                className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <motion.div
                  whileHover={{ y: -2, scale: 1.01 }}
                  className={cn("trust-panel p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6 border-l-[6px] transition-all duration-300 shadow-md hover:shadow-xl", borderClass)}
                >
                  {/* Mobile top section */}
                  <div className="flex items-start justify-between md:hidden w-full">
                    <PartnerLogo name={offer.partnerName} logoUrl={offer.partnerLogoUrl} className="w-12 h-12 rounded-xl border border-border text-xl" />
                    <span className="bg-foreground text-background px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide shadow-sm">
                      {offer.bonusMultiplier}×
                    </span>
                  </div>

                  <PartnerLogo name={offer.partnerName} logoUrl={offer.partnerLogoUrl} className="hidden md:flex shrink-0 w-14 h-14 rounded-xl border border-border text-2xl text-foreground shadow-sm" />

                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-foreground truncate tracking-tight">{offer.title}</h3>
                    <p className="text-[11px] font-bold text-muted-foreground mt-1.5 truncate uppercase tracking-widest">{offer.partnerName}</p>
                  </div>

                  <div className="flex flex-row md:flex-col items-center md:items-end justify-between gap-3 shrink-0 md:w-48">
                    <div className="hidden md:block bg-foreground text-background px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide shadow-sm">
                      {offer.bonusMultiplier}× баллов
                    </div>
                    <div className={cn("flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border",
                      urgent ? "text-destructive border-destructive/20 bg-destructive/5" : "text-muted-foreground border-border bg-muted/50")}>
                      {urgent && <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />}
                      {days === 0 ? "Истекает сегодня" : `Осталось ${days} дн.`}
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
          <p className="text-lg font-bold text-foreground tracking-tight">Нет активных предложений</p>
          <p className="text-sm mt-2 font-medium">Попробуйте выбрать другую категорию</p>
        </div>
      )}
    </motion.div>
  );
}
