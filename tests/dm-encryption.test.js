import { test, expect } from "bun:test";
import { deriveX25519Keypair, bytesToHex } from "iqlabs-sdk/crypto";
import {
  encryptDmPayload,
  decryptDmPayload,
} from "../lib/crypto/dm-encryption";
// Synthetic signatures only; no user wallet, credentials or network.
const makeKey = async (seed) => {
  const pair = await deriveX25519Keypair(async () =>
    new Uint8Array(64).fill(seed),
  );
  return { ...pair, hex: bytesToHex(pair.pubKey) };
};
test("sender and recipient recover exact JSON; unrelated key cannot", async () => {
  const [a, b, c] = await Promise.all([makeKey(1), makeKey(2), makeKey(3)]);
  const row = { id: "local-test", text: "private-message-fixture" };
  const encrypted = await encryptDmPayload(a.hex, b.hex, JSON.stringify(row));
  expect(encrypted).not.toContain(row.text);
  expect(await decryptDmPayload(a.privKey, a.hex, encrypted)).toEqual(row);
  expect(await decryptDmPayload(b.privKey, b.hex, encrypted)).toEqual(row);
  expect(await decryptDmPayload(c.privKey, c.hex, encrypted)).toBeNull();
});
test("ciphertext tampering fails authentication", async () => {
  const [a, b] = await Promise.all([makeKey(4), makeKey(5)]);
  const envelope = JSON.parse(await encryptDmPayload(a.hex, b.hex, "test"));
  envelope.c = (envelope.c[0] === "0" ? "1" : "0") + envelope.c.slice(1);
  expect(
    await decryptDmPayload(b.privKey, b.hex, JSON.stringify(envelope)),
  ).toBeNull();
});
test("plain-string payload remains compatible and malformed envelopes fail", async () => {
  const [a, b] = await Promise.all([makeKey(6), makeKey(7)]);
  const encrypted = await encryptDmPayload(a.hex, b.hex, "hello");
  expect(await decryptDmPayload(b.privKey, b.hex, encrypted)).toEqual({
    text: "hello",
  });
  expect(
    await decryptDmPayload(b.privKey, b.hex, '{"m":"dm","r":[]}'),
  ).toBeNull();
});
