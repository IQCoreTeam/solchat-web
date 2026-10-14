import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import vm from "node:vm";
import { WebSocketServer, WebSocket } from "ws";

test("actual notification relay sends snapshots, fan-out updates and honors unsubscribe locally", async () => {
  const source = readFileSync(
    new URL("../noti-server.ts", import.meta.url),
    "utf8",
  );
  const importLine = 'import { WebSocketServer, WebSocket } from "ws";';
  expect(source).toContain(importLine);
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(importLine, ""),
  );
  // Reuse the actual server implementation with only its listener isolated.
  const server = vm.runInNewContext(javascript + ";wss;", {
    WebSocketServer: class extends WebSocketServer {
      constructor(options) {
        super({ ...options, host: "127.0.0.1", port: 0 });
      }
    },
    WebSocket,
    console: { log() {}, warn() {} },
    Map,
    Set,
    Date,
  });
  const clients = [];
  const nextMessage = async (client) =>
    JSON.parse(String((await once(client, "message"))[0]));
  try {
    await once(server, "listening");
    const url = `ws://127.0.0.1:${server.address().port}`;
    for (let i = 0; i < 2; i++) {
      const client = new WebSocket(url);
      clients.push(client);
      await once(client, "open");
      const snapshot = nextMessage(client);
      client.send(
        JSON.stringify({ type: "subscribe", roomId: "local-qa-only" }),
      );
      expect(await snapshot).toMatchObject({
        type: "roomSnapshot",
        roomId: "local-qa-only",
        lastTimestamp: 0,
      });
    }
    const updates = clients.map(nextMessage);
    clients[0].send(
      JSON.stringify({
        type: "messageSent",
        roomId: "local-qa-only",
        timestamp: 123,
        signature: "synthetic-not-a-chain-transaction",
      }),
    );
    for (const update of await Promise.all(updates))
      expect(update).toMatchObject({
        type: "roomUpdated",
        lastTimestamp: 123,
        signature: "synthetic-not-a-chain-transaction",
      });
    clients[1].send(
      JSON.stringify({ type: "unsubscribe", roomId: "local-qa-only" }),
    );
    let pong = nextMessage(clients[1]);
    clients[1].send('{"type":"ping"}');
    expect(await pong).toEqual({ type: "pong" });
    const remainingUpdate = nextMessage(clients[0]);
    clients[0].send(
      JSON.stringify({
        type: "messageSent",
        roomId: "local-qa-only",
        timestamp: 124,
      }),
    );
    expect(await remainingUpdate).toMatchObject({
      type: "roomUpdated",
      lastTimestamp: 124,
    });
    pong = nextMessage(clients[1]);
    clients[1].send('{"type":"ping"}');
    expect(await pong).toEqual({ type: "pong" });
  } finally {
    for (const client of clients) client.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});
