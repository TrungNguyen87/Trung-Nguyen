/**
 * Multiplayer Competition Mode.
 *
 * Supports two distinct game modes:
 * 1. 🌐 Online Remote Multiplayer:
 *    Players can be anywhere in the world (e.g. Netherlands <-> Vietnam).
 *    Host generates a 5-character room code / copyable link; Guest enters the code.
 *    Server-authoritative synchronization with WebSocket + HTTP polling fallback.
 * 2. 📱 Local Split-Screen Multiplayer:
 *    Two players play simultaneously on the same tablet, desktop, or laptop screen.
 *
 * Scoring Rule:
 *   - Faster correct answer = more points (100 down to 20).
 *   - Incorrect answers strictly award 0 points.
 *
 * At the end, a comprehensive comparison screen breaks down results,
 * total scores, average speeds, and question-by-question outcomes.
 */
import { el, raw, clear } from "../dom.js";
import { t } from "../i18n.js";
import { state } from "../state.js";
import { pageHeader } from "../ui.js";
import { getGameIllustration } from "../illustrations.js";
import { confetti, bigCelebration } from "../fx.js";
import * as sound from "../sound.js";
import {
  generateCompetitionProblem,
  calculateCompetitionPoints,
  ROUND_TIME_SECONDS,
} from "../competition-logic.js";

export { generateCompetitionProblem, calculateCompetitionPoints, ROUND_TIME_SECONDS };

/** Safely invoke sound effects with fallbacks and exception protection. */
function safePlay(fnName, fallbackFnName, ...args) {
  try {
    if (typeof sound[fnName] === "function") {
      sound[fnName](...args);
      return;
    }
    if (typeof window !== "undefined" && typeof window.__kmg_sound?.[fnName] === "function") {
      window.__kmg_sound[fnName](...args);
      return;
    }
    if (fallbackFnName && typeof sound[fallbackFnName] === "function") {
      sound[fallbackFnName](...args);
      return;
    }
    if (
      fallbackFnName &&
      typeof window !== "undefined" &&
      typeof window.__kmg_sound?.[fallbackFnName] === "function"
    ) {
      window.__kmg_sound[fallbackFnName](...args);
      return;
    }
  } catch {
    /* ignore audio device or autoplay restriction errors */
  }
}

const safePlayDing = () => safePlay("playDing", "playCorrect", 1);
const safePlayBuzz = () => safePlay("playBuzz", "playIncorrect");
const safePlayTap = () => safePlay("playTap");
const safePlayFanfare = () => safePlay("playFanfare", "playLevelUp");

/** Client helper managing WebSocket communication with REST polling fallback. */
class MultiplayerClient {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.ws = null;
    this.roomCode = null;
    this.playerId = null;
    this.polling = null;
    this.lastEventId = 0;
  }

  connectWs(onOpen, onError) {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${location.host}/ws/competitie`;
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        if (onOpen) onOpen();
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.onEvent(msg);
        } catch (e) {
          console.error("Multiplayer message parse error:", e);
        }
      };
      this.ws.onerror = (e) => {
        if (onError) onError(e);
      };
      this.ws.onclose = () => {
        if (this.roomCode) {
          this.startPolling();
        }
      };
    } catch (e) {
      if (onError) onError(e);
    }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else if (this.roomCode) {
      // Fallback via REST API
      fetch(`/api/rooms/${this.roomCode}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: this.playerId, ...msg }),
      }).catch(console.warn);
    }
  }

  startPolling() {
    if (this.polling) return;
    this.polling = setInterval(async () => {
      if (!this.roomCode) return;
      try {
        const res = await fetch(`/api/rooms/${this.roomCode}?since=${this.lastEventId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.events && data.events.length > 0) {
          for (const ev of data.events) {
            this.lastEventId = Math.max(this.lastEventId, ev.id);
            this.onEvent(ev.data);
          }
        }
      } catch (err) {
        console.warn("Polling error:", err);
      }
    }, 800);
  }

  stop() {
    if (this.polling) clearInterval(this.polling);
    if (this.ws) this.ws.close();
    this.polling = null;
    this.ws = null;
  }
}

export function render(container) {
  const root = el("section.kmg-competitie");

  // Read initial room code from URL query if present (e.g. #/competitie?room=ABC12)
  let initialRoom = "";
  try {
    const hash = window.location.hash || "";
    const qIndex = hash.indexOf("?");
    if (qIndex !== -1) {
      const params = new URLSearchParams(hash.substring(qIndex));
      initialRoom = (params.get("room") || "").trim().toUpperCase();
    }
    if (!initialRoom) {
      const searchParams = new URLSearchParams(window.location.search);
      initialRoom = (searchParams.get("room") || "").trim().toUpperCase();
    }
  } catch {
    /* ignore */
  }

  let activeMode = initialRoom ? "online" : "online"; // 'online' | 'local'
  let onlineTab = initialRoom ? "join" : "create"; // 'create' | 'join'

  // Local Match State
  let localP1Name = state.playerName || t("comp.player1");
  let localP2Name = t("comp.player2");
  let selectedCategory = "bliksem";
  let selectedRounds = 10;
  let selectedDifficulty = 2;

  let localQuestions = [];
  let localQuestionIndex = 0;
  let localP1Results = [];
  let localP2Results = [];
  let localRoundStartTime = 0;
  let localTimerInterval = null;
  let localTransitionTimeout = null;
  let localCountdownInterval = null;
  let localP1Answered = false;
  let localP2Answered = false;
  let localRoundEnded = false;

  // Online Match State
  let client = null;
  let myPlayerId = null;
  let isHost = false;
  let onlineRoomCode = initialRoom;
  let onlinePlayers = [];
  let onlineStatus = "lobby"; // 'lobby' | 'countdown' | 'in_round' | 'round_recap' | 'finished'
  let onlineCurrentRound = null;
  let onlineTimerInterval = null;
  let myAnswerSubmitted = false;

  // Containers
  const viewSetup = el("div.kmg-comp-setup");
  const viewPlay = el("div.kmg-comp-play");
  const viewResults = el("div.kmg-comp-results");

  viewPlay.hidden = true;
  viewResults.hidden = true;

  // -------------------------------------------------------------------------
  // Main Navigation / Mode Selector
  // -------------------------------------------------------------------------
  function renderHeaderAndModeTabs() {
    clear(viewSetup);

    const head = pageHeader("comp.title", {
      subtitleKey: "comp.subtitle",
      emoji: "🏆",
      illustration: getGameIllustration("bliksem"),
    });

    const modeTabs = el("div.kmg-comp-mode-tabs", {}, [
      el("button.kmg-comp-mode-tab", {
        type: "button",
        text: t("comp.mode_online"),
        className: `kmg-comp-mode-tab ${activeMode === "online" ? "is-active" : ""}`,
        onClick: () => {
          activeMode = "online";
          renderSetup();
        },
      }),
      el("button.kmg-comp-mode-tab", {
        type: "button",
        text: t("comp.mode_local"),
        className: `kmg-comp-mode-tab ${activeMode === "local" ? "is-active" : ""}`,
        onClick: () => {
          activeMode = "local";
          renderSetup();
        },
      }),
    ]);

    viewSetup.append(head, modeTabs);
  }

  function renderSetup() {
    renderHeaderAndModeTabs();
    if (activeMode === "online") {
      renderOnlineLobby();
    } else {
      renderLocalSetup();
    }
  }

  // -------------------------------------------------------------------------
  // ONLINE MULTIPLAYER LOBBY
  // -------------------------------------------------------------------------
  function renderOnlineLobby() {
    const card = el("div.kmg-card.kmg-comp-config-card");

    const introBanner = el("div.kmg-banner.kmg-banner-info", {}, [
      el("span.kmg-banner-icon", { text: "🌍" }),
      el("span.kmg-banner-body", { text: t("comp.online_intro") }),
    ]);

    // Subtabs: Create vs Join
    const subtabs = el("div.kmg-comp-subtabs", {}, [
      el("button.kmg-btn", {
        type: "button",
        text: t("comp.create_room_tab"),
        className: `kmg-btn ${onlineTab === "create" ? "kmg-btn-primary" : "kmg-btn-outline"} kmg-btn-sm`,
        onClick: () => {
          onlineTab = "create";
          renderSetup();
        },
      }),
      el("button.kmg-btn", {
        type: "button",
        text: t("comp.join_room_tab"),
        className: `kmg-btn ${onlineTab === "join" ? "kmg-btn-primary" : "kmg-btn-outline"} kmg-btn-sm`,
        onClick: () => {
          onlineTab = "join";
          renderSetup();
        },
      }),
    ]);

    if (onlineTab === "create") {
      // Host Room Creation Form
      const hostNameInput = el("input.kmg-textinput", {
        type: "text",
        value: state.playerName || "Speler 1",
        placeholder: t("comp.player1_name"),
      });

      const catSelect = el("select.kmg-select");
      const categories = [
        { id: "bliksem", label: t("comp.cat_bliksem") },
        { id: "tafels", label: t("comp.cat_tafels") },
        { id: "breuken", label: t("comp.cat_breuken") },
        { id: "procenten", label: t("comp.cat_procenten") },
        { id: "all", label: t("comp.cat_all") },
      ];
      categories.forEach((cat) => {
        const opt = el("option", { value: cat.id, text: cat.label });
        if (cat.id === selectedCategory) opt.selected = true;
        catSelect.append(opt);
      });
      catSelect.addEventListener("change", (e) => (selectedCategory = e.target.value));

      const roundsRow = el("div.kmg-comp-segmented");
      [5, 10, 15].forEach((n) => {
        const btn = el("button.kmg-comp-segment-btn", {
          type: "button",
          text: `${n} ${t("comp.rounds").toLowerCase()}`,
          className: `kmg-comp-segment-btn ${n === selectedRounds ? "is-active" : ""}`,
          onClick: () => {
            selectedRounds = n;
            [...roundsRow.children].forEach((b) => b.classList.remove("is-active"));
            btn.classList.add("is-active");
          },
        });
        roundsRow.append(btn);
      });

      const diffRow = el("div.kmg-comp-segmented");
      const diffs = [
        { level: 0, label: t("comp.diff_easy") },
        { level: 2, label: t("comp.diff_medium") },
        { level: 4, label: t("comp.diff_hard") },
      ];
      diffs.forEach((d) => {
        const btn = el("button.kmg-comp-segment-btn", {
          type: "button",
          text: d.label,
          className: `kmg-comp-segment-btn ${d.level === selectedDifficulty ? "is-active" : ""}`,
          onClick: () => {
            selectedDifficulty = d.level;
            [...diffRow.children].forEach((b) => b.classList.remove("is-active"));
            btn.classList.add("is-active");
          },
        });
        diffRow.append(btn);
      });

      const ruleNote = el("div.kmg-banner.kmg-banner-ok.kmg-comp-rulenote", {}, [
        el("span.kmg-banner-icon", { text: "⚡" }),
        el("span.kmg-banner-body", { text: t("comp.scoring_rule_reminder") }),
      ]);

      const createBtn = el("button.kmg-btn.kmg-btn-primary.kmg-btn-big.kmg-comp-startbtn", {
        type: "button",
        text: t("comp.create_room_btn"),
        onClick: () => {
          const hostName = hostNameInput.value.trim() || state.playerName || "Speler 1";
          createOnlineRoom(hostName, {
            category: selectedCategory,
            rounds: selectedRounds,
            difficulty: selectedDifficulty,
          });
        },
      });

      card.append(
        introBanner,
        subtabs,
        el("div.kmg-comp-field", {}, [
          el("label.kmg-answer-label", { text: t("comp.your_name") }),
          hostNameInput,
        ]),
        el("div.kmg-comp-field", {}, [
          el("label.kmg-answer-label", { text: t("comp.category") }),
          catSelect,
        ]),
        el("div.kmg-comp-field", {}, [
          el("label.kmg-answer-label", { text: t("comp.rounds") }),
          roundsRow,
        ]),
        el("div.kmg-comp-field", {}, [
          el("label.kmg-answer-label", { text: t("comp.difficulty") }),
          diffRow,
        ]),
        ruleNote,
        createBtn,
      );
    } else {
      // Guest Join Form
      const guestNameInput = el("input.kmg-textinput", {
        type: "text",
        value: state.playerName || "Speler 2",
        placeholder: t("comp.player2_name"),
      });

      const codeInput = el("input.kmg-textinput", {
        type: "text",
        value: initialRoom,
        placeholder: t("comp.enter_code_placeholder"),
        maxLength: 8,
        style: "font-family: monospace; font-size: 1.4rem; font-weight: 800; letter-spacing: 0.15rem; text-transform: uppercase;",
      });

      const joinErrorNode = el("div.kmg-banner.kmg-banner-bad", { hidden: true });

      const joinBtn = el("button.kmg-btn.kmg-btn-primary.kmg-btn-big.kmg-comp-startbtn", {
        type: "button",
        text: t("comp.join_room_btn"),
        onClick: () => {
          joinErrorNode.hidden = true;
          const guestName = guestNameInput.value.trim() || state.playerName || "Speler 2";
          const code = codeInput.value.trim().toUpperCase();
          if (!code) {
            joinErrorNode.textContent = "Vul een kamercode in.";
            joinErrorNode.hidden = false;
            return;
          }
          joinOnlineRoom(code, guestName, (err) => {
            joinErrorNode.textContent = err;
            joinErrorNode.hidden = false;
          });
        },
      });

      card.append(
        introBanner,
        subtabs,
        el("div.kmg-comp-field", {}, [
          el("label.kmg-answer-label", { text: t("comp.your_name") }),
          guestNameInput,
        ]),
        el("div.kmg-comp-field", {}, [
          el("label.kmg-answer-label", { text: t("comp.room_code_label") }),
          codeInput,
        ]),
        joinErrorNode,
        joinBtn,
      );
    }

    viewSetup.append(card);
  }

  // -------------------------------------------------------------------------
  // Online Room Flow (Create & Join Handlers)
  // -------------------------------------------------------------------------
  function setupMultiplayerClient() {
    if (client) client.stop();
    client = new MultiplayerClient((event) => {
      handleOnlineEvent(event);
    });
    client.connectWs(
      () => {
        // Connected WS
      },
      (err) => {
        console.warn("WS fallback active:", err);
      },
    );
  }

  async function createOnlineRoom(hostName, settings) {
    setupMultiplayerClient();
    try {
      const res = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: hostName, settings }),
      });
      const data = await res.json();
      myPlayerId = data.playerId;
      onlineRoomCode = data.roomCode;
      isHost = true;
      client.roomCode = onlineRoomCode;
      client.playerId = myPlayerId;
      onlinePlayers = data.players || [];

      // Also announce via WS if ready
      client.send({
        type: "create_room",
        playerName: hostName,
        settings,
      });

      renderOnlineWaitingRoom();
    } catch (err) {
      alert("Kon de kamer niet aanmaken. Probeer opnieuw: " + err.message);
    }
  }

  async function joinOnlineRoom(code, guestName, onError) {
    setupMultiplayerClient();
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: code, playerName: guestName }),
      });
      if (!res.ok) {
        const errData = await res.json();
        if (onError) onError(errData.error || "Fout bij meedoen.");
        return;
      }
      const data = await res.json();
      myPlayerId = data.playerId;
      onlineRoomCode = data.roomCode;
      isHost = false;
      client.roomCode = onlineRoomCode;
      client.playerId = myPlayerId;
      onlinePlayers = data.players || [];

      client.send({
        type: "join_room",
        roomCode: code,
        playerName: guestName,
      });

      renderOnlineWaitingRoom();
    } catch (err) {
      if (onError) onError("Verbinding mislukt: " + err.message);
    }
  }

  function renderOnlineWaitingRoom() {
    clear(viewSetup);
    safePlayTap();

    const head = pageHeader("comp.title", {
      subtitleKey: "comp.subtitle",
      emoji: "🏆",
    });

    const card = el("div.kmg-card.kmg-comp-config-card");

    const shareTitle = el("h3", { text: t("comp.share_code_title") });
    const shareDesc = el("p.kmg-sub", { text: t("comp.share_code_desc") });

    const codeDisplay = el("div.kmg-comp-code-display", {}, [
      el("div.kmg-comp-big-code", { text: onlineRoomCode }),
    ]);

    const copyBtn = el("button.kmg-btn.kmg-btn-outline.kmg-btn-sm", {
      type: "button",
      text: t("comp.copy_code_btn"),
      onClick: () => {
        navigator.clipboard?.writeText(onlineRoomCode);
        copyBtn.textContent = t("comp.copied_toast");
        setTimeout(() => (copyBtn.textContent = t("comp.copy_code_btn")), 2000);
      },
    });

    const shareUrl = `${window.location.origin}${window.location.pathname}#/competitie?room=${onlineRoomCode}`;
    const copyLinkBtn = el("button.kmg-btn.kmg-btn-outline.kmg-btn-sm", {
      type: "button",
      text: t("comp.copy_link_btn"),
      onClick: () => {
        navigator.clipboard?.writeText(shareUrl);
        copyLinkBtn.textContent = t("comp.copied_toast");
        setTimeout(() => (copyLinkBtn.textContent = t("comp.copy_link_btn")), 2000);
      },
    });

    const codeActions = el("div.kmg-comp-code-actions", {}, [copyBtn, copyLinkBtn]);

    // Player Status List
    const playersList = el("div.kmg-comp-players-status", { style: "margin: 1.2rem 0;" });
    const updatePlayersList = () => {
      clear(playersList);
      const p1 = onlinePlayers[0] || { name: "Host" };
      const p2 = onlinePlayers[1] || null;

      const p1Badge = el(
        "div.kmg-comp-player-pill.is-connected",
        {},
        [el("span", { text: `🔴 ${p1.name} (Host)` })],
      );

      const p2Badge = el(
        "div.kmg-comp-player-pill",
        { className: `kmg-comp-player-pill ${p2 ? "is-connected" : ""}` },
        [el("span", { text: p2 ? `🔵 ${p2.name}` : `⏳ ${t("comp.waiting_for_guest")}` })],
      );

      playersList.append(p1Badge, el("span", { text: " VS ", style: "font-weight: 800;" }), p2Badge);
    };
    updatePlayersList();

    // Start / Ready Action
    const actionArea = el("div.kmg-comp-action-area");
    const updateActionArea = () => {
      clear(actionArea);
      const opponentReady = onlinePlayers.length >= 2;

      if (isHost) {
        const startBtn = el("button.kmg-btn.kmg-btn-primary.kmg-btn-big.kmg-comp-startbtn", {
          type: "button",
          disabled: !opponentReady,
          text: opponentReady ? t("comp.start_btn") : t("comp.waiting_for_guest"),
          onClick: () => {
            client.send({
              type: "start_game",
              roomCode: onlineRoomCode,
              playerId: myPlayerId,
            });
          },
        });
        actionArea.append(startBtn);
      } else {
        const waitingNote = el("div.kmg-banner.kmg-banner-info", {}, [
          el("span.kmg-banner-icon", { text: "⏳" }),
          el("span.kmg-banner-body", {
            text: t("comp.waiting_for_host", { name: onlinePlayers[0]?.name || "de host" }),
          }),
        ]);
        actionArea.append(waitingNote);
      }
    };
    updateActionArea();

    card.append(shareTitle, shareDesc, codeDisplay, codeActions, playersList, actionArea);
    viewSetup.append(head, card);
  }

  // -------------------------------------------------------------------------
  // Online Event Dispatcher
  // -------------------------------------------------------------------------
  function handleOnlineEvent(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "player_joined": {
        onlinePlayers = msg.players || [];
        safePlayFanfare();
        if (onlineStatus === "lobby") {
          renderOnlineWaitingRoom();
        }
        break;
      }

      case "countdown_started": {
        onlineStatus = "countdown";
        viewSetup.hidden = true;
        viewResults.hidden = true;
        viewPlay.hidden = false;
        renderOnlineCountdown(3);
        break;
      }

      case "countdown_tick": {
        renderOnlineCountdown(msg.count);
        break;
      }

      case "round_started": {
        onlineStatus = "in_round";
        onlineCurrentRound = msg;
        myAnswerSubmitted = false;
        renderOnlineRound(msg);
        break;
      }

      case "player_answered": {
        // Opponent or me answered
        if (msg.playerId !== myPlayerId) {
          safePlayTap();
          const oppStatus = viewPlay.querySelector(".kmg-comp-opponent-status");
          if (oppStatus) {
            oppStatus.textContent = t("comp.opponent_answered_alert", {
              name: msg.playerName || "Tegenspeler",
            });
          }
        }
        break;
      }

      case "round_recap": {
        onlineStatus = "round_recap";
        renderOnlineRoundRecap(msg);
        break;
      }

      case "game_finished": {
        onlineStatus = "finished";
        renderOnlineFinished(msg);
        break;
      }

      case "rematch_ready": {
        onlineStatus = "lobby";
        renderOnlineWaitingRoom();
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Online Active Match Screens
  // -------------------------------------------------------------------------
  function renderOnlineCountdown(count) {
    clear(viewPlay);
    safePlayTap();

    const countNode = el("div.kmg-comp-countdown", {}, [
      el("div.kmg-comp-cd-text", { text: t("comp.countdown_ready") }),
      el("div.kmg-comp-cd-num", { text: count > 0 ? String(count) : t("comp.countdown_go") }),
    ]);
    viewPlay.append(countNode);
  }

  function renderOnlineRound(roundData) {
    clear(viewPlay);
    const { roundIndex, totalRounds, question, duration, players } = roundData;

    const me = players.find((p) => p.id === myPlayerId) || { name: "Ik", score: 0 };
    const opponent = players.find((p) => p.id !== myPlayerId) || { name: "Tegenspeler", score: 0 };

    // Header & Scoreboard Bar
    const roundIndicator = el("div.kmg-comp-round-indicator", {
      text: t("comp.round_indicator", { current: roundIndex + 1, total: totalRounds }),
    });

    const timerBar = el("div.kmg-comp-timerbar");
    const timerFill = el("div.kmg-comp-timerfill");
    timerBar.append(timerFill);

    const playHeader = el("div.kmg-comp-play-header", {}, [roundIndicator, timerBar]);

    const scoreboard = el("div.kmg-comp-scoreboard-bar", {}, [
      el("div.kmg-comp-score-box.is-me", {}, [
        el("span.kmg-sub", { text: `🟢 ${me.name} (Jij)` }),
        el("span.kmg-comp-score-pts", { text: `${me.score} pt` }),
      ]),
      el("div.kmg-comp-score-box.is-opponent", {}, [
        el("span.kmg-sub", { text: `🔵 ${opponent.name}` }),
        el("span.kmg-comp-score-pts", { text: `${opponent.score} pt` }),
      ]),
    ]);

    // QUESTION BANNER: Guaranteed 100% visible, huge bold typography!
    const questionBanner = el("div.kmg-comp-question", {
      style: "opacity: 1 !important; transform: none !important; visibility: visible !important;",
    }, [
      el("span.kmg-comp-question-text", {
        text: question.text,
        style: "opacity: 1 !important; visibility: visible !important;",
      }),
    ]);

    const opponentStatus = el("div.kmg-comp-opponent-status", { text: "" });
    const feedbackNode = el("div.kmg-comp-feedback");

    // Choice Buttons Grid
    const choiceGrid = el("div.kmg-comp-choices");
    const choiceButtons = [];

    question.options.forEach((opt) => {
      const btn = el("button.kmg-choice.kmg-comp-choice-btn", {
        type: "button",
        text: String(opt),
        onClick: () => {
          if (myAnswerSubmitted) return;
          myAnswerSubmitted = true;

          // Disable all buttons
          choiceButtons.forEach((b) => (b.disabled = true));
          btn.classList.add("is-selected");

          // Send to server
          client.send({
            type: "submit_answer",
            roomCode: onlineRoomCode,
            playerId: myPlayerId,
            answer: opt,
          });

          feedbackNode.textContent = t("comp.you_answered_badge");
          safePlayTap();
        },
      });
      choiceButtons.push(btn);
      choiceGrid.append(btn);
    });

    const stage = el("div.kmg-comp-online-stage", {}, [
      playHeader,
      scoreboard,
      questionBanner,
      opponentStatus,
      choiceGrid,
      feedbackNode,
    ]);

    viewPlay.append(stage);

    // Round countdown timer fill
    const startTime = Date.now();
    clearInterval(onlineTimerInterval);
    onlineTimerInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const fraction = Math.max(0, 1 - elapsed / duration);
      timerFill.style.width = `${fraction * 100}%`;

      if (fraction <= 0.25) {
        timerFill.classList.add("is-urgent");
      }
      if (elapsed >= duration) {
        clearInterval(onlineTimerInterval);
      }
    }, 100);
  }

  function renderOnlineRoundRecap(recapData) {
    clearInterval(onlineTimerInterval);
    const { correctAnswer, p1Result, p2Result, players } = recapData;

    const me = players.find((p) => p.id === myPlayerId) || { name: "Ik", score: 0 };
    const myResult = myPlayerId === onlinePlayers[0]?.id ? p1Result : p2Result;
    const oppResult = myPlayerId === onlinePlayers[0]?.id ? p2Result : p1Result;

    if (myResult?.isCorrect) safePlayDing();
    else safePlayBuzz();

    const feedbackNode = viewPlay.querySelector(".kmg-comp-feedback");
    if (feedbackNode) {
      clear(feedbackNode);
      if (myResult?.isCorrect) {
        feedbackNode.append(
          el("span.kmg-comp-msg-ok", {
            text: `✓ Goed! +${myResult.points} pt (${myResult.responseSeconds}s)`,
          }),
        );
      } else {
        feedbackNode.append(
          el("span.kmg-comp-msg-bad", {
            text: `✗ ${t("comp.wrong_zero")} (Juiste antwoord: ${correctAnswer})`,
          }),
        );
      }
    }
  }

  function renderOnlineFinished(finalData) {
    clearInterval(onlineTimerInterval);
    viewPlay.hidden = true;
    viewResults.hidden = false;
    clear(viewResults);

    const { winner, winnerName, p1Stats, p2Stats, roundHistory } = finalData;

    const bannerClass =
      winner === "p1"
        ? "is-p1"
        : winner === "p2"
          ? "is-p2"
          : "";

    let bannerTitle = t("comp.winner_tie");
    if (winnerName) {
      bannerTitle = t("comp.winner_p1", { name: winnerName });
    }

    if (winnerName) {
      bigCelebration();
    } else {
      confetti();
    }

    const winnerBanner = el(
      `div.kmg-comp-winner-banner.${bannerClass}`,
      {},
      [
        el("div.kmg-comp-winner-trophy", { text: "🏆" }),
        el("h2.kmg-comp-winner-title", { text: bannerTitle }),
        el("p.kmg-comp-winner-rule", { text: t("comp.scoring_rule_reminder") }),
      ],
    );

    // Summary Score Cards
    const p1Card = el("div.kmg-card.kmg-comp-summary-card.is-p1", {}, [
      el("strong.kmg-comp-player-title", { text: `🔴 ${p1Stats.name}` }),
      el("div.kmg-comp-big-score", { text: `${p1Stats.score}` }),
      el("div.kmg-sub", { text: "punten" }),
      el("div.kmg-comp-stat-line", {
        text: `${t("comp.stats_correct")}: ${p1Stats.correctCount}/${finalData.totalRounds}`,
      }),
      el("div.kmg-comp-stat-line", {
        text: `${t("comp.stats_avg_speed")}: ${p1Stats.avgSpeed}s`,
      }),
    ]);

    const p2Card = el("div.kmg-card.kmg-comp-summary-card.is-p2", {}, [
      el("strong.kmg-comp-player-title", { text: `🔵 ${p2Stats.name}` }),
      el("div.kmg-comp-big-score", { text: `${p2Stats.score}` }),
      el("div.kmg-sub", { text: "punten" }),
      el("div.kmg-comp-stat-line", {
        text: `${t("comp.stats_correct")}: ${p2Stats.correctCount}/${finalData.totalRounds}`,
      }),
      el("div.kmg-comp-stat-line", {
        text: `${t("comp.stats_avg_speed")}: ${p2Stats.avgSpeed}s`,
      }),
    ]);

    const summaryGrid = el("div.kmg-comp-summary-grid", {}, [p1Card, p2Card]);

    // Breakdown Ledger
    const tableCard = el("div.kmg-card", {}, [
      el("h3", { text: "Overzicht per vraag" }),
      renderBreakdownTable(roundHistory, p1Stats.name, p2Stats.name),
    ]);

    // Actions
    const rematchBtn = el("button.kmg-btn.kmg-btn-primary.kmg-btn-big", {
      type: "button",
      text: t("comp.rematch_btn"),
      onClick: () => {
        client.send({
          type: "rematch",
          roomCode: onlineRoomCode,
          playerId: myPlayerId,
        });
      },
    });

    const newMatchBtn = el("button.kmg-btn.kmg-btn-outline", {
      type: "button",
      text: t("comp.new_match_btn"),
      onClick: () => {
        onlineStatus = "lobby";
        viewResults.hidden = true;
        viewSetup.hidden = false;
        renderSetup();
      },
    });

    const homeBtn = el("a.kmg-btn.kmg-btn-subtle", {
      href: "#/",
      text: t("comp.home_btn"),
    });

    const actions = el("div.kmg-actions.kmg-comp-actions", {}, [rematchBtn, newMatchBtn, homeBtn]);

    viewResults.append(winnerBanner, summaryGrid, tableCard, actions);
  }

  // -------------------------------------------------------------------------
  // LOCAL MULTIPLAYER MATCH
  // -------------------------------------------------------------------------
  function renderLocalSetup() {
    const card = el("div.kmg-card.kmg-comp-config-card");

    const p1Input = el("input.kmg-textinput", {
      type: "text",
      value: localP1Name,
      placeholder: t("comp.player1_name"),
    });
    p1Input.addEventListener("input", (e) => (localP1Name = e.target.value.trim() || t("comp.player1")));

    const p2Input = el("input.kmg-textinput", {
      type: "text",
      value: localP2Name,
      placeholder: t("comp.player2_name"),
    });
    p2Input.addEventListener("input", (e) => (localP2Name = e.target.value.trim() || t("comp.player2")));

    const playersRow = el("div.kmg-comp-players-row", {}, [
      el("div.kmg-comp-player-box", {}, [
        el("label.kmg-answer-label", { text: `🔴 ${t("comp.player1_name")}` }),
        p1Input,
      ]),
      el("div.kmg-comp-vs-badge", { text: "VS" }),
      el("div.kmg-comp-player-box", {}, [
        el("label.kmg-answer-label", { text: `🔵 ${t("comp.player2_name")}` }),
        p2Input,
      ]),
    ]);

    const catSelect = el("select.kmg-select");
    const categories = [
      { id: "bliksem", label: t("comp.cat_bliksem") },
      { id: "tafels", label: t("comp.cat_tafels") },
      { id: "breuken", label: t("comp.cat_breuken") },
      { id: "procenten", label: t("comp.cat_procenten") },
      { id: "all", label: t("comp.cat_all") },
    ];
    categories.forEach((cat) => {
      const opt = el("option", { value: cat.id, text: cat.label });
      if (cat.id === selectedCategory) opt.selected = true;
      catSelect.append(opt);
    });
    catSelect.addEventListener("change", (e) => (selectedCategory = e.target.value));

    const roundsRow = el("div.kmg-comp-segmented");
    [5, 10, 15].forEach((n) => {
      const btn = el("button.kmg-comp-segment-btn", {
        type: "button",
        text: `${n} ${t("comp.rounds").toLowerCase()}`,
        className: `kmg-comp-segment-btn ${n === selectedRounds ? "is-active" : ""}`,
        onClick: () => {
          selectedRounds = n;
          [...roundsRow.children].forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
        },
      });
      roundsRow.append(btn);
    });

    const diffRow = el("div.kmg-comp-segmented");
    const diffs = [
      { level: 0, label: t("comp.diff_easy") },
      { level: 2, label: t("comp.diff_medium") },
      { level: 4, label: t("comp.diff_hard") },
    ];
    diffs.forEach((d) => {
      const btn = el("button.kmg-comp-segment-btn", {
        type: "button",
        text: d.label,
        className: `kmg-comp-segment-btn ${d.level === selectedDifficulty ? "is-active" : ""}`,
        onClick: () => {
          selectedDifficulty = d.level;
          [...diffRow.children].forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
        },
      });
      diffRow.append(btn);
    });

    const ruleNote = el("div.kmg-banner.kmg-banner-ok.kmg-comp-rulenote", {}, [
      el("span.kmg-banner-icon", { text: "⚡" }),
      el("span.kmg-banner-body", { text: t("comp.scoring_rule_reminder") }),
    ]);

    const startBtn = el("button.kmg-btn.kmg-btn-primary.kmg-btn-big.kmg-comp-startbtn", {
      type: "button",
      text: t("comp.start_btn"),
      onClick: startLocalMatch,
    });

    card.append(
      playersRow,
      el("div.kmg-comp-field", {}, [
        el("label.kmg-answer-label", { text: t("comp.category") }),
        catSelect,
      ]),
      el("div.kmg-comp-field", {}, [
        el("label.kmg-answer-label", { text: t("comp.rounds") }),
        roundsRow,
      ]),
      el("div.kmg-comp-field", {}, [
        el("label.kmg-answer-label", { text: t("comp.difficulty") }),
        diffRow,
      ]),
      ruleNote,
      startBtn,
    );

    viewSetup.append(card);
  }

  function startLocalMatch() {
    if (localTimerInterval) {
      clearInterval(localTimerInterval);
      localTimerInterval = null;
    }
    if (localTransitionTimeout) {
      clearTimeout(localTransitionTimeout);
      localTransitionTimeout = null;
    }
    if (localCountdownInterval) {
      clearInterval(localCountdownInterval);
      localCountdownInterval = null;
    }

    localQuestions = [];
    for (let i = 0; i < selectedRounds; i++) {
      localQuestions.push(generateCompetitionProblem(selectedCategory, selectedDifficulty));
    }
    localP1Results = [];
    localP2Results = [];
    localQuestionIndex = 0;
    localRoundEnded = false;

    viewSetup.hidden = true;
    viewResults.hidden = true;
    viewPlay.hidden = false;

    renderLocalCountdown(() => {
      runLocalQuestion();
    });
  }

  function renderLocalCountdown(onComplete) {
    if (localCountdownInterval) {
      clearInterval(localCountdownInterval);
      localCountdownInterval = null;
    }
    clear(viewPlay);
    safePlayTap();
    const countNode = el("div.kmg-comp-countdown", {}, [
      el("div.kmg-comp-cd-text", { text: t("comp.countdown_ready") }),
      el("div.kmg-comp-cd-num", { text: "3" }),
    ]);
    viewPlay.append(countNode);

    let count = 3;
    localCountdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        safePlayTap();
        countNode.querySelector(".kmg-comp-cd-num").textContent = String(count);
      } else if (count === 0) {
        safePlayFanfare();
        countNode.querySelector(".kmg-comp-cd-num").textContent = t("comp.countdown_go");
      } else {
        clearInterval(localCountdownInterval);
        localCountdownInterval = null;
        onComplete();
      }
    }, 900);
  }

  function advanceToNextLocalRound(delayMs = 1100) {
    if (localRoundEnded) return;
    localRoundEnded = true;

    if (localTimerInterval) {
      clearInterval(localTimerInterval);
      localTimerInterval = null;
    }
    if (localTransitionTimeout) {
      clearTimeout(localTransitionTimeout);
      localTransitionTimeout = null;
    }

    localTransitionTimeout = setTimeout(() => {
      localTransitionTimeout = null;
      localQuestionIndex++;
      runLocalQuestion();
    }, delayMs);
  }

  function runLocalQuestion() {
    if (localTimerInterval) {
      clearInterval(localTimerInterval);
      localTimerInterval = null;
    }
    if (localTransitionTimeout) {
      clearTimeout(localTransitionTimeout);
      localTransitionTimeout = null;
    }

    if (localQuestionIndex >= localQuestions.length) {
      finishLocalMatch();
      return;
    }

    const problem = localQuestions[localQuestionIndex];
    if (!problem) {
      finishLocalMatch();
      return;
    }

    localP1Answered = false;
    localP2Answered = false;
    localRoundEnded = false;
    localRoundStartTime = Date.now();

    clear(viewPlay);

    const p1TotalScore = localP1Results.reduce((sum, r) => sum + r.points, 0);
    const p2TotalScore = localP2Results.reduce((sum, r) => sum + r.points, 0);

    const roundIndicator = el("div.kmg-comp-round-indicator", {
      text: t("comp.round_indicator", {
        current: localQuestionIndex + 1,
        total: localQuestions.length,
      }),
    });

    const timerBar = el("div.kmg-comp-timerbar");
    const timerFill = el("div.kmg-comp-timerfill");
    timerBar.append(timerFill);

    const header = el("div.kmg-comp-play-header", {}, [roundIndicator, timerBar]);

    const p1ScoreBadge = el("div.kmg-comp-scoretag", { text: `${p1TotalScore} pt` });
    const p2ScoreBadge = el("div.kmg-comp-scoretag", { text: `${p2TotalScore} pt` });

    const p1Feedback = el("div.kmg-comp-feedback");
    const p2Feedback = el("div.kmg-comp-feedback");

    const p1ChoiceGrid = el("div.kmg-comp-choices");
    const p1Buttons = [];
    problem.options.forEach((opt) => {
      const btn = el("button.kmg-choice.kmg-comp-choice-btn", {
        type: "button",
        text: String(opt),
        onClick: () =>
          handleLocalPlayerAnswer(1, opt, problem, btn, p1Feedback, p1Buttons, p2Buttons),
      });
      p1Buttons.push(btn);
      p1ChoiceGrid.append(btn);
    });

    const p2ChoiceGrid = el("div.kmg-comp-choices");
    const p2Buttons = [];
    problem.options.forEach((opt) => {
      const btn = el("button.kmg-choice.kmg-comp-choice-btn", {
        type: "button",
        text: String(opt),
        onClick: () =>
          handleLocalPlayerAnswer(2, opt, problem, btn, p2Feedback, p2Buttons, p1Buttons),
      });
      p2Buttons.push(btn);
      p2ChoiceGrid.append(btn);
    });

    // P1 Card with 100% visible question text
    const p1Card = el("div.kmg-comp-player-card.is-p1", {}, [
      el("div.kmg-comp-card-head", {}, [
        el("strong.kmg-comp-player-title", { text: `🔴 ${localP1Name}` }),
        p1ScoreBadge,
      ]),
      el(
        "div.kmg-comp-question",
        {
          style:
            "opacity: 1 !important; visibility: visible !important; transform: none !important;",
        },
        [
          el("span.kmg-comp-question-text", {
            text: problem.text,
            style: "opacity: 1 !important; visibility: visible !important;",
          }),
        ],
      ),
      p1ChoiceGrid,
      p1Feedback,
    ]);

    // P2 Card with 100% visible question text
    const p2Card = el("div.kmg-comp-player-card.is-p2", {}, [
      el("div.kmg-comp-card-head", {}, [
        el("strong.kmg-comp-player-title", { text: `🔵 ${localP2Name}` }),
        p2ScoreBadge,
      ]),
      el(
        "div.kmg-comp-question",
        {
          style:
            "opacity: 1 !important; visibility: visible !important; transform: none !important;",
        },
        [
          el("span.kmg-comp-question-text", {
            text: problem.text,
            style: "opacity: 1 !important; visibility: visible !important;",
          }),
        ],
      ),
      p2ChoiceGrid,
      p2Feedback,
    ]);

    const arena = el("div.kmg-comp-arena", {}, [p1Card, p2Card]);
    viewPlay.append(header, arena);

    // Timer loop
    clearInterval(localTimerInterval);
    localTimerInterval = setInterval(() => {
      if (localRoundEnded) {
        clearInterval(localTimerInterval);
        localTimerInterval = null;
        return;
      }

      const elapsed = (Date.now() - localRoundStartTime) / 1000;
      const fraction = Math.max(0, 1 - elapsed / ROUND_TIME_SECONDS);
      timerFill.style.width = `${fraction * 100}%`;

      if (fraction <= 0.25) {
        timerFill.classList.add("is-urgent");
      }

      if (elapsed >= ROUND_TIME_SECONDS) {
        clearInterval(localTimerInterval);
        localTimerInterval = null;
        handleLocalTimeout(problem, p1Buttons, p2Buttons, p1Feedback, p2Feedback);
      }
    }, 100);
  }

  function handleLocalPlayerAnswer(
    playerNum,
    chosen,
    problem,
    button,
    feedbackNode,
    myButtons,
    oppButtons,
  ) {
    if (localRoundEnded) return;
    if (playerNum === 1 && localP1Answered) return;
    if (playerNum === 2 && localP2Answered) return;

    const responseSeconds = Number(
      Math.max(0.05, (Date.now() - localRoundStartTime) / 1000).toFixed(2),
    );
    const isCorrect = String(chosen) === String(problem.answerDisplay);
    const points = calculateCompetitionPoints(isCorrect, responseSeconds, ROUND_TIME_SECONDS);

    if (playerNum === 1) {
      localP1Answered = true;
      localP1Results.push({
        question: problem.text,
        correctAnswer: problem.answerDisplay,
        chosen,
        isCorrect,
        points,
        responseSeconds,
      });
    } else {
      localP2Answered = true;
      localP2Results.push({
        question: problem.text,
        correctAnswer: problem.answerDisplay,
        chosen,
        isCorrect,
        points,
        responseSeconds,
      });
    }

    // Disable this player's buttons immediately
    if (myButtons) {
      myButtons.forEach((b) => (b.disabled = true));
    }
    clear(feedbackNode);

    if (isCorrect) {
      safePlayDing();
      button.classList.add("is-correct");
      feedbackNode.append(
        el("span.kmg-comp-msg-ok", {
          text: `✓ Goed! +${points} pt (${responseSeconds}s)`,
        }),
      );
    } else {
      safePlayBuzz();
      button.classList.add("is-wrong");
      feedbackNode.append(
        el("span.kmg-comp-msg-bad", {
          text: `✗ ${t("comp.wrong_zero")}`,
        }),
      );
    }

    // If both players have answered, disable opponent buttons as well and advance to next round!
    if (localP1Answered && localP2Answered) {
      if (myButtons) myButtons.forEach((b) => (b.disabled = true));
      if (oppButtons) oppButtons.forEach((b) => (b.disabled = true));
      advanceToNextLocalRound(1100);
    }
  }

  function handleLocalTimeout(problem, p1Buttons, p2Buttons, p1Feedback, p2Feedback) {
    if (localRoundEnded) return;

    safePlayBuzz();

    p1Buttons.forEach((b) => (b.disabled = true));
    p2Buttons.forEach((b) => (b.disabled = true));

    if (!localP1Answered) {
      localP1Answered = true;
      localP1Results.push({
        question: problem.text,
        correctAnswer: problem.answerDisplay,
        chosen: "—",
        isCorrect: false,
        points: 0,
        responseSeconds: ROUND_TIME_SECONDS,
      });
      clear(p1Feedback);
      p1Feedback.append(el("span.kmg-comp-msg-bad", { text: `⏰ ${t("comp.times_up")}` }));
    }

    if (!localP2Answered) {
      localP2Answered = true;
      localP2Results.push({
        question: problem.text,
        correctAnswer: problem.answerDisplay,
        chosen: "—",
        isCorrect: false,
        points: 0,
        responseSeconds: ROUND_TIME_SECONDS,
      });
      clear(p2Feedback);
      p2Feedback.append(el("span.kmg-comp-msg-bad", { text: `⏰ ${t("comp.times_up")}` }));
    }

    // Time ran out -> advance to next round!
    advanceToNextLocalRound(1300);
  }

  function finishLocalMatch() {
    if (localTimerInterval) {
      clearInterval(localTimerInterval);
      localTimerInterval = null;
    }
    if (localTransitionTimeout) {
      clearTimeout(localTransitionTimeout);
      localTransitionTimeout = null;
    }
    if (localCountdownInterval) {
      clearInterval(localCountdownInterval);
      localCountdownInterval = null;
    }
    viewPlay.hidden = true;
    viewResults.hidden = false;
    clear(viewResults);

    const p1TotalScore = localP1Results.reduce((s, r) => s + r.points, 0);
    const p2TotalScore = localP2Results.reduce((s, r) => s + r.points, 0);

    const p1CorrectCount = localP1Results.filter((r) => r.isCorrect).length;
    const p2CorrectCount = localP2Results.filter((r) => r.isCorrect).length;

    const p1AvgSpeed =
      p1CorrectCount > 0
        ? (
            localP1Results.filter((r) => r.isCorrect).reduce((s, r) => s + r.responseSeconds, 0) /
            p1CorrectCount
          ).toFixed(1)
        : "—";

    const p2AvgSpeed =
      p2CorrectCount > 0
        ? (
            localP2Results.filter((r) => r.isCorrect).reduce((s, r) => s + r.responseSeconds, 0) /
            p2CorrectCount
          ).toFixed(1)
        : "—";

    let winner = "tie";
    let bannerTitle = t("comp.winner_tie");
    let bannerClass = "";

    if (p1TotalScore > p2TotalScore) {
      winner = "p1";
      bannerTitle = t("comp.winner_p1", { name: localP1Name });
      bannerClass = "is-p1";
      bigCelebration();
    } else if (p2TotalScore > p1TotalScore) {
      winner = "p2";
      bannerTitle = t("comp.winner_p2", { name: localP2Name });
      bannerClass = "is-p2";
      bigCelebration();
    } else {
      confetti();
    }

    const winnerBanner = el(
      `div.kmg-comp-winner-banner.${bannerClass}`,
      {},
      [
        el("div.kmg-comp-winner-trophy", { text: "🏆" }),
        el("h2.kmg-comp-winner-title", { text: bannerTitle }),
        el("p.kmg-comp-winner-rule", { text: t("comp.scoring_rule_reminder") }),
      ],
    );

    const p1Card = el("div.kmg-card.kmg-comp-summary-card.is-p1", {}, [
      el("strong.kmg-comp-player-title", { text: `🔴 ${localP1Name}` }),
      el("div.kmg-comp-big-score", { text: `${p1TotalScore}` }),
      el("div.kmg-sub", { text: "punten" }),
      el("div.kmg-comp-stat-line", {
        text: `${t("comp.stats_correct")}: ${p1CorrectCount}/${localQuestions.length}`,
      }),
      el("div.kmg-comp-stat-line", {
        text: `${t("comp.stats_avg_speed")}: ${p1AvgSpeed}s`,
      }),
    ]);

    const p2Card = el("div.kmg-card.kmg-comp-summary-card.is-p2", {}, [
      el("strong.kmg-comp-player-title", { text: `🔵 ${localP2Name}` }),
      el("div.kmg-comp-big-score", { text: `${p2TotalScore}` }),
      el("div.kmg-sub", { text: "punten" }),
      el("div.kmg-comp-stat-line", {
        text: `${t("comp.stats_correct")}: ${p2CorrectCount}/${localQuestions.length}`,
      }),
      el("div.kmg-comp-stat-line", {
        text: `${t("comp.stats_avg_speed")}: ${p2AvgSpeed}s`,
      }),
    ]);

    const summaryGrid = el("div.kmg-comp-summary-grid", {}, [p1Card, p2Card]);

    const roundHistory = localQuestions.map((q, idx) => {
      const r1 = localP1Results[idx] || {};
      const r2 = localP2Results[idx] || {};
      let rWinner = "Gelijk";
      if ((r1.points || 0) > (r2.points || 0)) rWinner = localP1Name;
      else if ((r2.points || 0) > (r1.points || 0)) rWinner = localP2Name;

      return {
        round: idx + 1,
        question: q.text,
        correctAnswer: q.answerDisplay,
        p1: { name: localP1Name, ...r1 },
        p2: { name: localP2Name, ...r2 },
        roundWinner: rWinner,
      };
    });

    const tableCard = el("div.kmg-card", {}, [
      el("h3", { text: "Overzicht per vraag" }),
      renderBreakdownTable(roundHistory, localP1Name, localP2Name),
    ]);

    const rematchBtn = el("button.kmg-btn.kmg-btn-primary.kmg-btn-big", {
      type: "button",
      text: t("comp.rematch_btn"),
      onClick: startLocalMatch,
    });

    const newMatchBtn = el("button.kmg-btn.kmg-btn-outline", {
      type: "button",
      text: t("comp.new_match_btn"),
      onClick: () => {
        if (localTimerInterval) {
          clearInterval(localTimerInterval);
          localTimerInterval = null;
        }
        if (localTransitionTimeout) {
          clearTimeout(localTransitionTimeout);
          localTransitionTimeout = null;
        }
        if (localCountdownInterval) {
          clearInterval(localCountdownInterval);
          localCountdownInterval = null;
        }
        viewResults.hidden = true;
        viewSetup.hidden = false;
        renderSetup();
      },
    });

    const homeBtn = el("a.kmg-btn.kmg-btn-subtle", {
      href: "#/",
      text: t("comp.home_btn"),
    });

    const actions = el("div.kmg-actions.kmg-comp-actions", {}, [rematchBtn, newMatchBtn, homeBtn]);

    viewResults.append(winnerBanner, summaryGrid, tableCard, actions);
  }

  // -------------------------------------------------------------------------
  // Breakdown Table Component
  // -------------------------------------------------------------------------
  function renderBreakdownTable(roundHistory, p1Name, p2Name) {
    const table = el("table.kmg-table.kmg-comp-table");
    const thead = el("thead", {}, [
      el("tr", {}, [
        el("th", { text: "#" }),
        el("th", { text: t("comp.table_q") }),
        el("th", { text: t("comp.table_correct") }),
        el("th", { text: `🔴 ${p1Name}` }),
        el("th", { text: `🔵 ${p2Name}` }),
        el("th", { text: t("comp.table_winner") }),
      ]),
    ]);

    const tbody = el("tbody");
    roundHistory.forEach((item) => {
      const p1Class = item.p1?.isCorrect ? "kmg-cell-ok" : "kmg-cell-bad";
      const p2Class = item.p2?.isCorrect ? "kmg-cell-ok" : "kmg-cell-bad";

      const tr = el("tr", {}, [
        el("td", { text: String(item.round) }),
        el("td.kmg-comp-q-cell", { text: item.question }),
        el("td.kmg-comp-ans-cell", { text: String(item.correctAnswer) }),
        el(`td.${p1Class}`, {
          text: `${item.p1?.chosen ?? "—"} (${item.p1?.points ?? 0} pt)`,
        }),
        el(`td.${p2Class}`, {
          text: `${item.p2?.chosen ?? "—"} (${item.p2?.points ?? 0} pt)`,
        }),
        el("td.kmg-comp-winner-cell", { text: item.roundWinner || "—" }),
      ]);
      tbody.append(tr);
    });

    table.append(thead, tbody);
    return table;
  }

  renderSetup();
  root.append(viewSetup, viewPlay, viewResults);
  container.append(root);

  return () => {
    if (localTimerInterval) clearInterval(localTimerInterval);
    if (localTransitionTimeout) clearTimeout(localTransitionTimeout);
    if (localCountdownInterval) clearInterval(localCountdownInterval);
    if (onlineTimerInterval) clearInterval(onlineTimerInterval);
    if (client) client.stop();
  };
}
