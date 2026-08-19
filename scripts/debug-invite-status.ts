import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { fetchTwilioMessage, findTwilioInviteMessage } from "@/lib/twilio";
import { normalizePhone } from "@/lib/phone";

async function main() {
  const guests = await prisma.guest.findMany({
    where: { statusSend: true, phoneFictitious: false },
    select: { id: true, name: true, phone: true, inviteMessageSid: true },
    take: 3,
  });

  console.log("Guests with statusSend:", guests.length);

  for (const guest of guests) {
    console.log("\n---", guest.name, guest.phone, guest.inviteMessageSid);

    if (guest.inviteMessageSid) {
      const msg = await fetchTwilioMessage(guest.inviteMessageSid);
      console.log("By stored SID:", msg);
    }

    const found = await findTwilioInviteMessage(guest.phone);
    console.log("Find invite:", found);
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_FROM!;
  const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;

  const guest = guests[0];
  if (!guest) return;

  const cleanPhone = normalizePhone(guest.phone);
  const to = `whatsapp:${cleanPhone}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json?To=${encodeURIComponent(to)}&From=${encodeURIComponent(from)}&PageSize=5`;
  const res = await fetch(url, { headers: { Authorization: auth } });
  const data = (await res.json()) as { messages?: Record<string, unknown>[] };
  const sample = data.messages?.[0];
  console.log("\nList sample keys:", sample ? Object.keys(sample) : "no messages");
  if (sample?.sid) {
    const detailRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${sample.sid}.json`,
      { headers: { Authorization: auth } },
    );
    const detail = await detailRes.json();
    console.log("Detail keys:", Object.keys(detail));
    console.log("Detail content fields:", {
      content_sid: detail.content_sid,
      contentSid: detail.contentSid,
      messaging_service_sid: detail.messaging_service_sid,
      body: detail.body?.slice?.(0, 80),
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
