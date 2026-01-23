import { Button } from "@/components/Button";

export default function StartPage() {
  return (
    <main>
      <section className="pageHero">
        <div className="container">
          <div className="pageHeroInner">
            <div className="pageHeroPanel">
              <div className="kicker">
                <span className="kickerDot" />
                Старт оплаты
              </div>
              <h1>Начать оплату</h1>
              <p className="subhead">
                UX‑черновик потока оплаты через СБП. Здесь фиксируем логику до подключения платёжного контура.
              </p>
              <div className="pageMeta">
                <span className="pageMetaTag">Flow v1</span>
                <span className="pageMetaTag">SBP</span>
                <span className="pageMetaTag">Preview</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="card formShell">
            <div className="formHeader">
              <h2 className="h2Medium">Шаг 1. Объект</h2>
              <p className="p mt8">
                Выберите, что оплачиваете: <strong>аренда</strong> или <strong>ЖКУ</strong>. Затем — адрес/лицевой счет.
              </p>
              <div className="badges mt12">
                <span className="badge"><span className="badgeMark" />Квартира</span>
                <span className="badge"><span className="badgeMark" />Комната</span>
                <span className="badge"><span className="badgeMark" />ЖКУ</span>
              </div>
            </div>

            <div className="formHeader">
              <h2 className="h2Medium">Шаг 2. Сумма</h2>
              <p className="p mt8">
                Введите сумму. До подтверждения мы показываем итог, начисление баллов и лимиты.
              </p>
              <div className="card mt12">
                <div className="gridGap12">
                  <div><strong>Пример:</strong> 50 000 ₽ → 500 баллов</div>
                  <div className="small">Лимит: до 5 000 баллов/мес • Срок: 12 месяцев</div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="h2Medium">Шаг 3. СБП</h2>
              <p className="p mt8">
                Генерация QR / deeplink в банк. Результат — статус от PSP: <code>success</code> / <code>failed</code>.
              </p>
              <div className="heroCtas mt14">
                <Button href="/docs#лк-ux-потоки" variant="primary">
                  Посмотреть полный UX-описание
                </Button>
                <Button href="/" variant="ghost">
                  Вернуться на главную
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
