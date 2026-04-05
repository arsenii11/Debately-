/** Runs once when the Node server starts (see Next.js instrumentation). */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const hasKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasSecret = Boolean(process.env.GEMINI_API_KEY_SECRET_RESOURCE?.trim());
  console.log(
    `[debately:boot] GEMINI_API_KEY=${hasKey ? "set" : "MISSING"} GEMINI_API_KEY_SECRET_RESOURCE=${hasSecret ? "set" : "MISSING"}`,
  );
}
