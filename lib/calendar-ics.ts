import type { GuestCeremonyDetails } from "@/lib/ceremony-content";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIcsDate(date: Date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Parse guest-facing French dates like "05 septembre 2026" + "15h00". */
export function parseCeremonyDateTime(dateLabel: string, timeLabel: string): Date | null {
  const months: Record<string, number> = {
    janvier: 0,
    fevrier: 1,
    février: 1,
    mars: 2,
    avril: 3,
    mai: 4,
    juin: 5,
    juillet: 6,
    aout: 7,
    août: 7,
    septembre: 8,
    octobre: 9,
    novembre: 10,
    decembre: 11,
    décembre: 11,
  };

  const dateMatch = dateLabel
    .normalize("NFC")
    .toLowerCase()
    .match(/(\d{1,2})\s+([a-zéûôà]+)\s+(\d{4})/i);
  if (!dateMatch) return null;

  const day = Number(dateMatch[1]);
  const month = months[dateMatch[2] ?? ""];
  const year = Number(dateMatch[3]);
  if (month == null || !day || !year) return null;

  const timeMatch = timeLabel.match(/(\d{1,2})\s*h\s*(\d{2})?/i);
  const hours = timeMatch ? Number(timeMatch[1]) : 12;
  const minutes = timeMatch?.[2] ? Number(timeMatch[2]) : 0;

  return new Date(year, month, day, hours, minutes, 0);
}

export function buildCeremonyCalendarEvent(
  ceremony: Pick<
    GuestCeremonyDetails,
    "name" | "date" | "time" | "location" | "address" | "description"
  >,
) {
  const start = parseCeremonyDateTime(ceremony.date, ceremony.time);
  if (!start) return null;

  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const stamp = toIcsDate(new Date());
  const location = [ceremony.location, ceremony.address].filter(Boolean).join(" — ");
  const description = ceremony.description.replace(/\n/g, "\\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nathan & Innocente//Invitation//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ceremony.name.replace(/\s+/g, "-").toLowerCase()}-${start.getTime()}@nathan-innocente`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${ceremony.name}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return {
    filename: `${ceremony.name.replace(/\s+/g, "-").toLowerCase()}.ics`,
    ics,
  };
}

export function downloadCeremonyCalendar(
  ceremony: Pick<
    GuestCeremonyDetails,
    "name" | "date" | "time" | "location" | "address" | "description"
  >,
) {
  const event = buildCeremonyCalendarEvent(ceremony);
  if (!event) return false;

  const blob = new Blob([event.ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = event.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}
