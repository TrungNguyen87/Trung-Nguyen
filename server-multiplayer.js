/**
 * Server-authoritative multiplayer room engine for online competition.
 * Coordinates 2-player real-time matches across locations (e.g. Netherlands <-> Vietnam).
 */
import { WebSocketServer } from "ws";
import {
  generateCompetitionProblem,
  calculateCompetitionPoints,
  ROUND_TIME_SECONDS,
} from "./web/js/competition-logic.js";

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generatePlayerId() {
  return "p_" + Math.random().toString(36).substring(2, 10);
}

export class MultiplayerManager {
  constructor() {
    this.rooms = new Map();
    // Clean stale rooms every 10 minutes
    const interval = setInterval(() => this.cleanupStaleRooms(), 10 * 60 * 1000);
    if (interval.unref) interval.unref();
  }

  cleanupStaleRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (now - room.createdAt > 3 * 60 * 60 * 1000) {
        if (room.timer) clearTimeout(room.timer);
        this.rooms.delete(code);
      }
    }
  }

  attachWebSocketServer(server) {
    this.wss = new WebSocketServer({ server, path: "/ws/competitie" });

    this.wss.on("connection", (ws) => {
      let currentRoomCode = null;
      let currentPlayerId = null;

      ws.on("message", (raw) => {
        try {
          const data = JSON.parse(raw.toString());
          this.handleSocketMessage(ws, data, (roomCode, playerId) => {
            currentRoomCode = roomCode;
            currentPlayerId = playerId;
          });
        } catch (err) {
          console.error("Multiplayer message error:", err);
          ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
        }
      });

      ws.on("close", () => {
        if (currentRoomCode && currentPlayerId) {
          this.handlePlayerDisconnect(currentRoomCode, currentPlayerId);
        }
      });

      ws.on("error", (err) => {
        console.warn("WebSocket client error:", err.message);
      });
    });
  }

  handleSocketMessage(ws, msg, registerContext) {
    switch (msg.type) {
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;

      case "create_room": {
        const room = this.createRoom(msg.playerName, msg.settings);
        const player = room.players[0];
        player.ws = ws;
        registerContext(room.code, player.id);
        ws.send(
          JSON.stringify({
            type: "room_created",
            roomCode: room.code,
            playerId: player.id,
            settings: room.settings,
            players: this.sanitizePlayers(room),
          })
        );
        break;
      }

      case "join_room": {
        const result = this.joinRoom(msg.roomCode, msg.playerName);
        if (result.error) {
          ws.send(JSON.stringify({ type: "error", message: result.error }));
          return;
        }
        const { room, player } = result;
        player.ws = ws;
        registerContext(room.code, player.id);

        ws.send(
          JSON.stringify({
            type: "room_joined",
            roomCode: room.code,
            playerId: player.id,
            settings: room.settings,
            status: room.status,
            players: this.sanitizePlayers(room),
          })
        );

        this.broadcast(room, {
          type: "player_joined",
          newPlayerName: player.name,
          players: this.sanitizePlayers(room),
        });
        break;
      }

      case "start_game": {
        const room = this.rooms.get(msg.roomCode);
        if (!room) return;
        if (room.hostId !== msg.playerId) {
          ws.send(JSON.stringify({ type: "error", message: "Alleen de maker kan het spel starten." }));
          return;
        }
        if (room.players.length < 2) {
          ws.send(JSON.stringify({ type: "error", message: "Wachten op tegenspeler..." }));
          return;
        }
        this.startGame(room);
        break;
      }

      case "submit_answer": {
        const room = this.rooms.get(msg.roomCode);
        if (!room) return;
        this.recordAnswer(room, msg.playerId, msg.answer);
        break;
      }

      case "rematch": {
        const room = this.rooms.get(msg.roomCode);
        if (!room) return;
        this.resetGameForRematch(room);
        break;
      }
    }
  }

  createRoom(hostName, settings = {}) {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }

    const hostId = generatePlayerId();
    const cleanSettings = {
      category: settings.category || "bliksem",
      rounds: Math.min(20, Math.max(3, Number(settings.rounds) || 10)),
      difficulty: Number(settings.difficulty) || 2,
    };

    const hostPlayer = {
      id: hostId,
      name: (hostName || "Speler 1").trim().substring(0, 20),
      isHost: true,
      score: 0,
      correctCount: 0,
      totalResponseTime: 0,
      connected: true,
      lastSeen: Date.now(),
      ws: null,
    };

    const room = {
      code,
      hostId,
      createdAt: Date.now(),
      settings: cleanSettings,
      players: [hostPlayer],
      status: "waiting", // waiting | countdown | in_round | round_recap | finished
      questions: [],
      currentRoundIndex: 0,
      roundStartTime: 0,
      roundAnswers: {},
      roundHistory: [],
      timer: null,
      events: [],
    };

    this.rooms.set(code, room);
    return room;
  }

  joinRoom(rawCode, guestName) {
    const code = (rawCode || "").trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { error: "Kamercode niet gevonden. Controleer de code." };
    }
    if (room.status !== "waiting" && room.status !== "finished") {
      return { error: "Deze wedstrijd is al begonnen!" };
    }
    if (room.players.length >= 2) {
      // Check if one was disconnected and reconnecting
      const existing = room.players.find((p) => p.name === (guestName || "").trim());
      if (existing) {
        existing.connected = true;
        existing.lastSeen = Date.now();
        return { room, player: existing };
      }
      return { error: "Kamer is vol (maximaal 2 spelers)." };
    }

    const guestId = generatePlayerId();
    const guestPlayer = {
      id: guestId,
      name: (guestName || "Speler 2").trim().substring(0, 20),
      isHost: false,
      score: 0,
      correctCount: 0,
      totalResponseTime: 0,
      connected: true,
      lastSeen: Date.now(),
      ws: null,
    };

    room.players.push(guestPlayer);
    return { room, player: guestPlayer };
  }

  sanitizePlayers(room) {
    return room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      score: p.score,
      correctCount: p.correctCount,
      connected: p.connected,
    }));
  }

  broadcast(room, data) {
    const payload = JSON.stringify(data);
    room.events.push({ id: room.events.length + 1, data, timestamp: Date.now() });

    for (const player of room.players) {
      if (player.ws && player.ws.readyState === 1 /* OPEN */) {
        player.ws.send(payload);
      }
    }
  }

  handlePlayerDisconnect(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find((p) => p.id === playerId);
    if (player) {
      player.connected = false;
      this.broadcast(room, {
        type: "player_left",
        playerId,
        playerName: player.name,
        players: this.sanitizePlayers(room),
      });
    }
  }

  startGame(room) {
    if (room.timer) clearTimeout(room.timer);

    // Generate questions for all rounds
    room.questions = [];
    for (let i = 0; i < room.settings.rounds; i++) {
      room.questions.push(
        generateCompetitionProblem(room.settings.category, room.settings.difficulty)
      );
    }

    room.currentRoundIndex = 0;
    room.roundHistory = [];
    room.players.forEach((p) => {
      p.score = 0;
      p.correctCount = 0;
      p.totalResponseTime = 0;
    });

    room.status = "countdown";
    let countdown = 3;

    this.broadcast(room, {
      type: "countdown_started",
      totalRounds: room.settings.rounds,
    });

    const stepCountdown = () => {
      if (countdown > 0) {
        this.broadcast(room, { type: "countdown_tick", count: countdown });
        countdown--;
        room.timer = setTimeout(stepCountdown, 1000);
      } else {
        this.broadcast(room, { type: "countdown_tick", count: 0 }); // GO!
        room.timer = setTimeout(() => this.startNextRound(room), 1000);
      }
    };
    stepCountdown();
  }

  startNextRound(room) {
    if (room.currentRoundIndex >= room.questions.length) {
      this.finishGame(room);
      return;
    }

    const problem = room.questions[room.currentRoundIndex];
    room.status = "in_round";
    room.roundStartTime = Date.now();
    room.roundAnswers = {};

    this.broadcast(room, {
      type: "round_started",
      roundIndex: room.currentRoundIndex,
      totalRounds: room.questions.length,
      question: {
        text: problem.text,
        options: problem.options,
      },
      duration: ROUND_TIME_SECONDS,
      players: this.sanitizePlayers(room),
    });

    // Server-side round timer timeout
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => {
      this.endRound(room);
    }, (ROUND_TIME_SECONDS + 0.3) * 1000);
  }

  recordAnswer(room, playerId, answer) {
    if (room.status !== "in_round") return;
    if (room.roundAnswers[playerId]) return; // Already answered this round

    const elapsedSeconds = Number(((Date.now() - room.roundStartTime) / 1000).toFixed(2));
    const problem = room.questions[room.currentRoundIndex];
    const isCorrect = String(answer) === String(problem.answerDisplay);
    const points = calculateCompetitionPoints(isCorrect, elapsedSeconds, ROUND_TIME_SECONDS);

    const player = room.players.find((p) => p.id === playerId);
    if (player) {
      player.score += points;
      if (isCorrect) player.correctCount++;
      player.totalResponseTime += elapsedSeconds;
    }

    room.roundAnswers[playerId] = {
      answer,
      responseSeconds: elapsedSeconds,
      isCorrect,
      points,
    };

    // Broadcast that player answered (without revealing the actual answer to the opponent yet)
    this.broadcast(room, {
      type: "player_answered",
      playerId,
      playerName: player ? player.name : "",
      isCorrect,
      points,
    });

    // If all active players have answered, end round early
    const answeredCount = Object.keys(room.roundAnswers).length;
    if (answeredCount >= room.players.length) {
      if (room.timer) clearTimeout(room.timer);
      // Brief pause so player sees their tap registration before recap
      room.timer = setTimeout(() => this.endRound(room), 700);
    }
  }

  endRound(room) {
    if (room.status !== "in_round") return;
    if (room.timer) clearTimeout(room.timer);

    room.status = "round_recap";
    const problem = room.questions[room.currentRoundIndex];

    const p1 = room.players[0] || {};
    const p2 = room.players[1] || {};

    const p1Ans = room.roundAnswers[p1.id] || {
      answer: "—",
      responseSeconds: ROUND_TIME_SECONDS,
      isCorrect: false,
      points: 0,
    };
    const p2Ans = room.roundAnswers[p2.id] || {
      answer: "—",
      responseSeconds: ROUND_TIME_SECONDS,
      isCorrect: false,
      points: 0,
    };

    let roundWinner = null;
    if (p1Ans.points > p2Ans.points) roundWinner = p1.name;
    else if (p2Ans.points > p1Ans.points) roundWinner = p2.name;
    else if (p1Ans.isCorrect && p2Ans.isCorrect) roundWinner = "Gelijk";

    room.roundHistory.push({
      round: room.currentRoundIndex + 1,
      question: problem.text,
      correctAnswer: problem.answerDisplay,
      p1: { name: p1.name, ...p1Ans },
      p2: { name: p2.name, ...p2Ans },
      roundWinner,
    });

    this.broadcast(room, {
      type: "round_recap",
      roundIndex: room.currentRoundIndex,
      correctAnswer: problem.answerDisplay,
      p1Result: p1Ans,
      p2Result: p2Ans,
      players: this.sanitizePlayers(room),
    });

    room.currentRoundIndex++;
    // Show recap for 2.8 seconds, then next round
    room.timer = setTimeout(() => {
      this.startNextRound(room);
    }, 2800);
  }

  finishGame(room) {
    room.status = "finished";
    if (room.timer) clearTimeout(room.timer);

    const p1 = room.players[0] || {};
    const p2 = room.players[1] || {};

    let winner = "tie";
    if (p1.score > p2.score) winner = "p1";
    else if (p2.score > p1.score) winner = "p2";

    const p1AvgSpeed =
      p1.correctCount > 0
        ? (p1.totalResponseTime / room.questions.length).toFixed(1)
        : "—";
    const p2AvgSpeed =
      p2.correctCount > 0
        ? (p2.totalResponseTime / room.questions.length).toFixed(1)
        : "—";

    this.broadcast(room, {
      type: "game_finished",
      winner,
      winnerName: winner === "p1" ? p1.name : winner === "p2" ? p2.name : null,
      p1Stats: {
        name: p1.name,
        score: p1.score,
        correctCount: p1.correctCount,
        avgSpeed: p1AvgSpeed,
      },
      p2Stats: {
        name: p2.name,
        score: p2.score,
        correctCount: p2.correctCount,
        avgSpeed: p2AvgSpeed,
      },
      totalRounds: room.questions.length,
      roundHistory: room.roundHistory,
      players: this.sanitizePlayers(room),
    });
  }

  resetGameForRematch(room) {
    if (room.timer) clearTimeout(room.timer);
    room.status = "waiting";
    this.broadcast(room, {
      type: "rematch_ready",
      players: this.sanitizePlayers(room),
      settings: room.settings,
    });
  }
}
