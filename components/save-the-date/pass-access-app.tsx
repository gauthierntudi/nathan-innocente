"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    fetch("/api/auth/pass-access", { cache: "no-store" })
      .then(async (response) => {
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
        setPayload(data);
      })
      .catch(() => {
        setError("Erreur réseau.");
      })
      .finally(() => setLoading(false));
  }, [loginPath, router]);

  if (loading) {
    return (
      <div className="pass-access-screen pass-access-screen--loading">
        <div className="pass-access-screen__spinner" aria-hidden />
        <p className="pass-access-screen__loading-text">Chargement du pass…</p>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="pass-access-screen pass-access-screen--error">
        <p className="pass-access-screen__error">{error || "Pass indisponible."}</p>
        <Link href={loginPath} className="pass-access-screen__retry">
          Se connecter
        </Link>
      </div>
    );
  }

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
