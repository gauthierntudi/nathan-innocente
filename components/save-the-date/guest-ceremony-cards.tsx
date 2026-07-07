import type { GuestCeremonyView } from "@/lib/guest-ceremonies";

import {
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
      <ul className="guest-ceremonies__list">
        {ceremonies.map((ceremony) => (
          <li
            key={ceremony.id}
            className={`guest-ceremony-card guest-ceremony-card--${ceremony.id}`}
          >
            {ceremony.tableName ? (
              <div className="guest-ceremony-card__head">
                <span className="guest-ceremony-card__table">
                  <UtensilsCrossed {...INVITATION_ICON_PROPS} />
                  {ceremony.tableName}
                </span>
              </div>
            ) : null}

            <div className="guest-ceremony-card__grid">
              <article className="guest-ceremony-card__item guest-ceremony-card__item--wide">
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
