"use client";

import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { MatchedAlbum } from "@/lib/galerie/content";

type FaceScanProps = {
  onCancel: () => void;
  onMatched: (albums: MatchedAlbum[]) => void;
  camera: Promise<MediaStream> | null;
};

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: "user",
    width: { ideal: 720 },
    height: { ideal: 960 },
  },
};

export function canUseCamera() {
  return window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === "function";
}

export function requestUserCamera() {
  return navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
}

const INSECURE_CAMERA_MESSAGE =
  "La caméra est bloquée sur cette adresse http. Le téléphone n’autorise le scan qu’en https.";

type ScanStatus = "prepare" | "place" | "found" | "search" | "error";

type SearchPayload = {
  success?: boolean;
  status?: "no_face" | "matched";
  albums?: MatchedAlbum[];
  message?: string;
};

const STATUS_COPY: Record<Exclude<ScanStatus, "error">, { title: string; hint: string }> = {
  prepare: {
    title: "Ouverture de la caméra…",
    hint: "Autorisez l’accès si le téléphone le demande.",
  },
  place: {
    title: "Placez votre visage dans l’ovale",
    hint: "Tenez le téléphone à hauteur des yeux, comme pour une photo d’identité.",
  },
  found: {
    title: "Visage détecté",
    hint: "Restez immobile un instant.",
  },
  search: {
    title: "Recherche dans les albums…",
    hint: "Comparaison en cours. Le visage n’est pas enregistré.",
  },
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function captureJpeg(video: HTMLVideoElement) {
  const maxSide = 720;
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("canvas"));
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("jpeg"))),
      "image/jpeg",
      0.82,
    );
  });
}

function browserFaceDetector() {
  const scope = window as Window & {
    FaceDetector?: new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
      detect: (source: CanvasImageSource) => Promise<unknown[]>;
    };
  };
  if (!scope.FaceDetector) return null;
  try {
    return new scope.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
  } catch {
    return null;
  }
}

function cameraErrorMessage(cause: unknown) {
  if (!canUseCamera()) return INSECURE_CAMERA_MESSAGE;
  const name = cause instanceof DOMException ? cause.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Autorisez la caméra pour retrouver vos photos.";
  }
  if (name === "NotFoundError" || name === "NotReadableError") {
    return "Aucune caméra n’est disponible sur cet appareil.";
  }
  return "Le scan n’a pas pu démarrer. Réessayez.";
}

export function FaceScan({ onCancel, onMatched, camera }: FaceScanProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<ScanStatus>("prepare");
  const [error, setError] = useState("");
  const [retryCamera, setRetryCamera] = useState<Promise<MediaStream> | null | undefined>(undefined);
  const activeCamera = retryCamera === undefined ? camera : retryCamera;

  const onMatchedRef = useRef(onMatched);
  onMatchedRef.current = onMatched;

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const video: HTMLVideoElement = element;

    const abort = new AbortController();
    let cancelled = false;
    let scanning = true;
    let stream: MediaStream | null = null;

    const stopStream = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      if (video.srcObject) video.srcObject = null;
    };

    async function finish(albums: MatchedAlbum[]) {
      scanning = false;
      stopStream();
      onMatchedRef.current(albums);
    }

    async function loop() {
      const detector = browserFaceDetector();

      while (scanning && !cancelled) {
        if (video.readyState < 2 || video.videoWidth === 0) {
          await wait(280);
          continue;
        }

        if (detector) {
          try {
            const faces = await detector.detect(video);
            if (!scanning || cancelled) return;
            if (faces.length === 0) {
              setStatus("place");
              await wait(320);
              continue;
            }
            setStatus("found");
          } catch {
            // La comparaison Rekognition tranche si le détecteur local échoue.
          }
        }

        const slowTimer = window.setTimeout(() => {
          if (scanning) setStatus("search");
        }, 700);

        try {
          const blob = await captureJpeg(video);
          if (!scanning || cancelled) return;
          const response = await fetch("/api/galerie/search", {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body: blob,
            signal: abort.signal,
          });
          const data = (await response.json()) as SearchPayload;
          if (!scanning || cancelled) return;

          if (response.status === 429) {
            setStatus("place");
            await wait(1600);
            continue;
          }

          if (!response.ok || !data.success) {
            setStatus("error");
            setError(data.message || "Le scan n’a pas pu aboutir. Réessayez.");
            stopStream();
            return;
          }

          if (data.status === "matched" && Array.isArray(data.albums)) {
            setStatus("search");
            await finish(data.albums);
            return;
          }

          setStatus("place");
        } catch (cause) {
          if (cancelled || (cause instanceof DOMException && cause.name === "AbortError")) return;
          setStatus("error");
          setError("Le scan n’a pas pu aboutir. Réessayez.");
          stopStream();
          return;
        } finally {
          window.clearTimeout(slowTimer);
        }

        await wait(450);
      }
    }

    async function start() {
      setStatus("prepare");
      setError("");
      if (!activeCamera) {
        setStatus("error");
        setError(INSECURE_CAMERA_MESSAGE);
        return;
      }
      try {
        const nextStream = await activeCamera;

        if (cancelled) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }

        stream = nextStream;
        video.srcObject = stream;
        await video.play();
        setStatus("place");
        void loop();
      } catch (cause) {
        if (cancelled) return;
        setStatus("error");
        setError(cameraErrorMessage(cause));
      }
    }

    void start();

    return () => {
      cancelled = true;
      scanning = false;
      abort.abort();
      stopStream();
    };
  }, [activeCamera]);

  const copy = status === "error" ? null : STATUS_COPY[status];
  const frameState =
    status === "found" ? "found" : status === "search" ? "search" : status === "error" ? "error" : "idle";

  return (
    <div
      className={`galerie-scan galerie-scan--${frameState}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="galerie-scan-title"
    >
      <video ref={videoRef} className="galerie-scan__video" playsInline muted autoPlay />

      <div className={`galerie-scan__guide galerie-scan__guide--${frameState}`} aria-hidden>
        <div className="galerie-scan__oval">
          <span className="galerie-scan__cutout" />
          <span className="galerie-scan__cross galerie-scan__cross--v" />
          <span className="galerie-scan__cross galerie-scan__cross--h" />
        </div>
      </div>

      <button type="button" className="galerie-scan__back" onClick={onCancel} aria-label="Retour">
        <ChevronLeft size={28} strokeWidth={1.6} aria-hidden />
      </button>

      <div className="galerie-scan__footer">
        <div className="galerie-scan__copy" role="status">
          <h2 id="galerie-scan-title" className="galerie-scan__status">
            {status === "error" ? error : copy?.title}
          </h2>
          <p className="galerie-scan__hint">
            {status === "error" ? "Vérifiez la caméra, puis réessayez." : copy?.hint}
          </p>
        </div>

        <div className="galerie-scan__actions">
          {status === "error" ? (
            <button
              type="button"
              className="galerie-access"
              onClick={() => setRetryCamera(canUseCamera() ? requestUserCamera() : null)}
            >
              Réessayer
            </button>
          ) : (
            <p className="galerie-scan__note">Comparaison sécurisée · non enregistré</p>
          )}
        </div>
      </div>
    </div>
  );
}
