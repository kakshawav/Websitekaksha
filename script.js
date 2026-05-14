const cursorGlow = document.querySelector(".cursor-glow");
const bootScreen = document.querySelector(".boot-screen");
const clock = document.querySelector("#clock");
const parallaxNodes = [...document.querySelectorAll("[data-depth]")];
const draggableNodes = [...document.querySelectorAll(".draggable")];
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const prefersCoarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;

let pointerX = window.innerWidth / 2;
let pointerY = window.innerHeight / 2;
let glowX = pointerX;
let glowY = pointerY;
let audioContext;
let bootSoundStarted = false;

function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = new AudioContextClass();
  return audioContext;
}

function scheduleTone(ctx, frequency, startTime, duration, volume = 0.08) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function playBootSound() {
  if (bootSoundStarted || prefersReducedMotion) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  bootSoundStarted = true;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const start = ctx.currentTime + 0.04;
  for (let index = 0; index < 18; index += 1) {
    scheduleTone(ctx, 180 + index * 18, start + index * 0.095, 0.045, 0.055);
  }
  scheduleTone(ctx, 660, start + 1.9, 0.11, 0.09);
  scheduleTone(ctx, 330, start + 2.03, 0.14, 0.07);
}

function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx?.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  if (bootScreen && !bootScreen.classList.contains("is-done")) {
    playBootSound();
  }
}

function updateClock() {
  if (!clock) return;

  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  clock.textContent = time;
  clock.dateTime = now.toISOString();
}

function animateCursor() {
  if (prefersReducedMotion || !cursorGlow) return;

  glowX += (pointerX - glowX) * 0.18;
  glowY += (pointerY - glowY) * 0.18;
  cursorGlow.style.transform = `translate3d(${glowX - 17}px, ${glowY - 17}px, 0)`;
  requestAnimationFrame(animateCursor);
}

function updateParallax() {
  if (prefersCoarsePointer) return;

  const x = (pointerX / window.innerWidth - 0.5) * 2;
  const y = (pointerY / window.innerHeight - 0.5) * 2;

  parallaxNodes.forEach((node) => {
    const depth = Number(node.dataset.depth || 0);
    node.style.setProperty("--mx", `${x * depth * 90}px`);
    node.style.setProperty("--my", `${y * depth * 90}px`);
    node.style.translate = "var(--mx) var(--my)";
  });
}

function createSpark(x, y) {
  const spark = document.createElement("span");
  spark.className = "pointer-spark";
  spark.style.left = `${x}px`;
  spark.style.top = `${y}px`;
  document.body.append(spark);
  window.setTimeout(() => spark.remove(), 620);
}

function makeDraggable(node) {
  if (prefersCoarsePointer) return;

  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;

  node.addEventListener("pointerdown", (event) => {
    const isControl = event.target.closest("a, button, input, textarea, select, canvas, [contenteditable='true']");
    if (isControl && !event.target.closest(".window-bar")) return;

    const rect = node.getBoundingClientRect();
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    node.classList.add("dragging");
    node.setPointerCapture(event.pointerId);
  });

  node.addEventListener("pointermove", (event) => {
    if (!dragging) return;

    const parentRect = node.offsetParent?.getBoundingClientRect();
    const left = event.clientX - (parentRect?.left || 0) - offsetX;
    const top = event.clientY - (parentRect?.top || 0) - offsetY;
    const moved = Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY);

    if (moved > 4) {
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
      node.style.right = "auto";
      node.style.bottom = "auto";
      node.style.transform = "rotate(0deg)";
    }
  });

  node.addEventListener("pointerup", (event) => {
    dragging = false;
    node.classList.remove("dragging");
    if (node.hasPointerCapture(event.pointerId)) {
      node.releasePointerCapture(event.pointerId);
    }
  });
}

function setupSongPreviews() {
  const songCards = [...document.querySelectorAll(".song-card")];
  if (!songCards.length) return;

  const previewAudio = new Audio();
  previewAudio.loop = true;
  previewAudio.volume = 0.5;
  previewAudio.preload = "none";
  let activeCard = null;

  function setStatus(card, text) {
    const status = card.querySelector(".song-status");
    if (status) status.textContent = text;
  }

  function pauseYoutube(card) {
    const iframe = card.querySelector("iframe");
    if (!iframe?.contentWindow) return;

    iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), "*");
  }

  function ensureYoutubeEmbed(card) {
    const youtubeId = card.dataset.youtubeId;
    const slot = card.querySelector(".song-embed");
    if (!youtubeId || !slot || slot.children.length) return;

    const origin = encodeURIComponent(window.location.origin || window.location.href);
    const iframe = document.createElement("iframe");
    iframe.title = `${card.dataset.song || "Kaksha"} YouTube preview`;
    iframe.loading = "lazy";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    iframe.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=1&playsinline=1&enablejsapi=1&origin=${origin}`;
    slot.append(iframe);
  }

  async function startCard(card) {
    if (activeCard && activeCard !== card) {
      stopCard(activeCard);
    }

    activeCard = card;
    card.classList.add("is-playing");
    ensureYoutubeEmbed(card);

    const audioSrc = card.dataset.audioSrc;
    if (!audioSrc) {
      setStatus(card, "open stream");
      return;
    }

    if (!previewAudio.src.includes(audioSrc)) {
      previewAudio.src = audioSrc;
    }

    previewAudio.currentTime = 0;
    try {
      await previewAudio.play();
      setStatus(card, "playing preview");
    } catch {
      setStatus(card, "click to play");
    }
  }

  function stopCard(card) {
    if (!card) return;

    card.classList.remove("is-playing");
    pauseYoutube(card);
    if (activeCard === card) {
      previewAudio.pause();
      activeCard = null;
    }
    setStatus(card, card.dataset.audioSrc ? "hover preview" : "open stream");
  }

  songCards.forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--card-x", `${event.clientX - rect.left}px`);
      card.style.setProperty("--card-y", `${event.clientY - rect.top}px`);
    });

    card.addEventListener("pointerenter", () => {
      if (!prefersCoarsePointer) startCard(card);
    });
    card.addEventListener("focusin", () => startCard(card));
    card.addEventListener("pointerleave", () => {
      if (!prefersCoarsePointer) stopCard(card);
    });
    card.addEventListener("focusout", () => stopCard(card));
    card.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey) return;
      if (card.dataset.audioSrc) {
        startCard(card);
        return;
      }
      if (card.dataset.streamUrl) {
        window.open(card.dataset.streamUrl, "_blank", "noopener,noreferrer");
      }
    });
  });
}

function setupGame() {
  const canvas = document.querySelector("#kakshaGame");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const keys = new Set();
  const characterButtons = [...document.querySelectorAll("[data-character]")];
  const controlButtons = [...document.querySelectorAll("[data-game-key]")];
  const resetButton = document.querySelector("[data-game-reset]");
  const groundY = 226;
  const platforms = [
    { x: 96, y: 172, width: 98, height: 12 },
    { x: 252, y: 132, width: 112, height: 12 },
    { x: 388, y: 184, width: 82, height: 12 }
  ];
  const noteTemplate = [
    { x: 124, y: 142, label: "RAVE" },
    { x: 290, y: 102, label: "CTRL" },
    { x: 414, y: 154, label: "CAVE" },
    { x: 462, y: 198, label: "4L" }
  ];
  const glitches = [
    { x: 214, y: groundY - 22, width: 20, height: 22, dir: 1, min: 198, max: 252 },
    { x: 354, y: groundY - 22, width: 20, height: 22, dir: -1, min: 330, max: 392 }
  ];
  const characters = {
    tasveer: { label: "T", color: "#36ffe2", accent: "#f5ff31", speed: 2.65, jump: -8.7 },
    kaydie: { label: "K", color: "#ff86cf", accent: "#36ffe2", speed: 3.05, jump: -8.1 },
    kash: { label: "K$", color: "#f5ff31", accent: "#ff2aa3", speed: 2.45, jump: -9.3 }
  };
  const game = {
    selected: "tasveer",
    score: 0,
    won: false,
    message: "Collect song notes",
    frame: 0,
    notes: [],
    player: { x: 24, y: groundY - 28, width: 22, height: 28, vx: 0, vy: 0, onGround: true }
  };

  function resetGame() {
    game.score = 0;
    game.won = false;
    game.message = "Collect song notes";
    game.notes = noteTemplate.map((note) => ({ ...note, collected: false }));
    game.player = { x: 24, y: groundY - 28, width: 22, height: 28, vx: 0, vy: 0, onGround: true };
    glitches[0].x = 214;
    glitches[1].x = 354;
  }

  function intersects(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function updateGame() {
    const character = characters[game.selected];
    const player = game.player;
    game.frame += 1;

    player.vx = 0;
    if (keys.has("left")) player.vx -= character.speed;
    if (keys.has("right")) player.vx += character.speed;
    if (keys.has("jump") && player.onGround) {
      player.vy = character.jump;
      player.onGround = false;
    }

    player.vy += 0.38;
    player.x += player.vx;
    player.y += player.vy;
    player.x = Math.max(4, Math.min(canvas.width - player.width - 4, player.x));

    player.onGround = false;
    if (player.y + player.height >= groundY) {
      player.y = groundY - player.height;
      player.vy = 0;
      player.onGround = true;
    }

    platforms.forEach((platform) => {
      const fallingOntoPlatform = player.vy >= 0 && player.y + player.height <= platform.y + player.vy + 8;
      if (fallingOntoPlatform && intersects(player, platform)) {
        player.y = platform.y - player.height;
        player.vy = 0;
        player.onGround = true;
      }
    });

    glitches.forEach((glitch) => {
      glitch.x += glitch.dir * 0.85;
      if (glitch.x <= glitch.min || glitch.x >= glitch.max) glitch.dir *= -1;
      if (intersects(player, glitch)) {
        game.message = "Glitch hit. Rebooting...";
        player.x = 24;
        player.y = groundY - player.height;
        player.vy = 0;
      }
    });

    game.notes.forEach((note) => {
      if (note.collected) return;
      const noteBox = { x: note.x, y: note.y, width: 22, height: 22 };
      if (intersects(player, noteBox)) {
        note.collected = true;
        game.score += 1;
        game.message = `${note.label} saved`;
      }
    });

    if (player.x > 474 && game.score === game.notes.length) {
      game.won = true;
      game.message = "Portal found. Kaksha 4L.";
    } else if (player.x > 474) {
      game.message = "Need every note first";
    }
  }

  function drawPixelText(text, x, y, size = 14, color = "#fffaf0") {
    ctx.fillStyle = color;
    ctx.font = `900 ${size}px Courier New, monospace`;
    ctx.fillText(text, x, y);
  }

  function drawGame() {
    const character = characters[game.selected];
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#09020e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(54, 255, 226, 0.08)";
    for (let x = 0; x < canvas.width; x += 26) ctx.fillRect(x, 0, 2, canvas.height);
    for (let y = 0; y < canvas.height; y += 26) ctx.fillRect(0, y, canvas.width, 2);

    ctx.fillStyle = "#171019";
    ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
    ctx.fillStyle = "#f5ff31";
    ctx.fillRect(0, groundY, canvas.width, 4);

    platforms.forEach((platform, index) => {
      ctx.fillStyle = index % 2 ? "#ff86cf" : "#36ffe2";
      ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
      ctx.fillStyle = "#000";
      ctx.fillRect(platform.x + 5, platform.y + platform.height, platform.width, 5);
    });

    game.notes.forEach((note) => {
      if (note.collected) return;
      ctx.fillStyle = "#fffaf0";
      ctx.fillRect(note.x, note.y, 22, 16);
      ctx.fillStyle = "#ff2aa3";
      ctx.fillRect(note.x + 3, note.y - 8 + Math.sin(game.frame / 8) * 2, 10, 10);
      drawPixelText(note.label, note.x - 4, note.y - 12, 10, "#f5ff31");
    });

    glitches.forEach((glitch) => {
      ctx.fillStyle = "#ff2aa3";
      ctx.fillRect(glitch.x, glitch.y, glitch.width, glitch.height);
      ctx.fillStyle = "#000";
      ctx.fillRect(glitch.x + 4, glitch.y + 6, 4, 4);
      ctx.fillRect(glitch.x + 13, glitch.y + 6, 4, 4);
    });

    ctx.fillStyle = game.score === game.notes.length ? "#36ffe2" : "#555";
    ctx.fillRect(482, groundY - 60, 28, 60);
    ctx.fillStyle = "#000";
    ctx.fillRect(488, groundY - 45, 16, 42);
    drawPixelText("PORTAL", 454, groundY - 68, 11, "#fffaf0");

    const player = game.player;
    ctx.fillStyle = "#000";
    ctx.fillRect(player.x + 4, player.y + 5, player.width, player.height);
    ctx.fillStyle = character.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
    ctx.fillStyle = character.accent;
    ctx.fillRect(player.x + 4, player.y + 5, player.width - 8, 7);
    ctx.fillStyle = "#050009";
    drawPixelText(character.label, player.x + 4, player.y + 22, 12, "#050009");

    ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
    ctx.fillRect(10, 10, 236, 42);
    drawPixelText(`NOTES ${game.score}/${game.notes.length}`, 20, 29, 14, "#36ffe2");
    drawPixelText(game.message, 20, 45, 12, game.won ? "#f5ff31" : "#fffaf0");
  }

  function loop() {
    updateGame();
    drawGame();
    requestAnimationFrame(loop);
  }

  function setCharacter(name) {
    game.selected = name;
    characterButtons.forEach((button) => button.classList.toggle("is-selected", button.dataset.character === name));
    resetGame();
    canvas.focus({ preventScroll: true });
  }

  const keyMap = {
    ArrowLeft: "left",
    a: "left",
    A: "left",
    ArrowRight: "right",
    d: "right",
    D: "right",
    ArrowUp: "jump",
    w: "jump",
    W: "jump",
    " ": "jump"
  };

  window.addEventListener("keydown", (event) => {
    const action = keyMap[event.key];
    if (!action) return;
    if (document.activeElement === canvas || canvas.matches(":hover")) event.preventDefault();
    keys.add(action);
  });

  window.addEventListener("keyup", (event) => {
    const action = keyMap[event.key];
    if (action) keys.delete(action);
  });

  characterButtons.forEach((button) => {
    button.addEventListener("click", () => setCharacter(button.dataset.character));
  });

  controlButtons.forEach((button) => {
    const action = button.dataset.gameKey;
    const press = (event) => {
      event.preventDefault();
      keys.add(action);
      canvas.focus({ preventScroll: true });
    };
    const release = () => keys.delete(action);
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("pointercancel", release);
  });

  resetButton?.addEventListener("click", () => {
    resetGame();
    canvas.focus({ preventScroll: true });
  });

  resetGame();
  loop();
}

function setupWhiteboard() {
  const form = document.querySelector("#noteForm");
  const input = document.querySelector("#noteText");
  const board = document.querySelector("#stickyBoard");
  if (!form || !input || !board) return;

  const storageKey = "kaksha-whiteboard-notes-v1";
  const remoteEndpoint = window.KAKSHA_BOARD_ENDPOINT || "";
  let notes = [];

  function makeNoteId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function defaultNotes() {
    return [
      { id: makeNoteId(), text: "Tasveer was here. Play Daraz Mai again.", x: 8, y: 10, tilt: "-3deg" },
      { id: makeNoteId(), text: "Kaydie says: save the noisy takes.", x: 46, y: 18, tilt: "2deg" },
      { id: makeNoteId(), text: "Kash found the portal behind the chorus.", x: 20, y: 56, tilt: "-1deg" }
    ];
  }

  function readLocalNotes() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      return Array.isArray(saved) ? saved : defaultNotes();
    } catch {
      return defaultNotes();
    }
  }

  function saveNotes() {
    localStorage.setItem(storageKey, JSON.stringify(notes));
    if (!remoteEndpoint) return;

    fetch(remoteEndpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes })
    }).catch(() => {});
  }

  async function loadRemoteNotes() {
    if (!remoteEndpoint) return false;
    try {
      const response = await fetch(remoteEndpoint, { cache: "no-store" });
      if (!response.ok) return false;
      const data = await response.json();
      if (!Array.isArray(data.notes)) return false;
      notes = data.notes;
      localStorage.setItem(storageKey, JSON.stringify(notes));
      renderNotes();
      return true;
    } catch {
      return false;
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createNote(text) {
    return {
      id: makeNoteId(),
      text,
      x: 7 + Math.random() * 58,
      y: 8 + Math.random() * 58,
      tilt: `${(Math.random() * 8 - 4).toFixed(1)}deg`
    };
  }

  function makeStickyDraggable(noteElement, note) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    noteElement.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, [contenteditable='true']")) return;
      const rect = noteElement.getBoundingClientRect();
      dragging = true;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      noteElement.setPointerCapture(event.pointerId);
    });

    noteElement.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const boardRect = board.getBoundingClientRect();
      const x = ((event.clientX - boardRect.left - offsetX) / boardRect.width) * 100;
      const y = ((event.clientY - boardRect.top - offsetY) / boardRect.height) * 100;
      note.x = clamp(x, 2, 76);
      note.y = clamp(y, 2, 68);
      noteElement.style.left = `${note.x}%`;
      noteElement.style.top = `${note.y}%`;
    });

    noteElement.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      dragging = false;
      if (noteElement.hasPointerCapture(event.pointerId)) {
        noteElement.releasePointerCapture(event.pointerId);
      }
      saveNotes();
    });
  }

  function renderNotes() {
    board.replaceChildren();
    notes.forEach((note) => {
      const noteElement = document.createElement("article");
      const removeButton = document.createElement("button");
      const text = document.createElement("p");

      noteElement.className = "sticky-note";
      noteElement.style.left = `${note.x}%`;
      noteElement.style.top = `${note.y}%`;
      noteElement.style.setProperty("--note-tilt", note.tilt || "-2deg");
      removeButton.type = "button";
      removeButton.textContent = "x";
      removeButton.setAttribute("aria-label", "Remove sticky note");
      text.contentEditable = "true";
      text.spellcheck = false;
      text.textContent = note.text;

      removeButton.addEventListener("click", () => {
        notes = notes.filter((item) => item.id !== note.id);
        saveNotes();
        renderNotes();
      });
      text.addEventListener("input", () => {
        note.text = text.textContent.trim().slice(0, 96) || "blank note";
        saveNotes();
      });
      text.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          text.blur();
        }
      });

      noteElement.append(removeButton, text);
      makeStickyDraggable(noteElement, note);
      board.append(noteElement);
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    notes.push(createNote(value));
    input.value = "";
    saveNotes();
    renderNotes();
  });

  notes = readLocalNotes();
  renderNotes();
  loadRemoteNotes();
  if (remoteEndpoint) window.setInterval(loadRemoteNotes, 10000);
}

window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

window.addEventListener("pointermove", (event) => {
  pointerX = event.clientX;
  pointerY = event.clientY;

  if (prefersReducedMotion || prefersCoarsePointer) return;

  if (cursorGlow) cursorGlow.style.opacity = "1";
  updateParallax();

  if (Math.random() > 0.86) {
    createSpark(pointerX, pointerY);
  }
});

document.addEventListener("pointerleave", () => {
  if (cursorGlow) cursorGlow.style.opacity = "0";
});

draggableNodes.forEach(makeDraggable);
setupSongPreviews();
setupGame();
setupWhiteboard();
updateClock();
window.setInterval(updateClock, 1000);
animateCursor();

window.setTimeout(() => {
  if (!bootScreen) return;

  bootScreen.classList.add("is-done");
  bootScreen.style.opacity = "0";
  bootScreen.style.visibility = "hidden";
  bootScreen.style.pointerEvents = "none";
}, prefersReducedMotion ? 0 : 2600);

const style = document.createElement("style");
style.textContent = `
  .pointer-spark {
    position: fixed;
    z-index: 44;
    width: 7px;
    height: 7px;
    pointer-events: none;
    background: #f5ff31;
    box-shadow: 0 0 0 2px #000, 0 0 16px #36ffe2;
    transform: translate(-50%, -50%) rotate(45deg);
    animation: sparkPop 620ms ease-out forwards;
  }

  @keyframes sparkPop {
    to {
      opacity: 0;
      transform: translate(-50%, -50%) translateY(-24px) rotate(135deg) scale(0.1);
    }
  }
`;
document.head.append(style);
