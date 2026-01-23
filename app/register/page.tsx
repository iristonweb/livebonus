"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { Divider, Field, Input, Pill, Select, TextArea } from "@/components/forms/FormBits";
import { SmartPlaceInput } from "@/components/forms/SmartPlaceInput";
import type { AccountType, Intent, ListingForm, SearchForm } from "@/lib/types";
import { titleFor, canContinueApply } from "@/lib/types";

type Registration = {
  accountType: AccountType;
  intent: Intent;
  phone: string;
  email: string;
  fullName?: string; // individual
  companyName?: string; // legal
  inn?: string; // legal
  contactPerson?: string; // legal
  consentPd: boolean;
  consentTerms: boolean;
  consentReporting: boolean;
};

function RegisterPageContent() {
  const params = useSearchParams();
  const topRef = useRef<HTMLDivElement | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("individual");
  const [intent, setIntent] = useState<Intent>("rent_in");

  const [reg, setReg] = useState<Registration>({
    accountType: "individual",
    intent: "rent_in",
    phone: "",
    email: "",
    fullName: "",
    companyName: "",
    inn: "",
    contactPerson: "",
    consentPd: true,
    consentTerms: true,
    consentReporting: false,
  });

  const [listing, setListing] = useState<ListingForm>({
    city: "",
    district: "",
    metro: "",
    propertyType: "apartment",
    rooms: "",
    areaM2: "",
    floor: "",
    floorsTotal: "",
    furnished: "yes",
    petsAllowed: "negotiable",
    moveInFrom: "",
    priceRub: "",
    depositRub: "",
    utilities: "separate",
    contractTerm: "long",
    description: "",
    invoiceNeeded: "no",
  });

  const [search, setSearch] = useState<SearchForm>({
    city: "",
    districts: "",
    metro: "",
    propertyType: "any",
    rooms: "",
    budgetFrom: "",
    budgetTo: "",
    moveInFrom: "",
    leaseTerm: "any",
    furnished: "optional",
    pets: "negotiable",
    metroMaxMinutes: "",
    notes: "",
    forEmployees: "no",
    invoiceNeeded: "no",
  });

  // Prefill from modal (/?type=legal&intent=rent_out&step=2)
  useEffect(() => {
    const t = params.get("type");
    const i = params.get("intent");
    const s = params.get("step");
    if (t === "legal" || t === "individual") {
      setAccountType(t);
      setReg((r) => ({ ...r, accountType: t }));
    }
    if (i === "rent_in" || i === "rent_out") {
      setIntent(i);
      setReg((r) => ({ ...r, intent: i }));
    }
    if (s === "2" || s === "3") {
      setStep(Number(s) as 2 | 3);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to top of card when step changes (so it feels like a real wizard)
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  // Восстановление черновика регистрации при загрузке
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("allin_register_draft");
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.accountType) setAccountType(draft.accountType);
      if (draft.intent) setIntent(draft.intent);
      if (draft.reg) setReg(draft.reg);
      if (draft.listing) setListing(draft.listing);
      if (draft.search) setSearch(draft.search);
      if (draft.step) setStep(draft.step);
    } catch {
      // ignore
    }
  }, []);

  // Сохранение черновика регистрации в localStorage при изменении формы
  useEffect(() => {
    try {
      const draft = {
        accountType,
        intent,
        reg,
        listing,
        search,
        step,
        savedAt: new Date().toISOString(),
      };
      window.localStorage.setItem("allin_register_draft", JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, [accountType, intent, reg, listing, search, step]);

  const summary = useMemo(() => {
    const payload = {
      registration: { ...reg, accountType, intent },
      questionnaire: intent === "rent_out" ? listing : search,
    };
    return JSON.stringify(payload, null, 2);
  }, [reg, accountType, intent, listing, search]);

  function goNext() {
    setIsLoading(true);
    setTimeout(() => {
      setStep((s) => (s === 3 ? 3 : ((s + 1) as 1 | 2 | 3)));
      setIsLoading(false);
    }, 300);
  }
  function goBack() {
    setIsLoading(true);
    setTimeout(() => {
      setStep((s) => (s === 1 ? 1 : ((s - 1) as 1 | 2 | 3)));
      setIsLoading(false);
    }, 300);
  }

  function syncTopChoice(nextAccount: AccountType, nextIntent: Intent) {
    setAccountType(nextAccount);
    setIntent(nextIntent);
    setReg((r) => ({ ...r, accountType: nextAccount, intent: nextIntent }));
  }

  return (
    <main className="section">
      <div className="container">
        <div className="card formShell">
          <div ref={topRef} />
          <div className="formHeader">
            <div className="kicker">
              <span className="kickerDot" />
              Регистрация — контрольный экран
            </div>

            <h1 className="h1Large">Окно регистрации</h1>
            <p className="p mt12 maxW900">
              Зарегистрируйтесь как <strong>физлицо</strong> или <strong>юрлицо</strong> и выберите сценарий:{" "}
              <strong>сдать жильё</strong> (анкета объявления) или <strong>арендовать жильё</strong> (анкета поиска).
            </p>
          </div>

          <Divider />

          <div className="flexWrap">
            <Pill active={accountType === "individual"} onClick={() => syncTopChoice("individual", intent)}>
              Физлицо
            </Pill>
            <Pill active={accountType === "legal"} onClick={() => syncTopChoice("legal", intent)}>
              Юрлицо
            </Pill>

            <span className="spacer12" />

            <Pill active={intent === "rent_in"} onClick={() => syncTopChoice(accountType, "rent_in")}>
              Арендовать жильё
            </Pill>
            <Pill active={intent === "rent_out"} onClick={() => syncTopChoice(accountType, "rent_out")}>
              Сдать жильё
            </Pill>
          </div>

          <div className="badges" style={{ marginTop: 14 }}>
            <span className="badge badgeStrong">
              <span className="badgeMark" />
              {titleFor(accountType, intent)}
            </span>
            <span className="badge">
              <span className="badgeMark" />
              Минимум данных • управляемые согласия
            </span>
            <span className="badge">
              <span className="badgeMark" />
              Rent‑reporting — opt‑in / opt‑out
            </span>
          </div>

          <div className="pageMeta mt12">
            <span className="pageMetaTag">Autosave</span>
            <span className="pageMetaTag">Step Flow</span>
            <span className="pageMetaTag">Control Room</span>
          </div>

          <Divider />

          <Stepper step={step} />

          {step === 1 ? (
            <StepOne accountType={accountType} intent={intent} reg={reg} setReg={setReg} onNext={goNext} isLoading={isLoading} />
          ) : null}

          {step === 2 ? (
            <StepTwo
              accountType={accountType}
              intent={intent}
              listing={listing}
              setListing={setListing}
              search={search}
              setSearch={setSearch}
              onNext={goNext}
              onBack={goBack}
              isLoading={isLoading}
            />
          ) : null}

          {step === 3 ? <StepThree summary={summary} onBack={goBack} isLoading={isLoading} /> : null}
        </div>
      </div>
    </main>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items: Array<{ n: 1 | 2 | 3; title: string; desc: string }> = [
    { n: 1, title: "Регистрация", desc: "Тип аккаунта и контакты" },
    { n: 2, title: "Анкета", desc: "Объявление или поиск" },
    { n: 3, title: "Черновик", desc: "Проверка данных" },
  ];

  return (
    <div className="steps steps3" style={{ marginTop: 6 }}>
      {items.map((it) => (
        <div key={it.n} className={`step ${it.n === step ? "stepActive" : ""}`}>
          <div className="stepNum">{String(it.n).padStart(2, "0")}</div>
          <div className="stepTitle">{it.title}</div>
          <div className="stepText">{it.desc}</div>
        </div>
      ))}
    </div>
  );
}

function StepOne({
  accountType,
  intent,
  reg,
  setReg,
  onNext,
  isLoading,
}: {
  accountType: AccountType;
  intent: Intent;
  reg: Registration;
  setReg: Dispatch<SetStateAction<Registration>>;
  onNext: () => void;
  isLoading: boolean;
}) {
  const isLegal = accountType === "legal";

  const missing: string[] = [];
  const phoneDigits = reg.phone.replace(/\D/g, "");
  if (phoneDigits.length < 10) missing.push("Телефон (10 цифр)");
  if (!reg.email.trim().includes("@")) missing.push("Email");

  if (isLegal) {
    if ((reg.companyName ?? "").trim().length < 2) missing.push("Название организации");
    if ((reg.inn ?? "").trim().length < 10) missing.push("ИНН (10–12 цифр)");
    if ((reg.contactPerson ?? "").trim().length < 2) missing.push("Контактное лицо");
  } else {
    if ((reg.fullName ?? "").trim().length < 2) missing.push("ФИО");
  }

  if (!reg.consentPd) missing.push("Согласие на ПДн");
  if (!reg.consentTerms) missing.push("Согласие с офертой");

  const canContinue = missing.length === 0;

  return (
    <section>
      <h2 style={{ fontSize: 22, marginTop: 8 }}>Шаг 1. Регистрация</h2>
      <p className="p" style={{ marginTop: 8 }}>
        Сценарий: <strong>{titleFor(accountType, intent)}</strong>. Собираем только необходимое, без паспортов и лишних
        документов на MVP.
      </p>

      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        {isLegal ? (
          <div className="card">
            <div className="cardTitle">Данные юрлица</div>
            <div style={{ display: "grid", gap: 12 }}>
              <Field label="Название организации" hint="Как в договоре/уставе">
                <Input
                  value={reg.companyName ?? ""}
                  onChange={(e) => setReg((p) => ({ ...p, companyName: e.target.value }))}
                  placeholder="ООО «Пример»"
                />
              </Field>
              <Field label="ИНН" hint="10–12 цифр">
                <Input
                  value={reg.inn ?? ""}
                  onChange={(e) => setReg((p) => ({ ...p, inn: e.target.value.replace(/\D/g, "") }))}
                  inputMode="numeric"
                  placeholder="7701234567"
                />
              </Field>
              <Field label="Контактное лицо" hint="ФИО или должность">
                <Input
                  value={reg.contactPerson ?? ""}
                  onChange={(e) => setReg((p) => ({ ...p, contactPerson: e.target.value }))}
                  placeholder="Иванов Иван"
                />
              </Field>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="cardTitle">Данные физлица</div>
            <Field label="ФИО" hint="Для договоров и корректной коммуникации">
              <Input
                value={reg.fullName ?? ""}
                onChange={(e) => setReg((p) => ({ ...p, fullName: e.target.value }))}
                placeholder="Иванов Иван"
              />
            </Field>
          </div>
        )}

        <div className="card">
          <div className="cardTitle">Контакты</div>
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Телефон" hint="Для входа по коду и уведомлений">
              <Input
                value={reg.phone}
                onChange={(e) => setReg((p) => ({ ...p, phone: e.target.value }))}
                inputMode="tel"
                placeholder="+7 (___) ___‑__‑__"
              />
            </Field>
            <Field label="Email" hint="Чеки и документы (можно отключить уведомления)">
              <Input
                value={reg.email}
                onChange={(e) => setReg((p) => ({ ...p, email: e.target.value }))}
                inputMode="email"
                placeholder="name@example.com"
              />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">Согласия</div>
          <div style={{ display: "grid", gap: 10 }}>
            <Consent
              checked={reg.consentPd}
              onChange={(v) => setReg((p) => ({ ...p, consentPd: v }))}
              label="Согласие на обработку персональных данных (обязательно)"
            />
            <Consent
              checked={reg.consentTerms}
              onChange={(v) => setReg((p) => ({ ...p, consentTerms: v }))}
              label="Согласие с офертой и правилами сервиса (обязательно)"
            />
            <Consent
              checked={reg.consentReporting}
              onChange={(v) => setReg((p) => ({ ...p, consentReporting: v }))}
              label="Rent‑reporting в БКИ (опционально, можно отключить в любой момент)"
            />
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            В проде: версии документов, дата/время подписи, audit‑trail.
          </p>
        </div>
      </div>

      <div className="heroCtas" style={{ marginTop: 16 }}>
        <button className="btn btnPrimary" disabled={!canContinue || isLoading} onClick={onNext} type="button">
          {isLoading ? "Загрузка…" : "Продолжить"}
        </button>
        <Button href="/" variant="ghost">
          На главную
        </Button>
      </div>

      {!canContinue ? (
        <p className="small" style={{ marginTop: 10 }}>
          Чтобы продолжить, заполните: <strong>{missing.join(", ")}</strong>.
        </p>
      ) : null}
    </section>
  );
}

function StepTwo({
  accountType,
  intent,
  listing,
  setListing,
  search,
  setSearch,
  onNext,
  onBack,
  isLoading,
}: {
  accountType: AccountType;
  intent: Intent;
  listing: ListingForm;
  setListing: Dispatch<SetStateAction<ListingForm>>;
  search: SearchForm;
  setSearch: Dispatch<SetStateAction<SearchForm>>;
  onNext: () => void;
  onBack: () => void;
  isLoading: boolean;
}) {
  const isLegal = accountType === "legal";

  const canContinue = canContinueApply(intent, listing, search);

  return (
    <section>
      <h2 style={{ fontSize: 22, marginTop: 8 }}>Шаг 2. {intent === "rent_out" ? "Анкета объявления" : "Анкета поиска"}</h2>
      <p className="p" style={{ marginTop: 8 }}>
        {intent === "rent_out"
          ? "Анкета для размещения объявления. Минимум — город и цена."
          : "Анкета для подбора объявлений. Минимум — город и бюджет."}
      </p>

      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        {intent === "rent_out" ? (
          <>
            <div className="card">
              <div className="cardTitle">Объект</div>
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Город">
                  <SmartPlaceInput kind="city" value={listing.city} onChange={(v) => setListing((p) => ({ ...p, city: v }))} placeholder="Начните вводить…" />
                </Field>
                <Field label="Район / ориентир" hint="Можно без точного адреса (безопаснее)">
                  <SmartPlaceInput kind="district" cityContext={listing.city} value={listing.district} onChange={(v) => setListing((p) => ({ ...p, district: v }))} placeholder="Например: ЦАО, рядом с Таганской" />
                </Field>
                <Field label="Тип жилья">
                  <Select value={listing.propertyType} onChange={(e) => setListing((p) => ({ ...p, propertyType: e.target.value as ListingForm["propertyType"] }))}>
                    <option value="apartment">Квартира</option>
                    <option value="room">Комната</option>
                    <option value="house">Дом</option>
                    <option value="other">Другое</option>
                  </Select>
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  <Field label="Комнат">
                    <Input value={listing.rooms} onChange={(e) => setListing((p) => ({ ...p, rooms: e.target.value }))} inputMode="numeric" placeholder="2" />
                  </Field>
                  <Field label="Площадь, м²">
                    <Input value={listing.areaM2} onChange={(e) => setListing((p) => ({ ...p, areaM2: e.target.value }))} inputMode="numeric" placeholder="54" />
                  </Field>
                  <Field label="Заселение с">
                    <Input value={listing.moveInFrom} onChange={(e) => setListing((p) => ({ ...p, moveInFrom: e.target.value }))} placeholder="с 15.02" />
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  <Field label="Этаж">
                    <Input value={listing.floor} onChange={(e) => setListing((p) => ({ ...p, floor: e.target.value }))} inputMode="numeric" placeholder="7" />
                  </Field>
                  <Field label="Этажей в доме">
                    <Input value={listing.floorsTotal} onChange={(e) => setListing((p) => ({ ...p, floorsTotal: e.target.value }))} inputMode="numeric" placeholder="16" />
                  </Field>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="cardTitle">Условия</div>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  <Field label="Аренда, ₽/мес">
                    <Input value={listing.priceRub} onChange={(e) => setListing((p) => ({ ...p, priceRub: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder="50000" />
                  </Field>
                  <Field label="Депозит, ₽">
                    <Input value={listing.depositRub} onChange={(e) => setListing((p) => ({ ...p, depositRub: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder="50000" />
                  </Field>
                  <Field label="Коммунальные">
                    <Select value={listing.utilities} onChange={(e) => setListing((p) => ({ ...p, utilities: e.target.value as ListingForm["utilities"] }))}>
                      <option value="separate">Отдельно</option>
                      <option value="included">Включены</option>
                      <option value="partly">Частично</option>
                    </Select>
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  <Field label="Мебель">
                    <Select value={listing.furnished} onChange={(e) => setListing((p) => ({ ...p, furnished: e.target.value as ListingForm["furnished"] }))}>
                      <option value="yes">Есть</option>
                      <option value="partly">Частично</option>
                      <option value="no">Нет</option>
                    </Select>
                  </Field>
                  <Field label="Питомцы">
                    <Select value={listing.petsAllowed} onChange={(e) => setListing((p) => ({ ...p, petsAllowed: e.target.value as ListingForm["petsAllowed"] }))}>
                      <option value="yes">Можно</option>
                      <option value="no">Нельзя</option>
                      <option value="negotiable">По договорённости</option>
                    </Select>
                  </Field>
                  <Field label="Срок">
                    <Select value={listing.contractTerm} onChange={(e) => setListing((p) => ({ ...p, contractTerm: e.target.value as ListingForm["contractTerm"] }))}>
                      <option value="long">Долгосрочно</option>
                      <option value="short">Краткосрочно</option>
                      <option value="negotiable">По договорённости</option>
                    </Select>
                  </Field>
                </div>

                {isLegal ? (
                  <Field label="Готовы выставлять счёт/акт?" hint="Полезно для арендаторов‑юрлиц">
                    <Select value={listing.invoiceNeeded ?? "no"} onChange={(e) => setListing((p) => ({ ...p, invoiceNeeded: e.target.value as ListingForm["invoiceNeeded"] }))}>
                      <option value="no">Не обязательно</option>
                      <option value="yes">Да</option>
                    </Select>
                  </Field>
                ) : null}

                <Field label="Описание" hint="Ремонт, техника, ограничения, условия заселения">
                  <TextArea value={listing.description} onChange={(e) => setListing((p) => ({ ...p, description: e.target.value }))} placeholder="Квартира после ремонта, техника есть, без курения. Заселение с 15 февраля…" />
                </Field>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="card">
              <div className="cardTitle">Что ищем</div>
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Город">
                  <SmartPlaceInput kind="city" value={search.city} onChange={(v) => setSearch((p) => ({ ...p, city: v }))} placeholder="Начните вводить…" />
                </Field>
                <Field label="Районы (через запятую)" hint="Перечислите через запятую">
                  <Input value={search.districts} onChange={(e) => setSearch((p) => ({ ...p, districts: e.target.value }))} placeholder="Приморский, Петроградский…" />
                </Field>
                <Field label="Метро (опционально)">
                  <SmartPlaceInput kind="metro" cityContext={search.city} value={search.metro} onChange={(v) => setSearch((p) => ({ ...p, metro: v }))} placeholder="Начните вводить станцию…" />
                </Field>
                <Field label="Тип жилья">
                  <Select value={search.propertyType} onChange={(e) => setSearch((p) => ({ ...p, propertyType: e.target.value as SearchForm["propertyType"] }))}>
                    <option value="any">Любое</option>
                    <option value="apartment">Квартира</option>
                    <option value="room">Комната</option>
                    <option value="house">Дом</option>
                  </Select>
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  <Field label="Комнат">
                    <Input value={search.rooms} onChange={(e) => setSearch((p) => ({ ...p, rooms: e.target.value }))} placeholder="1–2" />
                  </Field>
                  <Field label="Заезд с">
                    <Input value={search.moveInFrom} onChange={(e) => setSearch((p) => ({ ...p, moveInFrom: e.target.value }))} placeholder="с 01.03" />
                  </Field>
                  <Field label="Метро, мин (макс.)" hint="Если важно">
                    <Input value={search.metroMaxMinutes} onChange={(e) => setSearch((p) => ({ ...p, metroMaxMinutes: e.target.value }))} inputMode="numeric" placeholder="15" />
                  </Field>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="cardTitle">Бюджет и условия</div>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  <Field label="Бюджет от, ₽">
                    <Input value={search.budgetFrom} onChange={(e) => setSearch((p) => ({ ...p, budgetFrom: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder="45000" />
                  </Field>
                  <Field label="Бюджет до, ₽">
                    <Input value={search.budgetTo} onChange={(e) => setSearch((p) => ({ ...p, budgetTo: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder="70000" />
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  <Field label="Срок аренды">
                    <Select value={search.leaseTerm} onChange={(e) => setSearch((p) => ({ ...p, leaseTerm: e.target.value as SearchForm["leaseTerm"] }))}>
                      <option value="any">Любой</option>
                      <option value="long">Долгосрочно</option>
                      <option value="short">Краткосрочно</option>
                    </Select>
                  </Field>
                  <Field label="Мебель">
                    <Select value={search.furnished} onChange={(e) => setSearch((p) => ({ ...p, furnished: e.target.value as SearchForm["furnished"] }))}>
                      <option value="required">Обязательно</option>
                      <option value="optional">Не важно</option>
                      <option value="no">Без мебели ок</option>
                    </Select>
                  </Field>
                  <Field label="Питомцы">
                    <Select value={search.pets} onChange={(e) => setSearch((p) => ({ ...p, pets: e.target.value as SearchForm["pets"] }))}>
                      <option value="negotiable">По договорённости</option>
                      <option value="yes">Да</option>
                      <option value="no">Нет</option>
                    </Select>
                  </Field>
                </div>

                {isLegal ? (
                  <div className="card" style={{ marginTop: 2 }}>
                    <div className="cardTitle">Параметры юрлица</div>
                    <div style={{ display: "grid", gap: 12 }}>
                      <Field label="Аренда для сотрудников">
                        <Select value={search.forEmployees ?? "no"} onChange={(e) => setSearch((p) => ({ ...p, forEmployees: e.target.value as SearchForm["forEmployees"] }))}>
                          <option value="no">Нет</option>
                          <option value="yes">Да</option>
                        </Select>
                      </Field>
                      <Field label="Нужны закрывающие документы / счёт">
                        <Select value={search.invoiceNeeded ?? "no"} onChange={(e) => setSearch((p) => ({ ...p, invoiceNeeded: e.target.value as SearchForm["invoiceNeeded"] }))}>
                          <option value="no">Не обязательно</option>
                          <option value="yes">Да</option>
                        </Select>
                      </Field>
                    </div>
                  </div>
                ) : null}

                <Field label="Комментарий" hint="Тихий двор, парковка, без 1 этажа и т.п.">
                  <TextArea value={search.notes} onChange={(e) => setSearch((p) => ({ ...p, notes: e.target.value }))} placeholder="Важно: рядом с метро, можно с котом, парковка…" />
                </Field>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="heroCtas" style={{ marginTop: 16 }}>
        <button className="btn btnPrimary" disabled={!canContinue || isLoading} onClick={onNext} type="button">
          {isLoading ? "Загрузка…" : "Перейти к проверке"}
        </button>
        <button className="btn" disabled={isLoading} onClick={onBack} type="button">
          Назад
        </button>
      </div>

      {!canContinue ? (
        <p className="small" style={{ marginTop: 10 }}>
          Заполните минимум: {intent === "rent_out" ? "город и цену" : "город и бюджет"}.
        </p>
      ) : null}
    </section>
  );
}

function StepThree({ summary, onBack, isLoading }: { summary: string; onBack: () => void; isLoading: boolean }) {
  return (
    <section>
      <h2 style={{ fontSize: 22, marginTop: 8 }}>Шаг 3. Черновик</h2>
      <p className="p" style={{ marginTop: 8 }}>
        Демо‑режим: данных в БД нет. В проде заявка уйдёт в модерацию/поиск и сохранится в вашем кабинете.
      </p>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="cardTitle">Сводка (JSON)</div>
        <pre style={{ margin: 0 }}>
          <code>{summary}</code>
        </pre>
      </div>

      <div className="heroCtas" style={{ marginTop: 16 }}>
        <button
          className="btn btnPrimary"
          type="button"
          disabled={isLoading}
          onClick={() => alert("Демо: сохранение отключено. Следующий шаг — подключить БД/админку.")}
        >
          Сохранить (демо)
        </button>
        <button className="btn" type="button" disabled={isLoading} onClick={onBack}>
          Назад
        </button>
      </div>

      <p className="small" style={{ marginTop: 10 }}>
        Следующая итерация: загрузка фото, модерация объявлений, поиск и выдача, карточка объявления, кабинет партнёра.
      </p>
    </section>
  );
}

function Consent({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
      <span className="p" style={{ margin: 0 }}>
        {label}
      </span>
    </label>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <main className="section">
        <div className="container">
          <div className="card">
            <p className="p">Загрузка формы…</p>
          </div>
        </div>
      </main>
    }>
      <RegisterPageContent />
    </Suspense>
  );
}
