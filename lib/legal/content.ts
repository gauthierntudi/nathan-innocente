import { weddingInfo } from "@/lib/home/content";

export const privacyPolicyPath = "/politique-de-confidentialite" as const;
export const termsOfServicePath = "/conditions-d-utilisation" as const;
export const dataDeletionPath = "/suppression-des-donnees" as const;

export const legalSiteName = "Nathan & Innocente";
export const legalContactEmail = weddingInfo.email;

export const legalLastUpdated = "13 août 2026";

export const legalUrls = {
  privacyPolicy: privacyPolicyPath,
  termsOfService: termsOfServicePath,
  dataDeletion: dataDeletionPath,
} as const;
