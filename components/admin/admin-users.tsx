"use client";

import { FormEvent, useState } from "react";

type AdminUserRow = {
  id: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "MEASURER" | "INSTALLER";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

async function parseResponse(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Не удалось выполнить операцию");
  return result;
}

export function AdminUsers({ initialUsers }: { initialUsers: AdminUserRow[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MANAGER" | "MEASURER" | "INSTALLER">("MANAGER");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const result = await parseResponse(await fetch("/api/admin/users", { cache: "no-store" }));
    setUsers(result.users);
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await parseResponse(await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      }));
      setEmail("");
      setPassword("");
      await refresh();
      setMessage("Учётная запись создана. Передайте сотруднику пароль защищённым способом.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать учётную запись");
    }
  }

  async function updateUser(user: AdminUserRow, nextRole = user.role, isActive = user.isActive) {
    if (user.role === "OWNER") return;
    setError("");
    try {
      await parseResponse(await fetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: nextRole, isActive }),
      }));
      await refresh();
      setMessage("Права учётной записи обновлены.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось изменить права");
    }
  }

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <h2>Добавить сотрудника</h2>
        <form className="admin-form-grid" onSubmit={createUser}>
          <label>Email сотрудника<input autoComplete="off" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label>Начальный пароль (12+ символов)<input autoComplete="new-password" minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          <label>Роль
            <select onChange={(event) => setRole(event.target.value as typeof role)} value={role}>
              <option value="MANAGER">Менеджер</option>
              <option value="ADMIN">Администратор</option>
              <option value="MEASURER">Замерщик</option>
              <option value="INSTALLER">Установщик</option>
            </select>
          </label>
          <div className="admin-form-wide">
            {error && <p className="admin-error" role="alert">{error}</p>}
            {message && <p className="admin-success" role="status">{message}</p>}
            <p className="admin-muted">Пароль хранится только в Argon2id-хэше. Уведомления не отправляются — пароль передаётся вручную защищённым способом.</p>
            <button className="button button-accent" type="submit">Создать сотрудника</button>
          </div>
        </form>
      </section>
      <section className="admin-panel">
        <h2>Учётные записи</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Сотрудник</th><th>Роль</th><th>Последний вход</th><th>Статус</th><th>Действие</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>
                    {user.role === "OWNER" ? "Владелец" : (
                      <select
                        aria-label={`Роль для ${user.email}`}
                        onChange={(event) => void updateUser(user, event.target.value as "ADMIN" | "MANAGER" | "MEASURER" | "INSTALLER")}
                        value={user.role}
                      >
                        <option value="MANAGER">Менеджер</option>
                        <option value="ADMIN">Администратор</option>
                        <option value="MEASURER">Замерщик</option>
                        <option value="INSTALLER">Установщик</option>
                      </select>
                    )}
                  </td>
                  <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("ru-RU") : "Ещё не входил"}</td>
                  <td>{user.isActive ? "Активна" : "Отключена"}</td>
                  <td>{user.role !== "OWNER" && <button className="admin-text-button" onClick={() => void updateUser(user, user.role, !user.isActive)} type="button">{user.isActive ? "Отключить" : "Активировать"}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
