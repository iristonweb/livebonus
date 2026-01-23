"use client";

import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { AuthModal } from "@/components/AuthModal";

export function Header() {
  const [open, setOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="nav">
        <div className="container navInner">
          <Logo />

          <div className="navLinks" aria-label="Навигация">
            <div className="navDock" aria-label="Основная навигация">
              <div className="navDockItem navDockLabel" title="Раздел для участников">
                <span className="kickerDot" aria-hidden="true" />
                Для участников
              </div>
              <Link className="navDockItem" href="/#how">Как работает</Link>
              <Link className="navDockItem" href="/features">Возможности</Link>
              <Link className="navDockItem" href="/partners">Для УК</Link>
              <Link className="navDockItem" href="/docs">Документ</Link>
            </div>

            <div className="navRight">
              <button className="btn btnSmall btnPrimary" type="button" onClick={() => setOpen(true)}>
                Войти
              </button>

              <ThemeToggle />

              <button
                className="navMobileToggle"
                type="button"
                aria-label="Меню"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <span className={mobileMenuOpen ? "navMobileToggleIcon open" : "navMobileToggleIcon"} />
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="navMobileMenu">
            <div className="navMobileMenuInner">
              <Link href="/#how" onClick={() => setMobileMenuOpen(false)}>
                Как работает
              </Link>
              <Link href="/features" onClick={() => setMobileMenuOpen(false)}>
                Возможности
              </Link>
              <Link href="/partners" onClick={() => setMobileMenuOpen(false)}>
                Для УК
              </Link>
              <Link href="/docs" onClick={() => setMobileMenuOpen(false)}>
                Документ
              </Link>
              <button className="btn btnPrimary" type="button" onClick={() => { setOpen(true); setMobileMenuOpen(false); }}>
                Войти
              </button>
            </div>
          </div>
        )}
      </header>

      <AuthModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
