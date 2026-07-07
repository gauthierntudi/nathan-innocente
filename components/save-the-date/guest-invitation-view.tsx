"use client";

import Link from "next/link";
import { useState } from "react";

import { GuestCeremonyCards } from "@/components/save-the-date/guest-ceremony-cards";
import { GuestDressCodePanel } from "@/components/save-the-date/guest-dress-code-panel";
import { InvitationHearts } from "@/components/save-the-date/invitation-hearts";
import "@/components/save-the-date/invitation.css";
import type { GuestCeremonyView } from "@/lib/guest-ceremonies";
import { getDressCodeDownloadPath } from "@/lib/dress-code-urls";

type GuestInvitationViewProps = {
  alreadySubmitted: boolean;
  numGuests: number;
  ceremonies: GuestCeremonyView[];
};

type Step = "info" | "end";

export function GuestInvitationView({
  alreadySubmitted,
  numGuests,
  ceremonies,
}: GuestInvitationViewProps) {
  const [step, setStep] = useState<Step>(alreadySubmitted ? "end" : "info");
  const [busy, setBusy] = useState(false);
  const [downloadingDressCode, setDownloadingDressCode] = useState(false);
  const [message, setMessage] = useState("");

  async function downloadDressCode() {
    setDownloadingDressCode(true);
    setMessage("");

    try {
      const response = await fetch(getDressCodeDownloadPath(ceremonies));

      if (!response.ok) {
        setMessage("Impossible de télécharger le dress code.");
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
      const filename = decodeURIComponent(
        filenameMatch?.[1] ?? filenameMatch?.[2] ?? "dress-code.pdf",
      );

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setMessage("Erreur réseau lors du téléchargement.");
    } finally {
      setDownloadingDressCode(false);
    }
  }

  async function saveAvailability(availability: boolean, confirmedGuests = 1) {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/guests/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability, confirmedGuests }),
      });
      const data = await response.json();

      if (!data.success) {
        setMessage(data.message ?? "Erreur lors de l'enregistrement.");
        return;
      }

      setStep("end");
    } catch {
      setMessage("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  const hasCeremonies = ceremonies.length > 0;

  return (
    <div className={`invitation-page invitation-page--dashboard${step === "end" ? " invitation-page--success" : ""}`}>
      <div className="invitation-page__bg" aria-hidden />
      <div className="invitation-page__overlay" aria-hidden />

      <div className="invitation-dashboard">
        <header className="invitation-dashboard__header">
          <img
            className="invitation-dashboard__logo"
            src="/img/logo-white.png"
            alt="Nathan & Innocente"
          />
          {step === "end" ? (
            <>
              <InvitationHearts />
              <p className="invitation-dashboard__eyebrow">Merci pour votre réponse</p>
              <h1 className="invitation-dashboard__title">À très bientôt !</h1>
              <p className="invitation-dashboard__lead">
                Nous avons hâte de vous retrouver pour célébrer cette union.
              </p>
            </>
          ) : (
            <>
              <p className="invitation-dashboard__eyebrow">Nathan & Innocente · 2026</p>
              <h1 className="invitation-dashboard__title">
                {hasCeremonies
                  ? ceremonies.length === 1
                    ? ceremonies[0].name
                    : "Vos cérémonies"
                  : "Save the date"}
              </h1>
              <p className="invitation-dashboard__lead">
                {hasCeremonies
                  ? "Retrouvez ci-dessous les détails de l'évènement."
                  : "Les célébrations se tiendront du 28 août au 06 septembre 2026 à Kinshasa."}
              </p>
            </>
          )}
        </header>

        <main className="invitation-dashboard__main">
          {step === "info" ? (
            <>
              {hasCeremonies ? (
                <GuestCeremonyCards ceremonies={ceremonies} />
              ) : (
                <section className="invitation-panel invitation-panel--message">
                  <p className="invitation-panel__message">
                    Au fil de ces jours, plusieurs moments viendront rythmer cette union. Les
                    invitations aux cérémonies auxquelles vous êtes convié(e) vous seront
                    adressées prochainement.
                  </p>
                </section>
              )}

              <GuestDressCodePanel
                busy={busy}
                downloadingDressCode={downloadingDressCode}
                message={message}
                onDownloadDressCode={() => void downloadDressCode()}
                onDecline={() => void saveAvailability(false, 0)}
              />
            </>
          ) : (
            <>
              {hasCeremonies ? (
                <GuestCeremonyCards ceremonies={ceremonies} compact />
              ) : (
                <section className="invitation-panel invitation-panel--message">
                  <p className="invitation-panel__message">
                    Les célébrations se tiendront du <strong>28 août au 06 septembre 2026</strong>{" "}
                    à Kinshasa. Nous avons hâte de vous y retrouver.
                  </p>
                </section>
              )}

              <p className="invitation-dashboard__hashtag">#TheSamunaWedding</p>
            </>
          )}
        </main>

        <footer className="invitation-dashboard__footer">
          <Link href="/" className="invitation-footer__link">
            Découvrir le site du mariage
          </Link>
        </footer>
      </div>
    </div>
  );
}
