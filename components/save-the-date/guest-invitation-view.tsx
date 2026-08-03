"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DressCodeThumbCard } from "@/components/save-the-date/dress-code-thumb-card";
import { GuestConfirmBottomSheet } from "@/components/save-the-date/guest-confirm-bottom-sheet";
import { GuestDeclineBottomSheet } from "@/components/save-the-date/guest-decline-bottom-sheet";
import { GuestDressCodeJourney } from "@/components/save-the-date/guest-dress-code-journey";
import { GuestDressCodeReader } from "@/components/save-the-date/guest-dress-code-reader";
import { GuestInvitationReader } from "@/components/save-the-date/guest-invitation-reader";
import { GuestNameBadge } from "@/components/save-the-date/guest-name-badge";
import {
  InvitationCeremonyCard,
} from "@/components/save-the-date/invitation-ceremony-card";
import { InvitationHearts } from "@/components/save-the-date/invitation-hearts";
import {
  INVITATION_ICON_PROPS,
  Shirt,
} from "@/components/save-the-date/invitation-icons";
import { InvitationSiteMenu } from "@/components/save-the-date/invitation-site-menu";
import { useFlipModalBrowserBack } from "@/components/save-the-date/use-flip-modal-browser-back";
import "@/components/save-the-date/invitation.css";
import { downloadCeremonyCalendar } from "@/lib/calendar-ics";
import { type GuestCeremonyView } from "@/lib/guest-ceremonies";
import {
  getConfirmedCeremonies,
  getEndReasonFromCeremonies,
  getNextUnansweredCeremony,
  hasAnsweredAllCeremonyRsvps,
} from "@/lib/guest-rsvp-flow";
import { notreUniversPath } from "@/lib/home/content";
import {
  buildInvitationGreeting,
  getInvitationLabel,
  getInvitationShortLabel,
} from "@/lib/invitation-labels";
import { hasInvitationPdf } from "@/lib/invitation-urls";
import { unlockAllBodyScroll } from "@/lib/lock-body-scroll";
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
  const [readerCeremonyId, setReaderCeremonyId] = useState<string | null>(null);
  const [dressCodeCeremonyId, setDressCodeCeremonyId] = useState<string | null>(
    null,
  );
  const [dressCodeOpenBlob, setDressCodeOpenBlob] = useState<Blob | null>(null);
  const [dressCodeOpenFilename, setDressCodeOpenFilename] = useState("dress-code.pdf");
  const [inviteRailIndex, setInviteRailIndex] = useState(0);
  const inviteRailRef = useRef<HTMLElement | null>(null);
  const [dressCodeRailIndex, setDressCodeRailIndex] = useState(0);
  const dressCodeRailRef = useRef<HTMLElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [decliningCeremonyId, setDecliningCeremonyId] = useState<string | null>(null);
  const [rsvpHandoff, setRsvpHandoff] = useState<{
    phase: "saving" | "opening";
    nextLabel: string;
    remaining: number;
  } | null>(null);
  const [guestsSheetOpen, setGuestsSheetOpen] = useState(false);
  const [declineSheetOpen, setDeclineSheetOpen] = useState(false);
  const [pendingCeremonyId, setPendingCeremonyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [previewConfirmedDressCodes, setPreviewConfirmedDressCodes] =
    useState(false);

  useEffect(() => {
    setCeremonyStates(ceremonies);
  }, [ceremonies]);

  const syncRailIndex = useCallback(
    (
      rail: HTMLElement | null,
      setIndex: (index: number) => void,
    ) => {
      if (!rail || rail.children.length === 0) return;
      const first = rail.children[0] as HTMLElement;
      const styles = window.getComputedStyle(rail);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || "12") || 12;
      const stride = first.offsetWidth + gap;
      if (stride <= 0) return;
      const index = Math.round(rail.scrollLeft / stride);
      setIndex(Math.max(0, Math.min(index, rail.children.length - 1)));
    },
    [],
  );

  const syncInviteRailIndex = useCallback(() => {
    syncRailIndex(inviteRailRef.current, setInviteRailIndex);
  }, [syncRailIndex]);

  const syncDressCodeRailIndex = useCallback(() => {
    syncRailIndex(dressCodeRailRef.current, setDressCodeRailIndex);
  }, [syncRailIndex]);

  const onInviteRailScroll = useCallback(() => {
    syncInviteRailIndex();
  }, [syncInviteRailIndex]);

  const onDressCodeRailScroll = useCallback(() => {
    syncDressCodeRailIndex();
  }, [syncDressCodeRailIndex]);

  useEffect(() => {
    syncInviteRailIndex();
    const onResize = () => syncInviteRailIndex();
    window.addEventListener("resize", onResize);
    const timer = window.setTimeout(syncInviteRailIndex, 80);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(timer);
    };
  }, [ceremonyStates.length, step, syncInviteRailIndex]);

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

  const readerCeremony = useMemo(
    () => ceremonyStates.find((ceremony) => ceremony.id === readerCeremonyId) ?? null,
    [ceremonyStates, readerCeremonyId],
  );

  const confirmedCeremonies = useMemo(
    () => getConfirmedCeremonies(ceremonyStates),
    [ceremonyStates],
  );

  const confirmedInvitationDownloads = useMemo(
    () =>
      confirmedCeremonies.filter((ceremony) =>
        hasInvitationPdf(ceremony.id as CeremonyId),
      ),
    [confirmedCeremonies],
  );

  useEffect(() => {
    if (step !== "end" && !previewConfirmedDressCodes) return;
    syncDressCodeRailIndex();
    const onResize = () => syncDressCodeRailIndex();
    window.addEventListener("resize", onResize);
    const timer = window.setTimeout(syncDressCodeRailIndex, 80);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(timer);
    };
  }, [
    confirmedCeremonies.length,
    step,
    previewConfirmedDressCodes,
    syncDressCodeRailIndex,
  ]);

  useEffect(() => {
    if (confirmedCeremonies.length === 0) {
      setPreviewConfirmedDressCodes(false);
    }
  }, [confirmedCeremonies.length]);

  useEffect(() => {
    if (step === "end") {
      setPreviewConfirmedDressCodes(false);
    }
  }, [step]);

  const dressCodeCeremony = useMemo(
    () =>
      ceremonyStates.find((ceremony) => ceremony.id === dressCodeCeremonyId) ??
      null,
    [ceremonyStates, dressCodeCeremonyId],
  );

  const flipModalOpen = Boolean(readerCeremonyId || dressCodeCeremonyId);

  const closeFlipModals = useCallback(() => {
    setReaderCeremonyId(null);
    setDressCodeCeremonyId(null);
    setDressCodeOpenBlob(null);
  }, []);

  useFlipModalBrowserBack(flipModalOpen, closeFlipModals);

  useEffect(() => {
    if (step !== "end") return;
    // Après flip + bottom sheet, le body peut rester bloqué — forcer le scroll
    unlockAllBodyScroll();
  }, [step]);

  function finishInvitationJourney(nextCeremonies: GuestCeremonyView[]) {
    setOpenCeremonyId(null);
    setReaderCeremonyId(null);
    setEndReason(getEndReasonFromCeremonies(nextCeremonies));
    setStep("end");
  }

  function advanceAfterRsvp(
    nextCeremonies: GuestCeremonyView[],
    answeredCeremonyId: string,
  ) {
    if (hasAnsweredAllCeremonyRsvps(nextCeremonies)) {
      finishInvitationJourney(nextCeremonies);
      return;
    }

    const next = getNextUnansweredCeremony(nextCeremonies, answeredCeremonyId);
    if (!next) {
      finishInvitationJourney(nextCeremonies);
      return;
    }

    if (hasInvitationPdf(next.id as CeremonyId)) {
      setOpenCeremonyId(null);
      setReaderCeremonyId(next.id);
      return;
    }

    setReaderCeremonyId(null);
    setOpenCeremonyId(next.id);
  }

  async function saveCeremonyAvailability(
    ceremonyId: string,
    availability: boolean,
    confirmedGuests = 1,
  ) {
    const previous = ceremonyStates.find((item) => item.id === ceremonyId);
    const isCorrection = previous?.availability !== null;

    if (availability) setConfirming(true);
    else setDecliningCeremonyId(ceremonyId);
    setMessage("");

    const projectedCeremonies = ceremonyStates.map((item) =>
      item.id === ceremonyId
        ? {
            ...item,
            availability,
            confirmedGuests: availability ? confirmedGuests : 0,
            dressCodeDownloadedAt: availability
              ? item.dressCodeDownloadedAt
              : null,
          }
        : item,
    );
    const nextCeremony = getNextUnansweredCeremony(
      projectedCeremonies,
      ceremonyId,
    );
    const willContinue =
      !isCorrection &&
      Boolean(nextCeremony) &&
      !hasAnsweredAllCeremonyRsvps(projectedCeremonies);

    if (willContinue && nextCeremony) {
      setRsvpHandoff({
        phase: "saving",
        nextLabel: getInvitationLabel(
          nextCeremony.id as CeremonyId,
          nextCeremony.name,
        ),
        remaining: projectedCeremonies.filter(
          (item) => item.availability === null,
        ).length,
      });
    }

    try {
      const response = await fetch("/api/guests/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ceremonyId, availability, confirmedGuests }),
      });
      const data = await response.json();

      if (!data.success) {
        setMessage(data.message ?? "Erreur lors de l'enregistrement.");
        setRsvpHandoff(null);
        return false;
      }

      setCeremonyStates(projectedCeremonies);

      if (isCorrection) {
        setReaderCeremonyId(null);
        setOpenCeremonyId(null);
        if (step === "end" || hasAnsweredAllCeremonyRsvps(projectedCeremonies)) {
          setEndReason(getEndReasonFromCeremonies(projectedCeremonies));
          setStep("end");
        }
        return true;
      }

      if (willContinue && nextCeremony) {
        setGuestsSheetOpen(false);
        setPendingCeremonyId(null);
        setRsvpHandoff((current) =>
          current
            ? { ...current, phase: "opening" }
            : {
                phase: "opening",
                nextLabel: getInvitationLabel(
                  nextCeremony.id as CeremonyId,
                  nextCeremony.name,
                ),
                remaining: projectedCeremonies.filter(
                  (item) => item.availability === null,
                ).length,
              },
        );
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        advanceAfterRsvp(projectedCeremonies, ceremonyId);
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        setRsvpHandoff(null);
      } else {
        advanceAfterRsvp(projectedCeremonies, ceremonyId);
      }
      return true;
    } catch {
      setMessage("Erreur réseau.");
      setRsvpHandoff(null);
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
    setDeclineSheetOpen(false);
    setPendingCeremonyId(ceremony.id);
    setGuestsSheetOpen(true);
  }

  function requestConfirmNo(ceremony: GuestCeremonyView) {
    setGuestsSheetOpen(false);
    setPendingCeremonyId(ceremony.id);
    setDeclineSheetOpen(true);
  }

  async function confirmDecline() {
    if (!pendingCeremonyId) return;
    const success = await saveCeremonyAvailability(pendingCeremonyId, false, 0);
    if (success) {
      setDeclineSheetOpen(false);
      setPendingCeremonyId(null);
    }
  }

  const markDressCodeViewed = useCallback((ceremonyId: string) => {
    setCeremonyStates((current) =>
      current.map((item) =>
        item.id === ceremonyId && !item.dressCodeDownloadedAt
          ? { ...item, dressCodeDownloadedAt: new Date().toISOString() }
          : item,
      ),
    );
  }, []);

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
              <GuestNameBadge name={guestName} />
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
        guestName={guestName}
        guestGenre={guestGenre}
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

      {step === "end" ? <InvitationSiteMenu hidden={flipModalOpen} /> : null}

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
              <GuestNameBadge name={guestName} />
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
              <h1 className="invitation-dashboard__title">
                {ceremonyStates.length <= 1
                  ? "Votre invitation"
                  : "Vos invitations"}
              </h1>
              <p className="invitation-dashboard__lead invitation-dashboard__lead--greeting">
                Bonjour {greeting.civilite}{" "}
                <strong className="invitation-dashboard__guest-name">
                  {greeting.name}
                </strong>
                ,
                <br />
                {greeting.intro}{" "}
                {greeting.labels.map((label, index) => (
                  <span key={`${label}-${index}`}>
                    {index > 0
                      ? index === greeting.labels.length - 1
                        ? " et "
                        : ", "
                      : null}
                    <strong className="invitation-dashboard__ceremony-name">
                      {label}
                    </strong>
                  </span>
                ))}
                .
              </p>
            </>
          )}
        </header>

        <main className="invitation-dashboard__main">
          {step === "info" ? (
            <>
              <p className="invite-envelopes-hint">
                Cliquez sur votre enveloppe, confirmez votre présence et accédez
                au dress code.
              </p>
              <div
                className={`invite-card-rail${ceremonyStates.length > 1 ? " invite-card-rail--multi" : " invite-card-rail--single"}`}
              >
                <section
                  className={`invite-card-list${ceremonyStates.length <= 1 ? " invite-card-list--single" : ""}`}
                  aria-label={
                    ceremonyStates.length <= 1 ? "Invitation" : "Invitations"
                  }
                  ref={inviteRailRef}
                  onScroll={onInviteRailScroll}
                >
                  {ceremonyStates.map((ceremony) => {
                    const openInReader = hasInvitationPdf(ceremony.id as CeremonyId);
                    return (
                      <InvitationCeremonyCard
                        key={ceremony.id}
                        ceremony={ceremony}
                        openInReader={openInReader}
                        open={openCeremonyId === ceremony.id}
                        confirming={confirming && pendingCeremonyId === ceremony.id}
                        declining={decliningCeremonyId === ceremony.id}
                        onOpen={() => {
                          if (openInReader) {
                            setReaderCeremonyId(ceremony.id);
                            return;
                          }
                          setOpenCeremonyId(ceremony.id);
                        }}
                        onClose={() => setOpenCeremonyId(null)}
                        onConfirmYes={() => requestConfirmYes(ceremony)}
                        onConfirmNo={() => requestConfirmNo(ceremony)}
                        onAddToCalendar={() => {
                          const ok = downloadCeremonyCalendar(ceremony);
                          if (!ok) {
                            setMessage("Impossible de générer l'événement calendrier.");
                          }
                        }}
                      />
                    );
                  })}
                </section>
                {ceremonyStates.length > 1 ? (
                  <div
                    className="invite-card-rail__dots"
                    role="tablist"
                    aria-label="Navigation des invitations"
                  >
                    {ceremonyStates.map((ceremony, index) => (
                      <button
                        key={ceremony.id}
                        type="button"
                        role="tab"
                        aria-selected={index === inviteRailIndex}
                        aria-label={`Invitation ${index + 1} sur ${ceremonyStates.length}`}
                        className={`invite-card-rail__dot${index === inviteRailIndex ? " invite-card-rail__dot--active" : ""}`}
                        onClick={() => {
                          const rail = inviteRailRef.current;
                          const target = rail?.children[index] as
                            | HTMLElement
                            | undefined;
                          target?.scrollIntoView({
                            behavior: "smooth",
                            inline: "start",
                            block: "nearest",
                          });
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              {confirmedCeremonies.length > 0 ? (
                <div className="invite-confirmed-dresscodes">
                  <button
                    type="button"
                    className="invitation-rsvp__btn invitation-rsvp__btn--download invitation-rsvp__btn--download-active invite-confirmed-dresscodes__toggle"
                    aria-expanded={previewConfirmedDressCodes}
                    onClick={() =>
                      setPreviewConfirmedDressCodes((open) => !open)
                    }
                  >
                    <Shirt {...INVITATION_ICON_PROPS} />
                    {previewConfirmedDressCodes
                      ? "Masquer les dress codes"
                      : confirmedCeremonies.length === 1
                        ? "Voir le dress code"
                        : "Voir les dress codes"}
                  </button>

                  {previewConfirmedDressCodes ? (
                    <section
                      className="invite-dresscode-thumbs invite-dresscode-thumbs--preview"
                      aria-label="Dress codes confirmés"
                    >
                      <p className="invite-dresscode-thumbs__lead">
                        {confirmedCeremonies.length === 1
                          ? "Dress code de la cérémonie déjà confirmée."
                          : "Dress codes des cérémonies déjà confirmées."}
                      </p>
                      <div
                        className={`invite-card-rail${confirmedCeremonies.length > 1 ? " invite-card-rail--multi" : " invite-card-rail--single"}`}
                      >
                        <section
                          className={`invite-card-list invite-dresscode-thumbs__rail${confirmedCeremonies.length <= 1 ? " invite-card-list--single" : ""}`}
                          ref={dressCodeRailRef}
                          onScroll={onDressCodeRailScroll}
                          aria-label={
                            confirmedCeremonies.length <= 1
                              ? "Dress code"
                              : "Dress codes"
                          }
                        >
                          {confirmedCeremonies.map((ceremony) => (
                            <DressCodeThumbCard
                              key={ceremony.id}
                              ceremony={ceremony}
                              guestName={guestName}
                              honorGuest={isHonorGuest}
                              onOpen={({ blob, filename }) => {
                                setDressCodeOpenBlob(blob);
                                setDressCodeOpenFilename(filename);
                                setDressCodeCeremonyId(ceremony.id);
                              }}
                            />
                          ))}
                        </section>
                        {confirmedCeremonies.length > 1 ? (
                          <div
                            className="invite-card-rail__dots"
                            role="tablist"
                            aria-label="Navigation des dress codes"
                          >
                            {confirmedCeremonies.map((ceremony, index) => (
                              <button
                                key={ceremony.id}
                                type="button"
                                role="tab"
                                aria-selected={index === dressCodeRailIndex}
                                aria-label={`Dress code ${index + 1} sur ${confirmedCeremonies.length}`}
                                className={`invite-card-rail__dot${index === dressCodeRailIndex ? " invite-card-rail__dot--active" : ""}`}
                                onClick={() => {
                                  const rail = dressCodeRailRef.current;
                                  const target = rail?.children[index] as
                                    | HTMLElement
                                    | undefined;
                                  target?.scrollIntoView({
                                    behavior: "smooth",
                                    inline: "start",
                                    block: "nearest",
                                  });
                                }}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : null}

              {message ? (
                <p className="invitation-panel__message invitation-panel__message--error">
                  {message}
                </p>
              ) : null}
            </>
          ) : (
            <>
              {isConfirmedEnd && confirmedCeremonies.length > 0 ? (
                <section
                  className="invite-dresscode-thumbs"
                  aria-label="Dress codes"
                >
                  <p className="invite-dresscode-thumbs__lead">
                    {confirmedCeremonies.length === 1
                      ? "Voici le dress code de la cérémonie à laquelle vous avez confirmé votre présence."
                      : "Voici les dress codes des cérémonies auxquelles vous avez confirmé votre présence."}
                  </p>
                  <div
                    className={`invite-card-rail${confirmedCeremonies.length > 1 ? " invite-card-rail--multi" : " invite-card-rail--single"}`}
                  >
                    <section
                      className={`invite-card-list invite-dresscode-thumbs__rail${confirmedCeremonies.length <= 1 ? " invite-card-list--single" : ""}`}
                      ref={dressCodeRailRef}
                      onScroll={onDressCodeRailScroll}
                      aria-label={
                        confirmedCeremonies.length <= 1
                          ? "Dress code"
                          : "Dress codes"
                      }
                    >
                      {confirmedCeremonies.map((ceremony) => (
                        <DressCodeThumbCard
                          key={ceremony.id}
                          ceremony={ceremony}
                          guestName={guestName}
                          honorGuest={isHonorGuest}
                          onOpen={({ blob, filename }) => {
                            setDressCodeOpenBlob(blob);
                            setDressCodeOpenFilename(filename);
                            setDressCodeCeremonyId(ceremony.id);
                          }}
                        />
                      ))}
                    </section>
                    {confirmedCeremonies.length > 1 ? (
                      <div
                        className="invite-card-rail__dots"
                        role="tablist"
                        aria-label="Navigation des dress codes"
                      >
                        {confirmedCeremonies.map((ceremony, index) => (
                          <button
                            key={ceremony.id}
                            type="button"
                            role="tab"
                            aria-selected={index === dressCodeRailIndex}
                            aria-label={`Dress code ${index + 1} sur ${confirmedCeremonies.length}`}
                            className={`invite-card-rail__dot${index === dressCodeRailIndex ? " invite-card-rail__dot--active" : ""}`}
                            onClick={() => {
                              const rail = dressCodeRailRef.current;
                              const target = rail?.children[index] as
                                | HTMLElement
                                | undefined;
                              target?.scrollIntoView({
                                behavior: "smooth",
                                inline: "start",
                                block: "nearest",
                              });
                            }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="invite-end-downloads">
                      {confirmedInvitationDownloads.length > 0 ? (
                        <>
                          <p className="invite-end-downloads__eyebrow">
                            {confirmedInvitationDownloads.length === 1
                              ? "Votre invitation"
                              : "Vos invitations"}
                          </p>
                          <div className="invite-end-downloads__actions">
                            {confirmedInvitationDownloads.map((ceremony) => {
                              const shortLabel = getInvitationShortLabel(
                                ceremony.id as CeremonyId,
                                ceremony.name,
                              );
                              return (
                                <button
                                  key={ceremony.id}
                                  type="button"
                                  className={`invitation-rsvp__btn invitation-rsvp__btn--download invitation-rsvp__btn--download-active invitation-rsvp__btn--theme-${ceremony.id}`}
                                  onClick={() => {
                                    setDressCodeCeremonyId(null);
                                    setDressCodeOpenBlob(null);
                                    setReaderCeremonyId(ceremony.id);
                                  }}
                                >
                                  {confirmedInvitationDownloads.length === 1
                                    ? "Voir mon invitation"
                                    : `Voir mon invitation — ${shortLabel}`}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      ) : null}

                      <Link
                        href={notreUniversPath}
                        className="invitation-rsvp__btn invite-end-downloads__home"
                      >
                        Notre Univers
                      </Link>
                    </div>
                </section>
              ) : null}
              {message && step === "end" ? (
                <p className="invitation-panel__message invitation-panel__message--error">
                  {message}
                </p>
              ) : null}
              <p className="invitation-dashboard__hashtag">#TheSamunasToEternity</p>
            </>
          )}
        </main>
      </div>

      {readerCeremony ? (
        <GuestInvitationReader
          key={readerCeremony.id}
          ceremony={readerCeremony}
          guestName={guestName}
          viewOnly={step === "end"}
          confirming={confirming && pendingCeremonyId === readerCeremony.id}
          declining={decliningCeremonyId === readerCeremony.id}
          onClose={() => setReaderCeremonyId(null)}
          onConfirmYes={() => requestConfirmYes(readerCeremony)}
          onConfirmNo={() => requestConfirmNo(readerCeremony)}
          onAddToCalendar={() => {
            const ok = downloadCeremonyCalendar(readerCeremony);
            if (!ok) {
              setMessage("Impossible de générer l'événement calendrier.");
            }
          }}
        />
      ) : null}

      {dressCodeCeremony ? (
        <GuestDressCodeReader
          key={`${dressCodeCeremony.id}-${isHonorGuest ? "honor" : "std"}`}
          ceremony={dressCodeCeremony}
          guestName={guestName}
          honor={
            isHonorGuest &&
            (dressCodeCeremony.id === "civile" ||
              dressCodeCeremony.id === "religieux")
          }
          initialBlob={dressCodeOpenBlob}
          initialFilename={dressCodeOpenFilename}
          onClose={() => {
            setDressCodeCeremonyId(null);
            setDressCodeOpenBlob(null);
          }}
          onViewed={markDressCodeViewed}
        />
      ) : null}

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

      <GuestDeclineBottomSheet
        open={declineSheetOpen}
        ceremonyLabel={
          pendingCeremony
            ? getInvitationLabel(
                pendingCeremony.id as CeremonyId,
                pendingCeremony.name,
              )
            : undefined
        }
        declining={decliningCeremonyId !== null}
        onClose={() => {
          if (decliningCeremonyId === null) {
            setDeclineSheetOpen(false);
            setPendingCeremonyId(null);
          }
        }}
        onConfirmDecline={() => void confirmDecline()}
      />

      {rsvpHandoff ? (
        <div
          className="invite-rsvp-handoff"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="invite-rsvp-handoff__card">
            <span className="invite-rsvp-handoff__spinner" aria-hidden />
            <p className="invite-rsvp-handoff__eyebrow">
              {rsvpHandoff.phase === "saving" ? "Un instant" : "Suite du parcours"}
            </p>
            <h2 className="invite-rsvp-handoff__title">
              {rsvpHandoff.phase === "saving"
                ? "Enregistrement en cours…"
                : rsvpHandoff.remaining === 1
                  ? "Dernière invitation"
                  : "Prochaine invitation"}
            </h2>
            <p className="invite-rsvp-handoff__lead">
              {rsvpHandoff.phase === "saving"
                ? rsvpHandoff.remaining === 1
                  ? "Nous préparons votre dernière invitation."
                  : `Encore ${rsvpHandoff.remaining} invitation${rsvpHandoff.remaining > 1 ? "s" : ""} à parcourir.`
                : (
                  <>
                    Ouverture de{" "}
                    <strong>{rsvpHandoff.nextLabel}</strong>
                    …
                  </>
                )}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
