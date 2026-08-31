(() => {
  const script = document.createElement('script');
  script.src = 'config.js';
  script.onload = init;
  script.onerror = () => console.error('No se pudo cargar config.js');
  document.head.appendChild(script);

  function init() {
    const { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_KEY } = window.RULETA_CONFIG || {};
    const PARTICIPANTS = ['Contreras','Ramón','Sneider','Jaidis','Ingris','Guadalupe','Peña','Viviana','Fernando'];
    const palette = ['#6d3f8f','#55a82e','#ec681f','#f1a813','#397eb8','#ef4f62','#39a3b8','#f0aa17','#d45c88'];

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
    const joinButton = form.querySelector('button[type="submit"]');

    let rotation = 0;
    let spinning = false;
    let claimToken = null;

    renderParticipants();
    drawWheel();
    spinButton.disabled = true;

    async function rpc(name, body) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`Supabase ${response.status}`);
      return response.json();
    }

    function cleanName(value) { return value.replace(/\s+/g, ' ').trim().slice(0, 30); }
    function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

    function renderParticipants() {
      list.innerHTML = PARTICIPANTS.map(name => `<div class="participant-row"><span class="icon">♟</span><span>${escapeHTML(name)}</span><time>★</time></div>`).join('');
      total.textContent = String(PARTICIPANTS.length);
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (claimToken || spinning) return;
      const name = cleanName(input.value);
      if (!name) return;
      joinButton.disabled = true;
      input.disabled = true;
      result.textContent = 'Validando tu nombre…';
      try {
        const rows = await rpc('ruleta_claim_participant', { input_name: name });
        const data = Array.isArray(rows) ? rows[0] : rows;
        if (!data?.ok) {
          result.textContent = data?.status === 'already_used' ? '⚠️ Ese participante ya realizó su giro.' : data?.status === 'not_found' ? '⚠️ Ese nombre no está en la lista de participantes.' : '⚠️ Revisa el nombre e inténtalo nuevamente.';
          joinButton.disabled = false;
          input.disabled = false;
          input.select();
          return;
        }
        claimToken = data.claim_token;
        result.textContent = `✅ ${data.display_name}, tu nombre fue validado. ¡Ya puedes girar!`;
        input.value = data.display_name;
        spinButton.disabled = false;
        joinButton.textContent = '✓ VALIDADO';
      } catch (error) {
        console.error(error);
        result.textContent = '⚠️ No pudimos validar ahora. Intenta nuevamente.';
        joinButton.disabled = false;
        input.disabled = false;
      }
    });

    function drawWheel() {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const size = 900;
      if (canvas.width !== size * dpr) { canvas.width = size * dpr; canvas.height = size * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const count = PARTICIPANTS.length, cx = size/2, cy = size/2, r = size/2 - 14, slice = Math.PI*2/count;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotation);
      PARTICIPANTS.forEach((name, i) => {
        const start = i*slice - Math.PI/2, end = start + slice;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,r,start,end); ctx.closePath();
        ctx.fillStyle = palette[i % palette.length]; ctx.fill();
        ctx.strokeStyle = 'rgba(50,25,9,.72)'; ctx.lineWidth = 5; ctx.stroke();
        ctx.save(); ctx.rotate(start + slice/2); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff9e6'; ctx.strokeStyle = 'rgba(38,19,7,.9)'; ctx.lineWidth = 8;
        let fontSize = 38; ctx.font = `900 ${fontSize}px Nunito, sans-serif`;
        while (fontSize > 18 && ctx.measureText(name).width > r*.60) { fontSize -= 2; ctx.font = `900 ${fontSize}px Nunito, sans-serif`; }
        ctx.strokeText(name, r-45, 0); ctx.fillText(name, r-45, 0); ctx.restore();
      });
      ctx.restore();
    }

    function normalizeAngle(a) { const tau = Math.PI*2; return ((a % tau) + tau) % tau; }

    async function spin() {
      if (spinning || !claimToken) return;
      spinning = true; spinButton.disabled = true; result.textContent = 'La ruleta está decidiendo…';
      let winner;
      try {
        const rows = await rpc('ruleta_spin', { input_claim_token: claimToken });
        const data = Array.isArray(rows) ? rows[0] : rows;
        if (!data?.ok) { result.textContent = '⚠️ Este participante ya realizó su giro.'; claimToken = null; spinning = false; return; }
        winner = data.winner;
      } catch (error) {
        console.error(error); result.textContent = '⚠️ No se pudo realizar el giro. Intenta de nuevo.'; spinButton.disabled = false; spinning = false; return;
      }
      const winnerIndex = PARTICIPANTS.findIndex(n => n.localeCompare(winner, 'es', { sensitivity:'base' }) === 0);
      const slice = Math.PI*2/PARTICIPANTS.length;
      const desired = normalizeAngle(-(winnerIndex*slice + slice/2));
      let delta = normalizeAngle(desired - normalizeAngle(rotation));
      delta += (7 + Math.floor(Math.random()*3))*Math.PI*2;
      const start = rotation, target = start + delta, duration = 4700 + Math.random()*600, startedAt = performance.now();
      const frame = now => {
        const t = Math.min(1, (now-startedAt)/duration), eased = 1-Math.pow(1-t,5);
        rotation = start + (target-start)*eased; drawWheel();
        if (t < 1) requestAnimationFrame(frame);
        else {
          spinning = false; claimToken = null;
          result.textContent = `✨ El pesebre ha elegido a ${winner} ✨`;
          winnerName.textContent = winner; confetti();
          if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open','');
        }
      };
      requestAnimationFrame(frame);
    }

    function closeDialog() { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
    function confetti() {
      const colors = ['#ffd23f','#ef476f','#06d6a0','#118ab2','#ffffff','#f78c2b'];
      for (let i=0;i<80;i++) { const p=document.createElement('i'); p.className='confetti'; p.style.left=Math.random()*100+'vw'; p.style.background=colors[Math.floor(Math.random()*colors.length)]; p.style.setProperty('--x',(Math.random()*280-140)+'px'); p.style.animationDuration=(2.6+Math.random()*2.8)+'s'; document.body.appendChild(p); setTimeout(()=>p.remove(),6000); }
    }

    spinButton.addEventListener('click', spin);
    closeWinner.addEventListener('click', closeDialog);
    spinAgain.addEventListener('click', closeDialog);
    dialog.addEventListener('click', e => { if (e.target === dialog) closeDialog(); });
    window.addEventListener('resize', drawWheel, { passive:true });
  }
})();
