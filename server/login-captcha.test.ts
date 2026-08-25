import { describe, expect, it } from "vitest";
import { createLoginCaptcha, verifyLoginCaptcha } from "../shared/login-captcha";

describe("captcha do login", () => {
  it("aceita somente a resposta correta de um token íntegro", () => {
    const captcha = createLoginCaptcha();
    const [left, right] = captcha.question.match(/\d+/g)!.map(Number);
    expect(verifyLoginCaptcha(captcha.token, String(left + right))).toBe(true);
    expect(verifyLoginCaptcha(captcha.token, String(left + right + 1))).toBe(false);
    expect(verifyLoginCaptcha(`${captcha.token}x`, String(left + right))).toBe(false);
  });
});
