"use client";

import type { GuestCeremonyView } from "@/lib/guest-ceremonies";
import { getInvitationLabel } from "@/lib/invitation-labels";
import type { CeremonyId } from "@/lib/admin/ceremony-types";

export const HONOR_LETTER_PARAGRAPHS = [
  "Il est des présences qui illuminent une vie, des cœurs qui encouragent, inspirent et portent avec une affection sincère. Vous êtes de ceux-là.",
  "Si aujourd’hui nous avons souhaité vous distinguer, ce n’est pas seulement pour la place que vous occupez à nos côtés, mais parce que vous faites partie de l’histoire qui nous a conduits jusqu’à ce jour tant attendu.",
  "Les couleurs qui vous sont réservées sont le symbole de cette distinction. Elles ne sont pas simplement un dress code : elles sont le reflet de l’honneur que nous avons de vous compter parmi les personnes qui nous entoureront de plus près lors de cette célébration.",
  "Et parce qu’aucune fête ne prend véritablement vie sans les âmes qui lui donnent son éclat, nous comptons tout particulièrement sur vous. Soyez les premiers à célébrer, à rire, à danser, à entraîner les autres dans la joie et à insuffler cette énergie qui transforme une réception en un souvenir inoubliable.",
  "Que votre élégance sublime cette journée, que votre enthousiasme embrase la piste de danse, et que votre présence rappelle à chacun que les plus belles célébrations sont avant tout portées par ceux qui les vivent de tout leur cœur.",
  "Merci d’être les gardiens de cette atmosphère que nous rêvons de partager : une célébration empreinte d’amour, de raffinement, de joie et d’émotions sincères.",
] as const;

type InvitationCeremonyCardProps = {
  ceremony: GuestCeremonyView;
  open: boolean;
  confirming: boolean;
  declining: boolean;
  downloading: boolean;
  onOpen: () => void;
  onClose: () => void;
  onConfirmYes: () => void;
  onConfirmNo: () => void;
  onDownloadPdf: () => void;
  onAddToCalendar: () => void;
};

export function InvitationCeremonyCard({
  ceremony,
  open,
  confirming,
  declining,
  downloading,
  onOpen,
  onClose,
  onConfirmYes,
  onConfirmNo,
  onDownloadPdf,
  onAddToCalendar,
}: InvitationCeremonyCardProps) {
  const label = getInvitationLabel(ceremony.id as CeremonyId, ceremony.name);
  const status =
    ceremony.availability === true
      ? "Présence confirmée"
      : ceremony.availability === false
        ? "Absence enregistrée"
        : "En attente de réponse";

  return (
    <article
      className={`mail-invite mail-invite--${ceremony.id}${open ? " mail-invite--open" : ""}`}
    >
      <button
        type="button"
        className="mail-invite__stage"
        onClick={() => (open ? onClose() : onOpen())}
        aria-expanded={open}
        aria-label={open ? `Replier ${label}` : `Ouvrir l'invitation ${label}`}
      >
        <div className="mail-invite__mail" aria-hidden={!open}>
          <div className="mail-invite__back-fold" />

          <div className="mail-invite__letter">
            <div className="mail-invite__letter-border" />
            <div className="mail-invite__letter-inner">
              <p className="mail-invite__letter-kicker">Invitation</p>
              <h3 className="mail-invite__letter-title">{label}</h3>
              <p className="mail-invite__letter-status">{status}</p>

              {open ? (
                <div className="mail-invite__letter-body">
                  <p>
                    <span>Date</span>
                    {ceremony.date}
                  </p>
                  <p>
                    <span>Lieu</span>
                    {ceremony.location}
                  </p>
                  {ceremony.tableName ? (
                    <p>
                      <span>Table</span>
                      {ceremony.tableName}
                    </p>
                  ) : null}
                  <p className="mail-invite__letter-desc">{ceremony.description}</p>
                </div>
              ) : (
                <div className="mail-invite__letter-preview" aria-hidden>
                  <span />
                  <span />
                </div>
              )}
            </div>
            <div className="mail-invite__stamp">
              <span>N&amp;I</span>
            </div>
          </div>

          <div className="mail-invite__top-fold" />
          <div className="mail-invite__body" />
          <div className="mail-invite__left-fold" />
        </div>
        <div className="mail-invite__shadow" aria-hidden />
      </button>

      <p className="mail-invite__hint">
        {open ? "Touchez l'enveloppe pour replier" : "Touchez l'enveloppe pour ouvrir"}
      </p>

      {open ? (
        <div className="mail-invite__actions">
          <button
            type="button"
            className="mail-invite__btn mail-invite__btn--yes"
            onClick={onConfirmYes}
            disabled={confirming || ceremony.availability === true}
          >
            {confirming ? "…" : "Oui, je confirme"}
          </button>
          <button
            type="button"
            className="mail-invite__btn mail-invite__btn--no"
            onClick={onConfirmNo}
            disabled={declining || ceremony.availability === false}
          >
            {declining ? "…" : "Non, je ne pourrai pas"}
          </button>
          <button
            type="button"
            className="mail-invite__btn mail-invite__btn--ghost"
            onClick={onDownloadPdf}
            disabled={downloading}
          >
            {downloading ? "Chargement…" : "Télécharger le PDF"}
          </button>
          <button
            type="button"
            className="mail-invite__btn mail-invite__btn--ghost"
            onClick={onAddToCalendar}
          >
            Ajouter à mon calendrier
          </button>
        </div>
      ) : null}
    </article>
  );
}

type HonorInvitationCardProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
};

export function HonorInvitationCard({
  open,
  onOpen,
  onClose,
}: HonorInvitationCardProps) {
  return (
    <article
      className={`mail-invite mail-invite--honor${open ? " mail-invite--open" : ""}`}
    >
      <button
        type="button"
        className="mail-invite__stage"
        onClick={() => (open ? onClose() : onOpen())}
        aria-expanded={open}
        aria-label={
          open
            ? "Replier la lettre d'honneur"
            : "Ouvrir la lettre d'honneur"
        }
      >
        <div className="mail-invite__mail" aria-hidden={!open}>
          <div className="mail-invite__back-fold" />
          <div className="mail-invite__letter">
            <div className="mail-invite__letter-border" />
            <div className="mail-invite__letter-inner">
              <p className="mail-invite__letter-kicker">Distinction</p>
              <h3 className="mail-invite__letter-title">Invités d&apos;honneur</h3>
              <p className="mail-invite__letter-status">Lettre personnelle</p>

              {open ? (
                <div className="mail-invite__letter-body mail-invite__letter-body--honor">
                  <p className="mail-invite__letter-honor-title">
                    À Nos Chers Invités d&apos;Honneur
                  </p>
                  {HONOR_LETTER_PARAGRAPHS.map((paragraph) => (
                    <p key={paragraph.slice(0, 40)} className="mail-invite__letter-desc">
                      {paragraph}
                    </p>
                  ))}
                  <p className="mail-invite__letter-desc">
                    Avec toute notre affection et notre profonde gratitude,
                  </p>
                  <p className="mail-invite__letter-honor-sign">
                    Innocente &amp; Nathan
                  </p>
                </div>
              ) : (
                <div className="mail-invite__letter-preview" aria-hidden>
                  <span />
                  <span />
                </div>
              )}
            </div>
            <div className="mail-invite__stamp">
              <span>N&amp;I</span>
            </div>
          </div>
          <div className="mail-invite__top-fold" />
          <div className="mail-invite__body" />
          <div className="mail-invite__left-fold" />
        </div>
        <div className="mail-invite__shadow" aria-hidden />
      </button>
      <p className="mail-invite__hint">
        {open
          ? "Touchez l'enveloppe pour replier"
          : "Touchez l'enveloppe pour lire la lettre"}
      </p>
    </article>
  );
}
