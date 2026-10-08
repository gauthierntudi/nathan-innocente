"use client";

import { FaceLivenessDetectorCore } from "@aws-amplify/ui-react-liveness";
import { ThemeProvider } from "@aws-amplify/ui-react";
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { MatchedAlbum } from "@/lib/galerie/content";

import "@aws-amplify/ui-react/styles.css";
import "@aws-amplify/ui-react-liveness/styles.css";

type FaceScanProps = {
  onCancel: () => void;
  onMatched: (albums: MatchedAlbum[]) => void;
};

export function canUseCamera() {
  return window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === "function";
}

/** Conservé pour compatibilité avec l’ancien flux ; le liveness gère la caméra. */
export function requestUserCamera() {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user" },
  });
}

type SessionPayload = {
  success?: boolean;
  sessionId?: string;
  region?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration?: string | null;
  };
  message?: string;
};

type CompletePayload = {
  success?: boolean;
  status?: "not_live" | "no_face" | "matched";
  albums?: MatchedAlbum[];
  message?: string;
};

const INSECURE_MESSAGE =
  "La caméra est bloquée sur cette adresse http. Le téléphone n’autorise le scan qu’en https.";

const FRENCH_DISPLAY = {
  photosensitivityWarningHeadingText: "Avertissement photosensibilité",
  photosensitivityWarningBodyText:
    "Ce contrôle fait clignoter des couleurs. Si vous êtes épileptique, demandez de l’aide.",
  photosensitivityWarningInfoText: "Quelques personnes sont sensibles aux lumières colorées.",
  photosensitivityWarningLabelText: "Plus d’informations",
  goodFitCaptionText: "Bon cadrage",
  tooFarCaptionText: "Trop loin",
  hintCenterFaceText: "Centrez votre visage",
  hintCenterFaceInstructionText:
    "Placez votre visage dans l’ovale puis tenez-vous immobile pour démarrer le contrôle.",
  hintFaceOffCenterText: "Le visage n’est pas centré. Centrez votre visage.",
  startScreenBeginCheckText: "Démarrer le contrôle",
  cancelLivenessCheckText: "Annuler",
  waitingCameraPermissionText: "En attente de l’autorisation caméra…",
  retryCameraPermissionsText: "Réessayer",
  errorCameraMissingText: "Aucune caméra n’est disponible.",
  errorCameraAccessText: "Autorisez la caméra pour continuer.",
  errorLandscapeModeText: "Tournez le téléphone en mode portrait.",
  timeoutHeaderText: "Temps écoulé",
  timeoutMessageText: "Le visage n’est pas resté dans l’ovale assez longtemps. Réessayez.",
  faceDistanceHeaderText: "Rapprochez-vous",
  faceDistanceMessageText: "Avant de démarrer, placez votre visage dans l’ovale.",
  multipleFacesHeaderText: "Plusieurs visages",
  multipleFacesMessageText: "Assurez-vous qu’une seule personne est devant la caméra.",
  clientHeaderText: "Erreur client",
  clientMessageText: "Le contrôle a échoué à cause d’un problème côté client.",
  serverHeaderText: "Erreur serveur",
  serverMessageText: "Impossible de traiter le contrôle.",
  hintTooCloseText: "Reculez un peu",
  hintTooFarText: "Rapprochez-vous",
  hintConnectingText: "Connexion…",
  hintVerifyingText: "Vérification…",
  hintCheckCompleteText: "Contrôle terminé",
  hintIlluminationTooBrightText: "Trop lumineux",
  hintIlluminationTooDarkText: "Trop sombre",
  hintIlluminationNormalText: "Éclairage correct",
  hintHoldFaceForFreshnessText: "Restez immobile",
  hintMoveFaceFrontOfCameraText: "Placez votre visage devant la caméra",
  hintTooManyFacesText: "Assurez-vous qu’un seul visage est visible",
  hintFaceDetectedText: "Visage détecté",
  hintCanNotIdentifyText: "Placez votre visage devant la caméra",
};

export function FaceScan({ onCancel, onMatched }: FaceScanProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [region, setRegion] = useState("us-east-1");
  const [credentials, setCredentials] = useState<SessionPayload["credentials"] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const handlingError = useRef(false);
  const onMatchedRef = useRef(onMatched);
  onMatchedRef.current = onMatched;

  const startSession = useCallback(async () => {
    setLoading(true);
    setError("");
    setSessionId(null);
    setCredentials(null);

    if (!canUseCamera()) {
      setError(INSECURE_MESSAGE);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/galerie/liveness/session", { method: "POST" });
      const data = (await response.json()) as SessionPayload;
      if (!response.ok || !data.success || !data.sessionId || !data.credentials) {
        setError(data.message || "Le contrôle anti-fraude n’a pas pu démarrer. Réessayez.");
        setLoading(false);
        return;
      }
      setSessionId(data.sessionId);
      setRegion(data.region || "us-east-1");
      setCredentials(data.credentials);
      setLoading(false);
    } catch {
      setError("Le contrôle anti-fraude n’a pas pu démarrer. Réessayez.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void startSession();
  }, [attempt, startSession]);

  const credentialProvider = useCallback(async () => {
    if (!credentials) {
      throw new Error("Identifiants liveness manquants.");
    }
    return {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: credentials.expiration ? new Date(credentials.expiration) : undefined,
    };
  }, [credentials]);

  const handleAnalysisComplete = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const response = await fetch("/api/galerie/liveness/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = (await response.json()) as CompletePayload;
      if (!response.ok || !data.success) {
        setError(data.message || "Le scan n’a pas pu aboutir. Réessayez.");
        setLoading(false);
        return;
      }
      if (data.status === "not_live") {
        setError(data.message || "Nous n’avons pas pu confirmer un visage réel. Réessayez.");
        setLoading(false);
        return;
      }
      if (data.status === "matched" && Array.isArray(data.albums)) {
        onMatchedRef.current(data.albums);
        return;
      }
      onMatchedRef.current([]);
    } catch {
      setError("Le scan n’a pas pu aboutir. Réessayez.");
      setLoading(false);
    }
  }, [sessionId]);

  const handleError = useCallback(async () => {
    if (handlingError.current) return;
    handlingError.current = true;
    setAttempt((value) => value + 1);
    handlingError.current = false;
  }, []);

  return (
    <div className="galerie-scan galerie-scan--liveness" role="dialog" aria-modal="true" aria-label="Scan du visage">
      <button type="button" className="galerie-scan__back" onClick={onCancel} aria-label="Retour">
        <ChevronLeft size={28} strokeWidth={1.6} aria-hidden />
      </button>

      {error ? (
        <div className="galerie-scan__liveness-fallback">
          <p className="galerie-scan__status">{error}</p>
          <p className="galerie-scan__hint">Le contrôle vérifie que vous êtes bien présent·e devant la caméra.</p>
          <div className="galerie-scan__actions">
            <button type="button" className="galerie-access" onClick={() => setAttempt((value) => value + 1)}>
              Réessayer
            </button>
            <button type="button" className="galerie-scan__cancel" onClick={onCancel}>
              Annuler
            </button>
          </div>
        </div>
      ) : loading || !sessionId || !credentials ? (
        <div className="galerie-scan__liveness-fallback">
          <p className="galerie-scan__status">Préparation du contrôle anti-fraude…</p>
          <p className="galerie-scan__hint">Placez-vous face à la lumière, puis suivez les consignes à l’écran.</p>
          <button type="button" className="galerie-scan__cancel" onClick={onCancel}>
            Annuler
          </button>
        </div>
      ) : (
        <div className="galerie-scan__liveness-shell">
          <ThemeProvider>
            <FaceLivenessDetectorCore
              sessionId={sessionId}
              region={region}
              onAnalysisComplete={handleAnalysisComplete}
              onError={handleError}
              onUserCancel={onCancel}
              disableStartScreen={false}
              displayText={FRENCH_DISPLAY}
              config={{ credentialProvider }}
            />
          </ThemeProvider>
        </div>
      )}
    </div>
  );
}
