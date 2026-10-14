import { beforeEach, test, expect, mock } from "bun:test";
const rpc = {
  rows: mock(async () => ["rpc"]),
  sigs: mock(async () => ["rpc"]),
  connections: mock(async () => ["rpc"]),
};
mock.module("iqlabs-sdk", () => ({
  default: {
    reader: {
      readTableRows: rpc.rows,
      collectSignatures: rpc.sigs,
      fetchUserConnections: rpc.connections,
    },
  },
}));
const { readTableRows, getSignaturesForTable, getUserConnections } =
  await import("../lib/gateway/reader");
let payload;
let ok = true;
const urls = [];
globalThis.fetch = mock(async (input) => {
  urls.push(String(input));
  return new Response(JSON.stringify(payload), { status: ok ? 200 : 503 });
});
beforeEach(() => {
  payload = { rows: [] };
  ok = true;
  urls.length = 0;
  for (const f of Object.values(rpc)) f.mockClear();
});
test("empty table envelope stays on gateway", async () => {
  expect(await readTableRows("table")).toEqual([]);
  expect(rpc.rows).not.toHaveBeenCalled();
});
test("empty table array stays on gateway", async () => {
  payload = [];
  expect(await readTableRows("table")).toEqual([]);
  expect(rpc.rows).not.toHaveBeenCalled();
});
test("real rows pass through without RPC", async () => {
  payload = { rows: [{ id: "one" }] };
  expect(await readTableRows("table")).toEqual([{ id: "one" }]);
  expect(rpc.rows).not.toHaveBeenCalled();
});
test("malformed row response falls back instead of claiming an empty room", async () => {
  payload = { error: "bad" };
  expect(await readTableRows("table")).toEqual(["rpc"]);
  expect(rpc.rows).toHaveBeenCalledTimes(1);
});
test("empty signature index is valid and preserves the cursor request", async () => {
  payload = { signatures: [] };
  expect(await getSignaturesForTable("table", 20, "previous")).toEqual([]);
  expect(urls[0]).toContain("before=previous");
  expect(rpc.sigs).not.toHaveBeenCalled();
});
test("gateway failure attempts each distinct default only once before RPC", async () => {
  ok = false;
  expect(await readTableRows("table")).toEqual(["rpc"]);
  expect(urls).toHaveLength(1);
  expect(rpc.rows).toHaveBeenCalledTimes(1);
});
test("malformed connections response falls back, valid empty does not", async () => {
  payload = { error: "bad" };
  expect(await getUserConnections("owner")).toEqual(["rpc"]);
  payload = [];
  expect(await getUserConnections("owner")).toEqual([]);
  expect(rpc.connections).toHaveBeenCalledTimes(1);
});
