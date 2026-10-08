"use client";

import { FaceLivenessDetectorCore } from "@aws-amplify/ui-react-liveness";
import { ThemeProvider, type Theme } from "@aws-amplify/ui-react";
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  status?: "not_live" | "session_failed" | "no_face" | "matched";
  albums?: MatchedAlbum[];
  message?: string;
};

type Phase = "loading" | "ready" | "checking" | "verifying" | "error";

const INSECURE_MESSAGE =
  "La caméra est bloquée sur cette adresse http. Le téléphone n’autorise le scan qu’en https.";

const FRENCH_DISPLAY = {
  photosensitivityWarningHeadingText: "Lumières colorées",
  photosensitivityWarningBodyText:
    "Le contrôle fait brièvement clignoter l’écran. Évitez si vous êtes photosensible.",
  photosensitivityWarningInfoText: "Sensibilité aux lumières colorées",
  photosensitivityWarningLabelText: "Info",
  goodFitCaptionText: "Bon cadrage",
  tooFarCaptionText: "Trop loin",
  hintCenterFaceText: "Centrez votre visage",
  hintCenterFaceInstructionText:
    "Placez votre visage dans l’ovale, puis restez immobile.",
  hintFaceOffCenterText: "Recadrez votre visage au centre",
  startScreenBeginCheckText: "Commencer",
  cancelLivenessCheckText: "Fermer",
  waitingCameraPermissionText: "Autorisation caméra…",
  retryCameraPermissionsText: "Réessayer",
  errorCameraMissingText: "Aucune caméra disponible.",
  errorCameraAccessText: "Autorisez la caméra pour continuer.",
  errorLandscapeModeText: "Passez en mode portrait.",
  timeoutHeaderText: "Temps écoulé",
  timeoutMessageText: "Gardez le visage dans l’ovale un peu plus longtemps.",
  faceDistanceHeaderText: "Un peu plus près",
  faceDistanceMessageText: "Rapprochez-vous pour remplir l’ovale.",
  multipleFacesHeaderText: "Plusieurs visages",
  multipleFacesMessageText: "Une seule personne devant la caméra, merci.",
  clientHeaderText: "Contrôle interrompu",
  clientMessageText: "Réessayez dans un instant.",
  serverHeaderText: "Connexion impossible",
  serverMessageText: "Le serveur n’a pas pu finaliser le contrôle.",
  hintTooCloseText: "Reculez un peu",
  hintTooFarText: "Rapprochez-vous",
  hintConnectingText: "Connexion…",
  hintVerifyingText: "Vérification…",
  hintCheckCompleteText: "Terminé",
  hintIlluminationTooBrightText: "Trop lumineux",
  hintIlluminationTooDarkText: "Trop sombre",
  hintIlluminationNormalText: "Éclairage correct",
  hintHoldFaceForFreshnessText: "Restez immobile",
  hintMoveFaceFrontOfCameraText: "Placez-vous face à la caméra",
  hintTooManyFacesText: "Un seul visage, merci",
  hintFaceDetectedText: "Visage détecté",
  hintCanNotIdentifyText: "Placez-vous face à la caméra",
};

const LIVENESS_THEME: Theme = {
  name: "galerie-liveness",
  tokens: {
    colors: {
      background: {
        primary: { value: "#080c0b" },
        secondary: { value: "#101412" },
        tertiary: { value: "#161b19" },
      },
      font: {
        primary: { value: "#f4efe6" },
        secondary: { value: "rgba(244,239,230,0.72)" },
        inverse: { value: "#1a221e" },
        tertiary: { value: "rgba(244,239,230,0.55)" },
      },
      border: {
        primary: { value: "rgba(221,203,179,0.28)" },
        secondary: { value: "rgba(221,203,179,0.16)" },
      },
      brand: {
        primary: {
          10: { value: "#2a2218" },
          20: { value: "#3d3226" },
          40: { value: "#8a7358" },
          60: { value: "#c4a882" },
          80: { value: "#ddcbb3" },
          90: { value: "#e8dcc9" },
          100: { value: "#f4efe6" },
        },
      },
      overlay: {
        10: { value: "rgba(8,12,11,0.1)" },
        20: { value: "rgba(8,12,11,0.2)" },
        40: { value: "rgba(8,12,11,0.45)" },
        50: { value: "rgba(8,12,11,0.55)" },
        60: { value: "rgba(8,12,11,0.7)" },
        70: { value: "rgba(8,12,11,0.82)" },
        80: { value: "rgba(8,12,11,0.9)" },
        90: { value: "rgba(8,12,11,0.96)" },
      },
    },
    fonts: {
      default: {
        variable: { value: '"Source Sans 3", system-ui, sans-serif' },
        static: { value: '"Source Sans 3", system-ui, sans-serif' },
      },
    },
    radii: {
      small: { value: "0.65rem" },
      medium: { value: "1rem" },
      large: { value: "1.35rem" },
      xl: { value: "999px" },
    },
  },
};

function PhotosensitivityNote() {
  return (
    <p className="galerie-scan__photo-note">
      L’écran clignote brièvement pendant le contrôle. Évitez si vous êtes photosensible.
    </p>
  );
}

export function FaceScan({ onCancel, onMatched }: FaceScanProps) {
  const [portalReady, setPortalReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [region, setRegion] = useState("us-east-1");
  const [credentials, setCredentials] = useState<SessionPayload["credentials"] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const handlingError = useRef(false);
  const onMatchedRef = useRef(onMatched);
  onMatchedRef.current = onMatched;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const startSession = useCallback(async () => {
    setPhase("loading");
    setError("");
    setSessionId(null);
    setCredentials(null);

    if (!canUseCamera()) {
      setError(INSECURE_MESSAGE);
      setPhase("error");
      return;
    }

    try {
      const response = await fetch("/api/galerie/liveness/session", { method: "POST" });
      const data = (await response.json()) as SessionPayload;
      if (!response.ok || !data.success || !data.sessionId || !data.credentials) {
        setError(data.message || "Le contrôle anti-fraude n’a pas pu démarrer. Réessayez.");
        setPhase("error");
        return;
      }
      setSessionId(data.sessionId);
      setRegion(data.region || "us-east-1");
      setCredentials(data.credentials);
      setPhase("ready");
    } catch {
      setError("Le contrôle anti-fraude n’a pas pu démarrer. Réessayez.");
      setPhase("error");
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
    setPhase("verifying");
    try {
      const response = await fetch("/api/galerie/liveness/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = (await response.json()) as CompletePayload;
      if (!response.ok || !data.success) {
        setError(data.message || "Le scan n’a pas pu aboutir. Réessayez.");
        setPhase("error");
        return;
      }
      if (data.status === "not_live" || data.status === "session_failed") {
        setError(
          data.message ||
            "Nous n’avons pas pu confirmer un visage réel. Réessayez face à la lumière.",
        );
        setPhase("error");
        return;
      }
      if (data.status === "matched" && Array.isArray(data.albums)) {
        onMatchedRef.current(data.albums);
        return;
      }
      onMatchedRef.current([]);
    } catch {
      setError("Le scan n’a pas pu aboutir. Réessayez.");
      setPhase("error");
    }
  }, [sessionId]);

  const handleError = useCallback(() => {
    if (handlingError.current) return;
    handlingError.current = true;
    setError("Le contrôle caméra a été interrompu. Réessayez.");
    setPhase("error");
    handlingError.current = false;
  }, []);

  const livenessComponents = useMemo(
    () => ({
      PhotosensitiveWarning: PhotosensitivityNote,
      CancelButton: null,
    }),
    [],
  );

  if (!portalReady) return null;

  return createPortal(
    <div className="galerie-scan galerie-scan--liveness" role="dialog" aria-modal="true" aria-label="Scan du visage">
      <button type="button" className="galerie-scan__back" onClick={onCancel} aria-label="Retour">
        <ChevronLeft size={28} strokeWidth={1.6} aria-hidden />
      </button>

      {phase === "error" ? (
        <div className="galerie-scan__stage">
          <p className="galerie-scan__eyebrow">Galerie</p>
          <h2 className="galerie-scan__title">Contrôle interrompu</h2>
          <p className="galerie-scan__status">{error}</p>
          <p className="galerie-scan__hint">Lumière douce, téléphone en portrait, visage centré.</p>
          <div className="galerie-scan__actions">
            <button type="button" className="galerie-access" onClick={() => setAttempt((value) => value + 1)}>
              Réessayer
            </button>
            <button type="button" className="galerie-scan__cancel" onClick={onCancel}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {phase === "loading" || phase === "verifying" ? (
        <div className="galerie-scan__stage">
          <div className="galerie-scan__pulse" aria-hidden />
          <p className="galerie-scan__eyebrow">Nathan & Innocente</p>
          <h2 className="galerie-scan__title">
            {phase === "verifying" ? "Recherche de vos photos" : "Préparation"}
          </h2>
          <p className="galerie-scan__hint">
            {phase === "verifying"
              ? "Nous vérifions votre présence, puis vos albums…"
              : "Quelques secondes avant le contrôle anti-fraude."}
          </p>
          <button type="button" className="galerie-scan__cancel" onClick={onCancel}>
            Annuler
          </button>
        </div>
      ) : null}

      {phase === "ready" ? (
        <div className="galerie-scan__stage galerie-scan__stage--ready">
          <div className="galerie-scan__oval-preview" aria-hidden>
            <span className="galerie-scan__oval-ring" />
          </div>
          <p className="galerie-scan__eyebrow">Accès galerie</p>
          <h2 className="galerie-scan__title">Scan du visage</h2>
          <p className="galerie-scan__lead">
            Placez-vous face à une lumière douce. L’écran clignotera un instant pour confirmer
            que vous êtes bien présent·e.
          </p>
          <ul className="galerie-scan__tips">
            <li>Téléphone en portrait</li>
            <li>Visage centré, sans lunettes trop sombres</li>
            <li>Une seule personne devant la caméra</li>
          </ul>
          <button type="button" className="galerie-access" onClick={() => setPhase("checking")}>
            Commencer
          </button>
          <button type="button" className="galerie-scan__cancel" onClick={onCancel}>
            Annuler
          </button>
        </div>
      ) : null}

      {phase === "checking" && sessionId && credentials ? (
        <div className="galerie-scan__liveness-shell">
          <ThemeProvider theme={LIVENESS_THEME} colorMode="dark">
            <FaceLivenessDetectorCore
              sessionId={sessionId}
              region={region}
              onAnalysisComplete={handleAnalysisComplete}
              onError={handleError}
              onUserCancel={onCancel}
              disableStartScreen
              displayText={FRENCH_DISPLAY}
              components={livenessComponents}
              config={{ credentialProvider }}
            />
          </ThemeProvider>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
