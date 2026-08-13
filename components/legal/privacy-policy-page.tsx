import { LegalDocument } from "@/components/legal/legal-document";
import { legalContactEmail, legalSiteName } from "@/lib/legal/content";

export function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title="Politique de confidentialité"
      intro={`Cette politique décrit comment le site ${legalSiteName} (nathan-innocente.com) collecte et utilise les données personnelles dans le cadre de l’organisation du mariage et de l’envoi des invitations numériques.`}
      sections={[
        {
          title: "Responsable du traitement",
          paragraphs: [
            `Les données sont traitées par les organisateurs du mariage ${legalSiteName}, pour la gestion des invitations, des confirmations de présence et des informations pratiques liées aux cérémonies.`,
            `Pour toute question : ${legalContactEmail}.`,
          ],
        },
        {
          title: "Données collectées",
          paragraphs: [
            "Nous collectons uniquement les informations nécessaires à l’invitation et à l’organisation de l’événement :",
          ],
          bullets: [
            "Identité : prénom, nom, civilité / formule d’adresse",
            "Coordonnées : numéro de téléphone (WhatsApp), éventuellement e-mail",
            "Informations d’invitation : nombre de convives, cérémonies concernées, réponse RSVP",
            "Données techniques limitées : jeton d’accès à l’invitation, journal d’envoi des messages WhatsApp",
          ],
        },
        {
          title: "Finalités",
          paragraphs: [
            "Vos données sont utilisées pour :",
          ],
          bullets: [
            "Vous envoyer l’invitation et les rappels via WhatsApp",
            "Vous permettre d’accéder à votre espace invité (invitation, dress code, informations)",
            "Enregistrer votre réponse de présence et le nombre de convives",
            "Organiser les places, tables et cérémonies",
          ],
        },
        {
          title: "Canaux de communication",
          paragraphs: [
            "Les messages WhatsApp sont envoyés via un prestataire technique (Twilio) et la plateforme WhatsApp / Meta. Ces services traitent le numéro de téléphone et le contenu du message uniquement pour l’acheminement.",
          ],
        },
        {
          title: "Conservation",
          paragraphs: [
            "Les données sont conservées pendant la préparation du mariage et un délai raisonnable après l’événement, puis supprimées ou anonymisées, sauf obligation légale contraire.",
          ],
        },
        {
          title: "Partage",
          paragraphs: [
            "Nous ne vendons pas vos données. Elles peuvent être partagées uniquement avec des prestataires techniques nécessaires au fonctionnement du site et à l’envoi des messages (hébergement, WhatsApp / Twilio), dans la limite de leurs missions.",
          ],
        },
        {
          title: "Vos droits",
          paragraphs: [
            "Vous pouvez demander l’accès, la rectification ou la suppression de vos données en nous contactant. Les instructions détaillées pour la suppression sont disponibles sur la page « Suppression des données utilisateur ».",
          ],
        },
      ]}
    />
  );
}
