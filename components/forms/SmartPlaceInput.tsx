"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/forms/FormBits";

type Kind = "city" | "district" | "metro";

// In-memory cache для результатов поиска
interface CacheEntry {
  results: string[];
  timestamp: number;
}

const searchCache = new Map<string, CacheEntry>();
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 минут
const CACHE_MAX_SIZE = 100; // максимум 100 записей

function getCached(query: string): string[] | null {
  const entry = searchCache.get(query);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_MAX_AGE) {
    searchCache.delete(query);
    return null;
  }
  return entry.results;
}

function setCached(query: string, results: string[]) {
  // Очистка старых записей при превышении лимита
  if (searchCache.size >= CACHE_MAX_SIZE) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey !== undefined) {
      searchCache.delete(firstKey);
    }
  }
  searchCache.set(query, { results, timestamp: Date.now() });
}

const CITY_SUGGESTIONS = [
  "Москва",
  "Санкт‑Петербург",
  "Казань",
  "Нижний Новгород",
  "Екатеринбург",
  "Новосибирск",
  "Краснодар",
  "Сочи",
  "Ростов‑на‑Дону",
  "Самара",
  "Уфа",
  "Воронеж",
  "Пермь",
  "Волгоград",
  "Калининград",
  "Владивосток",
];

const METRO_HINTS: Record<string, string[]> = {
  "Москва": [
    "Охотный ряд",
    "Тверская",
    "Пушкинская",
    "Китай‑город",
    "Киевская",
    "Павелецкая",
    "Комсомольская",
    "Курская",
    "Белорусская",
    "ВДНХ",
    "Сокол",
    "Аэропорт",
  ],
  "Санкт‑Петербург": [
    "Невский проспект",
    "Гостиный двор",
    "Петроградская",
    "Чкаловская",
    "Василеостровская",
    "Московская",
    "Площадь Восстания",
    "Лиговский проспект",
  ],
};

function uniqLimit(items: string[], limit: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    const k = x.trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= limit) break;
  }
  return out;
}

async function nominatimSearch(q: string, signal?: AbortSignal): Promise<string[]> {
  // Проверка кэша
  const cached = getCached(q);
  if (cached !== null) return cached;

  // Note: public endpoint. In production you should add proper caching/rate-limits and User-Agent policy.
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "ru");
  url.searchParams.set("q", q);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "Accept-Language": "ru",
      },
      signal,
    });

    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ display_name?: string }>;
    const results = data.map((x) => x.display_name).filter(Boolean) as string[];
    setCached(q, results);
    return results;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return []; // Запрос отменён, это нормально
    }
    throw err; // Другие ошибки пробрасываем дальше
  }
}

export function SmartPlaceInput({
  value,
  onChange,
  kind,
  cityContext,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  kind: Kind;
  cityContext?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remote, setRemote] = useState<string[]>([]);
  const [local, setLocal] = useState<string[]>([]);
  const [active, setActive] = useState<number>(-1);
  const tRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const normalizedCity = (cityContext ?? "").replace("Санкт-Петербург", "Санкт‑Петербург");

  // Outside click handler
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    // Небольшая задержка, чтобы не закрывать сразу при открытии
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    const q = value.trim();
    if (tRef.current) window.clearTimeout(tRef.current);

    // Отменяем предыдущий запрос
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Local suggestions (instant)
    const qLower = q.toLowerCase();
    let locals: string[] = [];
    if (kind === "city") {
      locals = CITY_SUGGESTIONS.filter((c) => c.toLowerCase().includes(qLower));
    } else if (kind === "metro") {
      const list = METRO_HINTS[normalizedCity] ?? [];
      locals = list.filter((m) => m.toLowerCase().includes(qLower));
    } else {
      // district: suggest nothing locally (varies a lot)
      locals = [];
    }
    setLocal(uniqLimit(locals, 6));
    setActive(-1);
    setError(null);

    if (q.length < 3) {
      setRemote([]);
      setLoading(false);
      return;
    }

    // Remote suggestions (debounced, увеличен до 300ms)
    tRef.current = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      // Создаём новый AbortController для этого запроса
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        let query = q;
        if (kind === "city") query = q;
        if (kind === "district") query = normalizedCity ? `${q}, ${normalizedCity}` : q;
        if (kind === "metro") query = normalizedCity ? `метро ${q}, ${normalizedCity}` : `станция метро ${q}`;

        const results = await nominatimSearch(query, controller.signal);
        
        // Проверяем, не был ли запрос отменён
        if (!controller.signal.aborted) {
          setRemote(uniqLimit(results, 6));
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Запрос отменён, это нормально
          return;
        }
        // Другие ошибки
        setError("Ошибка загрузки подсказок");
        setRemote([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      if (tRef.current) window.clearTimeout(tRef.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [value, kind, normalizedCity]);

  const items = useMemo(() => {
    // Merge local + remote, with local first.
    return uniqLimit([...local, ...remote], 8);
  }, [local, remote]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        aria-expanded={open}
        aria-haspopup="listbox"
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
          }
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, items.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, -1));
          }
          if (e.key === "Enter") {
            if (active >= 0 && active < items.length) {
              e.preventDefault();
              pick(items[active]);
            }
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          }
        }}
      />

      {open && (items.length > 0 || loading || error) ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(100% + 8px)",
            zIndex: 50,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "var(--shadow)",
          }}
        >
          {loading ? (
            <div className="small" style={{ padding: 12, color: "var(--muted)", textAlign: "center" }}>
              Ищем варианты…
            </div>
          ) : error ? (
            <div className="small" style={{ padding: 12, color: "var(--muted)", textAlign: "center" }}>
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="small" style={{ padding: 12, color: "var(--muted)", textAlign: "center" }}>
              Ничего не найдено
            </div>
          ) : null}

          {items.map((it, idx) => (
            <button
              key={it + idx}
              type="button"
              role="option"
              aria-selected={idx === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(it);
              }}
              onMouseEnter={() => setActive(idx)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                border: "none",
                background: idx === active ? "var(--surface2)" : "transparent",
                color: "var(--text)",
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
            >
              {it}
            </button>
          ))}

          {!loading && !error && items.length > 0 ? (
            <div className="small" style={{ padding: 10, borderTop: "1px solid var(--border)", color: "var(--muted)" }}>
              Подсказки: локальные + OpenStreetMap (демо). В проде — кэш/лимиты и провайдер (DaData/Geo API).
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
