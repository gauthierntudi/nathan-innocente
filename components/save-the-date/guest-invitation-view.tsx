"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { GuestDressCodePanel } from "@/components/save-the-date/guest-dress-code-panel";
import { InvitationHearts } from "@/components/save-the-date/invitation-hearts";
import "@/components/save-the-date/invitation.css";
import { type GuestCeremonyView } from "@/lib/guest-ceremonies";
import { getDressCodeDownloadPath } from "@/lib/dress-code-urls";

type GuestInvitationViewProps = {
  alreadySubmitted: boolean;
  endReason?: "confirmed" | "declined" | null;
  dressCodeDownloaded?: boolean;
  numGuests: number;
  ceremonies: GuestCeremonyView[];
};

type Step = "info" | "end";
type EndReason = "confirmed" | "declined";

function getCeremonyForRsvp(ceremonies: GuestCeremonyView[]) {
  return ceremonies.find((ceremony) => ceremony.availability === null) ?? ceremonies[0] ?? null;
}

function getEndReasonFromCeremonies(ceremonies: GuestCeremonyView[]): EndReason {
  return ceremonies.some((ceremony) => ceremony.availability === true) ? "confirmed" : "declined";
}

export function GuestInvitationView({
  alreadySubmitted,
  endReason: initialEndReason = null,
  dressCodeDownloaded = false,
  numGuests,
  ceremonies,
}: GuestInvitationViewProps) {
  const [step, setStep] = useState<Step>(alreadySubmitted ? "end" : "info");
  const [endReason, setEndReason] = useState<EndReason | null>(
    alreadySubmitted ? initialEndReason ?? "confirmed" : null,
  );
  const [ceremonyStates, setCeremonyStates] = useState(ceremonies);
  const [hasDownloadedDressCode, setHasDownloadedDressCode] = useState(dressCodeDownloaded);
  const hasDownloadedDressCodeRef = useRef(dressCodeDownloaded);
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [downloadingDressCode, setDownloadingDressCode] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setCeremonyStates(ceremonies);
  }, [ceremonies]);

  useEffect(() => {
    setHasDownloadedDressCode(dressCodeDownloaded);
    hasDownloadedDressCodeRef.current = dressCodeDownloaded;
  }, [dressCodeDownloaded]);

  useEffect(() => {
    hasDownloadedDressCodeRef.current = hasDownloadedDressCode;
  }, [hasDownloadedDressCode]);

  function goToConfirmedEnd() {
    setEndReason("confirmed");
    setStep("end");
  }

  const hasCeremonies = ceremonyStates.length > 0;
  const ceremonyForRsvp = useMemo(() => getCeremonyForRsvp(ceremonyStates), [ceremonyStates]);
  const hasPreparedTenue = ceremonyForRsvp?.availability === true;

  async function saveCeremonyAvailability(
    availability: boolean,
    confirmedGuests = 1,
    options?: { goToEnd?: boolean; endOutcome?: EndReason; action?: "confirm" | "decline" },
  ) {
    const ceremony = getCeremonyForRsvp(ceremonyStates);
    const action = options?.action ?? (availability ? "confirm" : "decline");
    if (action === "confirm") setConfirming(true);
    else setDeclining(true);
    setMessage("");

    try {
      const payload =
        hasCeremonies && ceremony
          ? { ceremonyId: ceremony.id, availability, confirmedGuests }
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

      const nextCeremonies = ceremonyStates.map((item) =>
        ceremony && item.id === ceremony.id
          ? {
              ...item,
              availability,
              confirmedGuests: availability ? confirmedGuests : 0,
            }
          : item,
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
    if (hasPreparedTenue) {
      if (hasDownloadedDressCodeRef.current) {
        goToConfirmedEnd();
      }
      return;
    }

    const success = await saveCeremonyAvailability(true, numGuests, { action: "confirm" });
    if (success && hasDownloadedDressCodeRef.current) {
      goToConfirmedEnd();
    }
  }

  async function declineInvitation() {
    await saveCeremonyAvailability(false, 0, {
      goToEnd: true,
      endOutcome: "declined",
      action: "decline",
    });
  }

  async function downloadDressCode() {
    const ceremony = ceremonyForRsvp;

    if (!ceremony && hasCeremonies) {
      return;
    }

    const shouldShowEndPage = hasPreparedTenue;

    setDownloadingDressCode(true);
    setMessage("");

    try {
      const targetCeremonies = ceremony ? [ceremony] : ceremonyStates;
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

      setHasDownloadedDressCode(true);

      if (shouldShowEndPage) {
        goToConfirmedEnd();
      }
    } catch {
      setMessage("Erreur réseau lors du téléchargement.");
    } finally {
      setDownloadingDressCode(false);
    }
  }

  const headerCeremony =
    step === "info" ? ceremonyForRsvp ?? ceremonyStates[0] ?? null : ceremonyStates[0] ?? null;

  const headerTitle = hasCeremonies
    ? headerCeremony
      ? headerCeremony.name
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
              {headerCeremony ? (
                <p className="invitation-dashboard__date">{headerCeremony.date}</p>
              ) : null}
              <p className="invitation-dashboard__lead">
                {hasCeremonies
                  ? ceremonyStates.length > 1 && ceremonyForRsvp
                    ? `Merci de nous confirmer votre présence pour ${ceremonyForRsvp.name.toLowerCase()}.`
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

              <p className="invitation-dashboard__hashtag">#TheSamunasToEternity</p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
