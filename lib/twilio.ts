import type { Guest } from "@prisma/client";

import type { VariablesMap } from "@/lib/admin/types";
import { normalizePhone } from "@/lib/phone";

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
  contentVariables: string;
}): Promise<TwilioSendResult> {
  const { sid, token, from } = getTwilioConfig();
  const cleanPhone = normalizePhone(phone);

  const body = new URLSearchParams({
    From: from,
    To: `whatsapp:${cleanPhone}`,
    ContentSid: contentSid,
    ContentVariables: contentVariables,
  });

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
  variablesMap: VariablesMap,
) {
  const contentSid = process.env.TWILIO_TEMPLATE_INVITE;
  if (!contentSid) {
    return { ok: false, message: "Template invitation manquant" };
  }

  const guestVars = buildGuestTemplateVars(guest);
  const contentVariables = buildContentVariables(variablesMap, guestVars);

  return sendTwilioTemplateMessage({
    phone: guest.phone,
    contentSid,
    contentVariables,
  });
}

export async function sendReminderWhatsApp(guest: Guest) {
  const contentSid = process.env.TWILIO_TEMPLATE_REMINDER;
  if (!contentSid) {
    return { ok: false, message: "Template rappel manquant" };
  }

  return sendTwilioTemplateMessage({
    phone: guest.phone,
    contentSid,
    contentVariables: JSON.stringify({ "1": guest.name }),
  });
}

export async function sendAvailabilityWhatsApp({
  phone,
  name,
  availability,
}: {
  phone: string;
  name: string;
  availability: boolean;
}) {
  const confirmSid = process.env.TWILIO_TEMPLATE_CONFIRM;
  const declineSid = process.env.TWILIO_TEMPLATE_DECLINE;

  if (!confirmSid || !declineSid) return { ok: true };

  return sendTwilioTemplateMessage({
    phone,
    contentSid: availability ? confirmSid : declineSid,
    contentVariables: JSON.stringify({ "1": name }),
  });
}
