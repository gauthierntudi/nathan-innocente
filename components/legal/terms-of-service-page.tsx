import { LegalDocument } from "@/components/legal/legal-document";
import { legalContactEmail, legalSiteName } from "@/lib/legal/content";

export function TermsOfServicePage() {
  return (
    <LegalDocument
      title="Conditions d’utilisation"
      intro={`Les présentes conditions régissent l’accès et l’utilisation du site ${legalSiteName} (nathan-innocente.com), dédié aux invitations et informations liées au mariage.`}
      sections={[
        {
          title: "Objet du service",
          paragraphs: [
            "Le site permet aux invités d’accéder à leur invitation personnelle, de consulter les informations des cérémonies, de télécharger le dress code le cas échéant, et de confirmer ou décliner leur présence.",
          ],
        },
        {
          title: "Accès",
          paragraphs: [
            "L’accès à l’espace invité se fait via un lien ou un jeton personnel transmis par les organisateurs (notamment par WhatsApp). Ce lien est personnel et non cessible.",
            "Vous vous engagez à ne pas partager votre lien d’accès avec des tiers non invités, ni à tenter d’accéder aux espaces d’autres invités.",
          ],
        },
        {
          title: "Usage autorisé",
          paragraphs: [
            "Le service est réservé à un usage personnel et non commercial, uniquement dans le cadre de l’événement. Il est interdit d’utiliser le site pour :",
          ],
          bullets: [
            "Perturber le fonctionnement technique du site",
            "Collecter des données d’autres invités",
            "Diffuser du contenu illicite ou trompeur via les canaux liés au site",
          ],
        },
        {
          title: "Contenus",
          paragraphs: [
            "Les textes, images, vidéos, invitations et dress codes restent la propriété des organisateurs ou de leurs ayants droit. Toute reproduction hors du cadre privé de l’invitation est soumise à autorisation.",
          ],
        },
        {
          title: "Messages WhatsApp",
          paragraphs: [
            "En figurant sur la liste d’invités et en fournissant un numéro WhatsApp, vous acceptez de recevoir des messages liés à l’invitation (envoi initial, rappels, confirmations). Vous pouvez demander à ne plus recevoir de messages en contactant les organisateurs.",
          ],
        },
        {
          title: "Disponibilité",
          paragraphs: [
            "Nous mettons en œuvre des moyens raisonnables pour assurer la disponibilité du site, sans garantie d’accès ininterrompu. Des maintenances ou incidents techniques peuvent survenir.",
          ],
        },
        {
          title: "Contact",
          paragraphs: [
            `Pour toute question relative à ces conditions : ${legalContactEmail}.`,
          ],
        },
      ]}
    />
  );
}
