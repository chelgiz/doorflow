"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось войти");
      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-login-form" onSubmit={submit}>
      <label>
        Email
        <input autoComplete="username" name="email" required type="email" />
      </label>
      <label>
        Пароль
        <input autoComplete="current-password" minLength={1} name="password" required type="password" />
      </label>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button className="button button-accent" disabled={busy} type="submit">
        {busy ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
