"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import "@/components/save-the-date/dispositions-pratiques.css";
import { DISPOSITIONS_PRATIQUES_SECTIONS } from "@/lib/dispositions-pratiques-content";

type DispositionsPratiquesAppProps = {
  loginPath?: string;
};

export function DispositionsPratiquesApp({
  loginPath = "/login?cocktail=1",
}: DispositionsPratiquesAppProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { authenticated?: boolean };
        if (!response.ok || !data.authenticated) {
          router.replace(loginPath);
          return;
        }
        setAuthenticated(true);
      })
      .catch(() => {
        setError("Erreur réseau.");
      })
      .finally(() => setLoading(false));
  }, [loginPath, router]);

  if (loading || !authenticated) {
    return (
      <div className="dispositions-screen dispositions-screen--loading">
        <div className="dispositions-screen__spinner" aria-hidden />
        <p className="dispositions-screen__loading-text">Chargement…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dispositions-screen dispositions-screen--error">
        <p className="dispositions-screen__error">{error}</p>
        <Link href={loginPath} className="dispositions-screen__retry">
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="dispositions-screen">
      <header className="dispositions-screen__header">
        <img
          src="/img/logo-black.png"
          alt="Nathan & Innocente"
          className="dispositions-screen__logo"
          width={120}
          height={40}
        />
        <p className="dispositions-screen__tagline">Nathan &amp; Innocente · 2026</p>
      </header>

      <h1 className="dispositions-screen__title">Dispositions pratiques</h1>

      <div className="dispositions-screen__list">
        {DISPOSITIONS_PRATIQUES_SECTIONS.map((section) => (
          <article key={section.title} className="dispositions-card">
            <h2 className="dispositions-card__title">{section.title}</h2>
            <p className="dispositions-card__body">{section.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
