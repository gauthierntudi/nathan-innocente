import { Check, INVITATION_ICON_PROPS } from "@/components/save-the-date/invitation-icons";
import { isCeremonyStepComplete } from "@/lib/guest-rsvp-flow";
import type { GuestCeremonyView } from "@/lib/guest-ceremonies";
import type { CeremonyId } from "@/lib/admin/ceremony-types";

const SHORT_NAMES: Record<CeremonyId, string> = {
  coutumier: "Coutumière",
  civile: "Civile",
  religieux: "Réligieux",
};

function shortDate(date: string) {
  return date.replace(/\s*20\d{2}\s*$/, "").trim();
}

function statusLabel(ceremony: GuestCeremonyView, isActive: boolean) {
  if (ceremony.availability === false) return "Indisponible";
  if (ceremony.availability === true && ceremony.dressCodeDownloadedAt) {
    return "Confirmé";
  }
  if (ceremony.availability === true) return "Dress code";
  if (isActive) return "En cours";
  return "À venir";
}

type GuestCeremonyRailProps = {
  ceremonies: GuestCeremonyView[];
  activeCeremonyId: CeremonyId | null;
};

export function GuestCeremonyRail({
  ceremonies,
  activeCeremonyId,
}: GuestCeremonyRailProps) {
  if (ceremonies.length < 2) return null;

  return (
    <nav className="invitation-ceremony-rail" aria-label="Vos cérémonies">
      <p className="invitation-ceremony-rail__eyebrow">Votre parcours</p>

      <ol className="invitation-ceremony-rail__track">
        {ceremonies.map((ceremony, index) => {
          const isActive = activeCeremonyId === ceremony.id;
          const isDone = isCeremonyStepComplete(ceremony);
          const declined = ceremony.availability === false;
          const status = statusLabel(ceremony, isActive);

          return (
            <li
              key={ceremony.id}
              className={[
                "invitation-ceremony-rail__stop",
                `invitation-ceremony-rail__stop--${ceremony.id}`,
                isActive ? "invitation-ceremony-rail__stop--active" : "",
                isDone ? "invitation-ceremony-rail__stop--done" : "",
                declined ? "invitation-ceremony-rail__stop--declined" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {index > 0 ? (
                <span
                  className={`invitation-ceremony-rail__line${
                    isCeremonyStepComplete(ceremonies[index - 1])
                      ? " invitation-ceremony-rail__line--filled"
                      : ""
                  }`}
                  aria-hidden
                />
              ) : null}

              <span className="invitation-ceremony-rail__marker" aria-hidden>
                {declined ? (
                  "–"
                ) : isDone ? (
                  <Check {...INVITATION_ICON_PROPS} size={14} strokeWidth={2.25} />
                ) : (
                  index + 1
                )}
              </span>

              <div className="invitation-ceremony-rail__copy">
                <span className="invitation-ceremony-rail__date">
                  {shortDate(ceremony.date)}
                </span>
                <span className="invitation-ceremony-rail__name">
                  {SHORT_NAMES[ceremony.id]}
                </span>
                <span className="invitation-ceremony-rail__status">{status}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
