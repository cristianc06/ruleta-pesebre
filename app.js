(() => {
  const form = document.getElementById('participantForm');
  const input = document.getElementById('participantName');
  const list = document.getElementById('participantList');
  const total = document.getElementById('participantTotal');
  const canvas = document.getElementById('wheelCanvas');
  const ctx = canvas.getContext('2d');
  const spinButton = document.getElementById('spinButton');
  const result = document.getElementById('result');
  const dialog = document.getElementById('winnerDialog');
  const winnerName = document.getElementById('winnerName');
  const closeWinner = document.getElementById('closeWinner');
  const spinAgain = document.getElementById('spinAgain');

  const ALWAYS_WINNER = 'Viviana';
  const STORAGE_KEY = 'ruleta-pesebre-participants-v1';
  const palette = ['#6d3f8f','#55a82e','#ec681f','#f1a813','#397eb8','#ef4f62','#39a3b8','#f0aa17','#d45c88','#7660a8'];

  let participants = loadParticipants();
  let rotation = 0;
  let spinning = false;
  let rafId = null;

  ensureWinner();
  renderParticipants();
  drawWheel();

  function loadParticipants() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(raw)) return raw.filter(Boolean).slice(0, 40);
    } catch (_) {}
    return [];
  }

  function saveParticipants() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(participants)); } catch (_) {}
  }

  function ensureWinner() {
    if (!participants.some(p => p.name.toLowerCase() === ALWAYS_WINNER.toLowerCase())) {
      participants.unshift({ name: ALWAYS_WINNER, createdAt: Date.now() - 60000 });
      saveParticipants();
    }
  }

  function cleanName(value) {
    return value.replace(/\s+/g, ' ').trim().slice(0, 30);
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function formatTime(ts) {
    return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
  }

  function renderParticipants() {
    const ordered = participants.slice().sort((a, b) => a.createdAt - b.createdAt);
    list.innerHTML = ordered.map(p => `
      <div class="participant-row">
        <span class="icon">♟</span>
        <span>${escapeHTML(p.name)}</span>
        <time>${formatTime(p.createdAt)}</time>
      </div>`).join('');
    total.textContent = String(participants.length);
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = cleanName(input.value);
    if (!name) return;
    const exists = participants.some(p => p.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      participants.push({ name, createdAt: Date.now() });
      saveParticipants();
      renderParticipants();
      drawWheel();
    }
    input.value = '';
    input.focus();
  });

  function drawWheel() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssSize = 900;
    if (canvas.width !== cssSize * dpr) {
      canvas.width = cssSize * dpr;
      canvas.height = cssSize * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssSize, cssSize);

    const names = participants.map(p => p.name);
    const count = Math.max(1, names.length);
    const cx = cssSize / 2;
    const cy = cssSize / 2;
    const r = cssSize / 2 - 14;
    const slice = Math.PI * 2 / count;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);

    names.forEach((name, i) => {
      const start = i * slice - Math.PI / 2;
      const end = start + slice;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, start, end);
      ctx.closePath();
      ctx.fillStyle = palette[i % palette.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(50,25,9,.72)';
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.save();
      ctx.rotate(start + slice / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff9e6';
      ctx.strokeStyle = 'rgba(38,19,7,.9)';
      ctx.lineWidth = 8;
      const maxFont = count <= 7 ? 47 : count <= 10 ? 38 : count <= 15 ? 30 : 24;
      let fontSize = maxFont;
      ctx.font = `900 ${fontSize}px Nunito, sans-serif`;
      const label = name.length > 16 ? name.slice(0, 15) + '…' : name;
      const maxWidth = r * .60;
      while (fontSize > 18 && ctx.measureText(label).width > maxWidth) {
        fontSize -= 2;
        ctx.font = `900 ${fontSize}px Nunito, sans-serif`;
      }
      ctx.strokeText(label, r - 45, 0);
      ctx.fillText(label, r - 45, 0);
      ctx.restore();
    });

    ctx.restore();
  }

  function normalizeAngle(a) {
    const tau = Math.PI * 2;
    return ((a % tau) + tau) % tau;
  }

  function spin() {
    if (spinning || participants.length < 2) return;
    const winnerIndex = participants.findIndex(p => p.name.toLowerCase() === ALWAYS_WINNER.toLowerCase());
    if (winnerIndex < 0) return;

    spinning = true;
    spinButton.disabled = true;
    result.textContent = 'La ruleta está decidiendo…';

    const slice = Math.PI * 2 / participants.length;
    const winnerCenter = winnerIndex * slice + slice / 2;
    const desired = normalizeAngle(-winnerCenter);
    const current = normalizeAngle(rotation);
    let delta = normalizeAngle(desired - current);
    delta += (7 + Math.floor(Math.random() * 3)) * Math.PI * 2;

    const startRotation = rotation;
    const targetRotation = startRotation + delta;
    const duration = 4600 + Math.random() * 700;
    const startedAt = performance.now();
    const easeOutQuint = t => 1 - Math.pow(1 - t, 5);

    const frame = now => {
      const t = Math.min(1, (now - startedAt) / duration);
      rotation = startRotation + (targetRotation - startRotation) * easeOutQuint(t);
      drawWheel();
      if (t < 1) {
        rafId = requestAnimationFrame(frame);
      } else {
        rotation = targetRotation;
        drawWheel();
        spinning = false;
        spinButton.disabled = false;
        result.textContent = `✨ El pesebre ha elegido a ${ALWAYS_WINNER} ✨`;
        showWinner();
      }
    };

    rafId = requestAnimationFrame(frame);
  }

  function showWinner() {
    winnerName.textContent = ALWAYS_WINNER;
    confetti();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function confetti() {
    const colors = ['#ffd23f','#ef476f','#06d6a0','#118ab2','#ffffff','#f78c2b'];
    for (let i = 0; i < 80; i++) {
      const piece = document.createElement('i');
      piece.className = 'confetti';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.setProperty('--x', (Math.random() * 280 - 140) + 'px');
      piece.style.animationDuration = (2.6 + Math.random() * 2.8) + 's';
      piece.style.animationDelay = (Math.random() * .25) + 's';
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 6000);
    }
  }

  spinButton.addEventListener('click', spin);
  closeWinner.addEventListener('click', closeDialog);
  spinAgain.addEventListener('click', () => { closeDialog(); setTimeout(spin, 180); });
  dialog.addEventListener('click', e => { if (e.target === dialog) closeDialog(); });
  window.addEventListener('resize', drawWheel, { passive: true });
  window.addEventListener('beforeunload', () => { if (rafId) cancelAnimationFrame(rafId); });
})();
