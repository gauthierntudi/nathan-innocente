"use client";

import { useEffect } from "react";

type GuestHonorLetterModalProps = {
  open: boolean;
  onContinue: () => void;
};

const LETTER_PARAGRAPHS = [
  "Il est des présences qui illuminent une vie, des cœurs qui encouragent, inspirent et portent avec une affection sincère. Vous êtes de ceux-là.",
  "Si aujourd’hui nous avons souhaité vous distinguer, ce n’est pas seulement pour la place que vous occupez à nos côtés, mais parce que vous faites partie de l’histoire qui nous a conduits jusqu’à ce jour tant attendu.",
  "Les couleurs qui vous sont réservées sont le symbole de cette distinction. Elles ne sont pas simplement un dress code : elles sont le reflet de l’honneur que nous avons de vous compter parmi les personnes qui nous entoureront de plus près lors de cette célébration.",
  "Et parce qu’aucune fête ne prend véritablement vie sans les âmes qui lui donnent son éclat, nous comptons tout particulièrement sur vous. Soyez les premiers à célébrer, à rire, à danser, à entraîner les autres dans la joie et à insuffler cette énergie qui transforme une réception en un souvenir inoubliable.",
  "Que votre élégance sublime cette journée, que votre enthousiasme embrase la piste de danse, et que votre présence rappelle à chacun que les plus belles célébrations sont avant tout portées par ceux qui les vivent de tout leur cœur.",
  "Merci d’être les gardiens de cette atmosphère que nous rêvons de partager : une célébration empreinte d’amour, de raffinement, de joie et d’émotions sincères.",
] as const;

export function GuestHonorLetterModal({
  open,
  onContinue,
}: GuestHonorLetterModalProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="invitation-honor"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invitation-honor-title"
    >
      <div className="invitation-honor__veil" aria-hidden>
        <span className="invitation-honor__glow invitation-honor__glow--a" />
        <span className="invitation-honor__glow invitation-honor__glow--b" />
      </div>

      <div className="invitation-honor__shell">
        <article className="invitation-honor__letter">
          <div className="invitation-honor__frame" aria-hidden />

          <header className="invitation-honor__header">
            <img
              className="invitation-honor__logo"
              src="/img/logo-white.png"
              alt=""
              width={44}
              height={44}
            />
            <p className="invitation-honor__eyebrow">Message personnel</p>
            <h1 id="invitation-honor-title" className="invitation-honor__title">
              À Nos Chers Invités d’Honneur
            </h1>
            <div className="invitation-honor__ornament" aria-hidden>
              <span />
              <span className="invitation-honor__ornament-mark">✦</span>
              <span />
            </div>
          </header>

          <div className="invitation-honor__body">
            {LETTER_PARAGRAPHS.map((paragraph, index) => (
              <p
                key={paragraph.slice(0, 48)}
                style={{ animationDelay: `${0.18 + index * 0.06}s` }}
              >
                {paragraph}
              </p>
            ))}

            <div className="invitation-honor__signoff">
              <p className="invitation-honor__closing">
                Avec toute notre affection et notre profonde gratitude,
              </p>
              <p className="invitation-honor__signature">Innocente &amp; Nathan</p>
            </div>
          </div>
        </article>

        <div className="invitation-honor__footer">
          <button
            type="button"
            className="invitation-honor__cta"
            onClick={onContinue}
          >
            Continuer vers le dress code
          </button>
        </div>
      </div>
    </div>
  );
}
