const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: '500kb' }));
app.use(express.static(path.join(__dirname, '..')));

const roomStore = new Map();
const rateLimits = new Map();
const ipConnections = new Map();

function sanitizeRoomCode(code) {
  if (typeof code !== 'string') return null;
  const clean = code.trim();
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(clean)) return null;
  return clean;
}

function sanitizePacket(packet, depth = 0) {
  if (depth > 10 || !packet || typeof packet !== 'object') return packet;
  if (Array.isArray(packet)) {
    return packet.map(item => sanitizePacket(item, depth + 1));
  }
  const forbiddenKeys = ['__proto__', 'constructor', 'prototype'];
  const clean = {};
  for (const key of Object.keys(packet)) {
    if (!forbiddenKeys.includes(key)) {
      clean[key] = sanitizePacket(packet[key], depth + 1);
    }
  }
  return clean;
}

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimits.get(ip) || { count: 0, reset: now + 1000 };
  if (now > record.reset) {
    record.count = 1;
    record.reset = now + 1000;
  } else {
    record.count++;
  }
  rateLimits.set(ip, record);
  return record.count <= 60;
}

app.post('/send', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const { roomCode, packet, clientId } = req.body || {};
  const room = sanitizeRoomCode(roomCode);
  const cleanPacket = sanitizePacket(packet);

  if (!room || !cleanPacket) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  if (!roomStore.has(room)) {
    if (roomStore.size >= 1000) {
      return res.status(503).json({ error: 'Server room capacity reached' });
    }
    roomStore.set(room, { packets: [], lastId: 0, lastAccess: Date.now() });
  }

  const entry = roomStore.get(room);
  entry.lastAccess = Date.now();
  entry.lastId++;
  const packetEntry = {
    id: entry.lastId,
    clientId: clientId || 'unknown',
    packet: cleanPacket
  };
  entry.packets.push(packetEntry);
  if (entry.packets.length > 200) entry.packets.shift();

  const outMsg = JSON.stringify(cleanPacket);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.roomCode === room) {
      client.send(outMsg);
    }
  });

  res.json({ success: true, id: entry.lastId });
});

app.get('/poll', (req, res) => {
  const room = sanitizeRoomCode(req.query.room);
  if (!room) {
    return res.status(400).json({ error: 'Invalid room' });
  }

  const since = parseInt(req.query.since || '0', 10);
  const clientId = req.query.clientId || 'unknown';

  const entry = roomStore.get(room);
  if (entry) {
    entry.lastAccess = Date.now();
    const newPackets = entry.packets.filter(p => p.id > since && p.clientId !== clientId);
    res.json({ packets: newPackets, lastId: entry.lastId });
  } else {
    res.json({ packets: [], lastId: 0 });
  }
});

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const connCount = (ipConnections.get(ip) || 0) + 1;
  if (connCount > 25) {
    ws.close(1008, 'Too many connections');
    return;
  }
  ipConnections.set(ip, connCount);

  let currentRoom = null;

  ws.on('message', (message) => {
    if (!checkRateLimit(ip)) return;
    if (message.length > 524288) return;

    try {
      const data = JSON.parse(message);
      const cleanData = sanitizePacket(data);
      if (!cleanData) return;

      if (cleanData.type === 'JOIN_ROOM') {
        const room = sanitizeRoomCode(cleanData.roomCode);
        if (room) {
          if (currentRoom && currentRoom !== room) {
            const oldRoom = roomStore.get(currentRoom);
            if (oldRoom && oldRoom.hostWs === ws) {
              oldRoom.hostWs = null;
            }
          }
          currentRoom = room;
          ws.roomCode = room;
          const requestedRole = cleanData.requestedRole || (cleanData.isHost === false ? 'client' : (cleanData.isHost === true ? 'host' : null));
          let r = roomStore.get(room);
          if (!r) {
            if (roomStore.size >= 1000) {
              ws.close(1008, 'Capacity reached');
              return;
            }
            r = { packets: [], lastId: 0, lastAccess: Date.now(), hostWs: requestedRole === 'client' ? null : ws };
            roomStore.set(room, r);
            ws.isHost = requestedRole !== 'client';
          } else {
            const hasActiveHost = r.hostWs && r.hostWs.readyState === WebSocket.OPEN && r.hostWs !== ws;
            if (requestedRole === 'client') {
              ws.isHost = false;
            } else if (requestedRole === 'host') {
              if (hasActiveHost) {
                ws.isHost = false;
              } else {
                r.hostWs = ws;
                ws.isHost = true;
              }
            } else {
              if (!hasActiveHost) {
                r.hostWs = ws;
                ws.isHost = true;
              } else {
                ws.isHost = false;
              }
            }
          }
          ws.send(JSON.stringify({ type: 'ROLE_ASSIGNMENT', isHost: ws.isHost, roomCode: room }));
        }
        return;
      }

      if (currentRoom) {
        const outMsg = JSON.stringify(cleanData);
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN && client.roomCode === currentRoom) {
            client.send(outMsg);
          }
        });

        let r = roomStore.get(currentRoom);
        if (r) {
          r.lastAccess = Date.now();
          r.lastId++;
          r.packets.push({ id: r.lastId, clientId: 'ws_peer', packet: cleanData });
          if (r.packets.length > 200) r.packets.shift();
        }
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    if (currentRoom) {
      const r = roomStore.get(currentRoom);
      if (r && r.hostWs === ws) {
        r.hostWs = null;
      }
    }
    const current = ipConnections.get(ip) || 1;
    if (current <= 1) {
      ipConnections.delete(ip);
    } else {
      ipConnections.set(ip, current - 1);
    }
  });

  ws.on('error', () => {});
});

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimits.entries()) {
    if (now > record.reset + 5000) rateLimits.delete(ip);
  }
  for (const [room, entry] of roomStore.entries()) {
    if (now - entry.lastAccess > 300000) {
      roomStore.delete(room);
    }
  }
}, 30000);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {});
