type VdoCipherOtpResponse = {
  otp?: string;
  playbackInfo?: string;
  error?: string;
};

export async function getVdoCipherOtp() {
  const videoId = process.env.VDOCIPHER_VIDEO_ID;
  const apiSecret = process.env.VDOCIPHER_API_SECRET;

  if (!videoId || !apiSecret) {
    throw new Error("Configuration VdoCipher manquante");
  }

  const response = await fetch(
    `https://dev.vdocipher.com/api/videos/${videoId}/otp`,
    {
      method: "POST",
      headers: {
        Authorization: `Apisecret ${apiSecret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ttl: 300 }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`VdoCipher HTTP ${response.status}`);
  }

  const data = (await response.json()) as VdoCipherOtpResponse;

  if (!data.otp || !data.playbackInfo) {
    throw new Error("Impossible de récupérer les informations de lecture vidéo.");
  }

  return { otp: data.otp, playbackInfo: data.playbackInfo };
}
