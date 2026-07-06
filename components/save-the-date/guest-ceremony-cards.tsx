import type { GuestCeremonyView } from "@/lib/guest-ceremonies";

import {
  CalendarDays,
  INVITATION_ICON_PROPS,
  MapPin,
  UtensilsCrossed,
} from "@/components/save-the-date/invitation-icons";

type GuestCeremonyCardsProps = {
  ceremonies: GuestCeremonyView[];
  compact?: boolean;
};

export function GuestCeremonyCards({ ceremonies, compact = false }: GuestCeremonyCardsProps) {
  if (ceremonies.length === 0) return null;

  return (
    <section className={`guest-ceremonies${compact ? " guest-ceremonies--compact" : ""}`}>
      {!compact ? (
        <header className="guest-ceremonies__header">
          <p className="guest-ceremonies__eyebrow">
            {ceremonies.length === 1 ? "Votre cérémonie" : "Vos cérémonies"}
          </p>
        </header>
      ) : null}

      <ul className="guest-ceremonies__list">
        {ceremonies.map((ceremony) => (
          <li
            key={ceremony.id}
            className={`guest-ceremony-card guest-ceremony-card--${ceremony.id}`}
          >
            <div className="guest-ceremony-card__head">
              <div>
                <p className="guest-ceremony-card__label">Cérémonie</p>
                <h3 className="guest-ceremony-card__name">{ceremony.name}</h3>
              </div>
              {ceremony.tableName ? (
                <span className="guest-ceremony-card__table">
                  <UtensilsCrossed {...INVITATION_ICON_PROPS} />
                  {ceremony.tableName}
                </span>
              ) : null}
            </div>

            <div className="guest-ceremony-card__grid">
              <article className="guest-ceremony-card__item">
                <span className="guest-ceremony-card__icon">
                  <CalendarDays {...INVITATION_ICON_PROPS} />
                </span>
                <div>
                  <p className="guest-ceremony-card__item-label">Date</p>
                  <p className="guest-ceremony-card__item-value">{ceremony.date}</p>
                  {ceremony.time ? (
                    <p className="guest-ceremony-card__item-sub">{ceremony.time}</p>
                  ) : null}
                </div>
              </article>

              <article className="guest-ceremony-card__item">
                <span className="guest-ceremony-card__icon">
                  <MapPin {...INVITATION_ICON_PROPS} />
                </span>
                <div>
                  <p className="guest-ceremony-card__item-label">Lieu</p>
                  <p className="guest-ceremony-card__item-value">{ceremony.location}</p>
                  {ceremony.address ? (
                    <p className="guest-ceremony-card__item-sub">{ceremony.address}</p>
                  ) : null}
                </div>
              </article>

              {!compact ? (
                <p className="guest-ceremony-card__description">{ceremony.description}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
