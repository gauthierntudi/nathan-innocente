import type { GuestCeremonyView } from "@/lib/guest-ceremonies";

import { INVITATION_ICON_PROPS, Shirt } from "@/components/save-the-date/invitation-icons";

type GuestDressCodePanelProps = {
  ceremonies: GuestCeremonyView[];
};

export function GuestDressCodePanel({ ceremonies }: GuestDressCodePanelProps) {
  const hasCeremonies = ceremonies.length > 0;

  return (
    <section className="invitation-panel invitation-panel--dresscode">
      <div className="invitation-panel__head">
        <p className="invitation-panel__label">
          <Shirt {...INVITATION_ICON_PROPS} />
          Dress code
        </p>
        <h2 className="invitation-panel__title">Tenue recommandée</h2>
        <p className="invitation-panel__hint">
          {hasCeremonies
            ? "Préparez votre tenue en fonction de la ou des cérémonies auxquelles vous êtes convié(e)."
            : "Le dress code vous sera communiqué avec votre convocation aux cérémonies."}
        </p>
      </div>

      {hasCeremonies ? (
        <ul className="invitation-dresscode-list">
          {ceremonies.map((ceremony) => (
            <li
              key={ceremony.id}
              className={`invitation-dresscode-item invitation-dresscode-item--${ceremony.id}`}
            >
              <span className="invitation-dresscode-item__icon">
                <Shirt {...INVITATION_ICON_PROPS} />
              </span>
              <div>
                <p className="invitation-dresscode-item__ceremony">{ceremony.name}</p>
                <p className="invitation-dresscode-item__code">{ceremony.dressCode}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
