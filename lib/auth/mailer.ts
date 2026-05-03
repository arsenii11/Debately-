type VerificationMail = {
  to: string;
  code: string;
};

function verificationText(code: string): string {
  return [
    `Your Debately verification code is ${code}.`,
    "",
    "It expires in 10 minutes. If you did not request it, you can ignore this email.",
  ].join("\n");
}

export async function sendVerificationEmail({
  to,
  code,
}: VerificationMail): Promise<void> {
  const subject = "Your Debately login code";
  const text = verificationText(code);
  const webhookUrl = process.env.AUTH_EMAIL_WEBHOOK_URL?.trim();

  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.AUTH_EMAIL_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.AUTH_EMAIL_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        to,
        subject,
        text,
        html: `<p>Your Debately verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
      }),
    });
    if (!res.ok) {
      throw new Error(`Email provider failed with ${res.status}.`);
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_EMAIL_WEBHOOK_URL must be set to send verification email.");
  }

  console.info(`[Debately auth] Verification code for ${to}: ${code}`);
  console.info(`[Debately auth] ${subject}\n${text}`);
}

