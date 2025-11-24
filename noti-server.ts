import { WebSocketServer, WebSocket } from 'ws';

type RoomId = string;

type RoomState = {
  lastTimestamp: number;
  clients: Set<WebSocket>;
};

const rooms = new Map<RoomId, RoomState>();
let connectionCounter = 0;

const wss = new WebSocketServer({ port: 8080, perMessageDeflate: false });

function ensureRoom(roomId: RoomId): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = { lastTimestamp: 0, clients: new Set() };
    rooms.set(roomId, room);
    console.log(`[room:${roomId}] created new room`);
  }
  return room;
}

wss.on('connection', (ws) => {
  const connectionId = ++connectionCounter;
  console.log(`[conn:${connectionId}] connected`);

  const joinedRooms = new Set<RoomId>();

  ws.on('message', (raw) => {
    const payload = raw.toString();
    console.log(`[conn:${connectionId}] incoming message ${payload}`);

    let msg: any;
    try {
      msg = JSON.parse(payload);
    } catch {
      console.warn(`[conn:${connectionId}] invalid JSON payload`);
      return;
    }

    switch (msg.type) {
      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }
      case 'subscribe': {
        const roomId = msg.roomId as RoomId;
        const room = ensureRoom(roomId);
        room.clients.add(ws);
        joinedRooms.add(roomId);
        console.log(`[conn:${connectionId}] subscribed to room ${roomId}`);

        ws.send(
          JSON.stringify({
            type: 'roomSnapshot',
            roomId,
            lastTimestamp: room.lastTimestamp,
          })
        );
        break;
      }
      case 'unsubscribe': {
        const roomId = msg.roomId as RoomId;
        const room = rooms.get(roomId);
        if (room) room.clients.delete(ws);
        joinedRooms.delete(roomId);
        console.log(`[conn:${connectionId}] unsubscribed from room ${roomId}`);
        break;
      }
      case 'messageSent': {
        const roomId = msg.roomId as RoomId;
        const newTs = msg.timestamp ?? Date.now();
        const room = ensureRoom(roomId);

        if (newTs > room.lastTimestamp) {
          room.lastTimestamp = newTs;
          console.log(`[room:${roomId}] updated timestamp -> ${newTs}`);

          for (const client of room.clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: 'roomUpdated',
                  roomId,
                  lastTimestamp: newTs,
                })
              );
            }
          }
        }
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => {
    console.log(`[conn:${connectionId}] disconnected`);
    for (const roomId of joinedRooms) {
      const room = rooms.get(roomId);
      if (room) {
        room.clients.delete(ws);
        if (room.clients.size === 0) {
          rooms.delete(roomId);
          console.log(`[room:${roomId}] cleaned up (no subscribers)`);
        }
      }
    }
  });
});

console.log('WebSocket Notification Server running at ws://localhost:8080');
