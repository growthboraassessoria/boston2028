import { expect, test } from "@playwright/test";
import { maskDuration, parseDuration } from "../../src/lib/domain/time";

// Celular abre o teclado só de números: o campo monta h:mm:ss sozinho (pedido do Lucas, 24/11/2026).
test("tempo: só números viram h:mm:ss, da direita para a esquerda", () => {
  expect(maskDuration("3")).toBe("3");
  expect(maskDuration("31")).toBe("31");
  expect(maskDuration("312")).toBe("3:12");
  expect(maskDuration("3123")).toBe("31:23");
  expect(maskDuration("31230")).toBe("3:12:30");
  expect(maskDuration("031230")).toBe("03:12:30");
  expect(maskDuration("1845")).toBe("18:45");
  expect(maskDuration("3123099")).toBe("31:23:09"); // no máximo 6 números
});

test("tempo: colar ou digitar com dois-pontos dá o mesmo resultado, e o valor é lido certo", () => {
  expect(maskDuration("3:12:30")).toBe("3:12:30");
  expect(maskDuration("3h12m30s")).toBe("3:12:30");
  expect(maskDuration("")).toBe("");
  expect(parseDuration(maskDuration("31230"))).toEqual({ ok: true, seconds: 3 * 3600 + 12 * 60 + 30 });
  expect(parseDuration(maskDuration("13240"))).toEqual({ ok: true, seconds: 3600 + 32 * 60 + 40 });
  expect(parseDuration(maskDuration("1845"))).toEqual({ ok: true, seconds: 18 * 60 + 45 });
  expect(parseDuration(maskDuration("37500"))).toEqual({ ok: false, error: "Minutos e segundos vão de 00 a 59." });
});
