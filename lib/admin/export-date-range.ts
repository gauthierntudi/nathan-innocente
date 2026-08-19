/** Inclusive calendar day `YYYY-MM-DD`, or a full ISO timestamp. */
export function parseExportDateBound(
  raw: string | null,
  edge: "start" | "end",
): Date | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    if (edge === "start") {
      return new Date(year, month - 1, day, 0, 0, 0, 0);
    }
    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function guestsAddedWhere(from: Date | null, to: Date | null) {
  if (!from && !to) return undefined;
  return {
    createdAt: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  };
}

export function guestExportFilename(
  from: Date | null,
  to: Date | null,
  labels?: { fromDay?: string | null; toDay?: string | null },
) {
  const fromDay =
    labels?.fromDay && /^\d{4}-\d{2}-\d{2}$/.test(labels.fromDay)
      ? labels.fromDay
      : from
        ? formatDay(from)
        : null;
  const toDay =
    labels?.toDay && /^\d{4}-\d{2}-\d{2}$/.test(labels.toDay)
      ? labels.toDay
      : to
        ? formatDay(to)
        : null;
  const today = formatDay(new Date());
  if (!fromDay && !toDay) return `rapport_invites_${today}.xlsx`;
  if (fromDay && toDay && fromDay === toDay) {
    return `rapport_invites_${fromDay}.xlsx`;
  }
  if (fromDay && toDay) return `rapport_invites_${fromDay}_${toDay}.xlsx`;
  if (fromDay) return `rapport_invites_depuis_${fromDay}.xlsx`;
  return `rapport_invites_jusquau_${toDay}.xlsx`;
}

function formatDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
