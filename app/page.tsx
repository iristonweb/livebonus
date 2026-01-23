import { Button } from "@/components/Button";
import { MapHero } from "@/components/MapHero";

export default function Page() {
  return (
    <main>
      <MapHero />

      <section className="section sectionSlim" id="how">
        <div className="container">
          <div className="sectionHeader">
            <h2>Как это работает</h2>
            <p className="p">Коротко: подключили объект → оплатили через СБП → получили баллы → потратили.</p>
          </div>

          <div className="steps stepsTight">
            <div className="step stepTight">
              <div className="stepNum">01</div>
              <div className="stepTitle">Добавьте адрес или договор</div>
              <div className="stepText">Можно указать ориентир. Согласия — прозрачные.</div>
            </div>
            <div className="step stepTight">
              <div className="stepNum">02</div>
              <div className="stepTitle">Оплатите через СБП</div>
              <div className="stepText">QR/ссылка → подтверждение в банке. Сумма — до подтверждения.</div>
            </div>
            <div className="step stepTight">
              <div className="stepNum">03</div>
              <div className="stepTitle">Баллы начислим автоматически</div>
              <div className="stepText">После статуса «успешно» — обычно в течение минут.</div>
            </div>
            <div className="step stepTight">
              <div className="stepNum">04</div>
              <div className="stepTitle">Потратьте с выгодой</div>
              <div className="stepText">Привилегии рядом, сертификаты, поездки по РФ и другое.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section sectionSlim" id="features">
        <div className="container">
          <div className="sectionHeader">
            <h2>Возможности</h2>
            <p className="p">На главной — только суть. Детали — на отдельной странице.</p>
          </div>

          <div className="miniGrid">
            <div className="card">
              <div className="cardTitle">Оплата → баллы</div>
              <p className="p">Ежемесячный платёж за жильё превращается в баллы по прозрачным правилам.</p>
              <div className="cardCtaRow">
                <Button href="/features#earn" size="small" variant="ghost">
                  Подробнее
                </Button>
                <Button href="/start" size="small" variant="primary">
                  Начать
                </Button>
              </div>
            </div>

            <div className="card">
              <div className="cardTitle">Локальные привилегии</div>
              <p className="p">Еда, аптеки, фитнес, сервисы — офферы «рядом», а не абстрактные.</p>
              <div className="cardCtaRow">
                <Button href="/features#perks" size="small" variant="ghost">
                  Категории
                </Button>
              </div>
            </div>

            <div className="card">
              <div className="cardTitle">«День аренды»</div>
              <p className="p">Раз в месяц: двойные баллы и лимитированные предложения.</p>
              <div className="cardCtaRow">
                <Button href="/features#rentday" size="small" variant="ghost">
                  Сценарии
                </Button>
              </div>
            </div>

            <div className="card">
              <div className="cardTitle">Кредитная история</div>
              <p className="p">Опционально: отметка факта оплаты аренды в БКИ РФ (opt‑in/opt‑out).</p>
              <div className="cardCtaRow">
                <Button href="/features#credit" size="small" variant="ghost">
                  Как работает
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section sectionSlim" id="partners">
        <div className="container">
          <div className="sectionHeader">
            <h2>Для партнёров и безопасность</h2>
            <p className="p">Подключение УК/арендодателей и комплаенс: данные в РФ, СБП, opt‑in управление.</p>
          </div>

          <div className="grid3">
            <div className="card">
              <div className="cardTitle">Подключение</div>
              <p className="p">API / white‑label / интеграция. SLA: статусы, уведомления, отчёты.</p>
              <div className="cardCtaRow">
                <Button href="/partners" size="small" variant="ghost">
                  Подробнее
                </Button>
              </div>
            </div>
            <div className="card">
              <div className="cardTitle">152‑ФЗ</div>
              <p className="p">Персональные данные хранятся в РФ. Доступы — по принципу минимальности.</p>
            </div>
            <div className="card">
              <div className="cardTitle">СБП и opt‑in</div>
              <p className="p">Оплата через СБП. Rent‑reporting и коммуникации — только с согласия.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
