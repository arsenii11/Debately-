let cachedKey: string | null = null;
let cachedResource: string | null = null;

/**
 * Resolves the Gemini API key:
 * 1) `GEMINI_API_KEY` — local dev, Vercel env, etc.
 * 2) `GEMINI_API_KEY_SECRET_RESOURCE` — full Secret Manager resource name
 *    (`projects/PROJECT_ID/secrets/SECRET_ID/versions/latest`).
 *    Requires ADC: run `gcloud auth application-default login` locally, or
 *    attach a service account on Cloud Run / GKE (set `GOOGLE_APPLICATION_CREDENTIALS` if needed).
 */
export async function resolveGeminiApiKey(): Promise<string> {
  const direct = process.env.GEMINI_API_KEY?.trim();
  if (direct) return direct;

  const resource = process.env.GEMINI_API_KEY_SECRET_RESOURCE?.trim();
  if (!resource) {
    throw new Error(
      "Missing GEMINI_API_KEY (or GEMINI_API_KEY_SECRET_RESOURCE for Google Secret Manager).",
    );
  }

  if (cachedKey && cachedResource === resource) return cachedKey;

  const { SecretManagerServiceClient } = await import(
    "@google-cloud/secret-manager"
  );
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({ name: resource });
  const raw = version.payload?.data;
  const text =
    typeof raw === "string" ? raw : raw != null ? raw.toString("utf8") : "";
  const key = text.trim();
  if (!key) {
    throw new Error("Secret Manager returned an empty payload for Gemini API key.");
  }

  cachedKey = key;
  cachedResource = resource;
  return key;
}
