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

const INVITE_TEMPLATE_SID_FALLBACK = "HX22c1ab6f9322915eee97777590edc660";

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
    INVITE_TEMPLATE_SID_FALLBACK ||
    undefined
  );
}

function getStandardInviteTemplateSid() {
  return process.env.TWILIO_TEMPLATE_INVITE?.trim() || INVITE_TEMPLATE_SID_FALLBACK;
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
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!response.ok) {
    return { ok: false, message: await parseTwilioError(response) };
  }

  return { ok: true };
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
  return { ok: true, message: `Invitation envoyée (SID ${contentSid})` };
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
