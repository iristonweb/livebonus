import { useState } from "react";
import { useGetMe, useUpdateMe, useVerifyPhone, useVerifyIdentity, useVerifyIncome, useGetScore, useListMyVerifications, useRequestKycUploadUrl } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, getGetScoreQueryKey, getListMyVerificationsQueryKey } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { clearToken } from "./auth";
import { useLocation } from "wouter";
import { CheckCircle2, ShieldAlert, LogOut, UserCircle } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";

const itemV: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
};

function VerifyCard({
  label, description, points, achieved, onVerify, loading,
}: {
  label: string; description: string; points: number; achieved: boolean;
  onVerify: () => void; loading: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-5 p-5 rounded-xl border transition-all duration-300",
      achieved
        ? "bg-background border-border shadow-sm"
        : "bg-card border-border hover:border-primary/40 hover:shadow-md cursor-pointer group",
    )}
    onClick={!achieved && !loading ? onVerify : undefined}
    >
      <div className={cn(
        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border transition-colors",
        achieved ? "bg-primary/5 text-primary border-primary/20" : "bg-muted text-muted-foreground border-transparent group-hover:bg-primary/5 group-hover:text-primary"
      )}>
        {achieved ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("font-bold text-base tracking-tight", achieved ? "text-foreground" : "text-foreground group-hover:text-primary transition-colors")}>{label}</p>
        <p className="text-xs text-muted-foreground font-semibold mt-1">{description}</p>
      </div>
      {achieved ? (
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground shrink-0 border border-border px-3 py-1.5 rounded-lg bg-muted/50">+{points} б.</span>
      ) : (
        <button
          disabled={loading}
          className="shrink-0 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50 active:scale-[0.98] shadow-sm"
        >
          {loading ? "..." : `+${points} б.`}
        </button>
      )}
    </div>
  );
}

const DOCUMENT_ACCEPT = ".pdf,image/jpeg,image/png,image/webp";
const STATUS_LABELS: Record<string, string> = {
  not_started: "Не начата",
  pending: "На проверке",
  approved: "Подтверждено",
  rejected: "Нужна повторная подача",
};

function errorMessage(error: unknown): string {
  const data = (error as { data?: unknown })?.data;
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  return error instanceof Error ? error.message : "Не удалось отправить документ. Попробуйте ещё раз.";
}

function DocumentVerifyCard({
  type, label, description, points, status, rejectionReason, loading, onPick,
}: {
  type: "identity" | "income";
  label: string;
  description: string;
  points: number;
  status: string;
  rejectionReason?: string | null;
  loading: boolean;
  onPick: (file: File) => void;
}) {
  const inputId = `verification-document-${type}`;
  const isApproved = status === "approved";
  const isPending = status === "pending";
  return (
    <div className={cn(
      "rounded-xl border p-5 transition-all",
      isApproved ? "border-primary/20 bg-primary/5" : isPending ? "border-amber-500/20 bg-amber-500/5" : status === "rejected" ? "border-destructive/20 bg-destructive/5" : "border-border bg-card",
    )}>
      <div className="flex items-start gap-4">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border",
          isApproved ? "bg-primary/10 text-primary border-primary/20" : status === "rejected" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-muted text-muted-foreground border-transparent",
        )}>
          {isApproved ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-base tracking-tight text-foreground">{label}</p>
            <span className={cn(
              "rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
              isApproved ? "bg-primary/10 text-primary" : isPending ? "bg-amber-500/10 text-amber-700" : status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
            )}>{STATUS_LABELS[status] ?? STATUS_LABELS.not_started}</span>
          </div>
          <p className="text-xs text-muted-foreground font-semibold mt-1">{description}</p>
          {status === "rejected" && rejectionReason ? (
            <p className="mt-3 rounded-lg bg-background/70 px-3 py-2 text-xs font-semibold text-destructive">
              Причина: {rejectionReason}
            </p>
          ) : null}
        </div>
        {isApproved ? (
          <span className="text-[11px] font-bold uppercase tracking-widest text-primary shrink-0 border border-primary/20 px-3 py-1.5 rounded-lg bg-background">+{points} б.</span>
        ) : isPending ? (
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-700 shrink-0 border border-amber-500/20 px-3 py-1.5 rounded-lg bg-background">Ожидайте</span>
        ) : (
          <label htmlFor={inputId} className={cn(
            "shrink-0 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold transition-all shadow-sm",
            loading ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-primary/90",
          )}>
            {loading ? "Загрузка…" : status === "rejected" ? "Отправить снова" : `Загрузить документ`}
            <input
              id={inputId}
              type="file"
              accept={DOCUMENT_ACCEPT}
              className="sr-only"
              disabled={loading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onPick(file);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: user, isLoading } = useGetMe();
  const { data: score } = useGetScore();
  const updateMe = useUpdateMe();
  const verifyPhone = useVerifyPhone();
  const verifyIdentity = useVerifyIdentity();
  const verifyIncome = useVerifyIncome();
  const requestKycUploadUrl = useRequestKycUploadUrl();
  const { data: verificationApplications } = useListMyVerifications();

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
    qc.invalidateQueries({ queryKey: getGetScoreQueryKey() });
    qc.invalidateQueries({ queryKey: getListMyVerificationsQueryKey() });
  }

  async function handleVerify(fn: () => Promise<unknown>) {
    try { await fn(); invalidate(); } catch (error) { setVerificationError(errorMessage(error)); }
  }

  async function handleDocument(type: "identity" | "income", file: File) {
    setVerificationError(null);
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
      setVerificationError("Выберите PDF, JPEG, PNG или WEBP размером до 10 МБ.");
      return;
    }
    try {
      const upload = await requestKycUploadUrl.mutateAsync({
        data: { name: file.name, size: file.size, contentType: file.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp" },
      });
      const response = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Хранилище не приняло файл. Повторите загрузку.");
      const data = { objectPath: upload.objectPath, fileName: file.name, contentType: file.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp", fileSize: file.size };
      await (type === "identity" ? verifyIdentity : verifyIncome).mutateAsync({ data });
      invalidate();
    } catch (error) {
      setVerificationError(errorMessage(error));
    }
  }

  function verificationStatus(type: "identity" | "income") {
    const status = type === "identity" ? user?.identityVerificationStatus : user?.incomeVerificationStatus;
    return status ?? "not_started";
  }

  function latestApplication(type: "identity" | "income") {
    return verificationApplications?.find((item) => item.verificationType === type);
  }

  function startEdit() {
    setEditName(user?.name ?? "");
    setEditEmail(user?.email ?? "");
    setEditing(true);
    setSaved(false);
  }

  async function handleSave() {
    await updateMe.mutateAsync({ data: { name: editName, email: editEmail || undefined } });
    invalidate();
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleLogout() {
    clearToken();
    navigate("/auth");
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse h-32 rounded-2xl bg-muted/50 border border-border" />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-8 max-w-2xl mx-auto"
      initial="hidden" animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
    >
      <motion.div variants={itemV} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Профиль</h1>
          <p className="text-muted-foreground text-sm mt-2 font-semibold">Управление данными и верификация</p>
        </div>
      </motion.div>

      {/* User card */}
      <motion.div variants={itemV} className="trust-panel p-8 flex items-center gap-6">
        <div className="w-20 h-20 rounded-2xl border border-border bg-muted flex items-center justify-center shrink-0 shadow-sm">
          <UserCircle className="w-10 h-10 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-bold text-foreground tracking-tight">{user?.name}</p>
          <p className="text-sm text-muted-foreground font-bold mt-1.5 uppercase tracking-widest">{user?.phone}</p>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="px-5 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs font-bold hover:bg-muted transition-all shrink-0 shadow-sm active:scale-[0.98]"
          >
            Изменить
          </button>
        )}
      </motion.div>

      {/* Edit form */}
      {editing && (
        <motion.div variants={itemV} className="trust-panel p-8 space-y-6 border-primary/30 shadow-lg">
          <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Данные профиля</h2>
          <div className="space-y-4">
            <input
              className="w-full px-4 py-3 rounded-xl border border-border bg-input/50 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-inner"
              placeholder="Имя"
              value={editName}
              onChange={e => setEditName(e.target.value)}
            />
            <input
              className="w-full px-4 py-3 rounded-xl border border-border bg-input/50 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-inner"
              placeholder="Email (опционально)"
              type="email"
              value={editEmail}
              onChange={e => setEditEmail(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={updateMe.isPending || !editName.trim()}
              className="py-3 px-6 rounded-xl bg-foreground text-background font-bold text-sm hover:bg-foreground/90 transition-all disabled:opacity-50 active:scale-[0.98] shadow-md"
            >
              {updateMe.isPending ? "Сохранение..." : "Сохранить изменения"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="py-3 px-6 rounded-xl bg-transparent border border-transparent text-muted-foreground font-bold text-sm hover:bg-muted transition-all active:scale-[0.98]"
            >
              Отмена
            </button>
          </div>
        </motion.div>
      )}

      {saved && (
        <motion.div variants={itemV} className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 text-primary text-sm font-bold flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5" /> Данные успешно обновлены
        </motion.div>
      )}

      {/* Verification */}
      <motion.div variants={itemV} className="trust-panel p-8">
        <h2 className="text-xl font-bold text-foreground tracking-tight mb-2">Центр верификации</h2>
        <p className="text-sm text-muted-foreground font-semibold mb-6">Загрузите документ один раз — администратор проверит его вручную. Документ доступен только вам и проверяющему.</p>
        <div className="space-y-4">
          <VerifyCard
            label="Телефонный номер"
            description="Подтвержден по SMS"
            points={50}
            achieved={user?.isPhoneVerified ?? false}
            loading={verifyPhone.isPending}
            onVerify={() => handleVerify(() => verifyPhone.mutateAsync())}
          />
          <DocumentVerifyCard
            label="Паспортные данные"
            description="Подтверждение личности по документу"
            points={100}
            type="identity"
            status={verificationStatus("identity")}
            rejectionReason={latestApplication("identity")?.rejectionReason}
            loading={requestKycUploadUrl.isPending || verifyIdentity.isPending}
            onPick={(file) => void handleDocument("identity", file)}
          />
          <DocumentVerifyCard
            label="Подтверждение дохода"
            description="Справка или выписка со счёта"
            points={100}
            type="income"
            status={verificationStatus("income")}
            rejectionReason={latestApplication("income")?.rejectionReason}
            loading={requestKycUploadUrl.isPending || verifyIncome.isPending}
            onPick={(file) => void handleDocument("income", file)}
          />
        </div>
        {verificationError ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive" role="alert">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{verificationError}</span>
          </div>
        ) : null}
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemV}>
        <h2 className="text-xl font-bold text-foreground mb-5 tracking-tight">Сводка</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: "Live Score", value: score?.score ?? "—" },
            { label: "Верификация", value: `${user?.verificationLevel ?? 0}/3` },
            { label: "Договоры", value: score?.totalLeases ?? 0 },
            { label: "Баланс баллов", value: user ? <AnimatedNumber value={user.pointsBalance} /> : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="trust-panel p-5 bg-background">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{label}</p>
              <p className="text-2xl font-bold text-foreground tracking-tight">
                {value}
              </p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Danger zone */}
      <motion.div variants={itemV} className="pt-6">
        <button
          onClick={handleLogout}
          className="w-full py-4 rounded-xl border border-destructive/20 text-destructive bg-destructive/5 font-bold text-base hover:bg-destructive hover:text-white transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <LogOut className="w-5 h-5" /> Завершить сеанс
        </button>
      </motion.div>
    </motion.div>
  );
}
