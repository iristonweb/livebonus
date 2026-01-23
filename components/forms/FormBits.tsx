"use client";

import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gap: 2 }}>
        <div style={{ fontWeight: 700 }}>{label}</div>
        {hint ? <div className="small">{hint}</div> : null}
      </div>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`inputLike ${props.className || ""}`}
      style={{
        ...props.style,
      }}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`inputLike ${props.className || ""}`}
      style={{
        ...props.style,
        minHeight: 96,
        resize: "vertical",
      }}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`inputLike ${props.className || ""}`}
      style={{
        ...props.style,
      }}
    />
  );
}

export function Divider() {
  return <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "18px 0" }} />;
}

export function Pill({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="btn btnSmall"
      onClick={onClick}
      style={{
        background: active ? "linear-gradient(135deg, rgba(0,245,212,.22), rgba(180,255,57,.14))" : "var(--surface)",
        borderColor: active ? "rgba(0,245,212,.35)" : "var(--border)",
      }}
    >
      {children}
    </button>
  );
}
