const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..')));

const roomStore = new Map();
const rateLimits = new Map();

function sanitizeRoomCode(code) {
  if (typeof code !== 'string') return null;
  const clean = code.trim();
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(clean)) return null;
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
  return record.count <= 40;
}

app.post('/send', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const { roomCode, packet } = req.body;
  const room = sanitizeRoomCode(roomCode);
  if (!room || !packet) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  if (!roomStore.has(room)) {
    roomStore.set(room, []);
  }

  const queue = roomStore.get(room);
  queue.push(packet);
  if (queue.length > 50) queue.shift();

  res.json({ success: true });
});

app.get('/poll', (req, res) => {
  const room = sanitizeRoomCode(req.query.room);
  if (!room) {
    return res.status(400).json({ error: 'Invalid room' });
  }

  const queue = roomStore.get(room) || [];
  res.json(queue);
});

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  let currentRoom = null;

  ws.on('message', (message) => {
    if (!checkRateLimit(ip)) return;

    if (message.length > 8192) return;

    try {
      const data = JSON.parse(message);
      if (data.type === 'JOIN_ROOM') {
        const room = sanitizeRoomCode(data.roomCode);
        if (room) {
          currentRoom = room;
          ws.roomCode = room;
        }
        return;
      }

      if (currentRoom) {
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN && client.roomCode === currentRoom) {
            client.send(JSON.stringify(data));
          }
        });
      }
    } catch (e) {}
  });

  ws.on('error', () => {});
});

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimits.entries()) {
    if (now > record.reset + 5000) rateLimits.delete(ip);
  }
}, 30000);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {});
