import { useState } from "react";
import { useLocation } from "wouter";
import { useRequestOtp, useVerifyOtp } from "@workspace/api-client-react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ShieldCheck, ArrowRight, ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------
const TOKEN_KEY = "ls_token";

export function getStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function saveToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  setAuthTokenGetter(() => getStoredToken());
  window.dispatchEvent(new Event("ls-auth-change"));
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  setAuthTokenGetter(null);
  window.dispatchEvent(new Event("ls-auth-change"));
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
export default function AuthPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();

  function formatPhone(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("7") || digits.startsWith("8")) return "+" + digits;
    if (digits.startsWith("9")) return "+7" + digits;
    return "+" + digits;
  }

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const formatted = formatPhone(phone);
    if (formatted.replace(/\D/g, "").length < 11) {
      setError("Введите корректный номер телефона");
      return;
    }
    try {
      const res = await requestOtp.mutateAsync({ data: { phone: formatted } });
      if (res.devCode) setDevCode(res.devCode);
      setPhone(formatted);
      setStep("otp");
    } catch {
      setError("Не удалось отправить код. Попробуйте ещё раз.");
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.length !== 4) { setError("Введите 4-значный код"); return; }
    try {
      const res = await verifyOtp.mutateAsync({ data: { phone, code: otp } });
      saveToken(res.token);
      navigate("/");
    } catch (err: unknown) {
      // ApiError from the api client exposes the parsed body as `data`.
      const msg = (err as { data?: { error?: string } })?.data?.error;
      setError(msg ?? "Неверный код. Попробуйте ещё раз.");
    }
  }

  async function handleDemoLogin() {
    setError("");
    const demoPhone = "+79001234567";
    try {
      const req = await requestOtp.mutateAsync({ data: { phone: demoPhone } });
      const code = req.devCode ?? "1234";
      const res = await verifyOtp.mutateAsync({ data: { phone: demoPhone, code } });
      saveToken(res.token);
      navigate("/");
    } catch {
      setError("Ошибка демо-входа. Убедитесь, что API сервер запущен.");
    }
  }

  return (
    <div className="min-h-[100dvh] flex md:flex-row flex-col bg-background">
      {/* ── Left side: Deep Brand Scene ── */}
      <div className="hidden md:flex flex-1 bg-foreground text-background flex-col justify-between p-12 lg:p-20 relative overflow-hidden">
        {/* Massive background watermark */}
        <BrandMark className="absolute -left-32 -bottom-32 w-[800px] h-[800px] opacity-[0.03] text-white pointer-events-none" />
        
        {/* Subtle architectural gradient for depth */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
        
        <div className="relative z-10">
          <BrandMark className="w-16 h-16 text-primary mb-12 drop-shadow-xl" />
          <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight max-w-xl leading-[1.1]">
            Инфраструктура доверия <br />на рынке аренды.
          </h1>
          <p className="text-background/60 mt-6 max-w-md text-lg font-medium">
            Формируйте рейтинг, открывайте доступ к привилегиям и подтверждайте свою надёжность перед арендодателями.
          </p>
        </div>
        
        <div className="relative z-10 flex items-center gap-4 bg-white/5 w-fit px-5 py-3 rounded-2xl border border-white/10 backdrop-blur-md">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <span className="text-sm font-bold tracking-wide text-white">Защищено платформой Live Score</span>
        </div>
      </div>

      {/* ── Right side: Floating Auth Form ── */}
      <div className="flex-1 flex flex-col justify-center p-6 md:p-12 lg:p-24 relative bg-background">
        <div className="w-full max-w-md mx-auto">
          {/* Mobile logo */}
          <div className="md:hidden flex items-center gap-3 mb-12">
            <BrandMark className="w-10 h-10 text-primary" />
            <div>
              <p className="font-bold text-foreground text-xl tracking-tight leading-none">Live Score</p>
              <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-1">Housing Trust</p>
            </div>
          </div>

          <motion.div
            className="trust-panel p-8 md:p-10 relative overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {/* Subtle glow inside the card */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-primary/5 blur-3xl rounded-full pointer-events-none" />

            <AnimatePresence mode="wait">
              {step === "phone" ? (
                <motion.div key="phone" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="relative z-10">
                  <h2 className="text-2xl font-bold text-foreground mb-2 tracking-tight">Авторизация</h2>
                  <p className="text-muted-foreground text-sm font-medium mb-8">Укажите номер телефона для входа в систему</p>
                  
                  <form onSubmit={handleRequestOtp} className="space-y-6">
                    <div className="space-y-2.5">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Номер телефона</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+7 900 123-45-67"
                        className="w-full px-5 py-4 rounded-xl bg-input/50 border border-border text-foreground text-lg font-bold tracking-wide placeholder:text-muted-foreground/50 placeholder:font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary focus:bg-background transition-all"
                        autoFocus
                      />
                    </div>
                    {error && <p className="text-destructive text-sm font-semibold">{error}</p>}
                    
                    <button
                      type="submit"
                      disabled={requestOtp.isPending}
                      className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98]"
                    >
                      {requestOtp.isPending ? "Обработка..." : "Продолжить"}
                      {!requestOtp.isPending && <ArrowRight className="w-5 h-5" />}
                    </button>
                  </form>

                  <div className="mt-8 pt-6 border-t border-border">
                    <button
                      onClick={handleDemoLogin}
                      disabled={verifyOtp.isPending || requestOtp.isPending}
                      className="w-full py-3.5 rounded-xl bg-muted/50 text-foreground font-bold text-sm hover:bg-muted transition-colors disabled:opacity-50 border border-border active:scale-[0.98]"
                    >
                      {(verifyOtp.isPending || requestOtp.isPending) ? "Входим…" : "Войти как демо-пользователь"}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="otp" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="relative z-10">
                  <button onClick={() => { setStep("phone"); setError(""); setOtp(""); }}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 text-xs font-bold uppercase tracking-widest">
                    <ArrowLeft className="w-4 h-4" /> Назад
                  </button>
                  
                  <h2 className="text-2xl font-bold text-foreground mb-2 tracking-tight">Подтверждение</h2>
                  <p className="text-muted-foreground text-sm font-medium mb-8">Введите код, отправленный на <span className="font-bold text-foreground">{phone}</span></p>
                  
                  {devCode && (
                    <div className="mb-8 px-4 py-3 rounded-lg border border-primary/20 bg-primary/5 flex items-center justify-between">
                      <span className="text-primary text-xs font-bold uppercase tracking-wider">Код для разработчиков</span>
                      <span className="text-primary text-xl tracking-widest font-mono font-bold">{devCode}</span>
                    </div>
                  )}
                  
                  <form onSubmit={handleVerifyOtp} className="space-y-6">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="0000"
                      className="w-full px-4 py-5 rounded-xl bg-input/50 border border-border text-foreground text-4xl font-mono font-bold text-center tracking-[0.5em] placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary focus:bg-background transition-all"
                      autoFocus
                    />
                    {error && <p className="text-destructive text-sm font-semibold">{error}</p>}
                    
                    <button
                      type="submit"
                      disabled={verifyOtp.isPending || otp.length !== 4}
                      className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20 active:scale-[0.98]"
                    >
                      {verifyOtp.isPending ? "Проверка..." : "Войти в систему"}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <p className="text-center text-muted-foreground/60 text-xs font-medium mt-8">
            Нажимая кнопку «Продолжить», вы соглашаетесь с условиями обработки данных
          </p>
        </div>
      </div>
    </div>
  );
}
