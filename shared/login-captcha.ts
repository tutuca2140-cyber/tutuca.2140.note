import crypto from "node:crypto";

const secret = () => process.env.JWT_SECRET || "note-note-preview-captcha";

export function createLoginCaptcha() {
  const left = crypto.randomInt(1, 10);
  const right = crypto.randomInt(1, 10);
  const payload = Buffer.from(JSON.stringify({
    answer: left + right,
    expiresAt: Date.now() + 5 * 60 * 1000,
    nonce: crypto.randomBytes(12).toString("hex"),
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return { question: `${left} + ${right} = ?`, token: `${payload}.${signature}` };
}

export function verifyLoginCaptcha(token: string, answer: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { answer: number; expiresAt: number };
    return parsed.expiresAt >= Date.now() && Number(answer) === parsed.answer;
  } catch {
    return false;
  }
}
