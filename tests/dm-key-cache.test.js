import { test, expect, afterEach } from "bun:test";
import { deriveX25519Keypair, bytesToHex } from "iqlabs-sdk/crypto";
import {
  getOrDeriveKeypair,
  clearCachedKeypair,
} from "../lib/crypto/dm-encryption";
afterEach(clearCachedKeypair);

test("same wallet reuses its key, a different wallet must derive its own", async () => {
  let aCalls = 0,
    bCalls = 0;
  const signA = async () => {
    aCalls++;
    return new Uint8Array(64).fill(11);
  };
  const signB = async () => {
    bCalls++;
    return new Uint8Array(64).fill(22);
  };
  const a = await getOrDeriveKeypair("synthetic-wallet-a", signA);
  expect(await getOrDeriveKeypair("synthetic-wallet-a", signA)).toBe(a);
  const b = await getOrDeriveKeypair("synthetic-wallet-b", signB);
  expect(b.pubHex).not.toBe(a.pubHex);
  expect(aCalls).toBe(1);
  expect(bCalls).toBe(1);
});
test("simultaneous requests share one signature prompt", async () => {
  let calls = 0;
  const sign = async () => {
    calls++;
    return new Uint8Array(64).fill(33);
  };
  const [a, b] = await Promise.all([
    getOrDeriveKeypair("synthetic-wallet", sign),
    getOrDeriveKeypair("synthetic-wallet", sign),
  ]);
  expect(a).toBe(b);
  expect(calls).toBe(1);
});
test("late old-wallet derivation cannot overwrite the new wallet cache", async () => {
  let release;
  const old = getOrDeriveKeypair(
    "old-wallet",
    () => new Promise((r) => (release = r)),
  );
  const current = await getOrDeriveKeypair("current-wallet", async () =>
    new Uint8Array(64).fill(44),
  );
  release(new Uint8Array(64).fill(55));
  await old;
  expect(
    await getOrDeriveKeypair("current-wallet", async () => {
      throw Error("must use current cache");
    }),
  ).toBe(current);
});
test("disconnect invalidates even an outstanding signature result", async () => {
  let release;
  const old = getOrDeriveKeypair(
    "wallet",
    () => new Promise((r) => (release = r)),
  );
  clearCachedKeypair();
  release(new Uint8Array(64).fill(66));
  await old;
  let calls = 0;
  await getOrDeriveKeypair("wallet", async () => {
    calls++;
    return new Uint8Array(64).fill(66);
  });
  expect(calls).toBe(1);
});
test("failed derivation can be retried", async () => {
  await expect(
    getOrDeriveKeypair("wallet", async () => {
      throw Error("rejected");
    }),
  ).rejects.toThrow("rejected");
  expect(
    (
      await getOrDeriveKeypair("wallet", async () =>
        new Uint8Array(64).fill(77),
      )
    ).pubHex,
  ).toBeTruthy();
});

test("wallet scoping preserves the existing SDK key derivation", async () => {
  const sign = async () => new Uint8Array(64).fill(88);
  const expected = await deriveX25519Keypair(sign);
  const actual = await getOrDeriveKeypair("compatibility-wallet", sign);
  expect(actual.privKey).toEqual(expected.privKey);
  expect(actual.pubHex).toBe(bytesToHex(expected.pubKey));
});
