import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acotar, dentroDeVentana, esperaEntreEnvios, extraerContenido, sitioValido, soloDigitos, usuarioDeJid,
} from "../src/util.js";

test("sitio válido solo con letras, números, guion y guion bajo", () => {
  assert.ok(sitioValido("default"));
  assert.ok(sitioValido("sitio_pakalna"));
  assert.ok(!sitioValido("../etc"));
  assert.ok(!sitioValido(""));
});

test("números y JIDs", () => {
  assert.equal(soloDigitos("+52 916 163 2304"), "529161632304");
  assert.equal(usuarioDeJid("5219161234567:12@s.whatsapp.net"), "5219161234567");
  assert.equal(usuarioDeJid("123456789@lid"), "123456789");
});

test("ventana de 24 h", () => {
  const ahora = 1_000_000_000_000;
  assert.ok(dentroDeVentana({ ultimo_entrante: ahora - 60_000 }, ahora));
  assert.ok(!dentroDeVentana({ ultimo_entrante: ahora - 25 * 3600_000 }, ahora));
  assert.ok(!dentroDeVentana(undefined, ahora));
});

test("texto, ubicación y adjuntos", () => {
  assert.deepEqual(extraerContenido({ conversation: "Hola" }), { texto: "Hola" });
  assert.deepEqual(extraerContenido({ extendedTextMessage: { text: "Taxi" } }), { texto: "Taxi" });
  const loc = extraerContenido({ locationMessage: { degreesLatitude: 17.51, degreesLongitude: -91.98, name: "Parque" } });
  assert.equal(loc.lat, 17.51);
  assert.equal(loc.lng, -91.98);
  assert.match(loc.texto, /Parque/);
  assert.deepEqual(extraerContenido({ audioMessage: {} }), { texto: "[Nota de voz]" });
  assert.equal(extraerContenido({ reactionMessage: { text: "👍" } }), null);
  assert.equal(extraerContenido(undefined), null);
});

test("espera entre envíos y acotar", () => {
  assert.equal(esperaEntreEnvios(0, 10_000, 0), 0);
  assert.equal(esperaEntreEnvios(10_000, 10_000, 0), 3000);
  assert.equal(esperaEntreEnvios(10_000, 10_000, 1), 4500);
  assert.equal(acotar("9000", 800, 4000, 2000), 4000);
  assert.equal(acotar("x", 800, 4000, 2000), 2000);
});
