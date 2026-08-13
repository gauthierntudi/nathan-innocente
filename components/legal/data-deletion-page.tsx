import { LegalDocument } from "@/components/legal/legal-document";
import { legalContactEmail, legalSiteName } from "@/lib/legal/content";

export function DataDeletionPage() {
  return (
    <LegalDocument
      title="Suppression des données utilisateur"
      intro={`Cette page explique comment demander la suppression de vos données personnelles associées au site d’invitation ${legalSiteName}.`}
      sections={[
        {
          title: "Données concernées",
          paragraphs: [
            "Sur demande, nous pouvons supprimer ou anonymiser les données liées à votre invitation, notamment :",
          ],
          bullets: [
            "Nom, civilité et numéro de téléphone",
            "Réponses RSVP et nombre de convives",
            "Affectations aux cérémonies / tables",
            "Jeton d’accès et historiques d’envoi WhatsApp associés à votre fiche",
          ],
        },
        {
          title: "Comment demander la suppression",
          paragraphs: [
            "Envoyez un e-mail à l’adresse ci-dessous avec l’objet « Suppression de mes données – invitation mariage ».",
          ],
          bullets: [
            `Adresse : ${legalContactEmail}`,
            "Indiquez votre nom complet tel qu’il apparaît sur l’invitation",
            "Indiquez le numéro de téléphone WhatsApp utilisé pour recevoir les messages",
            "Précisez éventuellement le lien ou le jeton d’accès reçu, pour accélérer l’identification",
          ],
        },
        {
          title: "Délai de traitement",
          paragraphs: [
            "Nous accusons réception de votre demande et procédons à la suppression dans un délai raisonnable, en général sous 30 jours, sauf besoin de vérification d’identité ou contrainte légale.",
          ],
        },
        {
          title: "Effets de la suppression",
          paragraphs: [
            "Une fois vos données supprimées :",
          ],
          bullets: [
            "Votre accès à l’espace invité ne fonctionnera plus",
            "Vous ne recevrez plus de messages WhatsApp liés à l’invitation",
            "Les organisateurs ne conserveront plus votre fiche nominative, sauf archives anonymisées ou obligations légales",
          ],
        },
        {
          title: "Vérification",
          paragraphs: [
            "Pour éviter une suppression abusive, nous pouvons vous demander une confirmation simple (réponse depuis le numéro WhatsApp connu, ou éléments permettant de vérifier votre identité).",
          ],
        },
      ]}
    />
  );
}
