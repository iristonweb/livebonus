import { Button } from "@/components/Button";

export default function PartnersPage() {
  return (
    <main>
      <section className="pageHero">
        <div className="container">
          <div className="pageHeroInner">
            <div className="pageHeroPanel">
              <div className="kicker">
                <span className="kickerDot" />
                Партнёрам и УК
              </div>
              <h1>Подключить УК / арендодателя</h1>
              <p className="subhead">
                Платёж + привилегии поверх СБП: жители получают выгоду, а УК — рост собираемости и прозрачные статусы.
              </p>
              <div className="pageMeta">
                <span className="pageMetaTag">SLA</span>
                <span className="pageMetaTag">API / White‑label</span>
                <span className="pageMetaTag">Compliance</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="grid3">
            <div className="card cardHolo">
              <div className="cardTitle">Внедрение</div>
              <p className="p">API / White‑label / интеграция через партнёров (по готовности рынка).</p>
            </div>
            <div className="card">
              <div className="cardTitle">SLA</div>
              <p className="p">Статусы платежей, уведомления, реестры, сверка, отчётность.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Финмодель</div>
              <p className="p">Комиссия с GMV / CPA / sponsored listings / B2B‑подписка кабинета партнёра.</p>
            </div>
          </div>

          <div className="card mt14">
            <div className="cardTitle">Запрос на подключение (заглушка)</div>
            <p className="p">
              В проде здесь будет форма (и вебхук в CRM). Сейчас — кнопка для демонстрации.
            </p>
            <div className="heroCtas mt12">
              <Button href="/docs#для-управляющих-компаний-и-арендодателей" variant="primary">
                SLA + интеграции
              </Button>
              <Button href="/docs#техническая-спецификация-для-dev-команды" variant="ghost">
                Техспека
              </Button>
            </div>
          </div>

          <p className="small mt12">
            Комплаенс: 152‑ФЗ (локализация ПДн), 115‑ФЗ (AML), платежи через СБП/PSP. Opt‑in/opt‑out для rent‑reporting.
          </p>
        </div>
      </section>
    </main>
  );
}
