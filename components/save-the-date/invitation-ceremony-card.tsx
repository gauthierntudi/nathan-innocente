"use client";

import type { GuestCeremonyView } from "@/lib/guest-ceremonies";
import {
  getInvitationLabel,
  INVITATION_ENVELOPE_SRC,
} from "@/lib/invitation-labels";
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
  /** Ouvre la page flip PDF au lieu du panneau inline. */
  openInReader?: boolean;
  open: boolean;
  confirming: boolean;
  declining: boolean;
  onOpen: () => void;
  onClose: () => void;
  onConfirmYes: () => void;
  onConfirmNo: () => void;
  onAddToCalendar: () => void;
};

function CeremonyToggle({
  ceremonyId,
  label,
  open,
  onClick,
}: {
  ceremonyId: string;
  label: string;
  open?: boolean;
  onClick: () => void;
}) {
  const envelopeSrc = INVITATION_ENVELOPE_SRC[ceremonyId as CeremonyId];

  if (envelopeSrc) {
    return (
      <button
        type="button"
        className="invite-card__toggle invite-card__toggle--envelope"
        onClick={onClick}
        aria-expanded={open}
        aria-label={label}
      >
        <img
          className="invite-card__envelope"
          src={envelopeSrc}
          alt=""
          width={700}
          height={422}
          draggable={false}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      className="invite-card__toggle"
      onClick={onClick}
      aria-expanded={open}
    >
      <span className="invite-card__title">{label}</span>
    </button>
  );
}

export function InvitationCeremonyCard({
  ceremony,
  openInReader = false,
  open,
  confirming,
  declining,
  onOpen,
  onClose,
  onConfirmYes,
  onConfirmNo,
  onAddToCalendar,
}: InvitationCeremonyCardProps) {
  const label = getInvitationLabel(ceremony.id as CeremonyId, ceremony.name);

  if (openInReader) {
    return (
      <article className={`invite-card invite-card--${ceremony.id}`}>
        <CeremonyToggle
          ceremonyId={ceremony.id}
          label={label}
          onClick={onOpen}
        />
      </article>
    );
  }

  return (
    <article
      className={`invite-card invite-card--${ceremony.id}${open ? " invite-card--open" : ""}`}
    >
      <CeremonyToggle
        ceremonyId={ceremony.id}
        label={label}
        open={open}
        onClick={() => (open ? onClose() : onOpen())}
      />

      {open ? (
        <div className="invite-card__body">
          <p className="invite-card__detail">
            <strong>Lieu</strong>
            {ceremony.location}
          </p>
          {ceremony.description ? (
            <p className="invite-card__desc">{ceremony.description}</p>
          ) : null}

          <div className="invite-card__actions">
            <button
              type="button"
              className="invite-card__btn invite-card__btn--yes"
              onClick={onConfirmYes}
              disabled={confirming || ceremony.availability === true}
            >
              {confirming ? "…" : "Oui, je confirme"}
            </button>
            <button
              type="button"
              className="invite-card__btn invite-card__btn--no"
              onClick={onConfirmNo}
              disabled={declining || ceremony.availability === false}
            >
              {declining ? "…" : "Non, je ne pourrai pas"}
            </button>
            <button
              type="button"
              className="invite-card__btn invite-card__btn--ghost"
              onClick={onAddToCalendar}
            >
              Ajouter à mon calendrier
            </button>
          </div>
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
    <article className={`invite-card invite-card--honor${open ? " invite-card--open" : ""}`}>
      <button
        type="button"
        className="invite-card__toggle"
        onClick={() => (open ? onClose() : onOpen())}
        aria-expanded={open}
      >
        <span className="invite-card__title">Invités d&apos;honneur</span>
      </button>

      {open ? (
        <div className="invite-card__body invite-card__body--honor">
          <p className="invite-card__honor-title">
            À Nos Chers Invités d&apos;Honneur
          </p>
          {HONOR_LETTER_PARAGRAPHS.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="invite-card__desc">
              {paragraph}
            </p>
          ))}
          <p className="invite-card__desc">
            Avec toute notre affection et notre profonde gratitude,
          </p>
          <p className="invite-card__honor-sign">Innocente &amp; Nathan</p>
        </div>
      ) : null}
    </article>
  );
}
