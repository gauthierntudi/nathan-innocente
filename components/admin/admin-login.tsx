"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.message ?? "Mot de passe incorrect");
        return;
      }

      router.refresh();
    } catch {
      setError("Erreur technique");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <Image
          src="/img/logo-white.png"
          alt="Nathan & Innocente"
          width={180}
          height={72}
          className="admin-login-card__logo"
          priority
        />
        <p className="admin-login-card__eyebrow">Administration</p>
        <h1 className="admin-login-card__title">Espace invités</h1>
        <p className="admin-login-card__subtitle">
          Connectez-vous pour gérer les invitations, les envois WhatsApp et les confirmations.
        </p>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <div>
            <label className="admin-login-label" htmlFor="admin-password">
              Mot de passe
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="admin-login-field"
              placeholder="••••••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? <p className="admin-login-error">{error}</p> : null}

          <button type="submit" disabled={loading} className="admin-login-submit">
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <Link href="/home" className="admin-login-back">
          Retour au site
        </Link>
      </div>
    </div>
  );
}
