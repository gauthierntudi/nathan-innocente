import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginApp } from "@/components/save-the-date/login-app";
import { galleryPath } from "@/lib/galerie/content";
import {
  isCocktailLoginParam,
  isPassAccessLoginParam,
} from "@/lib/pass-access-urls";

export const metadata: Metadata = {
  title: "Invitation - Nathan & Innocente",
  description: "Accédez à votre invitation personnelle.",
  openGraph: {
    title: "Invitation - Nathan & Innocente",
    description: "Accédez à votre invitation personnelle.",
    type: "website",
    images: [{ url: "/img/profil01.png" }],
  },
};

type LoginPageProps = {
  searchParams: Promise<{ params?: string; passaccess?: string; cocktail?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { params: urlToken, passaccess, cocktail } = await searchParams;
  const token = urlToken?.trim() ?? "";
  const passAccess = isPassAccessLoginParam(passaccess);
  const cocktailAccess = isCocktailLoginParam(cocktail);

  // Accès public → galerie ; les liens WhatsApp / pass / cocktail restent sur l’invitation.
  if (!token && !passAccess && !cocktailAccess) {
    redirect(galleryPath);
  }

  return (
    <LoginApp
      urlToken={token}
      passAccess={passAccess}
      cocktail={cocktailAccess}
    />
  );
}
