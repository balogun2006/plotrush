import type { Mailer } from "../domain/accounts";
export function localAdaptersAllowed(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return true;
  try {
    return (
      env.APP_MODE === "test" &&
      new URL(env.APP_URL ?? "").hostname === "127.0.0.1" &&
      new URL(env.DATABASE_URL ?? "").hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}
export function emailConfig() {
  const local = localAdaptersAllowed();
  const live =
    process.env.FEATURE_EMAIL_AUTH === "true" &&
    process.env.EMAIL_PROVIDER === "resend" &&
    /^re_[A-Za-z0-9_\-]{16,}$/.test(process.env.RESEND_API_KEY ?? "") &&
    !!process.env.EMAIL_FROM &&
    !!process.env.AUTH_CODE_SECRET &&
    process.env.AUTH_CODE_SECRET.length >= 32;
  return { available: live || local, development: local && !live };
}
export function authSecret() {
  return (
    process.env.AUTH_CODE_SECRET ??
    (localAdaptersAllowed()
      ? "local-development-auth-secret-not-for-deployment"
      : "")
  );
}
export function mailer(onDevelopmentCode: (code: string) => void): Mailer {
  const config = emailConfig();
  if (!config.available)
    throw new Error("Email authentication is not configured");
  return {
    send: async (message) => {
      if (config.development) {
        onDevelopmentCode(message.code);
        return;
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: "Bearer " + process.env.RESEND_API_KEY,
          "Content-Type": "application/json",
          "Idempotency-Key": "auth/" + message.challengeId,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [message.to],
          subject: "Your PlotRush sign-in code",
          text: `Your PlotRush code is ${message.code}. It expires in 10 minutes. Only enter it on PlotRush. If you did not request this, ignore this email.`,
        }),
      });
      if (!response.ok) throw new Error("Email delivery failed");
    },
  };
}
