import type { Guest } from "@prisma/client";

import type { CeremonyId } from "@/lib/admin/ceremony-types";
import {
  CEREMONY_VARIABLES_MAP,
  DEFAULT_VARIABLES_MAP,
  INVITE_VARIABLES_MAP,
  type VariablesMap,
} from "@/lib/admin/types";
import { getDressCodeFilename } from "@/lib/dress-code-urls";
import { guestIsHonorGuest } from "@/lib/guest-honor";
import { normalizePhone } from "@/lib/phone";

const INVITE_TEMPLATE_SID = "HX366d0e56b5f09edd983a45ef7fb52efb";
const INVITE_TEMPLATE_SID_LEGACY = "HX22c1ab6f9322915eee97777590edc660";

const CEREMONY_TEMPLATE_ENV: Record<CeremonyId, string> = {
  coutumier: "TWILIO_TEMPLATE_CEREMONY_COUTUMIER",
  civile: "TWILIO_TEMPLATE_CEREMONY_CIVILE",
  religieux: "TWILIO_TEMPLATE_CEREMONY_RELIGIEUX",
  reception: "TWILIO_TEMPLATE_CEREMONY_RECEPTION",
};

/** Templates Twilio sans placeholders (legacy) — ne pas envoyer ContentVariables. */
const CEREMONY_TEMPLATE_SIDS_WITHOUT_VARS = new Set([
  "HX6e5cb8dacac5422b8b342085a24758b5", // civil
  "HX0e27383ba6c0679c31a40d2d0918eb86", // coutumier (texte)
  "HXf84b0572ca586d738d97224a5a70a706", // coutume_with_button
]);

function getCeremonyTemplateSid(ceremonyId: CeremonyId): string | undefined {
  const value = process.env[CEREMONY_TEMPLATE_ENV[ceremonyId]]?.trim();
  return value || undefined;
}

function getHonorInviteTemplateSid() {
  return (
    process.env.TWILIO_TEMPLATE_INVITE_HONOR?.trim() ||
    process.env.TWILIO_TEMPLATE_INVITE?.trim() ||
    INVITE_TEMPLATE_SID ||
    undefined
  );
}

function getStandardInviteTemplateSid() {
  return process.env.TWILIO_TEMPLATE_INVITE?.trim() || INVITE_TEMPLATE_SID;
}

type GuestTemplateVars = {
  genre: string;
  nom: string;
  token: string;
  lien: string;
  convives: string;
};

type TwilioSendResult = {
  ok: boolean;
  message?: string;
  sid?: string;
  status?: string;
};

type TwilioMessageResource = {
  sid?: string;
  status?: string;
  body?: string | null;
  error_code?: number | string | null;
  error_message?: string | null;
  from?: string;
  to?: string;
  date_sent?: string | null;
  date_created?: string | null;
  content_sid?: string | null;
  contentSid?: string | null;
};

/** Dress-code / confirmation RSVP — pas l'invitation Messages (août 2026). */
const NON_INVITE_BODY_MARKERS = [
  "Nous vous remercions pour votre confirmation",
  "Nous confirmons la bonne réception",
  "dress code de la cérémonie est joint",
  "Le dress code de la cérémonie",
];

/** Empreintes du template invitation (TWILIO_TEMPLATE_INVITE). */
const INVITE_BODY_MARKERS = [
  "Votre confirmation de participation à la cérémonie de mariage",
  "Le grand jour approche",
  "Convives :",
  "login?params=",
  "nathan-innocente.com/login",
];

/** Campagne d'invitations Messages — ne considérer que cette période chez Twilio. */
const INVITE_LOOKUP_PERIOD = {
  start: Date.parse("2026-08-01T00:00:00.000Z"),
  end: Date.parse("2026-08-31T23:59:59.999Z"),
};

function getTwilioConfig() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !from) {
    throw new Error("Configuration Twilio manquante");
  }

  return { sid, token, from };
}

export function buildGuestTemplateVars(guest: Guest): GuestTemplateVars {
  const appUrl = process.env.APP_URL ?? "https://nathan-innocente.com";

  return {
    genre: guest.genre,
    nom: guest.name,
    token: guest.token,
    lien: `${appUrl}/login?params=${guest.token}`,
    convives: String(guest.numGuests),
  };
}

export function buildContentVariables(
  variablesMap: VariablesMap,
  guestVars: GuestTemplateVars,
) {
  const contentVariables: Record<string, string> = {};

  for (const [position, key] of Object.entries(variablesMap)) {
    contentVariables[position] = String(
      guestVars[key as keyof GuestTemplateVars] ?? "",
    );
  }

  return JSON.stringify(contentVariables);
}

async function parseTwilioError(response: Response) {
  const text = await response.text();

  try {
    const json = JSON.parse(text) as { code?: number };
    if (json.code === 63049) {
      return "Meta bloque l'envoi de messages WhatsApp marketing vers les numéros US (Erreur 63049).";
    }
  } catch {
    // ignore
  }

  return `Erreur Twilio (${response.status})${text ? `: ${text}` : ""}`;
}

export async function sendTwilioTemplateMessage({
  phone,
  contentSid,
  contentVariables,
}: {
  phone: string;
  contentSid: string;
  contentVariables?: string;
}): Promise<TwilioSendResult> {
  const { sid, token, from } = getTwilioConfig();
  const cleanPhone = normalizePhone(phone);

  const params: Record<string, string> = {
    From: from,
    To: `whatsapp:${cleanPhone}`,
    ContentSid: contentSid,
  };

  if (contentVariables !== undefined) {
    params.ContentVariables = contentVariables;
  }

  const body = new URLSearchParams(params);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader(sid, token),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!response.ok) {
    return { ok: false, message: await parseTwilioError(response) };
  }

  const payload = (await response.json()) as TwilioMessageResource;
  return {
    ok: true,
    sid: payload.sid,
    status: payload.status,
  };
}

function twilioAuthHeader(sid: string, token: string) {
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

function messageContentSid(payload: TwilioMessageResource) {
  return payload.content_sid ?? payload.contentSid ?? null;
}

function messageTimestamp(payload: TwilioMessageResource) {
  const raw = payload.date_sent || payload.date_created || "";
  const time = Date.parse(raw);
  return Number.isNaN(time) ? 0 : time;
}

function isInInviteLookupPeriod(item: TwilioMessageResource) {
  const time = messageTimestamp(item);
  if (!time) return false;
  return (
    time >= INVITE_LOOKUP_PERIOD.start && time <= INVITE_LOOKUP_PERIOD.end
  );
}

function inviteTemplateContentSids() {
  return [
    ...new Set(
      [
        process.env.TWILIO_TEMPLATE_INVITE?.trim(),
        INVITE_TEMPLATE_SID,
        INVITE_TEMPLATE_SID_LEGACY,
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
}

export function isInviteTemplateContentSid(contentSid?: string | null) {
  return Boolean(contentSid && inviteTemplateContentSids().includes(contentSid));
}

function isLikelyNonInviteMessageBody(body?: string | null) {
  if (!body) return false;
  return NON_INVITE_BODY_MARKERS.some((marker) => body.includes(marker));
}

function isLikelyInviteMessageBody(body?: string | null) {
  if (!body || isLikelyNonInviteMessageBody(body)) return false;
  const lower = body.toLowerCase();
  return INVITE_BODY_MARKERS.some((marker) =>
    lower.includes(marker.toLowerCase()),
  );
}

function isTwilioInviteMessage(item: TwilioMessageResource) {
  const contentSid = messageContentSid(item);
  if (isInviteTemplateContentSid(contentSid)) return true;
  if (contentSid && !isInviteTemplateContentSid(contentSid)) return false;
  return isLikelyInviteMessageBody(item.body);
}

export function isStoredInviteMessage(item: {
  contentSid?: string | null;
  body?: string | null;
  dateSent?: string | null;
}) {
  const resource: TwilioMessageResource = {
    content_sid: item.contentSid,
    body: item.body,
    date_sent: item.dateSent,
    date_created: item.dateSent,
  };
  return isInInviteLookupPeriod(resource) && isTwilioInviteMessage(resource);
}

export async function fetchTwilioMessage(messageSid: string) {
  const { sid, token } = getTwilioConfig();
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${messageSid}.json`,
    {
      headers: {
        Authorization: twilioAuthHeader(sid, token),
      },
    },
  );

  if (!response.ok) {
    return {
      ok: false as const,
      message: await parseTwilioError(response),
    };
  }

  const payload = (await response.json()) as TwilioMessageResource;
  return {
    ok: true as const,
    sid: payload.sid ?? messageSid,
    status: payload.status ?? null,
    contentSid: messageContentSid(payload),
    body: payload.body ?? null,
    dateSent: payload.date_sent ?? payload.date_created ?? null,
    errorCode:
      payload.error_code == null || payload.error_code === ""
        ? null
        : String(payload.error_code),
    errorMessage: payload.error_message ?? null,
  };
}

function digitsPhone(phone: string) {
  return normalizePhone(phone).replace(/^\+/, "");
}

function whatsappToCandidates(phone: string) {
  const normalized = normalizePhone(phone);
  const digits = digitsPhone(phone);
  if (!digits) return [];
  return [...new Set([`whatsapp:${normalized}`, `whatsapp:+${digits}`])];
}

type TwilioMessageListResult =
  | {
      ok: false;
      message: string;
      messages: TwilioMessageResource[];
      nextPageUri: null;
    }
  | {
      ok: true;
      messages: TwilioMessageResource[];
      nextPageUri: string | null;
    };

async function listTwilioMessages(
  query: URLSearchParams,
): Promise<TwilioMessageListResult> {
  const { sid, token } = getTwilioConfig();
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json?${query.toString()}`,
    {
      headers: {
        Authorization: twilioAuthHeader(sid, token),
      },
    },
  );

  if (!response.ok) {
    return {
      ok: false as const,
      message: await parseTwilioError(response),
      messages: [] as TwilioMessageResource[],
      nextPageUri: null,
    };
  }

  const payload = (await response.json()) as {
    messages?: TwilioMessageResource[];
    next_page_uri?: string | null;
  };
  return {
    ok: true as const,
    messages: payload.messages ?? [],
    nextPageUri: payload.next_page_uri ?? null,
  };
}

async function listTwilioMessagesForRecipient(
  to: string,
  from: string,
  maxPages = 5,
) {
  let messages: TwilioMessageResource[] = [];
  let lastError = "Aucun message Twilio trouvé pour ce numéro";

  const withFromQuery = new URLSearchParams({
    To: to,
    From: from,
    PageSize: "50",
  });
  let nextUri: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const listed: TwilioMessageListResult = nextUri
      ? await listTwilioMessagesByUri(nextUri)
      : await listTwilioMessages(withFromQuery);
    if (!listed.ok) {
      lastError = listed.message;
      break;
    }
    messages.push(...listed.messages);
    nextUri = listed.nextPageUri;
    if (!nextUri) break;
  }

  if (messages.length > 0) {
    return { ok: true as const, messages };
  }

  const toOnlyQuery = new URLSearchParams({ To: to, PageSize: "50" });
  nextUri = null;
  messages = [];

  for (let page = 0; page < maxPages; page += 1) {
    const listed: TwilioMessageListResult = nextUri
      ? await listTwilioMessagesByUri(nextUri)
      : await listTwilioMessages(toOnlyQuery);
    if (!listed.ok) {
      lastError = listed.message;
      break;
    }
    messages.push(...listed.messages);
    nextUri = listed.nextPageUri;
    if (!nextUri) break;
  }

  if (messages.length === 0) {
    return { ok: false as const, message: lastError, messages: [] };
  }

  const fromDigits = digitsPhone(from.replace(/^whatsapp:/i, ""));
  const outbound = messages.filter((item) => {
    const itemFrom = (item.from ?? "").replace(/^whatsapp:/i, "");
    return digitsPhone(itemFrom) === fromDigits;
  });

  return {
    ok: true as const,
    messages: outbound.length > 0 ? outbound : messages,
  };
}

async function listTwilioMessagesByUri(
  nextPageUri: string,
): Promise<TwilioMessageListResult> {
  const { sid, token } = getTwilioConfig();
  const response = await fetch(`https://api.twilio.com${nextPageUri}`, {
    headers: {
      Authorization: twilioAuthHeader(sid, token),
    },
  });

  if (!response.ok) {
    return {
      ok: false as const,
      message: await parseTwilioError(response),
      messages: [] as TwilioMessageResource[],
      nextPageUri: null,
    };
  }

  const payload = (await response.json()) as {
    messages?: TwilioMessageResource[];
    next_page_uri?: string | null;
  };
  return {
    ok: true as const,
    messages: payload.messages ?? [],
    nextPageUri: payload.next_page_uri ?? null,
  };
}

/** Retrouve le message d'invitation déjà envoyé à ce numéro (sans SID local). */
export async function findTwilioInviteMessage(phone: string) {
  const { from } = getTwilioConfig();
  const toCandidates = whatsappToCandidates(phone);
  if (toCandidates.length === 0) {
    return { ok: false as const, message: "Numéro invalide" };
  }

  let lastError = "Aucun message Twilio trouvé pour ce numéro";
  let messages: TwilioMessageResource[] = [];

  for (const to of toCandidates) {
    const listed = await listTwilioMessagesForRecipient(to, from);
    if (!listed.ok) {
      lastError = listed.message;
      continue;
    }
    messages = listed.messages;
    break;
  }

  if (messages.length === 0) {
    return { ok: false as const, message: lastError };
  }

  messages = messages.filter(isInInviteLookupPeriod);
  if (messages.length === 0) {
    return {
      ok: false as const,
      message: "Aucune invitation trouvée pour la période août 2026",
    };
  }

  const inviteSidLabel = getStandardInviteTemplateSid();
  let inviteMatches = messages.filter((item) => isTwilioInviteMessage(item));

  if (inviteMatches.length === 0) {
    const newestFirst = [...messages].sort(
      (a, b) => messageTimestamp(b) - messageTimestamp(a),
    );
    for (const item of newestFirst.slice(0, 40)) {
      if (!item.sid) continue;
      if (isTwilioInviteMessage(item)) {
        inviteMatches.push(item);
        continue;
      }
      const detail = await fetchTwilioMessage(item.sid);
      if (!detail.ok) continue;
      const enriched = {
        ...item,
        sid: detail.sid,
        status: detail.status ?? item.status,
        body: detail.body ?? item.body,
        content_sid: detail.contentSid,
        error_code: detail.errorCode,
        error_message: detail.errorMessage,
      };
      if (!isTwilioInviteMessage(enriched)) continue;
      inviteMatches.push(enriched);
    }
  }

  const chosen = [...inviteMatches].sort(
    (a, b) => messageTimestamp(b) - messageTimestamp(a),
  )[0];

  if (!chosen?.sid) {
    const hasOtherMessages = messages.some((item) =>
      isLikelyNonInviteMessageBody(item.body),
    );
    return {
      ok: false as const,
      message: hasOtherMessages
        ? `Aucune invitation (template ${inviteSidLabel}) trouvée en août 2026 — seulement confirmation dress-code sur ce numéro`
        : `Aucune invitation (template ${inviteSidLabel}) trouvée en août 2026 pour ce numéro`,
    };
  }

  return {
    ok: true as const,
    sid: chosen.sid,
    status: chosen.status ?? "sent",
    errorCode:
      chosen.error_code == null || chosen.error_code === ""
        ? null
        : String(chosen.error_code),
    errorMessage: chosen.error_message ?? null,
    matchedInviteTemplate: true,
    contentSid: messageContentSid(chosen),
  };
}

export async function sendInvitationWhatsApp(
  guest: Guest,
  _variablesMap: VariablesMap = INVITE_VARIABLES_MAP,
) {
  // Messages → Invitation : toujours le template invitation standard
  // (jamais confirm/dress-code, jamais invitation d'honneur).
  const contentSid = getStandardInviteTemplateSid();

  if (!contentSid) {
    return {
      ok: false,
      message: "Template invitation manquant (TWILIO_TEMPLATE_INVITE)",
    };
  }

  const guestVars = buildGuestTemplateVars(guest);
  const contentVariables = buildContentVariables(
    INVITE_VARIABLES_MAP,
    guestVars,
  );

  const result = await sendTwilioTemplateMessage({
    phone: guest.phone,
    contentSid,
    contentVariables,
  });

  if (!result.ok) return result;
  return {
    ok: true,
    sid: result.sid,
    status: result.status,
    message: `Invitation envoyée${result.sid ? ` (${result.sid})` : ""}`,
  };
}

export async function sendReminderWhatsApp(guest: Guest) {
  // Le rappel de l'onglet Messages réutilise le template invitation.
  const contentSid = getStandardInviteTemplateSid();
  if (!contentSid) {
    return { ok: false, message: "Template invitation manquant" };
  }

  const guestVars = buildGuestTemplateVars(guest);
  const contentVariables = buildContentVariables(INVITE_VARIABLES_MAP, guestVars);

  return sendTwilioTemplateMessage({
    phone: guest.phone,
    contentSid,
    contentVariables,
  });
}

export async function sendAvailabilityWhatsApp({
  phone,
  name,
  availability,
  ceremonyId,
  honorGuest = false,
}: {
  phone: string;
  name: string;
  availability: boolean;
  ceremonyId?: CeremonyId | null;
  honorGuest?: boolean;
}) {
  const confirmSid = process.env.TWILIO_TEMPLATE_CONFIRM?.trim();
  const declineSid = process.env.TWILIO_TEMPLATE_DECLINE?.trim();

  if (availability) {
    if (!confirmSid) return { ok: true };

    // Template confirmation : {{1}} = nom du fichier dress code (média Document)
    const dressCodeFilename = getDressCodeFilename(ceremonyId, { honorGuest });

    return sendTwilioTemplateMessage({
      phone,
      contentSid: confirmSid,
      contentVariables: JSON.stringify({ "1": dressCodeFilename }),
    });
  }

  if (!declineSid) return { ok: true };

  return sendTwilioTemplateMessage({
    phone,
    contentSid: declineSid,
    contentVariables: JSON.stringify({ "1": name }),
  });
}

export async function sendCeremonyWhatsApp(
  guest: Guest,
  ceremonyId: CeremonyId,
) {
  // Invitation activée → template invitation standard (TWILIO_TEMPLATE_INVITE)
  if (guest.invitationEnabled) {
    const contentSid = getStandardInviteTemplateSid();
    if (!contentSid) {
      return {
        ok: false,
        message: "Template invitation manquant (TWILIO_TEMPLATE_INVITE)",
      };
    }

    const guestVars = buildGuestTemplateVars(guest);
    const contentVariables = buildContentVariables(
      INVITE_VARIABLES_MAP,
      guestVars,
    );

    return sendTwilioTemplateMessage({
      phone: guest.phone,
      contentSid,
      contentVariables,
    });
  }

  const honorGuest = await guestIsHonorGuest(guest.id);

  // Invité d'honneur (groupe honor / invités d'honneur) → template invitation d'honneur
  if (honorGuest) {
    const contentSid = getHonorInviteTemplateSid();
    if (!contentSid) {
      return {
        ok: false,
        message: "Template invitation d'honneur manquant",
      };
    }

    const guestVars = buildGuestTemplateVars(guest);
    const contentVariables = buildContentVariables(
      DEFAULT_VARIABLES_MAP,
      guestVars,
    );

    return sendTwilioTemplateMessage({
      phone: guest.phone,
      contentSid,
      contentVariables,
    });
  }

  const contentSid = getCeremonyTemplateSid(ceremonyId);

  if (!contentSid) {
    return {
      ok: false,
      message: `Template WhatsApp manquant pour la cérémonie « ${ceremonyId} »`,
    };
  }

  const guestVars = buildGuestTemplateVars(guest);
  const contentVariables = CEREMONY_TEMPLATE_SIDS_WITHOUT_VARS.has(contentSid)
    ? undefined
    : buildContentVariables(CEREMONY_VARIABLES_MAP, guestVars);

  return sendTwilioTemplateMessage({
    phone: guest.phone,
    contentSid,
    contentVariables,
  });
}
