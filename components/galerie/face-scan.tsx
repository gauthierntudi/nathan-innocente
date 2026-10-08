"use client";

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
    hint: "Tenez-vous face à la lumière, sans lunettes de soleil.",
  },
  found: {
    title: "Visage détecté",
    hint: "Restez immobile un instant.",
  },
  search: {
    title: "Recherche dans les albums…",
    hint: "Comparaison en cours, sans enregistrement du visage.",
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

function stepIndex(status: ScanStatus) {
  if (status === "prepare") return 0;
  if (status === "place" || status === "found") return 1;
  if (status === "search") return 2;
  return -1;
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

  const step = stepIndex(status);
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
      <div className="galerie-scan__glow" aria-hidden />

      <header className="galerie-scan__header">
        <p className="galerie-scan__eyebrow">Nathan & Innocente · 2026</p>
        <h2 id="galerie-scan-title" className="galerie-scan__title">
          Retrouvez-vous
        </h2>
      </header>

      <ol className="galerie-scan__steps" aria-label="Étapes du scan">
        {["Caméra", "Visage", "Albums"].map((label, index) => (
          <li
            key={label}
            className={
              step < 0
                ? undefined
                : index < step
                  ? "galerie-scan__step--done"
                  : index === step
                    ? "galerie-scan__step--active"
                    : undefined
            }
          >
            <span className="galerie-scan__step-dot" aria-hidden />
            <span className="galerie-scan__step-label">{label}</span>
          </li>
        ))}
      </ol>

      <div className={`galerie-scan__stage galerie-scan__stage--${frameState}`}>
        <div className="galerie-scan__ring" aria-hidden />
        <div className="galerie-scan__frame">
          <video ref={videoRef} className="galerie-scan__video" playsInline muted autoPlay />
          <div className="galerie-scan__vignette" aria-hidden />
          <div className="galerie-scan__sweep" aria-hidden />
        </div>
      </div>

      <div className="galerie-scan__copy" role="status">
        {status === "error" ? (
          <>
            <p className="galerie-scan__status galerie-scan__status--error">{error}</p>
            <p className="galerie-scan__hint">Vérifiez la caméra, puis réessayez.</p>
          </>
        ) : (
          <>
            <p className="galerie-scan__status">{copy?.title}</p>
            <p className="galerie-scan__hint">{copy?.hint}</p>
          </>
        )}
      </div>

      <p className="galerie-scan__note">
        Comparaison sécurisée · le visage n’est pas enregistré
      </p>

      <div className="galerie-scan__actions">
        {status === "error" ? (
          <button
            type="button"
            className="galerie-access"
            onClick={() => setRetryCamera(canUseCamera() ? requestUserCamera() : null)}
          >
            Réessayer
          </button>
        ) : null}
        <button type="button" className="galerie-scan__cancel" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}
