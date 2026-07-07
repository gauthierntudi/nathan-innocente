"use client";

import { useEffect, useMemo, useState } from "react";

import { GuestDressCodePanel } from "@/components/save-the-date/guest-dress-code-panel";
import { InvitationHearts } from "@/components/save-the-date/invitation-hearts";
import "@/components/save-the-date/invitation.css";
import { type GuestCeremonyView } from "@/lib/guest-ceremonies";
import { getDressCodeDownloadPath } from "@/lib/dress-code-urls";

type GuestInvitationViewProps = {
  alreadySubmitted: boolean;
  endReason?: "confirmed" | "declined" | null;
  numGuests: number;
  ceremonies: GuestCeremonyView[];
};

type Step = "info" | "end";
type EndReason = "confirmed" | "declined";

function getEndReasonFromCeremonies(ceremonies: GuestCeremonyView[]): EndReason {
  return ceremonies.some((ceremony) => ceremony.availability === true) ? "confirmed" : "declined";
}

export function GuestInvitationView({
  alreadySubmitted,
  endReason: initialEndReason = null,
  numGuests,
  ceremonies,
}: GuestInvitationViewProps) {
  const [step, setStep] = useState<Step>(alreadySubmitted ? "end" : "info");
  const [endReason, setEndReason] = useState<EndReason | null>(
    alreadySubmitted ? initialEndReason ?? "confirmed" : null,
  );
  const [ceremonyStates, setCeremonyStates] = useState(ceremonies);
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [downloadingDressCode, setDownloadingDressCode] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setCeremonyStates(ceremonies);
  }, [ceremonies]);

  const hasCeremonies = ceremonyStates.length > 0;
  const currentCeremony = useMemo(
    () => ceremonyStates.find((ceremony) => ceremony.availability === null) ?? ceremonyStates[0] ?? null,
    [ceremonyStates],
  );
  const hasPreparedTenue = currentCeremony?.availability === true;
  const canDownloadDressCode = hasPreparedTenue;

  async function saveCeremonyAvailability(
    availability: boolean,
    confirmedGuests = 1,
    options?: { goToEnd?: boolean; endOutcome?: EndReason; action?: "confirm" | "decline" },
  ) {
    const action = options?.action ?? (availability ? "confirm" : "decline");
    if (action === "confirm") setConfirming(true);
    else setDeclining(true);
    setMessage("");

    try {
      const payload = currentCeremony
        ? { ceremonyId: currentCeremony.id, availability, confirmedGuests }
        : { availability, confirmedGuests };

      const response = await fetch("/api/guests/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!data.success) {
        setMessage(data.message ?? "Erreur lors de l'enregistrement.");
        return false;
      }

      const nextCeremonies = ceremonyStates.map((ceremony) =>
        currentCeremony && ceremony.id === currentCeremony.id
          ? {
              ...ceremony,
              availability,
              confirmedGuests: availability ? confirmedGuests : 0,
            }
          : ceremony,
      );

      setCeremonyStates(nextCeremonies);

      if (options?.goToEnd) {
        setEndReason(options.endOutcome ?? getEndReasonFromCeremonies(nextCeremonies));
        setStep("end");
      }

      return true;
    } catch {
      setMessage("Erreur réseau.");
      return false;
    } finally {
      setConfirming(false);
      setDeclining(false);
    }
  }

  async function prepareTenue() {
    await saveCeremonyAvailability(true, numGuests, { action: "confirm" });
  }

  async function declineInvitation() {
    await saveCeremonyAvailability(false, 0, {
      goToEnd: true,
      endOutcome: "declined",
      action: "decline",
    });
  }

  async function downloadDressCode() {
    if (!canDownloadDressCode) {
      return;
    }

    if (!currentCeremony && hasCeremonies) {
      setMessage("Aucune cérémonie en attente de réponse.");
      return;
    }

    setDownloadingDressCode(true);
    setMessage("");

    try {
      const targetCeremonies = currentCeremony ? [currentCeremony] : ceremonyStates;
      const response = await fetch(getDressCodeDownloadPath(targetCeremonies));

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

      setEndReason("confirmed");
      setStep("end");
    } catch {
      setMessage("Erreur réseau lors du téléchargement.");
    } finally {
      setDownloadingDressCode(false);
    }
  }

  const headerTitle = hasCeremonies
    ? currentCeremony && step === "info"
      ? currentCeremony.name
      : ceremonyStates.length === 1
        ? ceremonyStates[0].name
        : "Vos cérémonies"
    : "Save the date";

  const isConfirmedEnd = endReason === "confirmed";

  return (
    <div
      className={`invitation-page invitation-page--dashboard${step === "end" ? " invitation-page--success" : ""}${step === "end" && !isConfirmedEnd ? " invitation-page--declined" : ""}`}
    >
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
              {isConfirmedEnd ? <InvitationHearts /> : null}
              <p className="invitation-dashboard__eyebrow">Merci pour votre réponse</p>
              <h1 className="invitation-dashboard__title">
                {isConfirmedEnd ? "À très bientôt !" : "C'est noté"}
              </h1>
              <p className="invitation-dashboard__lead">
                {isConfirmedEnd
                  ? "Nous avons hâte de vous retrouver pour célébrer cette union."
                  : "Nous avons bien pris note de votre indisponibilité. Merci de nous avoir répondu."}
              </p>
            </>
          ) : (
            <>
              <p className="invitation-dashboard__eyebrow">Nathan & Innocente · 2026</p>
              <h1 className="invitation-dashboard__title">{headerTitle}</h1>
              <p className="invitation-dashboard__lead">
                {hasCeremonies
                  ? ceremonyStates.length > 1 && currentCeremony
                    ? `Merci de nous confirmer votre présence pour ${currentCeremony.name.toLowerCase()}.`
                    : "Merci de nous confirmer votre présence ci-dessous."
                  : "Les célébrations se tiendront du 28 août au 06 septembre 2026 à Kinshasa."}
              </p>
            </>
          )}
        </header>

        <main className="invitation-dashboard__main">
          {step === "info" ? (
            <>
              {!hasCeremonies ? (
                <section className="invitation-panel invitation-panel--message">
                  <p className="invitation-panel__message">
                    Au fil de ces jours, plusieurs moments viendront rythmer cette union. Les
                    invitations aux cérémonies auxquelles vous êtes convié(e) vous seront
                    adressées prochainement.
                  </p>
                </section>
              ) : null}

              <GuestDressCodePanel
                confirming={confirming}
                declining={declining}
                canDownloadDressCode={canDownloadDressCode}
                downloadingDressCode={downloadingDressCode}
                hasPreparedTenue={hasPreparedTenue}
                message={message}
                onPrepareTenue={() => void prepareTenue()}
                onDownloadDressCode={() => void downloadDressCode()}
                onDecline={() => void declineInvitation()}
              />
            </>
          ) : (
            <>
              {!hasCeremonies ? (
                <section className="invitation-panel invitation-panel--message">
                  <p className="invitation-panel__message">
                    Les célébrations se tiendront du <strong>28 août au 06 septembre 2026</strong>{" "}
                    à Kinshasa. Nous avons hâte de vous y retrouver.
                  </p>
                </section>
              ) : null}

              <p className="invitation-dashboard__hashtag">#TheSamunaWedding</p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
