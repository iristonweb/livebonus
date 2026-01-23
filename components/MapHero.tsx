"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import Link from "next/link";

type Chip = {
  top: string;
  left: string;
  title: string;
  sub: string;
  icon?: string;
  tone?: "mint" | "lime" | "neutral";
  float?: "a" | "b" | "c";
  href?: string; // Якорь на /features
};

const chips: Chip[] = [
  { top: "18%", left: "58%", title: "Аптека рядом", sub: "+100 баллов", icon: "💊", tone: "mint", float: "a", href: "/features#perks" },
  { top: "34%", left: "70%", title: "Ужин у партнёра", sub: "300 баллов", icon: "🍽️", tone: "neutral", float: "b", href: "/features#perks" },
  { top: "46%", left: "54%", title: "Вы оплатили жильё", sub: "2 500 баллов", icon: "🏠", tone: "lime", float: "c", href: "/features#earn" },
  { top: "58%", left: "64%", title: "Такси", sub: "−10% или баллы", icon: "🚕", tone: "neutral", float: "a", href: "/features#perks" },
  { top: "66%", left: "46%", title: "Фитнес", sub: "комплимент", icon: "🏋️", tone: "mint", float: "b", href: "/features#perks" },
  { top: "74%", left: "60%", title: "Доставка", sub: "повышенные баллы", icon: "🛵", tone: "neutral", float: "c", href: "/features#perks" },
];

export function MapHero() {
  const [scrollY, setScrollY] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const heroRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Проверяем prefers-reduced-motion
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduceMotion(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setScrollY(0);
      return;
    }

    function handleScroll() {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        if (isVisible) {
          // Очень subtle parallax: максимум 20px смещения
          const parallax = Math.min(rect.top * 0.1, 20);
          setScrollY(parallax);
        }
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial call
    return () => window.removeEventListener("scroll", handleScroll);
  }, [reduceMotion]);
  return (
    <section ref={heroRef} className="mapHero heroNeo">
      <div className="mapCanvas" aria-hidden="true" style={{ transform: `translateY(${scrollY * 0.3}px)` }} />
      <div className="heroGrid" aria-hidden="true" />
      <div className="heroGlow heroGlowA" aria-hidden="true" />
      <div className="heroGlow heroGlowB" aria-hidden="true" />

      <div className="container">
        <div className="mapHeroInner heroStage">
          <div className="heroPanel">
            <div className="kicker">
              <span className="kickerDot" />
              Для участников • СБП • Данные в РФ
            </div>

            <h1 className="mapH1">Баллы за оплату жилья — быстро, прозрачно, без комиссий</h1>

            <p className="heroSubline">
              Платёж через СБП → подтверждение в банке → начисление баллов. Контроль согласий и статусов — в один клик.
            </p>

            <div className="heroTrustStrip">
              <span className="trustItem">152‑ФЗ</span>
              <span className="trustItem">СБП</span>
              <span className="trustItem">Opt‑in</span>
            </div>

            <div className="heroCtas">
              <Button href="/start" variant="primary">
                Начать оплату
              </Button>
              <Button href="/apply">Анкета</Button>
            </div>
          </div>

          <div className="mapChipField" aria-hidden="true">
            {chips.map((c, i) => {
              const chipContent = (
                <>
                  <div className="chipIcon" aria-hidden="true">
                    {c.icon ?? "•"}
                  </div>
                  <div style={{ display: "grid", gap: 2 }}>
                    <div className="chipTitle">{c.title}</div>
                    <div className="chipSub">{c.sub}</div>
                  </div>
                </>
              );

              // Subtle parallax: очень лёгкое смещение при скролле
              const parallaxOffset = scrollY * (0.12 + i * 0.02);
              const chipStyle = {
                top: c.top,
                left: c.left,
                transform: `translate3d(0, ${parallaxOffset}px, 0)`,
              };

              const finalChipStyle = reduceMotion ? { top: c.top, left: c.left } : chipStyle;

              if (c.href) {
                return (
                  <Link
                    key={i}
                    href={c.href}
                    className={`mapChip mapChipInteractive tone-${c.tone ?? "neutral"} float-${c.float ?? "a"}`}
                    style={finalChipStyle}
                    aria-label={`${c.title}: ${c.sub}`}
                  >
                    {chipContent}
                  </Link>
                );
              }

              return (
                <div
                  key={i}
                  className={`mapChip tone-${c.tone ?? "neutral"} float-${c.float ?? "a"}`}
                  style={finalChipStyle}
                >
                  {chipContent}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
