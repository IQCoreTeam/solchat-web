import { WebSocketServer, WebSocket } from "ws";

type RoomId = string;

type RoomState = {
    lastTimestamp: number;
    clients: Set<WebSocket>;
    recentSignatures: string[];
};

const rooms = new Map<RoomId, RoomState>();
let connectionCounter = 0;

const wss = new WebSocketServer({ port: 8080, host: '0.0.0.0' });

const MAX_RECENT_SIGS = 50;

function ensureRoom(roomId: RoomId): RoomState {
    let room = rooms.get(roomId);
    if (!room) {
        room = { lastTimestamp: 0, clients: new Set(), recentSignatures: [] };
        rooms.set(roomId, room);
        console.log(`[room:${roomId}] created new room`);
    }
    return room;
}

function pushRecentSig(room: RoomState, sig: string) {
    if (!sig) return;
    // 중복 방지 (단순)
    if (room.recentSignatures[0] === sig) return;
    room.recentSignatures.unshift(sig);
    if (room.recentSignatures.length > MAX_RECENT_SIGS) {
        room.recentSignatures.length = MAX_RECENT_SIGS;
    }
}

wss.on("connection", (ws) => {
    const connectionId = ++connectionCounter;
    console.log(`[conn:${connectionId}] connected`);

    const joinedRooms = new Set<RoomId>();

    ws.on("message", (raw) => {
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
            case "subscribe": {
                const roomId = msg.roomId as RoomId;
                const room = ensureRoom(roomId);
                room.clients.add(ws);
                joinedRooms.add(roomId);
                console.log(`[conn:${connectionId}] subscribed to room ${roomId}`);

                ws.send(
                    JSON.stringify({
                        type: "roomSnapshot",
                        roomId,
                        lastTimestamp: room.lastTimestamp,
                        recentSignatures: room.recentSignatures,
                    })
                );
                break;
            }

            case "unsubscribe": {
                const roomId = msg.roomId as RoomId;
                const room = rooms.get(roomId);
                if (room) room.clients.delete(ws);
                joinedRooms.delete(roomId);
                console.log(`[conn:${connectionId}] unsubscribed from room ${roomId}`);
                break;
            }

            case "messageSent": {
                const roomId = msg.roomId as RoomId;
                const sig = (msg.signature || "") as string;
                const newTs = Number(msg.timestamp ?? Date.now());
                const room = ensureRoom(roomId);

                // timestamp 최신화는 유지
                if (newTs > room.lastTimestamp) {
                    room.lastTimestamp = newTs;
                }
                // signature 기록
                if (sig) {
                    pushRecentSig(room, sig);
                }

                console.log(`[room:${roomId}] notify sig=${sig?.slice(0, 8)} ts=${room.lastTimestamp}`);

                for (const client of room.clients) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(
                            JSON.stringify({
                                type: "roomUpdated",
                                roomId,
                                lastTimestamp: room.lastTimestamp,
                                signature: sig || null,
                            })
                        );
                    }
                }
                break;
            }

            case "ping": {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "pong" }));
                }
                break;
            }

            default:
                break;
        }
    });

    ws.on("close", () => {
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

console.log("WebSocket Notification Server running at ws://0.0.0.0:8080");
console.log("You can connect via:");
console.log("  - ws://localhost:8080 (local)");
console.log("  - ws://<your-ip>:8080 (network)");
