import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import Link from "next/link";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "All in Guide — баллы за оплату жилья",
  description: "Оплачивайте аренду или ЖКУ через СБП — и получайте баллы без комиссий. Локальные привилегии и акции каждый месяц.",
  icons: [{ rel: "icon", url: "/favicon.svg" }],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" data-theme="dark" className={`${inter.variable} ${manrope.variable}`}>
      <body>
        <Header />

{children}

        <footer className="footer">
          <div className="container footerGrid">
            <div>
              <div style={{ fontWeight: 800, fontFamily: "var(--font-head)" }}>All in Guide</div>
              <p className="p" style={{ marginTop: 10 }}>
                Прототип лендинга + продукт-документа. Платежи и начисления в демо не выполняются.
              </p>
              <p className="small" style={{ marginTop: 10 }}>
                Регуляторика, упоминаемая в документе: 152‑ФЗ (ПДн), 115‑ФЗ (AML), СБП (НСПК), 218‑ФЗ (кредитная история / согласия).
              </p>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontFamily: "var(--font-head)" }}>Ссылки</div>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <Link href="/start">Начать оплату</Link>
                <Link href="/apply">Анкета</Link>
                <Link href="/features">Возможности</Link>
                <Link href="/partners">Подключить УК</Link>
                <Link href="/docs">Бриф + техспека</Link>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontFamily: "var(--font-head)" }}>Контакты (заглушка)</div>
              <p className="p" style={{ marginTop: 10 }}>
                hello@allinguide.ru<br />
                +7 (999) 000‑00‑00
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
