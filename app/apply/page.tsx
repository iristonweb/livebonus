"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { Divider, Field, Pill, Select, TextArea } from "@/components/forms/FormBits";
import { SmartPlaceInput } from "@/components/forms/SmartPlaceInput";
import Link from "next/link";
import type { AccountType, Intent, ListingForm, SearchForm } from "@/lib/types";
import { titleFor, canContinueApply } from "@/lib/types";

type AuthData = { email?: string; phone?: string; verifiedAt?: string };

function ApplyPageContent() {
  const params = useSearchParams();
  const topRef = useRef<HTMLDivElement | null>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);

  const [accountType, setAccountType] = useState<AccountType>("individual");
  const [intent, setIntent] = useState<Intent>("rent_in");

  const [auth, setAuth] = useState<AuthData>({});

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

  useEffect(() => {
    const t = params.get("type");
    const i = params.get("intent");
    if (t === "legal" || t === "individual") setAccountType(t);
    if (i === "rent_in" || i === "rent_out") setIntent(i);
  }, [params]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("allin_auth");
      if (!raw) return;
      setAuth(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  // Восстановление черновика при загрузке
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("allin_apply_draft");
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.accountType) setAccountType(draft.accountType);
      if (draft.intent) setIntent(draft.intent);
      if (draft.listing) setListing(draft.listing);
      if (draft.search) setSearch(draft.search);
    } catch {
      // ignore
    }
  }, []);

  // Сохранение черновика в localStorage при изменении формы
  useEffect(() => {
    if (step !== 1) return; // Сохраняем только на шаге 1
    try {
      const draft = {
        accountType,
        intent,
        listing,
        search,
        savedAt: new Date().toISOString(),
      };
      window.localStorage.setItem("allin_apply_draft", JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, [step, accountType, intent, listing, search]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const isLegal = accountType === "legal";

  const canContinue = useMemo(() => {
    return canContinueApply(intent, listing, search);
  }, [intent, listing, search]);

  const summary = useMemo(() => {
    const payload = {
      auth,
      scenario: { accountType, intent },
      questionnaire: intent === "rent_out" ? listing : search,
    };
    return JSON.stringify(payload, null, 2);
  }, [auth, accountType, intent, listing, search]);

  return (
    <main className="section">
      <div className="container">
        <div className="card formShell">
          <div ref={topRef} />

          <div className="formHeader">
            <div className="kicker">
              <span className="kickerDot" />
              Анкета — контрольный экран
            </div>

            <h1 className="h1Large">Заполните анкету</h1>
            <p className="p mt12 maxW920">
              Вы вошли и подтвердили контакт. Дополнительные данные (документы/договор) можно заполнить позже — чтобы не
              тормозить путь пользователя.
            </p>

            <div className="badges mt14">
              <span className="badge badgeStrong">
                <span className="badgeMark" />
                {titleFor(accountType, intent)}
              </span>
              <span className="badge">
                <span className="badgeMark" />
                {auth.email ? auth.email : "email не сохранён (демо)"}
              </span>
              <span className="badge">
                <span className="badgeMark" />
                {auth.phone ? auth.phone : "телефон не сохранён (демо)"}
              </span>
            </div>

            <div className="pageMeta mt12">
              <span className="pageMetaTag">Autosave</span>
              <span className="pageMetaTag">Step Flow</span>
              <span className="pageMetaTag">Control Room</span>
            </div>
          </div>

          <Divider />

          <div className="flexWrap">
            <Pill active={accountType === "individual"} onClick={() => setAccountType("individual")}>
              Физлицо
            </Pill>
            <Pill active={accountType === "legal"} onClick={() => setAccountType("legal")}>
              Юрлицо
            </Pill>

            <span className="spacer12" />

            <Pill active={intent === "rent_in"} onClick={() => setIntent("rent_in")}>
              Арендовать жильё
            </Pill>
            <Pill active={intent === "rent_out"} onClick={() => setIntent("rent_out")}>
              Сдать жильё
            </Pill>
          </div>

          <Divider />

          <div className="steps steps2">
            <div className={`step ${step === 1 ? "stepActive" : ""}`}>
              <div className="stepNum">01</div>
              <div className="stepTitle">Анкета</div>
              <div className="stepText">Объявление или поиск</div>
            </div>
            <div className={`step ${step === 2 ? "stepActive" : ""}`}>
              <div className="stepNum">02</div>
              <div className="stepTitle">Черновик</div>
              <div className="stepText">Проверка</div>
            </div>
          </div>

          {step === 1 ? (
            <section className="mt14">
              <h2 className="h2Medium">{intent === "rent_out" ? "Анкета объявления" : "Анкета поиска"}</h2>
              <p className="p mt8">
                Поля адреса — «умные»: подсказываем известные варианты (локально) и через OpenStreetMap (демо).
              </p>

              <div className="gridGap14 mt14">
                {intent === "rent_out" ? (
                  <>
                    <div className="card">
                      <div className="cardTitle">Локация</div>
                      <div className="gridGap12">
                        <Field label="Город">
                          <SmartPlaceInput
                            kind="city"
                            value={listing.city}
                            onChange={(v) => setListing((p) => ({ ...p, city: v }))}
                            placeholder="Начните вводитьь…"
                          />
                        </Field>
                        <Field label="Район / ориентир" hint="Можно без точного адреса (безопаснее)">
                          <SmartPlaceInput
                            kind="district"
                            cityContext={listing.city}
                            value={listing.district}
                            onChange={(v) => setListing((p) => ({ ...p, district: v }))}
                            placeholder="Например: ЦАО, рядом с Таганской"
                          />
                        </Field>
                        <Field label="Метро (опционально)">
                          <SmartPlaceInput
                            kind="metro"
                            cityContext={listing.city}
                            value={listing.metro}
                            onChange={(v) => setListing((p) => ({ ...p, metro: v }))}
                            placeholder="Начните вводитьь станцию…"
                          />
                        </Field>
                      </div>
                    </div>

                    <div className="card">
                      <div className="cardTitle">Объект</div>
                      <div className="gridGap12">
                        <Field label="Тип жилья">
                          <Select
                            value={listing.propertyType}
                            onChange={(e) => setListing((p) => ({ ...p, propertyType: e.target.value as ListingForm["propertyType"] }))}
                          >
                            <option value="apartment">Квартира</option>
                            <option value="room">Комната</option>
                            <option value="house">Дом</option>
                            <option value="other">Другое</option>
                          </Select>
                        </Field>

                        <div className="gridCols3">
                          <Field label="Комнат">
                            <input className="inputLike" value={listing.rooms} onChange={(e) => setListing((p) => ({ ...p, rooms: e.target.value }))} inputMode="numeric" placeholder="2" />
                          </Field>
                          <Field label="Площадь, м²">
                            <input className="inputLike" value={listing.areaM2} onChange={(e) => setListing((p) => ({ ...p, areaM2: e.target.value }))} inputMode="numeric" placeholder="54" />
                          </Field>
                          <Field label="Заселение с">
                            <input className="inputLike" value={listing.moveInFrom} onChange={(e) => setListing((p) => ({ ...p, moveInFrom: e.target.value }))} placeholder="с 15.02" />
                          </Field>
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <div className="cardTitle">Условия</div>
                      <div className="gridGap12">
                        <div className="gridCols3">
                          <Field label="Аренда, ₽/мес">
                            <input className="inputLike" value={listing.priceRub} onChange={(e) => setListing((p) => ({ ...p, priceRub: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder="50000" />
                          </Field>
                          <Field label="Депозит, ₽">
                            <input className="inputLike" value={listing.depositRub} onChange={(e) => setListing((p) => ({ ...p, depositRub: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder="50000" />
                          </Field>
                          <Field label="Коммунальные">
                            <Select value={listing.utilities} onChange={(e) => setListing((p) => ({ ...p, utilities: e.target.value as ListingForm["utilities"] }))}>
                              <option value="separate">Отдельно</option>
                              <option value="included">Включены</option>
                              <option value="partly">Частично</option>
                            </Select>
                          </Field>
                        </div>

                        <div className="gridCols3">
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

                        <Field label="Описание">
                          <TextArea value={listing.description} onChange={(e) => setListing((p) => ({ ...p, description: e.target.value }))} placeholder="Квартира после ремонта, техника есть…" />
                        </Field>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="card">
                      <div className="cardTitle">Локация</div>
                      <div className="gridGap12">
                        <Field label="Город">
                          <SmartPlaceInput kind="city" value={search.city} onChange={(v) => setSearch((p) => ({ ...p, city: v }))} placeholder="Начните вводитьь…" />
                        </Field>
                        <Field label="Районы (через запятую)" hint="Можно перечислить несколько зон">
                          <input className="inputLike" value={search.districts} onChange={(e) => setSearch((p) => ({ ...p, districts: e.target.value }))} placeholder="Приморский, Петроградский…" />
                        </Field>
                        <Field label="Метро (опционально)">
                          <SmartPlaceInput kind="metro" cityContext={search.city} value={search.metro} onChange={(v) => setSearch((p) => ({ ...p, metro: v }))} placeholder="Начните вводитьь станцию…" />
                        </Field>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                          <Field label="Метро, мин (макс.)" hint="Если важно">
                            <input className="inputLike" value={search.metroMaxMinutes} onChange={(e) => setSearch((p) => ({ ...p, metroMaxMinutes: e.target.value }))} inputMode="numeric" placeholder="15" />
                          </Field>
                          <Field label="Заезд с">
                            <input className="inputLike" value={search.moveInFrom} onChange={(e) => setSearch((p) => ({ ...p, moveInFrom: e.target.value }))} placeholder="с 01.03" />
                          </Field>
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <div className="cardTitle">Параметры</div>
                      <div className="gridGap12">
                        <Field label="Тип жилья">
                          <Select value={search.propertyType} onChange={(e) => setSearch((p) => ({ ...p, propertyType: e.target.value as SearchForm["propertyType"] }))}>
                            <option value="any">Любое</option>
                            <option value="apartment">Квартира</option>
                            <option value="room">Комната</option>
                            <option value="house">Дом</option>
                          </Select>
                        </Field>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                          <Field label="Бюджет от, ₽">
                            <input className="inputLike" value={search.budgetFrom} onChange={(e) => setSearch((p) => ({ ...p, budgetFrom: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder="45000" />
                          </Field>
                          <Field label="Бюджет до, ₽">
                            <input className="inputLike" value={search.budgetTo} onChange={(e) => setSearch((p) => ({ ...p, budgetTo: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder="70000" />
                          </Field>
                        </div>

                        <div className="gridCols3">
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
                            <div className="cardTitle">Для юрлица</div>
                            <div className="gridGap12">
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

                        <Field label="Комментарий">
                          <TextArea value={search.notes} onChange={(e) => setSearch((p) => ({ ...p, notes: e.target.value }))} placeholder="Тихий двор, парковка, без 1 этажа…" />
                        </Field>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="heroCtas" style={{ marginTop: 16 }}>
                <button
                  className="btn btnPrimary"
                  disabled={!canContinue || isLoading}
                  type="button"
                  onClick={() => {
                    if (!canContinue) return;
                    setIsLoading(true);
                    setTimeout(() => {
                      setStep(2);
                      setIsLoading(false);
                    }, 300);
                  }}
                >
                  {isLoading ? "Загрузка…" : "Продолжить"}
                </button>
                <Link className="btn btnGhost" href="/register">Расширенная регистрация</Link>
                <Button href="/" variant="ghost">На главную</Button>
              </div>

              {!canContinue ? (
                <p className="small" style={{ marginTop: 10 }}>
                  Заполните минимум: {intent === "rent_out" ? "город и цену" : "город и бюджет"}.
                </p>
              ) : null}
            </section>
          ) : null}

          {step === 2 ? (
            <section style={{ marginTop: 14 }}>
              <h2 style={{ fontSize: 22, marginTop: 8 }}>Черновик</h2>
              <p className="p" style={{ marginTop: 8 }}>
                Демо‑режим: сохраняем только в JSON. В проде — запись в БД и модерация/поиск.
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
                  onClick={() => {
                    setIsLoading(true);
                    setTimeout(() => {
                      alert("Демо: сохранение отключено. Следующий шаг — БД/админка.");
                      setIsLoading(false);
                    }, 200);
                  }}
                >
                  {isLoading ? "Сохранение…" : "Сохранить (демо)"}
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setIsLoading(true);
                    setTimeout(() => {
                      setStep(1);
                      setIsLoading(false);
                    }, 300);
                  }}
                >
                  Назад
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default function ApplyPage() {
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
      <ApplyPageContent />
    </Suspense>
  );
}
