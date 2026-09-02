"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PassAccessQrCode } from "@/components/save-the-date/pass-access-qr-code";
import "@/components/save-the-date/pass-access.css";
import type { PassAccessPayload } from "@/lib/pass-access";

type PassAccessPanelProps = {
  /** Intégré dans /wedding (fond sombre), bottom sheet, ou page /pass-access */
  variant?: "embedded" | "sheet" | "standalone";
  className?: string;
};

export function PassAccessPanel({
  variant = "standalone",
  className = "",
}: PassAccessPanelProps) {
  const [payload, setPayload] = useState<PassAccessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPass = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);

    try {
      const response = await fetch("/api/auth/pass-access", {
        cache: "no-store",
      });
      const data = (await response.json()) as PassAccessPayload & {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || !data.success) {
        setError(data.message ?? "Impossible de charger votre pass.");
        setPayload(null);
        return;
      }

      setError("");
      setPayload(data);
    } catch {
      setError("Erreur réseau.");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPass();
  }, [loadPass]);

  useEffect(() => {
    if (!payload?.valid || !payload.qrExpiresAt) return;

    const expiresAt = Date.parse(payload.qrExpiresAt);
    if (!Number.isFinite(expiresAt)) return;

    const refreshInMs = Math.max(expiresAt - Date.now() - 2 * 60 * 1000, 15_000);
    const timer = window.setTimeout(() => {
      void loadPass({ silent: true });
    }, refreshInMs);

    return () => window.clearTimeout(timer);
  }, [payload?.qrExpiresAt, payload?.valid, loadPass]);

  const embedded = variant === "embedded" || variant === "sheet";
  const rootClass = embedded
    ? `invite-pass-access${variant === "sheet" ? " invite-pass-access--in-sheet" : ""} ${className}`.trim()
    : `pass-access-screen ${className}`.trim();

  if (loading && !payload) {
    return (
      <div
        className={`${rootClass}${embedded ? " invite-pass-access--loading" : " pass-access-screen--loading"}`}
        aria-busy="true"
      >
        <div
          className={
            embedded ? "invite-pass-access__spinner" : "pass-access-screen__spinner"
          }
          aria-hidden
        />
        <p
          className={
            embedded
              ? "invite-pass-access__hint"
              : "pass-access-screen__loading-text"
          }
        >
          Chargement du pass…
        </p>
      </div>
    );
  }

  if (error || !payload) {
    if (embedded) {
      return (
        <section className={rootClass} aria-label="Pass d'accès">
          <p className="invite-pass-access__hint">{error || "Pass indisponible."}</p>
        </section>
      );
    }

    return (
      <div className="pass-access-screen pass-access-screen--error">
        <p className="pass-access-screen__error">{error || "Pass indisponible."}</p>
      </div>
    );
  }

  const confirmed = payload.valid;
  const showConfirm = payload.showConfirmButton && payload.confirmButtonLabel;

  if (embedded) {
    const TitleTag = variant === "sheet" ? "h2" : "h2";
    const titleId = variant === "sheet" ? "pass-access-sheet-title" : undefined;

    return (
      <section className={rootClass} aria-label="Pass d'accès">
        {variant !== "sheet" ? (
          <p className="invite-pass-access__eyebrow">Pass d&apos;accès</p>
        ) : null}
        <TitleTag
          id={titleId}
          className={
            variant === "sheet"
              ? "invitation-sheet__title"
              : "invite-pass-access__title"
          }
        >
          {confirmed ? "Votre QR code d'entrée" : "Pass inactif"}
        </TitleTag>

        {!confirmed && payload.invalidReason ? (
          <p className="invite-pass-access__hint">{payload.invalidReason}</p>
        ) : null}

        {confirmed && showConfirm ? (
          <p className="invite-pass-access__hint">
            {payload.pendingCeremonies.length === 1
              ? "Il reste une cérémonie à confirmer."
              : `Il reste ${payload.pendingCeremonies.length} cérémonies à confirmer.`}
          </p>
        ) : null}

        <div
          className={`invite-pass-access__shell${confirmed ? "" : " invite-pass-access__shell--inactive"}`}
        >
          {confirmed ? (
            <article className="invite-pass-access__ticket" aria-label="QR code pass">
              <PassAccessQrCode value={payload.checkInUrl} />
              <p className="invite-pass-access__ticket-label">Pass d&apos;Accès</p>
            </article>
          ) : (
            <p className="invite-pass-access__hint">
              Le QR code sera disponible dès qu&apos;une présence sera confirmée.
            </p>
          )}
        </div>

        {showConfirm && variant !== "sheet" ? (
          <p className="invite-pass-access__hint">
            Confirmez vos autres cérémonies via les enveloppes ci-dessus.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <div className={rootClass}>
      <header className="pass-access-screen__header">
        <div className="pass-access-screen__brand">
          <img
            src="/img/logo-black.png"
            alt="Nathan & Innocente"
            className="pass-access-screen__logo"
            width={120}
            height={40}
          />
          <p className="pass-access-screen__tagline">Nathan &amp; Innocente · 2026</p>
        </div>
        {confirmed ? (
          <span className="pass-access-screen__badge">Confirmé</span>
        ) : (
          <span className="pass-access-screen__badge pass-access-screen__badge--inactive">
            Inactif
          </span>
        )}
      </header>

      <p className="pass-access-screen__eyebrow">Pass d&apos;accès</p>
      <h1 className="pass-access-screen__title">
        {confirmed ? "Présence confirmée" : "Pass inactif"}
      </h1>

      {!confirmed && payload.invalidReason ? (
        <p className="pass-access-screen__invalid">{payload.invalidReason}</p>
      ) : null}

      {confirmed && showConfirm ? (
        <p className="pass-access-screen__pending">
          {payload.pendingCeremonies.length === 1
            ? "Il reste une cérémonie à confirmer pour finaliser votre pass."
            : `Il reste ${payload.pendingCeremonies.length} cérémonies à confirmer.`}
        </p>
      ) : null}

      <div
        className={`pass-access-screen__shell${confirmed ? "" : " pass-access-screen__shell--inactive"}`}
      >
        {confirmed ? (
          <article className="pass-access-ticket" aria-label="Pass d'accès QR code">
            <PassAccessQrCode value={payload.checkInUrl} />
            <div className="pass-access-ticket__foot">
              <span className="pass-access-ticket__perforation" aria-hidden />
              <p className="pass-access-ticket__label">
                Pass d&apos;Accès
                <span className="pass-access-ticket__chevron" aria-hidden>
                  ⌄
                </span>
              </p>
            </div>
          </article>
        ) : (
          <div className="pass-access-screen__inactive-card">
            <p>Le QR code sera disponible dès qu&apos;une présence sera confirmée.</p>
          </div>
        )}
      </div>

      {showConfirm ? (
        <div className="pass-access-screen__confirm-wrap">
          <Link href="/wedding" className="pass-access-screen__confirm-btn">
            {payload.confirmButtonLabel}
          </Link>
        </div>
      ) : (
        <div className="pass-access-screen__confirm-wrap">
          <Link href="/wedding" className="pass-access-screen__confirm-btn">
            Retour à mon invitation
          </Link>
        </div>
      )}
    </div>
  );
}
