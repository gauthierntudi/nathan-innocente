"use client";

import { useEffect, useState } from "react";

import { InvitationHearts } from "@/components/save-the-date/invitation-hearts";
import "@/components/save-the-date/invitation.css";
import type { PassAccessCeremony } from "@/lib/pass-access";

type CheckInPayload = {
  guestName: string;
  guestGenre: string;
  numGuests: number;
  ceremonies: PassAccessCeremony[];
};

type CheckInAppProps = {
  token: string;
};

export function CheckInApp({ token }: CheckInAppProps) {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<CheckInPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("QR code invalide.");
      setLoading(false);
      return;
    }

    fetch(`/api/check-in?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as CheckInPayload & {
          success?: boolean;
          message?: string;
        };
        if (!response.ok || !data.success) {
          setError(data.message ?? "Pass introuvable.");
          return;
        }
        setPayload(data);
      })
      .catch(() => setError("Erreur réseau."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="invitation-loading">
        <img src="/img/logo-white.png" alt="" width={48} height={48} className="opacity-90" />
        <div className="invitation-loading__spinner" aria-hidden />
        <p className="text-sm text-white/60">Vérification du pass…</p>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="invitation-page">
        <div className="invitation-page__bg" aria-hidden />
        <div className="invitation-page__overlay" aria-hidden />
        <div className="invitation-page__content">
          <p className="invitation-error">{error || "Pass introuvable."}</p>
        </div>
      </div>
    );
  }

  const tableLines = payload.ceremonies.filter((ceremony) => ceremony.tableName);

  return (
    <div className="invitation-page pass-access-page pass-access-page--check-in">
      <div className="invitation-page__bg" aria-hidden />
      <div className="invitation-page__overlay" aria-hidden />

      <div className="invitation-page__content pass-access-page__content">
        <div className="invitation-brand pass-access-page__brand">
          <img
            className="invitation-brand__logo"
            src="/img/logo-white.png"
            alt="Nathan & Innocente"
          />
          <InvitationHearts />
          <p className="invitation-brand__eyebrow">Contrôle d&apos;entrée</p>
          <h1 className="invitation-brand__title">{payload.guestName}</h1>
          <p className="invitation-brand__subtitle">
            {payload.guestGenre} · {payload.numGuests} convive
            {payload.numGuests > 1 ? "s" : ""}
          </p>
        </div>

        <article className="pass-access-card pass-access-card--check-in">
          <p className="pass-access-card__verified">Pass valide</p>
          <div className="pass-access-card__meta">
            {tableLines.length > 0 ? (
              tableLines.map((ceremony) => (
                <p key={ceremony.id}>
                  <span className="pass-access-card__label">
                    Table · {ceremony.name}
                  </span>
                  <span>{ceremony.tableName}</span>
                </p>
              ))
            ) : (
              <p className="pass-access-card__hint">Aucune table assignée.</p>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
