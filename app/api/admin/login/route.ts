import { jsonError, jsonOk } from "@/lib/api-response";
import {
  clearAdminSession,
  isAdminAuthenticated,
  setAdminSession,
  verifyAdminPassword,
} from "@/lib/admin-auth";

export async function GET() {
  return jsonOk({ authenticated: await isAdminAuthenticated() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  const password = body.password ?? "";

  if (!verifyAdminPassword(password)) {
    return jsonError("Mot de passe incorrect");
  }

  await setAdminSession();
  return jsonOk({});
}

export async function DELETE() {
  await clearAdminSession();
  return jsonOk({});
}
