import Link from "next/link";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export default function AdminLoginPage() {
  return (
    <main className="admin-login-page">
      <div className="admin-login-card">
        <Link className="brand" href="/">
          <span className="brand-mark">D</span>
          <span className="brand-word">door<span>flow</span></span>
        </Link>
        <span className="eyebrow">Рабочее пространство</span>
        <h1>Вход в управление</h1>
        <p>Войдите под учётной записью, созданной владельцем магазина.</p>
        <AdminLoginForm />
      </div>
    </main>
  );
}
