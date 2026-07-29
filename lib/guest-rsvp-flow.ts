export type CeremonyRsvpState = {
  availability: boolean | null;
  dressCodeDownloadedAt: string | null;
};

/** A ceremony step is complete when declined, or confirmed + dress code downloaded. */
export function isCeremonyStepComplete(ceremony: CeremonyRsvpState) {
  if (ceremony.availability === null) return false;
  if (ceremony.availability === false) return true;
  return ceremony.dressCodeDownloadedAt !== null;
}

export function hasCompletedAllCeremonySteps(ceremonies: CeremonyRsvpState[]) {
  return ceremonies.length > 0 && ceremonies.every(isCeremonyStepComplete);
}

/** RSVP répondu (oui ou non) — sans exiger le dress code. */
export function hasAnsweredCeremonyRsvp(ceremony: Pick<CeremonyRsvpState, "availability">) {
  return ceremony.availability !== null;
}

export function hasAnsweredAllCeremonyRsvps(
  ceremonies: Array<Pick<CeremonyRsvpState, "availability">>,
) {
  return ceremonies.length > 0 && ceremonies.every(hasAnsweredCeremonyRsvp);
}

/** Première cérémonie sans réponse RSVP, après `afterId` si fourni. */
export function getNextUnansweredCeremony<T extends { id: string; availability: boolean | null }>(
  ceremonies: T[],
  afterId?: string | null,
): T | null {
  const unanswered = ceremonies.filter((ceremony) => ceremony.availability === null);
  if (unanswered.length === 0) return null;
  if (!afterId) return unanswered[0];

  const startIdx = ceremonies.findIndex((ceremony) => ceremony.id === afterId);
  if (startIdx < 0) return unanswered[0];

  const ordered = [
    ...ceremonies.slice(startIdx + 1),
    ...ceremonies.slice(0, startIdx + 1),
  ];
  return ordered.find((ceremony) => ceremony.availability === null) ?? null;
}

/** First ceremony still needing a response or a dress-code download. */
export function getActiveCeremony<T extends CeremonyRsvpState>(
  ceremonies: T[],
): T | null {
  return ceremonies.find((ceremony) => !isCeremonyStepComplete(ceremony)) ?? null;
}

export function getCeremonyProgress(ceremonies: CeremonyRsvpState[]) {
  const completed = ceremonies.filter(isCeremonyStepComplete).length;
  return {
    completed,
    total: ceremonies.length,
    currentIndex: Math.min(completed + 1, Math.max(ceremonies.length, 1)),
    currentRsvpIndex: Math.min(
      ceremonies.filter(hasAnsweredCeremonyRsvp).length + 1,
      Math.max(ceremonies.length, 1),
    ),
  };
}

export function getEndReasonFromCeremonies(
  ceremonies: CeremonyRsvpState[],
): "confirmed" | "declined" {
  return ceremonies.some((ceremony) => ceremony.availability === true)
    ? "confirmed"
    : "declined";
}

export function getConfirmedCeremonies<T extends { availability: boolean | null }>(
  ceremonies: T[],
): T[] {
  return ceremonies.filter((ceremony) => ceremony.availability === true);
}

export function ceremonyNeedsDressCode(ceremony: CeremonyRsvpState) {
  return ceremony.availability === true && ceremony.dressCodeDownloadedAt === null;
}
