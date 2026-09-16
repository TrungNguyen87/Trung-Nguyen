import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { MultiplayerManager } from './server-multiplayer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(express.json());

const staticPath = path.join(__dirname, 'web');

// Serve static assets from the web directory
app.use(
  express.static(staticPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  })
);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Multiplayer engine
const multiplayer = new MultiplayerManager();
multiplayer.attachWebSocketServer(server);

// REST fallback APIs for room setup & polling (if WebSockets blocked by strict proxies)
app.post('/api/rooms/create', (req, res) => {
  const { playerName, settings } = req.body || {};
  const room = multiplayer.createRoom(playerName, settings);
  res.json({
    roomCode: room.code,
    playerId: room.players[0].id,
    settings: room.settings,
    players: multiplayer.sanitizePlayers(room),
  });
});

app.post('/api/rooms/join', (req, res) => {
  const { roomCode, playerName } = req.body || {};
  const result = multiplayer.joinRoom(roomCode, playerName);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  const { room, player } = result;
  multiplayer.broadcast(room, {
    type: 'player_joined',
    newPlayerName: player.name,
    players: multiplayer.sanitizePlayers(room),
  });
  res.json({
    roomCode: room.code,
    playerId: player.id,
    settings: room.settings,
    status: room.status,
    players: multiplayer.sanitizePlayers(room),
  });
});

app.get('/api/rooms/:code', (req, res) => {
  const code = (req.params.code || '').toUpperCase();
  const room = multiplayer.rooms.get(code);
  if (!room) {
    return res.status(404).json({ error: 'Kamer niet gevonden' });
  }
  const since = Number(req.query.since) || 0;
  const newEvents = room.events.filter((e) => e.id > since);
  res.json({
    roomCode: room.code,
    status: room.status,
    players: multiplayer.sanitizePlayers(room),
    settings: room.settings,
    events: newEvents,
  });
});

app.post('/api/rooms/:code/action', (req, res) => {
  const code = (req.params.code || '').toUpperCase();
  const room = multiplayer.rooms.get(code);
  if (!room) {
    return res.status(404).json({ error: 'Kamer niet gevonden' });
  }
  const { playerId, action, answer } = req.body || {};
  if (action === 'start') {
    if (room.hostId !== playerId) {
      return res.status(403).json({ error: 'Alleen de maker kan starten' });
    }
    multiplayer.startGame(room);
  } else if (action === 'answer') {
    multiplayer.recordAnswer(room, playerId, answer);
  } else if (action === 'rematch') {
    multiplayer.resetGameForRematch(room);
  }
  res.json({ ok: true });
});

// Fallback to index.html for client-side routing
app.get('*all', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});

