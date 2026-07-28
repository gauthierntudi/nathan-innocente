"use client";

import { useEffect, useMemo, useState } from "react";

import { GuestConfirmBottomSheet } from "@/components/save-the-date/guest-confirm-bottom-sheet";
import { GuestDressCodeJourney } from "@/components/save-the-date/guest-dress-code-journey";
import { GuestDressCodePreviewModal } from "@/components/save-the-date/guest-dress-code-preview-modal";
import {
  HonorInvitationCard,
  InvitationCeremonyCard,
} from "@/components/save-the-date/invitation-ceremony-card";
import { InvitationHearts } from "@/components/save-the-date/invitation-hearts";
import "@/components/save-the-date/invitation.css";
import {
  getDressCodeDownloadPath,
  isHonorDressCodeCeremony,
} from "@/lib/dress-code-urls";
import { downloadCeremonyCalendar } from "@/lib/calendar-ics";
import { type GuestCeremonyView } from "@/lib/guest-ceremonies";
import {
  hasCompletedAllCeremonySteps,
  getEndReasonFromCeremonies,
} from "@/lib/guest-rsvp-flow";
import {
  buildInvitationGreeting,
  getInvitationLabel,
} from "@/lib/invitation-labels";
import type { CeremonyId } from "@/lib/admin/ceremony-types";

type GuestInvitationViewProps = {
  alreadySubmitted: boolean;
  endReason?: "confirmed" | "declined" | null;
  dressCodeDownloaded?: boolean;
  numGuests: number;
  ceremonies: GuestCeremonyView[];
  dressCodeCeremonies?: GuestCeremonyView[];
  guestName?: string;
  guestGenre?: string;
  hasTableInvitation?: boolean;
  dressCodeJourneyComplete?: boolean;
  invitationWaitingEnabled?: boolean;
  isHonorGuest?: boolean;
};

type Step = "info" | "end";
type EndReason = "confirmed" | "declined";

type DressCodePreviewState = {
  open: boolean;
  loading: boolean;
  title: string;
  filename: string;
  objectUrl: string | null;
  blob: Blob | null;
  honor: boolean;
  ceremonyId: string | null;
};

const EMPTY_PREVIEW: DressCodePreviewState = {
  open: false,
  loading: false,
  title: "",
  filename: "dress-code.pdf",
  objectUrl: null,
  blob: null,
  honor: false,
  ceremonyId: null,
};

export function GuestInvitationView({
  alreadySubmitted,
  endReason: initialEndReason = null,
  dressCodeDownloaded = false,
  numGuests,
  ceremonies,
  dressCodeCeremonies = [],
  guestName = "",
  guestGenre = "Cher(e)",
  hasTableInvitation = false,
  dressCodeJourneyComplete = false,
  invitationWaitingEnabled = false,
  isHonorGuest = false,
}: GuestInvitationViewProps) {
  const dressCodeSource =
    dressCodeCeremonies.length > 0 ? dressCodeCeremonies : ceremonies;

  const initialDressEndReason =
    initialEndReason ??
    (dressCodeJourneyComplete && dressCodeSource.length > 0
      ? getEndReasonFromCeremonies(dressCodeSource)
      : null);

  const [awaitingTableAssignment, setAwaitingTableAssignment] = useState(
    invitationWaitingEnabled &&
      !hasTableInvitation &&
      dressCodeJourneyComplete &&
      initialDressEndReason === "confirmed",
  );

  const [step, setStep] = useState<Step>(alreadySubmitted ? "end" : "info");
  const [endReason, setEndReason] = useState<EndReason | null>(
    alreadySubmitted ? initialEndReason ?? "confirmed" : null,
  );
  const [ceremonyStates, setCeremonyStates] = useState(ceremonies);
  const [openCeremonyId, setOpenCeremonyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [decliningCeremonyId, setDecliningCeremonyId] = useState<string | null>(null);
  const [downloadingCeremonyId, setDownloadingCeremonyId] = useState<string | null>(
    null,
  );
  const [guestsSheetOpen, setGuestsSheetOpen] = useState(false);
  const [pendingCeremonyId, setPendingCeremonyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pdfPreview, setPdfPreview] = useState<DressCodePreviewState>(EMPTY_PREVIEW);
  const [mailReady, setMailReady] = useState(false);

  useEffect(() => {
    setCeremonyStates(ceremonies);
  }, [ceremonies]);

  useEffect(() => {
    // Déclenche l'animation enveloppe juste après la fin du loader (montage de la vue).
    const timer = window.setTimeout(() => setMailReady(true), 160);
    return () => window.clearTimeout(timer);
  }, []);

  const greeting = useMemo(
    () =>
      buildInvitationGreeting({
        genre: guestGenre,
        name: guestName,
        labels: ceremonyStates.map((ceremony) =>
          getInvitationLabel(ceremony.id as CeremonyId, ceremony.name),
        ),
      }),
    [ceremonyStates, guestGenre, guestName],
  );

  const pendingCeremony = useMemo(
    () => ceremonyStates.find((ceremony) => ceremony.id === pendingCeremonyId) ?? null,
    [ceremonyStates, pendingCeremonyId],
  );

  function finishIfComplete(nextCeremonies: GuestCeremonyView[]) {
    if (!hasCompletedAllCeremonySteps(nextCeremonies)) return false;
    setEndReason(getEndReasonFromCeremonies(nextCeremonies));
    setStep("end");
    return true;
  }

  async function saveCeremonyAvailability(
    ceremonyId: string,
    availability: boolean,
    confirmedGuests = 1,
  ) {
    if (availability) setConfirming(true);
    else setDecliningCeremonyId(ceremonyId);
    setMessage("");

    try {
      const response = await fetch("/api/guests/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ceremonyId, availability, confirmedGuests }),
      });
      const data = await response.json();

      if (!data.success) {
        setMessage(data.message ?? "Erreur lors de l'enregistrement.");
        return false;
      }

      const nextCeremonies = ceremonyStates.map((item) =>
        item.id === ceremonyId
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
      setDecliningCeremonyId(null);
    }
  }

  async function confirmWithGuests(confirmedGuests: number) {
    if (!pendingCeremonyId) return;
    const success = await saveCeremonyAvailability(
      pendingCeremonyId,
      true,
      confirmedGuests,
    );
    if (success) {
      setGuestsSheetOpen(false);
      setPendingCeremonyId(null);
    }
  }

  function requestConfirmYes(ceremony: GuestCeremonyView) {
    setPendingCeremonyId(ceremony.id);
    setGuestsSheetOpen(true);
  }

  async function confirmNo(ceremony: GuestCeremonyView) {
    await saveCeremonyAvailability(ceremony.id, false, 0);
  }

  function closePdfPreview() {
    setPdfPreview((current) => {
      if (current.objectUrl) URL.revokeObjectURL(current.objectUrl);
      return EMPTY_PREVIEW;
    });
  }

  async function downloadDressCode(ceremony: GuestCeremonyView) {
    const honor =
      isHonorGuest && isHonorDressCodeCeremony(ceremony.id as CeremonyId);

    setDownloadingCeremonyId(ceremony.id);
    setMessage("");
    setPdfPreview((current) => {
      if (current.objectUrl) URL.revokeObjectURL(current.objectUrl);
      return {
        open: true,
        loading: true,
        title: honor
          ? `Dress code d'honneur — ${getInvitationLabel(ceremony.id, ceremony.name)}`
          : `Dress code — ${getInvitationLabel(ceremony.id, ceremony.name)}`,
        filename: "dress-code.pdf",
        objectUrl: null,
        blob: null,
        honor,
        ceremonyId: ceremony.id,
      };
    });

    try {
      const response = await fetch(
        getDressCodeDownloadPath([ceremony], { view: true }),
      );

      if (!response.ok) {
        setMessage("Impossible de charger le PDF.");
        closePdfPreview();
        return;
      }

      const honorHeader = response.headers.get("X-Dress-Code-Honor") === "1";
      const rawBlob = await response.blob();
      const pdfBlob = new Blob([rawBlob], { type: "application/pdf" });
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const headerFilename = response.headers.get("X-Dress-Code-Filename");
      const filenameMatch = disposition.match(
        /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i,
      );
      const filename = decodeURIComponent(
        headerFilename ??
          filenameMatch?.[1] ??
          filenameMatch?.[2] ??
          "dress-code.pdf",
      );
      const objectUrl = URL.createObjectURL(pdfBlob);

      setPdfPreview({
        open: true,
        loading: false,
        title: honor || honorHeader
          ? `Dress code d'honneur — ${getInvitationLabel(ceremony.id, ceremony.name)}`
          : `Dress code — ${getInvitationLabel(ceremony.id, ceremony.name)}`,
        filename,
        objectUrl,
        blob: pdfBlob,
        honor: honor || honorHeader,
        ceremonyId: ceremony.id,
      });

      const downloadedAt = new Date().toISOString();
      const nextCeremonies = ceremonyStates.map((item) =>
        item.id === ceremony.id
          ? { ...item, dressCodeDownloadedAt: downloadedAt }
          : item,
      );
      setCeremonyStates(nextCeremonies);
      if (step !== "end") finishIfComplete(nextCeremonies);
    } catch {
      setMessage("Erreur réseau lors du chargement du PDF.");
      closePdfPreview();
    } finally {
      setDownloadingCeremonyId(null);
    }
  }

  const isConfirmedEnd = endReason === "confirmed";

  const waitingGreeting = useMemo(
    () =>
      buildInvitationGreeting({
        genre: guestGenre,
        name: guestName,
        labels: [],
      }),
    [guestGenre, guestName],
  );

  if (!hasTableInvitation) {
    if (invitationWaitingEnabled && awaitingTableAssignment) {
      return (
        <div className="invitation-page invitation-page--dashboard">
          <div className="invitation-page__bg" aria-hidden />
          <div className="invitation-page__overlay" aria-hidden />
          <div className="invitation-dashboard">
            <header className="invitation-dashboard__header">
              <img
                className="invitation-dashboard__logo"
                src="/img/logo-white.png"
                alt="Nathan & Innocente"
              />
              <p className="invitation-dashboard__eyebrow">Nathan & Innocente · 2026</p>
              <h1 className="invitation-dashboard__title">Invitation à venir</h1>
              <p className="invitation-dashboard__lead">
                {waitingGreeting.hello} Votre place à table n&apos;est pas encore
                finalisée. Les invitations aux cérémonies auxquelles vous êtes
                convié(e) vous seront adressées dès que votre affectation sera
                confirmée.
              </p>
            </header>
          </div>
        </div>
      );
    }

    return (
      <GuestDressCodeJourney
        alreadySubmitted={dressCodeJourneyComplete}
        endReason={
          dressCodeJourneyComplete ? initialDressEndReason ?? "confirmed" : null
        }
        dressCodeDownloaded={dressCodeDownloaded}
        numGuests={numGuests}
        ceremonies={dressCodeSource}
        onJourneyComplete={({ endReason: outcome }) => {
          if (invitationWaitingEnabled && outcome === "confirmed") {
            setAwaitingTableAssignment(true);
          }
        }}
      />
    );
  }

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
              <h1 className="invitation-dashboard__title">Vos invitations</h1>
              <p className="invitation-dashboard__lead invitation-dashboard__lead--greeting">
                <strong>{greeting.hello}</strong>
                <br />
                {greeting.body}
              </p>
            </>
          )}
        </header>

        <main className="invitation-dashboard__main">
          {step === "info" ? (
            <>
              <section
                className={`mail-invite-list mail-invite-list--count-${Math.min(
                  ceremonyStates.length + (isHonorGuest ? 1 : 0),
                  4,
                )}${mailReady ? " mail-invite-list--ready" : ""}`}
                aria-label="Invitations"
              >
                {ceremonyStates.map((ceremony) => (
                  <InvitationCeremonyCard
                    key={ceremony.id}
                    ceremony={ceremony}
                    open={openCeremonyId === ceremony.id}
                    confirming={confirming && pendingCeremonyId === ceremony.id}
                    declining={decliningCeremonyId === ceremony.id}
                    downloading={downloadingCeremonyId === ceremony.id}
                    onOpen={() => setOpenCeremonyId(ceremony.id)}
                    onClose={() => setOpenCeremonyId(null)}
                    onConfirmYes={() => requestConfirmYes(ceremony)}
                    onConfirmNo={() => void confirmNo(ceremony)}
                    onDownloadPdf={() => void downloadDressCode(ceremony)}
                    onAddToCalendar={() => {
                      const ok = downloadCeremonyCalendar(ceremony);
                      if (!ok) {
                        setMessage("Impossible de générer l'événement calendrier.");
                      }
                    }}
                  />
                ))}

                {isHonorGuest ? (
                  <HonorInvitationCard
                    open={openCeremonyId === "honor"}
                    onOpen={() => setOpenCeremonyId("honor")}
                    onClose={() => setOpenCeremonyId(null)}
                  />
                ) : null}
              </section>

              {message ? (
                <p className="invitation-panel__message invitation-panel__message--error">
                  {message}
                </p>
              ) : null}
            </>
          ) : (
            <p className="invitation-dashboard__hashtag">#TheSamunasToEternity</p>
          )}
        </main>
      </div>

      <GuestDressCodePreviewModal
        open={pdfPreview.open}
        loading={pdfPreview.loading}
        title={pdfPreview.title}
        filename={pdfPreview.filename}
        objectUrl={pdfPreview.objectUrl}
        blob={pdfPreview.blob}
        honor={pdfPreview.honor}
        onClose={closePdfPreview}
      />

      <GuestConfirmBottomSheet
        open={guestsSheetOpen}
        numGuests={Math.max(1, pendingCeremony?.numGuests ?? numGuests)}
        confirming={confirming}
        onClose={() => {
          if (!confirming) {
            setGuestsSheetOpen(false);
            setPendingCeremonyId(null);
          }
        }}
        onConfirm={(confirmedGuests) => void confirmWithGuests(confirmedGuests)}
      />
    </div>
  );
}
