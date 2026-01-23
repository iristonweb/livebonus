"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Divider, Field, Input, Pill, Select } from "@/components/forms/FormBits";

type AccountType = "individual" | "legal";
type Intent = "rent_out" | "rent_in";

type Step = 1 | 2 | 3 | 4;

export function AuthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  const [accountType, setAccountType] = useState<AccountType>("individual");
  const [intent, setIntent] = useState<Intent>("rent_in");

  useEffect(() => {
    if (!open) return;
    // reset lightly each time
    setStep(1);
    setEmail("");
    setPhone("");
    setCode("");
    setAccountType("individual");
    setIntent("rent_in");
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const canContinue = useMemo(() => {
    if (step === 1) return email.trim().length >= 4 && email.includes("@");
    if (step === 2) return phone.replace(/\D/g, "").length >= 10;
    if (step === 3) return code.replace(/\D/g, "").length === 5;
    return true;
  }, [step, email, phone, code]);

  if (!open) return null;

  function next() {
    if (!canContinue) return;
    setStep((s) => (s === 4 ? 4 : ((s + 1) as Step)));
  }

  function back() {
    setStep((s) => (s === 1 ? 1 : ((s - 1) as Step)));
  }

  function goToApply() {
    const qs = new URLSearchParams({
      type: accountType,
      intent,
    });

    // Demo: persist verified contacts for UX continuity
    try {
      window.localStorage.setItem(
        "allin_auth",
        JSON.stringify({ email, phone, verifiedAt: new Date().toISOString() })
      );
    } catch {
      // ignore
    }

    onClose();
    router.push(`/apply?${qs.toString()}`);
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Войти или зарегистрироваться" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <div className="modalTitle">Войти</div>
            <div className="small" style={{ marginTop: 4 }}>
              Email → телефон → код. В РФ: вход по коду, без пароля (демо).
            </div>
          </div>
          <button className="iconBtn" type="button" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className="modalBody">
          <div className="steps" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            <StepChip n={1} step={step} title="Email" />
            <StepChip n={2} step={step} title="Телефон" />
            <StepChip n={3} step={step} title="Код" />
            <StepChip n={4} step={step} title="Сценарий" />
          </div>

          <Divider />

          {step === 1 ? (
            <>
              <Field label="Email" hint="Используем для входа и уведомлений">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="name@example.com" />
              </Field>
              <p className="small" style={{ marginTop: 10 }}>
                Нажимая «Продолжить», вы соглашаетесь с офертой и политикой ПДн (демо‑текст).
              </p>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Field label="Телефон" hint="Отправим 5‑значный код по SMS (демо)">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="+7 (___) ___‑__‑__"
                />
              </Field>
              <p className="small" style={{ marginTop: 10 }}>
                В проде: лимиты отправки, анти‑фрод, защита от перебора, аудит.
              </p>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Field label="Код из SMS" hint="В демо подойдет любой код из 5 цифр">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  inputMode="numeric"
                  placeholder="12345"
                />
              </Field>
              <div className="small" style={{ marginTop: 10 }}>
                Не пришло? <button className="btn btnSmall" type="button" onClick={() => alert("Демо: отправка SMS отключена.")}>Отправить снова</button>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <div className="card">
                <div className="cardTitle">Выберите сценарий</div>
                <div className="modalTabs">
                  <Pill active={accountType === "individual"} onClick={() => setAccountType("individual")}>Физлицо</Pill>
                  <Pill active={accountType === "legal"} onClick={() => setAccountType("legal")}>Юрлицо</Pill>
                  <span style={{ width: 10 }} />
                  <Pill active={intent === "rent_in"} onClick={() => setIntent("rent_in")}>Арендовать жильё</Pill>
                  <Pill active={intent === "rent_out"} onClick={() => setIntent("rent_out")}>Сдать жильё</Pill>
                </div>

                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  <div className="small">Куда вести дальше:</div>
                  <Select value="toRegister" onChange={() => {}}>
                    <option value="toRegister">К анкете (демо‑/register)</option>
                  </Select>
                </div>
              </div>
            </>
          ) : null}

          <div className="heroCtas" style={{ marginTop: 16 }}>
            {step > 1 ? (
              <button className="btn" type="button" onClick={back}>
                Назад
              </button>
            ) : null}

            {step < 4 ? (
              <button className="btn btnPrimary" type="button" onClick={next} disabled={!canContinue}>
                Продолжить
              </button>
            ) : (
              <button className="btn btnPrimary" type="button" onClick={goToApply}>
                Перейти к анкете
              </button>
            )}

            <button className="btn btnGhost" type="button" onClick={() => { onClose(); router.push("/register"); }}>
              Открыть /register
            </button>
          </div>

          {!canContinue && step < 4 ? (
            <p className="small" style={{ marginTop: 10 }}>
              Заполните поле корректно — тогда «Продолжить» станет активной.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StepChip({ n, step, title }: { n: 1 | 2 | 3 | 4; step: Step; title: string }) {
  const active = n === step;
  return (
    <div className="step" style={{ background: active ? "var(--surface2)" : "var(--surface)" }}>
      <div className="stepNum">{String(n).padStart(2, "0")}</div>
      <div className="stepTitle">{title}</div>
      <div className="stepText">{active ? "текущий" : " "}</div>
    </div>
  );
}
