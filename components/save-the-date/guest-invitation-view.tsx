"use client";

import { useEffect, useMemo, useState } from "react";

import { GuestConfirmBottomSheet } from "@/components/save-the-date/guest-confirm-bottom-sheet";
import { GuestCeremonyRail } from "@/components/save-the-date/guest-ceremony-rail";
import { GuestDressCodePanel } from "@/components/save-the-date/guest-dress-code-panel";
import { GuestHonorLetterModal } from "@/components/save-the-date/guest-honor-letter-modal";
import { InvitationHearts } from "@/components/save-the-date/invitation-hearts";
import "@/components/save-the-date/invitation.css";
import { getDressCodeDownloadPath } from "@/lib/dress-code-urls";
import { triggerBlobDownload } from "@/lib/download-file";
import { type GuestCeremonyView } from "@/lib/guest-ceremonies";
import {
  ceremonyNeedsDressCode,
  getActiveCeremony,
  getCeremonyProgress,
  getConfirmedCeremonies,
  getEndReasonFromCeremonies,
  hasCompletedAllCeremonySteps,
} from "@/lib/guest-rsvp-flow";

type GuestInvitationViewProps = {
  alreadySubmitted: boolean;
  endReason?: "confirmed" | "declined" | null;
  dressCodeDownloaded?: boolean;
  numGuests: number;
  ceremonies: GuestCeremonyView[];
};

type Step = "info" | "end";
type EndReason = "confirmed" | "declined";

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
  const [legacyDressCodeDownloaded, setLegacyDressCodeDownloaded] =
    useState(dressCodeDownloaded);
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [downloadingCeremonyId, setDownloadingCeremonyId] = useState<string | null>(null);
  const [guestsSheetOpen, setGuestsSheetOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [honorLetterOpen, setHonorLetterOpen] = useState(
    () => ceremonies.length > 1 && !alreadySubmitted,
  );

  useEffect(() => {
    setCeremonyStates(ceremonies);
  }, [ceremonies]);

  useEffect(() => {
    setLegacyDressCodeDownloaded(dressCodeDownloaded);
  }, [dressCodeDownloaded]);

  const hasCeremonies = ceremonyStates.length > 0;
  const activeCeremony = useMemo(
    () => getActiveCeremony(ceremonyStates),
    [ceremonyStates],
  );
  const progress = useMemo(
    () => getCeremonyProgress(ceremonyStates),
    [ceremonyStates],
  );
  const confirmedCeremonies = useMemo(
    () => getConfirmedCeremonies(ceremonyStates),
    [ceremonyStates],
  );
  const hasPreparedTenue = activeCeremony?.availability === true;
  const needsDressCode = activeCeremony
    ? ceremonyNeedsDressCode(activeCeremony)
    : false;
  const downloadingDressCode = downloadingCeremonyId !== null;
  const ceremonyNumGuests = Math.max(
    1,
    activeCeremony?.numGuests ?? numGuests,
  );

  function finishIfComplete(nextCeremonies: GuestCeremonyView[]) {
    if (!hasCompletedAllCeremonySteps(nextCeremonies)) {
      return false;
    }

    setEndReason(getEndReasonFromCeremonies(nextCeremonies));
    setStep("end");
    return true;
  }

  function goToConfirmedEnd() {
    setEndReason("confirmed");
    setStep("end");
  }

  async function saveCeremonyAvailability(
    availability: boolean,
    confirmedGuests = 1,
    options?: { action?: "confirm" | "decline" },
  ) {
    const ceremony = activeCeremony;
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

      if (!hasCeremonies) {
        if (availability === false) {
          setEndReason("declined");
          setStep("end");
          return true;
        }

        setLegacyConfirmed(true);
        if (legacyDressCodeDownloaded) {
          goToConfirmedEnd();
        }
        return true;
      }

      if (!ceremony) return false;

      const nextCeremonies = ceremonyStates.map((item) =>
        item.id === ceremony.id
          ? {
              ...item,
              availability,
              confirmedGuests: availability ? confirmedGuests : 0,
            }
          : item,
      );

      setCeremonyStates(nextCeremonies);
      finishIfComplete(nextCeremonies);
      return true;
    } catch {
      setMessage("Erreur réseau.");
      return false;
    } finally {
      setConfirming(false);
      setDeclining(false);
    }
  }

  async function confirmWithGuests(confirmedGuests: number) {
    const success = await saveCeremonyAvailability(true, confirmedGuests, {
      action: "confirm",
    });
    if (success) {
      setGuestsSheetOpen(false);
    }
  }

  async function prepareTenue() {
    if (hasPreparedTenue) {
      return;
    }

    setGuestsSheetOpen(true);
  }

  async function declineInvitation() {
    await saveCeremonyAvailability(false, 0, { action: "decline" });
  }

  async function downloadDressCode(targetCeremony?: GuestCeremonyView | null) {
    const ceremony = targetCeremony ?? activeCeremony;

    if (hasCeremonies && !ceremony) {
      return;
    }

    setDownloadingCeremonyId(ceremony?.id ?? "legacy");
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

      triggerBlobDownload(blob, filename);

      if (!hasCeremonies) {
        setLegacyDressCodeDownloaded(true);
        if (legacyConfirmed && step !== "end") {
          goToConfirmedEnd();
        }
        return;
      }

      if (!ceremony) return;

      const downloadedAt = new Date().toISOString();
      const nextCeremonies = ceremonyStates.map((item) =>
        item.id === ceremony.id
          ? { ...item, dressCodeDownloadedAt: downloadedAt }
          : item,
      );

      setCeremonyStates(nextCeremonies);

      if (step !== "end") {
        finishIfComplete(nextCeremonies);
      }
    } catch {
      setMessage("Erreur réseau lors du téléchargement.");
    } finally {
      setDownloadingCeremonyId(null);
    }
  }

  const headerCeremony =
    step === "info"
      ? activeCeremony ?? ceremonyStates[0] ?? null
      : confirmedCeremonies[0] ?? ceremonyStates[0] ?? null;

  const headerTitle = hasCeremonies
    ? headerCeremony
      ? headerCeremony.name
      : "Vos cérémonies"
    : "Save the date";

  const isConfirmedEnd = endReason === "confirmed";

  const themeCeremonyId =
    step === "info"
      ? activeCeremony?.id ?? ceremonyStates[0]?.id
      : confirmedCeremonies[0]?.id ?? ceremonyStates[0]?.id;

  const themeClass =
    themeCeremonyId === "civile" || themeCeremonyId === "religieux"
      ? ` invitation-page--${themeCeremonyId}`
      : themeCeremonyId === "coutumier"
        ? " invitation-page--coutumier"
        : "";

  const downloadHint = needsDressCode
    ? "Téléchargez le dress code pour passer à la suite."
    : undefined;

  return (
    <div
      className={`invitation-page invitation-page--dashboard${themeClass}${step === "end" ? " invitation-page--success" : ""}${step === "end" && !isConfirmedEnd ? " invitation-page--declined" : ""}`}
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
                  ? needsDressCode
                    ? "Présence confirmée. Téléchargez le dress code pour continuer."
                    : ceremonyStates.length > 1 && activeCeremony
                      ? `Confirmez votre présence pour ce moment.`
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

              {hasCeremonies && progress.total > 1 ? (
                <GuestCeremonyRail
                  ceremonies={ceremonyStates}
                  activeCeremonyId={activeCeremony?.id ?? null}
                />
              ) : null}

              <GuestDressCodePanel
                confirming={confirming}
                declining={declining}
                downloadingDressCode={downloadingDressCode}
                hasPreparedTenue={hasPreparedTenue}
                downloadHint={downloadHint}
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

              {isConfirmedEnd && confirmedCeremonies.length > 0 ? (
                <GuestDressCodePanel
                  variant="end"
                  downloads={confirmedCeremonies.map((ceremony) => ({
                    id: ceremony.id,
                    theme: ceremony.id,
                    label:
                      confirmedCeremonies.length > 1
                        ? `Dress code — ${ceremony.name}`
                        : "Télécharger Dress Code",
                    downloading: downloadingCeremonyId === ceremony.id,
                    onDownload: () => void downloadDressCode(ceremony),
                  }))}
                  message={message}
                />
              ) : null}

              <p className="invitation-dashboard__hashtag">#TheSamunasToEternity</p>
            </>
          )}
        </main>
      </div>

      <GuestHonorLetterModal
        open={honorLetterOpen}
        onContinue={() => setHonorLetterOpen(false)}
      />

      <GuestConfirmBottomSheet
        open={guestsSheetOpen}
        numGuests={ceremonyNumGuests}
        confirming={confirming}
        onClose={() => {
          if (!confirming) setGuestsSheetOpen(false);
        }}
        onConfirm={(confirmedGuests) => void confirmWithGuests(confirmedGuests)}
      />
    </div>
  );
}
