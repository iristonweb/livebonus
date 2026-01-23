import { Button } from "@/components/Button";

export default function FeaturesPage() {
  return (
    <main>
      <section className="pageHero">
        <div className="container">
          <div className="pageHeroInner">
            <div className="pageHeroPanel">
              <div className="kicker">
                <span className="kickerDot" />
                Возможности All in Guide
              </div>
              <h1>Модули продукта — в деталях и по делу</h1>
              <p className="subhead">
                Здесь — полная карта функций. На главной только суть, здесь — сценарии, правила и UX‑логика.
              </p>
              <div className="pageMeta">
                <span className="pageMetaTag">Module Grid</span>
                <span className="pageMetaTag">Compliance Ready</span>
                <span className="pageMetaTag">SBP Native</span>
              </div>
              <div className="heroCtas">
                <Button href="/start" variant="primary">Начать оплату</Button>
                <Button href="/apply">Анкета</Button>
              </div>
            </div>

            <div className="featurePills" aria-label="Навигация по разделам">
              <a className="pillLink" href="#earn">Оплата → баллы</a>
              <a className="pillLink" href="#perks">Локальные привилегии</a>
              <a className="pillLink" href="#rentday">День аренды</a>
              <a className="pillLink" href="#credit">Кредитная история</a>
              <a className="pillLink" href="#spend">Как тратить</a>
              <a className="pillLink" href="#proof">Доверие</a>
            </div>
          </div>
        </div>
      </section>

      <section className="section sectionSlim" id="earn">
        <div className="container">
          <div className="sectionHeader">
            <h2>Оплата аренды → начисление баллов</h2>
            <p className="p">Правила прозрачны: пользователь заранее видит, сколько получит.</p>
          </div>

          <div className="grid3">
            <div className="card cardHolo">
              <div className="cardTitle">Правило</div>
              <p className="p">
                <strong>1% = 1 балл за каждые 100 ₽</strong> оплаты жилья. Комиссии для пользователя — <strong>0 ₽</strong>.
              </p>
            </div>
            <div className="card">
              <div className="cardTitle">Лимиты</div>
              <p className="p">
                До <strong>5 000 баллов/месяц</strong> за платежи жилья. Срок действия баллов — <strong>12 месяцев</strong>.
              </p>
            </div>
            <div className="card">
              <div className="cardTitle">Примеры</div>
              <p className="p">
                <strong>250 000 ₽ → 2 500 баллов</strong> за аренду. <strong>6 000 ₽ → 300 баллов</strong> у партнёра (пример).
              </p>
            </div>
          </div>

          <div className="card mt14">
            <div className="cardTitle">Как начисляем</div>
            <p className="p">
              Баллы начисляются после статуса «успешно» от платёжного партнёра. В спорных случаях — понятная поддержка и статус в истории.
            </p>
          </div>
        </div>
      </section>

      <section className="section sectionSlim" id="perks">
        <div className="container">
          <div className="sectionHeader">
            <h2>Локальные привилегии</h2>
            <p className="p">Фокус на реальные повседневные категории: рядом и понятно.</p>
          </div>

          <div className="grid3">
            <div className="card">
              <div className="cardTitle">Еда и доставка</div>
              <p className="p">Промокоды, комплименты, повышенные баллы. Сценарии: доставка еды, готовая еда, продуктовые сервисы.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Аптеки и здоровье</div>
              <p className="p">Скидки на корзину, доставка, бонусы на лаборатории и профилактику.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Фитнес и восстановление</div>
              <p className="p">Пробные тренировки, скидки на абонементы, +баллы за подписки.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Транспорт</div>
              <p className="p">Такси/каршеринг: скидки и пакеты минут. Партнёрские тарифы по городу.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Дом и быт</div>
              <p className="p">Клининг, мелкий ремонт, химчистка — комплименты и повышенные баллы.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Красота</div>
              <p className="p">Сертификаты и комплименты в салонах рядом с адресом.</p>
            </div>
          </div>

          <div className="card mt14">
            <div className="cardTitle">Форматы выгоды</div>
            <p className="p">
              Баллы (+X%) • скидка (−X%) • комплимент (подарок/услуга) • подписка‑пакет (выгодный тариф на месяц).
            </p>
          </div>
        </div>
      </section>

      <section className="section sectionSlim" id="rentday">
        <div className="container">
          <div className="sectionHeader">
            <h2>Ежемесячные акции — «День аренды»</h2>
            <p className="p">Ограниченные предложения: проще объяснить, легче запомнить, удобнее планировать оплату.</p>
          </div>

          <div className="grid3">
            <div className="card">
              <div className="cardTitle">x2 баллы</div>
              <p className="p">Двойные баллы за оплату жилья (в рамках лимитов и условий акции).</p>
            </div>
            <div className="card">
              <div className="cardTitle">Подарок от партнёра</div>
              <p className="p">Гарантированный бонус при оплате в окно акции: промокод или комплимент.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Розыгрыш</div>
              <p className="p">Участие за успешный платёж. Правила и призовой фонд публикуются заранее.</p>
            </div>
          </div>

          <div className="card mt14">
            <div className="cardTitle">Анти‑абьюз (важно)</div>
            <p className="p">Лимиты, скоринг, ручные проверки аномалий, прозрачные правила — чтобы программа оставалась честной для всех.</p>
          </div>
        </div>
      </section>

      <section className="section sectionSlim" id="credit">
        <div className="container">
          <div className="sectionHeader">
            <h2>Повышение кредитной истории — opt‑in</h2>
            <p className="p">Опционально: передача факта оплаты аренды в БКИ РФ. Можно включить и выключить в любой момент.</p>
          </div>

          <div className="grid3">
            <div className="card">
              <div className="cardTitle">Только по согласию</div>
              <p className="p">Явный opt‑in, понятный текст и журнал действий.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Прозрачная история</div>
              <p className="p">Что отправили, когда, статус, ошибки — всё видно пользователю.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Корректные обещания</div>
              <p className="p">Мы не гарантируем результат. Мы фиксируем дисциплину оплаты — дальше решают модели БКИ.</p>
            </div>
          </div>

          <div className="card mt14">
            <div className="cardTitle">Юридическая рамка</div>
            <p className="p">152‑ФЗ (ПДн, локализация) • 115‑ФЗ (AML/KYC контуры) • 218‑ФЗ (кредитные истории) — с opt‑in/opt‑out.</p>
          </div>
        </div>
      </section>

      <section className="section sectionSlim" id="spend">
        <div className="container">
          <div className="sectionHeader">
            <h2>Гибкое использование баллов</h2>
            <p className="p">Ставим курс и ограничения прозрачно: до списания пользователь видит итог.</p>
          </div>

          <div className="grid3">
            <div className="card">
              <div className="cardTitle">Путешествия по РФ</div>
              <p className="p">Отели/билеты/туры через партнёрский агрегатор или собственную витрину.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Повседневные расходы</div>
              <p className="p">Такси, доставка, маркетплейсы. Выгода: скидка или конвертация баллов в сертификаты.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Подарочные карты</div>
              <p className="p">Сертификаты крупных сетей и сервисов (каталог пополняется по партнёрствам).</p>
            </div>
          </div>

          <div className="card mt14">
            <div className="cardTitle">Дальше</div>
            <p className="p">«Большие цели»: накопление на первый взнос, образование и другие сценарии — через юридически корректные партнёрские механики.</p>
          </div>
        </div>
      </section>

      <section className="section sectionSlim" id="proof">
        <div className="container">
          <div className="sectionHeader">
            <h2>Социальное доказательство и доверие</h2>
            <p className="p">Цифры публикуем только после пилота. Ниже — формат, который будет на проде.</p>
          </div>

          <div className="grid3">
            <div className="card">
              <div className="cardTitle">Отзывы</div>
              <p className="p">«Баллы закрывают такси и кофе. Платить за жильё стало психологически приятнее.»</p>
              <p className="p" style={{ marginTop: 10, fontSize: 13 }}>Мария, Москва</p>
            </div>
            <div className="card">
              <div className="cardTitle">Метрики (плейсхолдер)</div>
              <p className="p">Участников: — • Платежей через СБП: — • Партнёров: —</p>
            </div>
            <div className="card">
              <div className="cardTitle">Комплаенс</div>
              <p className="p">Данные в РФ • логи без PII • шифрование • разграничение доступа • мониторинг аномалий.</p>
            </div>
          </div>

          <div className="heroCtas" style={{ marginTop: 18 }}>
            <Button href="/docs" variant="primary">Открыть документ</Button>
            <Button href="/partners" variant="ghost">Для УК</Button>
          </div>
        </div>
      </section>
    </main>
  );
}
