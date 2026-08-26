"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { PassAccessQrCode } from "@/components/save-the-date/pass-access-qr-code";
import "@/components/save-the-date/pass-access.css";
import type { PassAccessPayload } from "@/lib/pass-access";

type PassAccessAppProps = {
  loginPath?: string;
};

export function PassAccessApp({ loginPath = "/login?passaccess=1" }: PassAccessAppProps) {
  const router = useRouter();
  const [payload, setPayload] = useState<PassAccessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshingQr, setRefreshingQr] = useState(false);

  const loadPass = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      else setRefreshingQr(true);

      try {
        const response = await fetch("/api/auth/pass-access", {
          cache: "no-store",
        });
        const data = (await response.json()) as PassAccessPayload & {
          success?: boolean;
          message?: string;
        };
        if (!response.ok || !data.success) {
          if (response.status === 401) {
            router.replace(loginPath);
            return;
          }
          setError(data.message ?? "Impossible de charger votre pass.");
          return;
        }
        setError("");
        setPayload(data);
      } catch {
        if (!opts?.silent) setError("Erreur réseau.");
      } finally {
        setLoading(false);
        setRefreshingQr(false);
      }
    },
    [loginPath, router],
  );

  useEffect(() => {
    void loadPass();
  }, [loadPass]);

  // Renouvelle le QR ~2 min avant expiration (TTL 30 min).
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

  if (loading && !payload) {
    return (
      <div className="pass-access-screen pass-access-screen--loading">
        <div className="pass-access-screen__spinner" aria-hidden />
        <p className="pass-access-screen__loading-text">Chargement du pass…</p>
      </div>
    );
  }

  if ((error || !payload) && !payload) {
    return (
      <div className="pass-access-screen pass-access-screen--error">
        <p className="pass-access-screen__error">{error || "Pass indisponible."}</p>
        <Link href={loginPath} className="pass-access-screen__retry">
          Se connecter
        </Link>
      </div>
    );
  }

  if (!payload) return null;

  const confirmed = payload.valid;
  const showConfirm = payload.showConfirmButton && payload.confirmButtonLabel;

  return (
    <div className="pass-access-screen">
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
              <p className="pass-access-ticket__ttl">
                {refreshingQr
                  ? "Renouvellement du QR…"
                  : "QR valable 30 min · se renouvelle automatiquement"}
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
      ) : null}
    </div>
  );
}
