/* ============================================================
   GOLEIO - FRONT-END MVP
   Stack: HTML + CSS + JS puro + Supabase
   Etapa 2: Login, perfil, rachas, convite, aprovação,
            presença, ranking, avatar e sorteio inicial.
   ============================================================ */

const SUPABASE_URL = window.GOLEIO_SUPABASE_URL;
const SUPABASE_ANON_KEY = window.GOLEIO_SUPABASE_ANON_KEY;

let sb = null;

const state = {
  session: null,
  user: null,
  profile: null,
  memberships: [],
  activeMembership: null,
  activeRacha: null,
  members: [],
  ranking: [],
  globalRanking: null,
  ratingsByRacha: [],
  currentEvaluation: null,
  presencas: [],
  cancelledDates: [],
  sorteios: [],
  convites: [],
  inviteSearchResults: [],
  inviteSearchLoading: false,
  inviteSearchTerm: '',
  registerUsernameStatus: 'idle',
  registerUsernameMessage: '',
  registerUsernameTimer: null,
  currentView: 'dashboard',
  contentLoading: false,
  selectedDate: new Date().toISOString().slice(0, 10),
  lastTeamsText: '',
  sorteioMode: 'equilibrado',
  rankingMode: 'geral',
  requiredProfileModalShownFor: null,
  adminOpenPanel: null,
  presenceReminderDismissed: {}
};


const RACHA_AVATARS = [
  { key: 'classico', label: 'Clássico', icon: 'shield' },
  { key: 'trofeu', label: 'Troféu', icon: 'trophy' },
  { key: 'coroa', label: 'Coroa', icon: 'crown' },
  { key: 'bola', label: 'Bola', icon: 'goal' },
  { key: 'raio', label: 'Raio', icon: 'zap' },
  { key: 'fogo', label: 'Fogo', icon: 'flame' },
  { key: 'estrela', label: 'Estrela', icon: 'star' },
  { key: 'camisa', label: 'Camisa', icon: 'shirt' }
];

const POSITION_PRESETS = {
  futsal: [
    ['goleiro', 'Goleiro'],
    ['fixo', 'Fixo'],
    ['ala', 'Ala'],
    ['pivo', 'Pivô']
  ],
  society: [
    ['goleiro', 'Goleiro'],
    ['fixo', 'Fixo'],
    ['ala_direita', 'Ala Direita'],
    ['ala_esquerda', 'Ala Esquerda'],
    ['meia', 'Meia'],
    ['atacante', 'Atacante'],
    ['pivo', 'Pivô']
  ],
  campo: [
    ['goleiro', 'Goleiro'],
    ['zagueiro', 'Zagueiro'],
    ['lateral_direito', 'Lateral Direito'],
    ['lateral_esquerdo', 'Lateral Esquerdo'],
    ['volante', 'Volante'],
    ['meia_armador', 'Meia Armador'],
    ['meia_lateral', 'Meia Lateral'],
    ['ponta_direita', 'Ponta Direita'],
    ['ponta_esquerda', 'Ponta Esquerda'],
    ['atacante', 'Atacante'],
    ['centroavante', 'Centroavante']
  ]
};


let lastNavPointerTime = 0;
let lastRenderedView = 'dashboard';

const $ = (id) => document.getElementById(id);
const safe = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
}[char]));

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatPhoneBR(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (!digits) return '';

  const ddd = digits.slice(0, 2);
  const first = digits.length > 10 ? digits.slice(2, 7) : digits.slice(2, 6);
  const second = digits.length > 10 ? digits.slice(7, 11) : digits.slice(6, 10);

  if (digits.length <= 2) return `(${ddd}`;
  if (!second) return `(${ddd}) ${first}`;
  return `(${ddd}) ${first}-${second}`;
}

function applyPhoneMask(input) {
  if (!input) return;
  input.value = formatPhoneBR(input.value);
}

function togglePasswordVisibility(targetId, button) {
  const input = $(targetId);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button?.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  if (button) button.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}"></i>`;
  refreshIcons();
}

function moneylessNumber(value, fallback = '-') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return Number(value).toFixed(1).replace('.0', '');
}

function toast(message, ms = 3200) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.add('hidden'), ms);
}

function setLoading(button, isLoading, text = 'Aguarde...') {
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.oldText) button.dataset.oldText = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-loading');
    button.innerHTML = `<i data-lucide="loader-circle"></i> ${text}`;
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-loading');
    button.innerHTML = button.dataset.oldText || button.innerHTML;
    delete button.dataset.oldText;
  }
  refreshIcons();
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showAppLoader(show = true) {
  const loader = $('appLoader');
  if (!loader) return;
  clearTimeout(showAppLoader._failsafe);
  loader.classList.toggle('hidden', !show);
  if (show) {
    showAppLoader._failsafe = setTimeout(() => {
      loader.classList.add('hidden');
      stopProgress();
      // Fallback forte: nunca deixa o usuário preso na tela de loading.
      if (state.user) {
        $('authView')?.classList.add('hidden');
        $('appView')?.classList.remove('hidden');
        renderApp();
      } else {
        showAuth();
      }
    }, 3000);
  }
}

function startProgress() {
  const bar = $('globalProgress');
  if (!bar) return;
  bar.classList.remove('hidden');
  clearTimeout(startProgress._timer);
}

function stopProgress() {
  const bar = $('globalProgress');
  if (!bar) return;
  clearTimeout(startProgress._timer);
  startProgress._timer = setTimeout(() => bar.classList.add('hidden'), 220);
}

function withTimeout(promise, ms = 9000, label = 'operação') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Tempo esgotado ao carregar ${label}.`)), ms))
  ]);
}

function handlePointerFeedback(event) {
  const el = event.target.closest?.('button, a, .date-chip, .draw-mode-card, .choice-card, .racha-avatar-option, .member-card, .racha-row-card, .invite-user-option');
  if (!el || el.disabled) return;
  el.classList.add('tap-feedback');
  setTimeout(() => el.classList.remove('tap-feedback'), 220);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dayName(day) {
  const labels = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return labels[Number(day)] ?? 'Não definido';
}

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateFromInput(value) {
  const [y, m, d] = String(value || '').split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0);
}

function formatDateBR(value) {
  const d = dateFromInput(value);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function isMatchingRachaDay(dateValue, racha = state.activeRacha) {
  if (!racha || racha.dia_semana === null || racha.dia_semana === undefined) return true;
  return dateFromInput(dateValue).getDay() === Number(racha.dia_semana);
}

function getRawUpcomingGameDates(racha = state.activeRacha, amount = 8) {
  if (!racha) return [today()];
  const target = Number(racha.dia_semana);
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  const dates = [];
  let offset = ((target - base.getDay()) + 7) % 7;
  for (let i = 0; i < amount; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + offset + (i * 7));
    dates.push(toDateInputValue(d));
  }
  return dates;
}

function getCancelledDate(dateValue) {
  return state.cancelledDates.find((item) => item.data_jogo === dateValue);
}

function isDateCancelled(dateValue) {
  return Boolean(getCancelledDate(dateValue));
}

function getUpcomingGameDates(racha = state.activeRacha, amount = 8) {
  if (!racha) return [today()];
  const target = Number(racha.dia_semana);
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  const dates = [];
  let offset = ((target - base.getDay()) + 7) % 7;

  // Busca mais semanas para pular datas canceladas pelo admin.
  for (let i = 0; dates.length < amount && i < amount + 16; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + offset + (i * 7));
    const value = toDateInputValue(d);
    if (!isDateCancelled(value)) dates.push(value);
  }

  return dates.length ? dates : [today()];
}

function getDefaultGameDate(racha = state.activeRacha) {
  return getUpcomingGameDates(racha, 1)[0] || today();
}

function isSmallScreen() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
}

function renderGameDatePicker(context = 'presence') {
  if (!state.activeRacha) return '';
  const limit = isSmallScreen() ? 4 : 8;
  const dates = getUpcomingGameDates(state.activeRacha, limit);
  const selected = dates.includes(state.selectedDate) ? state.selectedDate : getDefaultGameDate(state.activeRacha);
  if (selected !== state.selectedDate) state.selectedDate = selected;
  const cancelledCount = state.cancelledDates.length;
  return `
    <div class="date-picker-card">
      <div class="date-picker-head">
        <div>
          <p class="eyebrow">Próximos jogos</p>
          <strong>${dayName(state.activeRacha.dia_semana)} ${state.activeRacha.horario ? `• ${safe(state.activeRacha.horario.slice(0, 5))}` : ''}</strong>
        </div>
        <p class="hint">${cancelledCount ? 'Datas canceladas pelo admin não aparecem aqui.' : 'Toque em uma data do racha.'}</p>
      </div>
      <div class="date-strip">
        ${dates.map((dateValue, index) => `
          <button type="button" class="date-chip ${dateValue === selected ? 'active' : ''}" data-action="select-${context}-date" data-date="${safe(dateValue)}">
            <span>${index === 0 ? 'Próximo' : dayName(dateFromInput(dateValue).getDay())}</span>
            <strong>${formatDateBR(dateValue)}</strong>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}


function getRachaAvatar(key) {
  return RACHA_AVATARS.find((item) => item.key === key) || RACHA_AVATARS[0];
}

function renderRachaAvatarPicker(name, selectedKey = 'classico') {
  const current = getRachaAvatar(selectedKey);
  return `
    <div class="racha-avatar-picker">
      ${RACHA_AVATARS.map((item) => `
        <label class="racha-avatar-option ${item.key === current.key ? 'active' : ''}">
          <input type="radio" name="${safe(name)}" value="${safe(item.key)}" ${item.key === current.key ? 'checked' : ''} />
          <span class="racha-avatar-badge picker-badge"><i data-lucide="${safe(item.icon)}"></i></span>
          <small>${safe(item.label)}</small>
        </label>
      `).join('')}
    </div>
  `;
}

function rachaAvatarHTML(racha, extraClass = '') {
  const avatar = getRachaAvatar(racha?.avatar_key);
  return `<div class="racha-avatar-badge ${safe(extraClass)} avatar-${safe(avatar.key)}"><i data-lucide="${safe(avatar.icon)}"></i></div>`;
}

function selectedRadioValue(name, fallback = '') {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}


function updateRachaAvatarPickerUI(input) {
  const picker = input?.closest('.racha-avatar-picker');
  if (!picker) return;
  picker.querySelectorAll('.racha-avatar-option').forEach((label) => {
    const radio = label.querySelector('input[type="radio"]');
    label.classList.toggle('active', Boolean(radio?.checked));
  });
}

function selectedDrawMode() {
  return selectedRadioValue('sorteioModo', state.sorteioMode || 'equilibrado');
}

function drawModeCard(value, title, description, active = false) {
  return `
    <label class="draw-mode-card ${active ? 'active' : ''}">
      <input type="radio" name="sorteioModo" value="${safe(value)}" ${active ? 'checked' : ''} />
      <span class="draw-mode-copy">
        <strong>${safe(title)}</strong>
        <small>${safe(description)}</small>
      </span>
    </label>
  `;
}

function initials(profile) {
  const name = profile?.apelido || profile?.nome || profile?.email || 'Jogador';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'J';
}

function avatarHTML(profile, big = false) {
  const cls = big ? 'avatar big' : 'avatar';
  if (profile?.avatar_url) {
    return `<div class="${cls}"><img src="${safe(profile.avatar_url)}" alt="Foto de ${safe(profile.nome)}"></div>`;
  }
  return `<div class="${cls}">${safe(initials(profile))}</div>`;
}


function cardTier(overall) {
  if (overall >= 90) return 'lendario';
  if (overall >= 82) return 'diamante';
  if (overall >= 72) return 'ouro';
  if (overall >= 62) return 'prata';
  return 'bronze';
}

function positionCode(posicao) {
  const p = String(posicao || '').toLowerCase();
  const codes = {
    goleiro: 'GOL',
    fixo: 'FIX',
    ala: 'ALA',
    ala_direita: 'AD',
    ala_esquerda: 'AE',
    ala_direito: 'AD',
    ala_esquerdo: 'AE',
    pivo: 'PIV',
    zagueiro: 'ZAG',
    lateral: 'LAT',
    lateral_direito: 'LD',
    lateral_esquerdo: 'LE',
    volante: 'VOL',
    meia: 'MEI',
    meia_armador: 'MA',
    meia_lateral: 'ML',
    atacante: 'ATA',
    ponta_direita: 'PD',
    ponta_esquerda: 'PE',
    centroavante: 'CA',
    linha: 'LIN',
    ambos: 'AMB'
  };
  return codes[p] || 'PEN';
}

function normalizeSkillScore(value, fallback = 60) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return fallback;
  const n = Number(value);
  const score = n <= 5 ? Math.round(n * 20) : Math.round(n);
  return Math.max(60, Math.min(99, score));
}

function cardScore(value, fallback = 60) {
  return normalizeSkillScore(value, fallback);
}

function overallScore(value, fallback = 60) {
  return normalizeSkillScore(value, fallback);
}

function averageNumbers(values, fallback = 60) {
  const nums = values
    .map((value) => normalizeSkillScore(value, null))
    .filter((value) => value !== null && value !== undefined && !Number.isNaN(Number(value)));
  if (!nums.length) return fallback;
  return Math.round(nums.reduce((sum, value) => sum + Number(value), 0) / nums.length);
}

function getSkillValue(row, keys, fallback = 60) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== '') return normalizeSkillScore(value, fallback);
  }
  return fallback;
}

function getOffensiveSkill(row, fallback = 60) {
  if (row?.media_hab_ofensiva !== null && row?.media_hab_ofensiva !== undefined) return normalizeSkillScore(row.media_hab_ofensiva, fallback);
  return averageNumbers([row?.media_finalizacao, row?.media_passe, row?.media_drible], fallback);
}

function cardSkillRows(row = {}) {
  return [
    { key: 'finalizacao', label: 'Finalização', short: 'FIN', value: getSkillValue(row, 'media_finalizacao') },
    { key: 'passe', label: 'Passe', short: 'PAS', value: getSkillValue(row, 'media_passe') },
    { key: 'velocidade', label: 'Velocidade', short: 'VEL', value: getSkillValue(row, 'media_velocidade') },
    { key: 'drible', label: 'Drible', short: 'DRI', value: getSkillValue(row, 'media_drible') },
    { key: 'hab_defensiva', label: 'Hab. Defensiva', short: 'DEF', value: getSkillValue(row, ['media_hab_defensiva', 'media_marcacao']) },
    { key: 'hab_ofensiva', label: 'Hab. Ofensiva', short: 'ATA', value: getOffensiveSkill(row) },
    { key: 'hab_goleiro', label: 'Hab. Goleiro', short: 'GOL', value: getSkillValue(row, ['media_hab_goleiro', 'media_goleiro']) }
  ];
}


function radarAnchor(x, cx) {
  if (x < cx - 8) return 'end';
  if (x > cx + 8) return 'start';
  return 'middle';
}

function radarPoint(cx, cy, radius, angle) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius
  };
}

function renderSkillRadar(skills = [], className = 'skill-radar') {
  const radarSkills = (skills || []).map((skill) => ({
    ...skill,
    value: normalizeSkillScore(skill.value, 60)
  }));
  if (!radarSkills.length) return '';

  const cx = 110;
  const cy = 98;
  const maxR = 57;
  const minR = 18;
  const step = (Math.PI * 2) / radarSkills.length;
  const start = -Math.PI / 2;
  const rings = [0.25, 0.5, 0.75, 1];
  const ringPolys = rings.map((factor) => radarSkills.map((_, i) => {
    const point = radarPoint(cx, cy, maxR * factor, start + i * step);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(' '));

  const valuePoints = radarSkills.map((skill, i) => {
    const pct = Math.max(0, Math.min(1, (skill.value - 60) / 39));
    const radius = minR + pct * (maxR - minR);
    const point = radarPoint(cx, cy, radius, start + i * step);
    return { ...point, skill };
  });

  const outerPoints = radarSkills.map((skill, i) => {
    const point = radarPoint(cx, cy, maxR + 21, start + i * step);
    return { ...point, skill };
  });

  return `
    <svg class="${safe(className)} skill-radar" viewBox="0 0 220 196" role="img" aria-label="Gráfico de habilidades do jogador">
      <g class="skill-radar-grid-group">
        ${ringPolys.map((points) => `<polygon class="skill-radar-grid" points="${points}"></polygon>`).join('')}
        ${radarSkills.map((_, i) => {
          const end = radarPoint(cx, cy, maxR, start + i * step);
          return `<line class="skill-radar-axis" x1="${cx}" y1="${cy}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}"></line>`;
        }).join('')}
      </g>
      <polygon class="skill-radar-area" points="${valuePoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}"></polygon>
      <polyline class="skill-radar-line" points="${valuePoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')} ${valuePoints[0].x.toFixed(1)},${valuePoints[0].y.toFixed(1)}"></polyline>
      ${valuePoints.map((point) => `<circle class="skill-radar-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4.2"></circle>`).join('')}
      ${outerPoints.map((point) => {
        const anchor = radarAnchor(point.x, cx);
        const labelY = point.y < cy ? point.y - 4 : point.y;
        return `<text class="skill-radar-label" x="${point.x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}"><tspan class="skill-radar-short">${safe(point.skill.short)}</tspan><tspan class="skill-radar-value" x="${point.x.toFixed(1)}" dy="13">${safe(point.skill.value)}</tspan></text>`;
      }).join('')}
    </svg>
  `;
}

function overallFromSkills(row = {}, fallback = 60) {
  return averageNumbers(cardSkillRows(row).map((skill) => skill.value), fallback);
}

function cardLabel(value, fallback = 'Equilibrado') {
  const text = String(value || '').trim();
  if (!text || text === 'nao_informado') return fallback;
  return text.replace(/_/g, ' ');
}

function statusBadge(status) {
  return `<span class="status-badge status-${safe(status)}">${safe(status || '-')}</span>`;
}

function roleBadge(papel, options = {}) {
  const full = Boolean(options.full);
  if (!full && papel === 'jogador') return '';
  const label = papel === 'admin' ? 'Admin' : papel === 'avaliador' ? 'Avaliador' : 'Jogador';
  const cls = papel === 'admin' ? 'role-admin' : papel === 'avaliador' ? 'role-evaluator' : '';
  return `<span class="role-badge ${cls}">${safe(label)}</span>`;
}

function normalizeUsernameInput(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 30);
}


function isUsernameValid(username) {
  return /^[a-z0-9._]{3,30}$/.test(username || '');
}

function setRegisterUsernameStatus(status, message) {
  state.registerUsernameStatus = status;
  state.registerUsernameMessage = message || '';
  const el = $('registerUsernameStatus');
  if (!el) return;
  el.className = `field-help username-status ${status || 'neutral'}`;
  el.textContent = message || 'Use letras, números, ponto ou underline. Ex: @davidcbcampos';
}

async function checkUsernameAvailability(username, excludeUserId = null) {
  const clean = normalizeUsernameInput(username);
  if (!isUsernameValid(clean)) {
    return { available: false, message: 'O @usuário precisa ter entre 3 e 30 caracteres.' };
  }

  const { data, error } = await sb.rpc('verificar_username_disponivel', {
    p_username: clean,
    p_excluir: excludeUserId
  });

  if (error) {
    console.error(error);
    throw error;
  }

  const available = Boolean(data);
  return {
    available,
    message: available ? `@${clean} disponível.` : `@${clean} já está em uso.`
  };
}

function scheduleRegisterUsernameCheck(value) {
  const username = normalizeUsernameInput(value);
  clearTimeout(state.registerUsernameTimer);

  if (!username) {
    setRegisterUsernameStatus('neutral', 'Escolha um @usuário único para ser encontrado no Goleio.');
    return;
  }

  if (!isUsernameValid(username)) {
    setRegisterUsernameStatus('error', 'Use pelo menos 3 caracteres. Só letras, números, ponto ou underline.');
    return;
  }

  setRegisterUsernameStatus('checking', `Verificando @${username}...`);
  state.registerUsernameTimer = setTimeout(async () => {
    try {
      const result = await checkUsernameAvailability(username, null);
      setRegisterUsernameStatus(result.available ? 'success' : 'error', result.message);
    } catch (error) {
      setRegisterUsernameStatus('error', 'Não consegui verificar agora. Tente novamente em instantes.');
    }
  }, 380);
}

function usernameText(profile) {
  return profile?.username ? `@${profile.username}` : '@semusuario';
}

function positionLabel(value) {
  const labels = {
    goleiro: 'Goleiro',
    fixo: 'Fixo',
    ala: 'Ala',
    ala_direita: 'Ala Direita',
    ala_esquerda: 'Ala Esquerda',
    ala_direito: 'Ala Direito',
    ala_esquerdo: 'Ala Esquerdo',
    pivo: 'Pivô',
    zagueiro: 'Zagueiro',
    lateral: 'Lateral',
    lateral_direito: 'Lateral Direito',
    lateral_esquerdo: 'Lateral Esquerdo',
    volante: 'Volante',
    meia: 'Meia',
    meia_armador: 'Meia Armador',
    meia_lateral: 'Meia Lateral',
    atacante: 'Atacante',
    ponta_direita: 'Ponta Direita',
    ponta_esquerda: 'Ponta Esquerda',
    centroavante: 'Centroavante',
    coringa: 'Posição pendente',
    linha: 'Linha',
    ambos: 'Ambos'
  };
  return labels[value] || labels[String(value || '').toLowerCase()] || 'Posição pendente';
}

function currentModalidade() {
  return state.activeRacha?.modalidade || 'society';
}

function getPositionOptionsForModalidade(modalidade = currentModalidade()) {
  return POSITION_PRESETS[modalidade] || POSITION_PRESETS.society;
}

function isDetailedPositionValid(value, modalidade = currentModalidade()) {
  const current = String(value || '').toLowerCase();
  if (!current || current === 'coringa' || current === 'linha' || current === 'ambos') return false;
  return getPositionOptionsForModalidade(modalidade).some(([optionValue]) => optionValue === current);
}

function defaultPositionForModalidade(modalidade = currentModalidade()) {
  const defaults = { futsal: 'fixo', society: 'meia', campo: 'meia_armador' };
  return defaults[modalidade] || getPositionOptionsForModalidade(modalidade)[0]?.[0] || 'meia';
}

function positionOptions(selected, modalidade = currentModalidade(), includePlaceholder = true) {
  const options = getPositionOptionsForModalidade(modalidade);
  const selectedValue = isDetailedPositionValid(selected, modalidade) ? selected : '';
  const placeholder = includePlaceholder ? `<option value="" ${selectedValue ? '' : 'selected'} disabled>Selecione sua posição</option>` : '';
  return placeholder + options.map(([value, label]) => option(value, label, selectedValue)).join('');
}

function positionSector(value) {
  const sectors = {
    goleiro: 'gol',
    fixo: 'defesa',
    zagueiro: 'defesa',
    lateral: 'defesa',
    lateral_direito: 'defesa',
    lateral_esquerdo: 'defesa',
    ala: 'meio',
    ala_direita: 'meio',
    ala_esquerda: 'meio',
    ala_direito: 'meio',
    ala_esquerdo: 'meio',
    volante: 'meio',
    meia: 'meio',
    meia_armador: 'meio',
    meia_lateral: 'meio',
    pivo: 'ataque',
    atacante: 'ataque',
    ponta_direita: 'ataque',
    ponta_esquerda: 'ataque',
    centroavante: 'ataque'
  };
  return sectors[value] || 'meio';
}

function positionTypeFromDetailed(value) {
  if (value === 'goleiro') return 'goleiro';
  return 'linha';
}

function mergeMemberProfile(member) {
  const p = member?.profiles || member || {};
  return {
    ...p,
    posicao_tipo: member?.posicao_tipo || p.posicao_tipo || p.posicao || 'linha',
    posicao_detalhada: member?.posicao_detalhada || p.posicao_detalhada || p.posicao || null,
    posicao_setor: member?.posicao_setor || p.posicao_setor || positionSector(member?.posicao_detalhada || p.posicao_detalhada || p.posicao)
  };
}

function getActiveMemberForUser(userId = state.user?.id) {
  return state.members.find((m) => m.user_id === userId) || null;
}

function getMyRachaProfile() {
  const member = getActiveMemberForUser(state.user?.id);
  return member ? mergeMemberProfile(member) : (state.profile || {});
}

function requireActiveRachaHTML(title = 'Escolha um racha') {
  return `
    <div class="card">
      <h3>${title}</h3>
      <p class="muted">Você precisa criar um racha ou entrar em um racha aprovado para usar esta área.</p>
      <div class="form-actions">
        <button class="btn-secondary" data-action="go-dashboard"><i data-lucide="layout-dashboard"></i> Voltar ao início</button>
      </div>
    </div>
  `;
}

function hasActiveRacha() {
  return Boolean(state.activeMembership?.status === 'ativo' && state.activeRacha?.id);
}

function isAdmin() {
  return state.activeMembership?.papel === 'admin' && state.activeMembership?.status === 'ativo';
}

function isEvaluator() {
  return state.activeMembership?.papel === 'avaliador' && state.activeMembership?.status === 'ativo';
}

function canEvaluate() {
  return ['admin', 'avaliador'].includes(state.activeMembership?.papel) && state.activeMembership?.status === 'ativo';
}

function activeRoleLabel() {
  if (!hasActiveRacha()) return 'Sem racha ativo';
  if (isAdmin()) return 'Admin';
  if (isEvaluator()) return 'Avaliador';
  return 'Jogador';
}

function getAllowedViews() {
  const base = ['dashboard', 'perfil'];
  if (!hasActiveRacha()) return base;
  return [...base, 'racha', 'presenca', 'ranking', 'sorteio'];
}

function normalizeCurrentView() {
  const allowed = getAllowedViews();
  if (!allowed.includes(state.currentView)) state.currentView = 'dashboard';
}

function buildMapUrl(racha) {
  if (!racha) return '';
  const direct = String(racha.link_maps || '').trim();
  if (direct) return direct;
  const query = [racha.local, racha.endereco].filter(Boolean).join(' ');
  if (!query) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function mapButtonHTML(racha, compact = false) {
  const url = buildMapUrl(racha);
  if (!url) return '';
  return `<a class="${compact ? 'mini-btn btn-secondary' : 'btn-secondary map-btn'}" href="${safe(url)}" target="_blank" rel="noopener noreferrer"><i data-lucide="map-pin"></i> Abrir no mapa</a>`;
}

function validateConfig() {
  const missing = !SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('COLE_AQUI') || SUPABASE_ANON_KEY.includes('COLE_AQUI');
  if (missing) {
    $('authView').classList.remove('hidden');
    $('authView').innerHTML = `
      <div class="auth-card glass-card">
        <div class="brand-block">
          <div class="brand-logo"><img src="assets/logos/goleio-icon-192.png" alt="Logo Goleio"></div>
          <div>
            <p class="eyebrow">Configuração necessária</p>
            <h1>Goleio</h1>
            <p class="muted">Preencha o arquivo <strong>js/config.js</strong> com a URL e a anon public key do Supabase.</p>
          </div>
        </div>
        <div class="card">
          <p class="muted">No Supabase: <strong>Project Settings &gt; API</strong>.</p>
          <p class="hint">Nunca use a service_role key no front-end.</p>
        </div>
      </div>`;
    refreshIcons();
    return false;
  }
  return true;
}

async function init() {
  try {
    if (!validateConfig()) return;
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    bindBaseEvents();

    const { data } = await sb.auth.getSession();
    state.session = data.session;
    state.user = data.session?.user || null;

    sb.auth.onAuthStateChange(async (_event, session) => {
      try {
        state.session = session;
        state.user = session?.user || null;
        if (state.user) {
          await loadInitialData();
        } else {
          resetState();
          showAuth();
        }
      } catch (error) {
        console.error('Erro ao atualizar autenticação:', error);
        showAppLoader(false);
        stopProgress();
        toast('Não consegui atualizar a sessão. Recarregue a página.');
      }
    });

    if (state.user) {
      await loadInitialData();
    } else {
      showAuth();
    }
  } catch (error) {
    console.error('Erro na inicialização:', error);
    showAppLoader(false);
    stopProgress();
    showAuth();
    toast('Não consegui iniciar o app. Confira a conexão e tente novamente.');
  }
}

function resetState() {
  state.profile = null;
  state.memberships = [];
  state.activeMembership = null;
  state.activeRacha = null;
  state.members = [];
  state.ranking = [];
  state.globalRanking = null;
  state.ratingsByRacha = [];
  state.currentEvaluation = null;
  state.presencas = [];
  state.cancelledDates = [];
  state.sorteios = [];
  state.convites = [];
  state.inviteSearchResults = [];
  state.inviteSearchLoading = false;
  state.inviteSearchTerm = '';
  state.registerUsernameStatus = 'idle';
  state.registerUsernameMessage = '';
  clearTimeout(state.registerUsernameTimer);
  state.currentView = 'dashboard';
  state.contentLoading = false;
  state.selectedDate = today();
  state.lastTeamsText = '';
}

function bindBaseEvents() {
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('pointerup', handlePointerNav, { passive: false });
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleInput);
  document.addEventListener('pointerdown', handlePointerFeedback, { passive: true });
  window.addEventListener('pageshow', async (event) => { showAppLoader(false); stopProgress(); if (event.persisted && state.user) { try { await loadInitialData(); } catch (_) { showAppLoader(false); } } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { showAppLoader(false); stopProgress(); } });
  window.addEventListener('error', () => { showAppLoader(false); stopProgress(); });
  window.addEventListener('unhandledrejection', () => { showAppLoader(false); stopProgress(); });

  $('tabLogin')?.addEventListener('click', () => toggleAuth('login'));
  $('tabRegister')?.addEventListener('click', () => toggleAuth('register'));
  $('logoutBtn')?.addEventListener('click', logout);
  $('mobileLogoutBtn')?.addEventListener('click', logout);
}

function toggleAuth(mode) {
  const isLogin = mode === 'login';
  $('tabLogin')?.classList.toggle('active', isLogin);
  $('tabRegister')?.classList.toggle('active', !isLogin);
  $('loginForm')?.classList.toggle('hidden', !isLogin);
  $('registerForm')?.classList.toggle('hidden', isLogin);
  $('quickToolsBlock')?.classList.toggle('hidden', !isLogin);
  $('authView')?.classList.toggle('register-mode', !isLogin);
  document.querySelector('.auth-card')?.classList.toggle('register-mode', !isLogin);
  if (!isLogin) {
    setTimeout(() => $('registerNome')?.focus(), 120);
  }
}

function showAuth() {
  showAppLoader(false);
  $('authView').classList.remove('hidden');
  $('appView').classList.add('hidden');
  refreshIcons();
}

function showApp() {
  showAppLoader(false);
  $('authView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  renderApp();
}

async function loadInitialData() {
  showAppLoader(true);
  startProgress();
  try {
    await withTimeout(ensureProfile(), 9000, 'perfil');
    await withTimeout(loadMemberships(), 9000, 'rachas');
    await withTimeout(loadGlobalProfileStats(), 9000, 'estatísticas globais');
    await withTimeout(loadConvites(), 9000, 'convites');
    chooseDefaultActiveRacha();
    if (state.activeRacha) {
      await withTimeout(loadRachaData(), 10000, 'dados do racha');
    } else {
      state.members = [];
      state.ranking = [];
      state.presencas = [];
      state.cancelledDates = [];
      state.sorteios = [];
      state.currentView = ['dashboard', 'perfil'].includes(state.currentView) ? state.currentView : 'dashboard';
    }
  } catch (error) {
    console.error('Erro ao carregar o app:', error);
    toast('Não consegui carregar todos os dados agora. Recarregue ou tente novamente.');
    state.activeMembership = null;
    state.activeRacha = null;
    localStorage.removeItem('goleio_active_racha');
    state.currentView = 'dashboard';
  } finally {
    state.contentLoading = false;
    stopProgress();
    showApp();
  }
}

async function ensureProfile() {
  if (!state.user) return;

  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', state.user.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    toast('Não foi possível carregar seu perfil.');
    return;
  }

  if (data) {
    state.profile = data;
    return;
  }

  const fallbackName = state.user.user_metadata?.nome || state.user.email.split('@')[0];
  const { data: inserted, error: insertError } = await sb
    .from('profiles')
    .insert({
      id: state.user.id,
      email: state.user.email,
      nome: fallbackName,
      apelido: state.user.user_metadata?.apelido || null
    })
    .select('*')
    .single();

  if (insertError) {
    console.error(insertError);
    toast('Erro ao criar perfil inicial.');
    return;
  }

  state.profile = inserted;
}

async function loadMemberships() {
  const { data, error } = await sb
    .from('racha_membros')
    .select(`
      id,
      racha_id,
      papel,
      status,
      entrou_em,
      posicao_tipo,
      posicao_detalhada,
      posicao_setor,
      rachas (
        id,
        nome,
        modalidade,
        local,
        endereco,
        link_maps,
        dia_semana,
        horario,
        jogadores_por_time,
        max_jogadores,
        avatar_key,
        codigo_convite,
        dono_id,
        status
      )
    `)
    .eq('user_id', state.user.id)
    .neq('status', 'removido')
    .order('entrou_em', { ascending: false });

  if (error) {
    console.error(error);
    toast('Erro ao carregar seus rachas.');
    state.memberships = [];
    return;
  }

  state.memberships = data || [];
}

async function loadConvites() {
  if (!state.user) return;
  const { data, error } = await sb.rpc('listar_convites_recebidos');
  if (error) {
    // Se o patch opcional da etapa 18 ainda não foi rodado, apenas esconde a área de convites.
    console.warn('Convites não carregados:', error.message);
    state.convites = [];
    return;
  }
  state.convites = data || [];
}

function chooseDefaultActiveRacha() {
  const savedId = localStorage.getItem('goleio_active_racha');
  const activeMemberships = state.memberships.filter((m) => m.status === 'ativo' && m.rachas);
  const selected = savedId ? activeMemberships.find((m) => m.racha_id === savedId) : null;

  state.activeMembership = selected || null;
  state.activeRacha = selected?.rachas || null;

  if (state.activeRacha) {
    state.selectedDate = getDefaultGameDate(state.activeRacha);
  } else {
    state.members = [];
    state.ranking = [];
    state.presencas = [];
    state.cancelledDates = [];
    state.sorteios = [];
    if (savedId) localStorage.removeItem('goleio_active_racha');
    state.currentView = ['dashboard', 'perfil'].includes(state.currentView) ? state.currentView : 'dashboard';
  }
}

async function loadRachaData() {
  if (!state.activeRacha) return;
  await loadCancelledDates();
  if (!state.selectedDate || !isMatchingRachaDay(state.selectedDate, state.activeRacha) || isDateCancelled(state.selectedDate)) {
    state.selectedDate = getDefaultGameDate(state.activeRacha);
  }
  await Promise.all([loadMembers(), loadRanking(), loadPresencas(state.selectedDate), loadLatestSorteios()]);
}

async function loadMembers() {
  if (!state.activeRacha) return;
  const { data, error } = await sb
    .from('racha_membros')
    .select(`
      id,
      racha_id,
      user_id,
      papel,
      status,
      entrou_em,
      posicao_tipo,
      posicao_detalhada,
      posicao_setor,
      profiles (
        id,
        nome,
        apelido,
        email,
        telefone,
        avatar_url,
        username,
        posicao,
        posicao_tipo,
        posicao_detalhada,
        posicao_setor,
        pe_dominante,
        estilo_jogo,
        bio
      )
    `)
    .eq('racha_id', state.activeRacha.id)
    .neq('status', 'removido')
    .order('status', { ascending: true })
    .order('entrou_em', { ascending: true });

  if (error) {
    console.error(error);
    toast('Erro ao carregar membros do racha.');
    state.members = [];
    return;
  }
  state.members = data || [];
}

async function loadRanking() {
  if (!state.activeRacha) return;
  const { data, error } = await sb.rpc('get_ranking_racha', { p_racha_id: state.activeRacha.id });
  if (error) {
    console.error(error);
    state.ranking = [];
    return;
  }
  state.ranking = data || [];
}


async function loadGlobalProfileStats() {
  if (!state.user || !sb) return;

  try {
    const { data, error } = await sb.rpc('get_meu_ranking_global');
    if (error) throw error;
    state.globalRanking = Array.isArray(data) ? (data[0] || null) : (data || null);
  } catch (error) {
    console.warn('Ranking global não carregado:', error.message);
    state.globalRanking = null;
  }

  try {
    const { data, error } = await sb.rpc('get_minhas_notas_por_racha');
    if (error) throw error;
    state.ratingsByRacha = data || [];
  } catch (error) {
    console.warn('Notas por racha não carregadas:', error.message);
    state.ratingsByRacha = [];
  }
}

async function loadCancelledDates() {
  if (!state.activeRacha) return;
  const { data, error } = await sb
    .from('racha_datas_canceladas')
    .select('*')
    .eq('racha_id', state.activeRacha.id)
    .gte('data_jogo', today())
    .order('data_jogo', { ascending: true });

  if (error) {
    console.error(error);
    state.cancelledDates = [];
    return;
  }
  state.cancelledDates = data || [];
}

async function loadPresencas(date) {
  if (!state.activeRacha) return;
  state.selectedDate = date || today();
  const { data, error } = await sb
    .from('presencas')
    .select('*')
    .eq('racha_id', state.activeRacha.id)
    .eq('data_jogo', state.selectedDate);

  if (error) {
    console.error(error);
    state.presencas = [];
    return;
  }
  state.presencas = data || [];
}


async function loadLatestSorteios() {
  if (!state.activeRacha) return;
  const { data, error } = await sb
    .from('sorteios')
    .select('id, racha_id, criado_por, modo, jogadores_por_time, resultado, created_at')
    .eq('racha_id', state.activeRacha.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.warn('Sorteios não carregados:', error.message);
    state.sorteios = [];
    return;
  }
  state.sorteios = data || [];
}

function latestSorteio() {
  return state.sorteios?.[0] || null;
}


function renderContentSkeleton(view = state.currentView) {
  const title = {
    racha: 'Atualizando comunidade',
    presenca: 'Carregando presenças',
    ranking: 'Montando ranking',
    sorteio: 'Preparando sorteio'
  }[view] || 'Carregando';

  return `
    <section class="skeleton-page">
      <div class="skeleton-hero card">
        <div class="skeleton-icon shimmer"></div>
        <div class="skeleton-copy">
          <span class="skeleton-line small shimmer"></span>
          <strong>${safe(title)}</strong>
          <span class="skeleton-line medium shimmer"></span>
        </div>
      </div>
      <div class="skeleton-grid">
        <div class="skeleton-card shimmer"></div>
        <div class="skeleton-card shimmer"></div>
        <div class="skeleton-card shimmer"></div>
      </div>
      <div class="skeleton-list card">
        <span class="skeleton-line wide shimmer"></span>
        <span class="skeleton-line wide shimmer"></span>
        <span class="skeleton-line medium shimmer"></span>
      </div>
    </section>
  `;
}

function renderApp() {
  normalizeCurrentView();
  const profileName = state.profile?.apelido || state.profile?.nome || 'Jogador';
  $('topEyebrow').textContent = `Olá, ${profileName}`;
  $('topTitle').textContent = getViewTitle();
  $('activeRachaPill').textContent = hasActiveRacha()
    ? `${state.activeRacha.nome} • ${activeRoleLabel()}`
    : 'Selecione ou crie um racha';

  const allowedViews = getAllowedViews();
  document.querySelectorAll('.nav-btn[data-view]').forEach((btn) => {
    const allowed = allowedViews.includes(btn.dataset.view);
    btn.classList.toggle('hidden', !allowed);
    btn.classList.toggle('active', allowed && btn.dataset.view === state.currentView);
    btn.disabled = !allowed;
  });

  const sorteioNavBtn = document.querySelector('.nav-btn[data-view="sorteio"]');
  if (sorteioNavBtn) {
    sorteioNavBtn.innerHTML = isAdmin()
      ? '<i data-lucide="shuffle"></i> Sorteio'
      : '<i data-lucide="list-checks"></i> Times';
  }

  const rachaNavBtn = document.querySelector('.nav-btn[data-view="racha"]');
  if (rachaNavBtn) {
    const pending = isAdmin() ? activePendingMembersCount() : 0;
    rachaNavBtn.innerHTML = `<i data-lucide="shield"></i> Racha${pending ? `<span class="nav-badge">${pending}</span>` : ''}`;
  }

  const content = $('content');
  const renderers = {
    dashboard: renderDashboard,
    perfil: renderPerfil,
    racha: renderRacha,
    presenca: renderPresenca,
    ranking: renderRanking,
    sorteio: renderSorteio
  };
  content.classList.remove('page-enter');
  content.innerHTML = state.contentLoading
    ? renderContentSkeleton(state.currentView)
    : (renderers[state.currentView] || renderDashboard)();
  refreshIcons();
  requestAnimationFrame(() => content.classList.add('page-enter'));
  requestAnimationFrame(() => {
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
    const app = $('appView');
    if (app) app.scrollLeft = 0;
  });
  lastRenderedView = state.currentView;
  scheduleRequiredRachaProfileModal();
  schedulePresenceReminderModal();
}

function getViewTitle() {
  const titles = {
    dashboard: hasActiveRacha() ? 'Início do racha' : 'Início',
    perfil: 'Minha cartinha',
    racha: 'Comunidade do racha',
    presenca: 'Confirmação de presença',
    ranking: 'Ranking do Goleio',
    sorteio: isAdmin() ? 'Sorteio inteligente' : 'Últimos times'
  };
  return titles[state.currentView] || 'Goleio';
}

function getMyPresenceForDate(dateValue) {
  return state.presencas.find((p) => p.user_id === state.user?.id && p.data_jogo === dateValue)?.status || null;
}

function presenceStatusLabel(status) {
  const labels = {
    confirmado: 'Confirmado',
    espera: 'Na espera',
    talvez: 'Talvez',
    nao_vou: 'Não vou'
  };
  return labels[status] || 'Sem resposta';
}


function activePendingMembersCount() {
  if (!state.activeRacha) return 0;
  return state.members.filter((m) => m.status === 'pendente').length;
}

function myPresenceStatusForNextGame() {
  if (!state.activeRacha) return null;
  const nextDate = getDefaultGameDate(state.activeRacha);
  return getMyPresenceForDate(nextDate);
}

function isNextGameWithinReminderWindow() {
  if (!state.activeRacha) return false;
  const nextDate = getDefaultGameDate(state.activeRacha);
  if (!nextDate) return false;
  const diff = Math.floor((dateFromInput(nextDate) - dateFromInput(today())) / 86400000);
  return diff >= 0 && diff <= 7;
}

function presenceReminderKey() {
  if (!state.user?.id || !state.activeRacha?.id) return '';
  return `goleio_presence_later:${state.user.id}:${state.activeRacha.id}:${getDefaultGameDate(state.activeRacha)}`;
}

function shouldShowPresenceReminder() {
  if (!hasActiveRacha() || !state.user?.id) return false;
  if (state.currentView === 'presenca') return false;
  if (needsRequiredRachaProfileModal()) return false;
  if (!isNextGameWithinReminderWindow()) return false;
  const nextDate = getDefaultGameDate(state.activeRacha);
  if (getMyPresenceForDate(nextDate)) return false;
  const key = presenceReminderKey();
  if (!key) return false;
  return !sessionStorage.getItem(key);
}

function schedulePresenceReminderModal() {
  if (!shouldShowPresenceReminder()) return;
  if (document.querySelector('.presence-reminder-overlay') || document.querySelector('.mandatory-profile-overlay')) return;
  setTimeout(() => {
    if (shouldShowPresenceReminder() && !document.querySelector('.presence-reminder-overlay') && !document.querySelector('.mandatory-profile-overlay')) {
      openPresenceReminderModal();
    }
  }, 240);
}

function renderPresenceReminderModal() {
  const r = state.activeRacha;
  const nextDate = getDefaultGameDate(r);
  return `
    <div class="modal-overlay form-modal-overlay presence-reminder-overlay">
      <div class="player-modal form-modal presence-reminder-modal" role="dialog" aria-modal="true">
        <button class="modal-close" data-action="dismiss-presence-reminder" aria-label="Fechar"><i data-lucide="x"></i></button>
        <div class="form-modal-head">
          <span class="form-modal-icon"><i data-lucide="calendar-check"></i></span>
          <div>
            <p class="eyebrow">Presença da semana</p>
            <h2>Você ainda não confirmou presença</h2>
            <p class="muted">Confirme se vai jogar no próximo racha para ajudar o sorteio a ficar certo.</p>
          </div>
        </div>
        <div class="required-racha-box">
          ${rachaAvatarHTML(r, 'racha-row-icon')}
          <div>
            <strong>${safe(r?.nome || 'Racha')}</strong>
            <span>${formatDateBR(nextDate)} • ${dayName(r?.dia_semana)} • ${safe((r?.horario || '').slice(0,5) || '--:--')}</span>
          </div>
        </div>
        <div class="form-actions presence-reminder-actions">
          <button class="btn-primary" type="button" data-action="go-presence-from-reminder"><i data-lucide="calendar-check"></i> Confirmar agora</button>
          <button class="btn-ghost" type="button" data-action="dismiss-presence-reminder"><i data-lucide="clock"></i> Depois</button>
        </div>
      </div>
    </div>
  `;
}

function openPresenceReminderModal() {
  closeModal();
  document.body.insertAdjacentHTML('beforeend', renderPresenceReminderModal());
  refreshIcons();
}

function dismissPresenceReminder() {
  const key = presenceReminderKey();
  if (key) sessionStorage.setItem(key, '1');
  closeModal();
}

async function goPresenceFromReminder() {
  dismissPresenceReminder();
  state.selectedDate = getDefaultGameDate(state.activeRacha);
  await navigateToView('presenca');
}

function renderDashboard() {
  const activeCount = state.memberships.filter((m) => m.status === 'ativo').length;
  const pendingCount = state.memberships.filter((m) => m.status === 'pendente').length;
  const profileName = state.profile?.apelido || state.profile?.nome || 'Jogador';
  const active = state.activeRacha;
  const role = activeRoleLabel();
  const nextDate = active ? getDefaultGameDate(active) : null;
  const totalMemberships = state.memberships.length;
  const nextStatus = active && nextDate === state.selectedDate ? getMyPresenceForDate(nextDate) : null;
  const myRachaProfile = getMyRachaProfile();

  return `
    <div class="home-stack home-clean-v29">
      ${active ? `
        <section class="card selected-racha-home-card">
          <div class="selected-racha-top">
            ${rachaAvatarHTML(active, 'home-selected-emblem')}
            <div>
              <p class="eyebrow">Racha selecionado</p>
              <h3>${safe(active.nome)}</h3>
              <p class="muted">${safe(active.local || 'Local não definido')} ${active.horario ? `• ${safe(active.horario.slice(0, 5))}` : ''}</p>
            </div>
            <span class="role-badge role-admin selected-role ${role === 'Admin' ? 'role-admin' : role === 'Avaliador' ? 'role-evaluator' : ''}">${safe(role)}</span>
          </div>
          <div class="selected-racha-meta">
            <div><span>Próximo</span><strong>${nextDate ? formatDateBR(nextDate) : '--/--'}</strong><small>${dayName(active.dia_semana)}</small></div>
            <div><span>Presença</span><strong>${nextStatus ? presenceStatusLabel(nextStatus) : 'Responder'}</strong><small>${active.horario ? safe(active.horario.slice(0, 5)) : 'sem horário'}</small></div>
            <div><span>Sua posição</span><strong>${safe(positionCode(myRachaProfile.posicao_detalhada || myRachaProfile.posicao))}</strong><small>${safe(positionLabel(myRachaProfile.posicao_detalhada || myRachaProfile.posicao))}</small></div>
          </div>
          ${isAdmin() && activePendingMembersCount() ? `<button class="admin-pending-home-alert" type="button" data-action="open-admin-pending"><i data-lucide="user-check"></i><span>${activePendingMembersCount()} solicitação(ões) pendente(s)</span><strong>Ver agora</strong></button>` : ''}
        </section>
      ` : `
        <section class="card selected-racha-home-card empty-home-card">
          <p class="eyebrow">Olá, ${safe(profileName)}</p>
          <h3>Escolha uma comunidade</h3>
          <p class="muted">Crie um racha ou selecione um dos seus rachas para liberar presença, ranking e times.</p>
        </section>
      `}
      <div class="home-action-grid compact-create-join home-modal-actions">
        <button type="button" class="accordion-card home-action-card home-modal-trigger" data-action="open-create-racha-modal">
          <span class="action-summary-main"><span class="action-icon"><i data-lucide="plus-circle"></i></span><span><b>Criar novo racha</b><small>Você vira admin e aprova os jogadores.</small></span></span><i data-lucide="arrow-up-right" class="summary-chevron"></i>
        </button>
        <button type="button" class="accordion-card home-action-card home-modal-trigger" data-action="open-join-racha-modal">
          <span class="action-summary-main"><span class="action-icon"><i data-lucide="key-round"></i></span><span><b>Entrar por código</b><small>Solicite entrada em um racha existente.</small></span></span><i data-lucide="arrow-up-right" class="summary-chevron"></i>
        </button>
      </div>

      ${renderConvitesRecebidos()}

      <section class="card clean-card home-section-card">
        <div class="section-headline"><div><p class="eyebrow">Comunidades</p><h3><i data-lucide="users"></i> Meus rachas</h3></div><span class="section-count">${totalMemberships}</span></div>
        ${renderMembershipList()}
      </section>
    </div>
  `;
}

function renderCreateRachaFormHTML() {
  return `
    <form id="createRachaForm" class="modal-form-stack">
      <label>Nome do racha</label>
      <input id="rachaNome" required placeholder="Ex: Racha Quinta Society" />

      <div class="grid-2">
        <div>
          <label>Modalidade</label>
          <select id="rachaModalidade">
            <option value="futsal">Futsal</option>
            <option value="society">Society</option>
            <option value="campo">Campo</option>
          </select>
        </div>
        <div>
          <label>Jogadores por time</label>
          <input id="rachaPorTime" type="number" min="1" max="30" value="5" required />
        </div>
      </div>

      <label>Escudo do racha</label>
      <p class="field-help compact-help">Escolha um escudo pronto para identificar sua comunidade.</p>
      ${renderRachaAvatarPicker('rachaAvatarKey', 'classico')}

      <label>Local</label>
      <input id="rachaLocal" placeholder="Nome da quadra/campo" />

      <label>Endereço</label>
      <input id="rachaEndereco" placeholder="Rua, número, bairro, cidade" />

      <label>Link do Google Maps opcional</label>
      <input id="rachaLinkMaps" placeholder="Cole o link do local no Google Maps" />
      <p class="field-help">Não usa API paga. Se não preencher, o app cria um link de busca pelo endereço.</p>

      <div class="grid-2">
        <div>
          <label>Dia da semana</label>
          <select id="rachaDia">
            <option value="1">Segunda</option>
            <option value="2">Terça</option>
            <option value="3">Quarta</option>
            <option value="4">Quinta</option>
            <option value="5">Sexta</option>
            <option value="6">Sábado</option>
            <option value="0">Domingo</option>
          </select>
        </div>
        <div>
          <label>Horário</label>
          <input id="rachaHorario" type="time" />
        </div>
      </div>

      <label>Máximo de jogadores</label>
      <input id="rachaMax" type="number" min="2" max="200" placeholder="Ex: 14" />

      <button class="btn-primary" type="submit"><i data-lucide="shield-plus"></i> Criar racha</button>
    </form>
  `;
}

function renderJoinRachaFormHTML() {
  return `
    <form id="joinRachaForm" class="modal-form-stack">
      <label>Código de convite</label>
      <input id="codigoConvite" placeholder="Ex: GOL-A1B2C3" required />
      <button class="btn-primary" type="submit"><i data-lucide="log-in"></i> Pedir entrada</button>
    </form>
  `;
}

function openHomeFormModal(type = 'create') {
  closeModal();
  const isCreate = type === 'create';
  const title = isCreate ? 'Criar novo racha' : 'Entrar por código';
  const subtitle = isCreate
    ? 'Preencha as informações da comunidade. Você será o administrador desse racha.'
    : 'Digite o código enviado pelo administrador para solicitar entrada.';
  const icon = isCreate ? 'plus-circle' : 'key-round';
  const formHTML = isCreate ? renderCreateRachaFormHTML() : renderJoinRachaFormHTML();

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay form-modal-overlay">
      <div class="player-modal form-modal" role="dialog" aria-modal="true">
        <button class="modal-close" data-action="close-modal" aria-label="Fechar"><i data-lucide="x"></i></button>
        <div class="form-modal-head">
          <span class="form-modal-icon"><i data-lucide="${icon}"></i></span>
          <div>
            <p class="eyebrow">Goleio</p>
            <h2>${safe(title)}</h2>
            <p class="muted">${safe(subtitle)}</p>
          </div>
        </div>
        ${formHTML}
      </div>
    </div>
  `);
  refreshIcons();
  setTimeout(() => (isCreate ? $('rachaNome') : $('codigoConvite'))?.focus(), 120);
}

function renderConvitesRecebidos() {
  if (!state.convites?.length) return '';
  return `
    <section class="card clean-card home-section-card invites-card">
      <div class="section-headline">
        <div>
          <p class="eyebrow">Convites</p>
          <h3><i data-lucide="mail-plus"></i> Convites recebidos</h3>
        </div>
        <span class="section-count">${state.convites.length}</span>
      </div>
      <div class="invite-list">
        ${state.convites.map((c) => `
          <article class="invite-row">
            <div>
              <strong>${safe(c.racha_nome || 'Racha')}</strong>
              <p class="muted">${safe(c.modalidade || '')}${c.local ? ` • ${safe(c.local)}` : ''}${c.horario ? ` • ${safe(String(c.horario).slice(0,5))}` : ''}</p>
              <small>Convite de ${safe(c.convidado_por_username ? '@' + c.convidado_por_username : c.convidado_por_nome || 'admin')}</small>
            </div>
            <div class="invite-actions">
              <button class="mini-btn btn-secondary" data-action="answer-invite" data-invite-id="${safe(c.convite_id)}" data-accept="true"><i data-lucide="check"></i> Aceitar</button>
              <button class="mini-btn btn-danger" data-action="answer-invite" data-invite-id="${safe(c.convite_id)}" data-accept="false"><i data-lucide="x"></i></button>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}


function getMyActiveMembershipRaw() {
  return state.memberships.find((m) => m.racha_id === state.activeRacha?.id && m.status === 'ativo') || state.activeMembership || null;
}

function needsRequiredRachaProfileModal() {
  if (!hasActiveRacha()) return false;
  const member = getMyActiveMembershipRaw();
  return !isDetailedPositionValid(member?.posicao_detalhada, state.activeRacha?.modalidade);
}

function scheduleRequiredRachaProfileModal() {
  if (!needsRequiredRachaProfileModal()) return;
  if (document.querySelector('.mandatory-profile-overlay')) return;
  setTimeout(() => {
    if (needsRequiredRachaProfileModal() && !document.querySelector('.mandatory-profile-overlay')) {
      openRequiredRachaProfileModal();
    }
  }, 120);
}

function renderRequiredRachaProfileModal() {
  const modalidade = state.activeRacha?.modalidade || 'society';
  const member = getMyActiveMembershipRaw();
  const selected = isDetailedPositionValid(member?.posicao_detalhada, modalidade) ? member.posicao_detalhada : '';
  const defaultType = selected ? positionTypeFromDetailed(selected) : (member?.posicao_tipo || 'linha');
  return `
    <div class="modal-overlay form-modal-overlay mandatory-profile-overlay">
      <div class="player-modal form-modal racha-profile-required-modal" role="dialog" aria-modal="true">
        <div class="form-modal-head">
          <div class="form-modal-icon"><i data-lucide="badge-check"></i></div>
          <div>
            <p class="eyebrow">Perfil do racha</p>
            <h2>Complete sua posição neste racha</h2>
            <p class="muted">Cada modalidade tem posições próprias. Isso ajuda o sorteio a montar times mais justos.</p>
          </div>
        </div>
        <div class="required-racha-box">
          ${rachaAvatarHTML(state.activeRacha, 'racha-row-icon')}
          <div>
            <strong>${safe(state.activeRacha?.nome || 'Racha')}</strong>
            <span>${safe(state.activeRacha?.modalidade || 'modalidade')} • ${dayName(state.activeRacha?.dia_semana)} • ${safe((state.activeRacha?.horario || '').slice(0, 5) || '--:--')}</span>
          </div>
        </div>
        <form id="rachaProfilePositionForm" class="modal-form-stack">
          <label for="rachaRequiredPosition">Sua posição neste racha</label>
          <select id="rachaRequiredPosition" required>
            ${positionOptions(selected, modalidade, true)}
          </select>
          <p class="field-help">Essa escolha vale apenas para este racha. Em outro racha você poderá usar outra posição.</p>

          <label for="rachaRequiredType">Tipo para sorteio</label>
          <select id="rachaRequiredType" required>
            ${option('linha', 'Linha', defaultType)}
            ${option('goleiro', 'Goleiro', defaultType)}
            ${option('ambos', 'Ambos', defaultType)}
          </select>

          <button class="btn-primary full" type="submit"><i data-lucide="save"></i> Salvar e entrar no racha</button>
        </form>
      </div>
    </div>
  `;
}

function openRequiredRachaProfileModal() {
  closeModal();
  document.body.insertAdjacentHTML('beforeend', renderRequiredRachaProfileModal());
  refreshIcons();
}

async function saveRachaProfilePosition(button) {
  if (!state.activeMembership?.id || !state.activeRacha?.id) {
    toast('Selecione um racha ativo primeiro.');
    return;
  }
  const modalidade = state.activeRacha.modalidade || 'society';
  const detailed = $('rachaRequiredPosition')?.value || '';
  if (!isDetailedPositionValid(detailed, modalidade)) {
    toast('Escolha uma posição válida para este racha.');
    $('rachaRequiredPosition')?.focus();
    return;
  }
  const selectedType = $('rachaRequiredType')?.value || positionTypeFromDetailed(detailed);
  const payload = {
    posicao_detalhada: detailed,
    posicao_tipo: selectedType,
    posicao_setor: positionSector(detailed)
  };

  setLoading(button, true, 'Salvando...');
  try {
    const { error } = await sb
      .from('racha_membros')
      .update(payload)
      .eq('id', state.activeMembership.id);
    if (error) throw error;

    state.activeMembership = { ...state.activeMembership, ...payload };
    state.memberships = state.memberships.map((m) => m.id === state.activeMembership.id ? { ...m, ...payload } : m);
    await loadMemberships();
    chooseDefaultActiveRacha();
    await loadRachaData();
    closeModal();
    renderApp();
    toast('Posição do racha salva.');
  } catch (error) {
    console.error(error);
    toast('Não consegui salvar sua posição neste racha. Tente novamente.');
  } finally {
    setLoading(button, false);
  }
}

function renderMembershipList() {
  if (!state.memberships.length) {
    return `
      <div class="empty-state-card">
        <div class="empty-icon"><i data-lucide="badge-plus"></i></div>
        <strong>Nenhum racha ainda</strong>
        <p class="muted">Crie seu primeiro racha ou peça o código para entrar na comunidade dos seus amigos.</p>
      </div>
    `;
  }

  return `<div class="racha-list-modern">
    ${state.memberships.map((m) => {
      const r = m.rachas;
      const isActive = state.activeRacha?.id === m.racha_id;
      const statusText = m.status === 'ativo' ? 'ativo' : m.status === 'pendente' ? 'pendente' : safe(m.status || 'status');
      const roleText = m.papel === 'admin' ? 'Admin' : m.papel === 'avaliador' ? 'Avaliador' : 'Jogador';
      return `
        <article class="racha-row-card ${isActive ? 'selected' : ''}">
          ${rachaAvatarHTML(r, 'racha-row-icon')}
          <div class="racha-row-main">
            <div class="racha-row-title">
              <strong>${safe(r?.nome || 'Racha pendente')}</strong>
              ${isActive ? '<span class="active-dot">Selecionado</span>' : ''}
            </div>
            <p>${r ? `${safe(r.modalidade)} • ${safe(r.local || 'sem local')} • ${dayName(r.dia_semana)}` : 'Aguardando acesso aos dados do racha'}</p>
            <div class="racha-row-tags">
              <span class="mini-tag ${m.status === 'ativo' ? 'ok' : 'wait'}">${statusText}</span>
              <span class="mini-tag gold">${roleText}</span>
              ${r?.horario ? `<span class="mini-tag"><i data-lucide="clock-3"></i>${safe(r.horario.slice(0, 5))}</span>` : ''}
            </div>
          </div>
          <div class="racha-row-action">
            ${m.status === 'ativo' && r
              ? `<button class="mini-btn btn-secondary" data-action="select-racha" data-racha-id="${safe(m.racha_id)}"><i data-lucide="arrow-right"></i> Abrir</button>`
              : '<span class="pending-pill">Aguardando aprovação</span>'}
          </div>
        </article>
      `;
    }).join('')}
  </div>`;
}

function renderPerfil() {
  const p = getMyRachaProfile();
  const modalidade = currentModalidade();
  const positionScopeLabel = state.activeRacha ? `Posição neste racha (${state.activeRacha.nome})` : 'Posição padrão';
  return `
    <div class="card-grid profile-layout">
      <div class="profile-main-stack">
        ${renderPlayerCard(p, getProfileCardAverage(), getProfileCardAttrs())}
        <div class="profile-share-actions">
          <button class="btn-primary full" type="button" data-action="open-story-share"><i data-lucide="share-2"></i> Compartilhar cartinha</button>
        </div>
        ${renderProfileRatingOverview()}
      </div>

      <div class="profile-actions-stack">
        <details class="accordion-card">
          <summary>
            <span><i data-lucide="pencil"></i> Editar perfil</span>
            <i data-lucide="chevron-down" class="summary-chevron"></i>
          </summary>
          <div class="accordion-content">
            <form id="profileForm">
              <div class="grid-2">
                <div>
                  <label>Nome</label>
                  <input id="profileNome" value="${safe(p.nome)}" required />
                </div>
                <div>
                  <label>Apelido</label>
                  <input id="profileApelido" value="${safe(p.apelido)}" placeholder="Seu apelido no racha" />
                </div>
              </div>

              <label for="profileUsername">Usuário único</label>
              <div class="username-field">
                <span>@</span>
                <input id="profileUsername" value="${safe(p.username || '')}" maxlength="30" placeholder="davidcbcampos" autocomplete="off" />
              </div>
              <p class="field-help">Esse @ será usado para buscar e convidar jogadores.</p>

              <label for="profileTelefone">WhatsApp</label>
              <input id="profileTelefone" type="tel" inputmode="numeric" maxlength="15" value="${safe(formatPhoneBR(p.telefone))}" placeholder="(34) 99999-9999" autocomplete="tel-national" />

              <div class="grid-2">
                <div>
                  <label>${safe(positionScopeLabel)}</label>
                  <select id="profilePosicaoDetalhada">
                    ${positionOptions(p.posicao_detalhada || p.posicao || '', modalidade)}
                  </select>
                </div>
                <div>
                  <label>Tipo para sorteio</label>
                  <select id="profilePosicaoTipo">
                    ${option('linha', 'Linha', p.posicao_tipo || p.posicao || 'linha')}
                    ${option('goleiro', 'Goleiro', p.posicao_tipo || p.posicao)}
                    ${option('ambos', 'Ambos', p.posicao_tipo || p.posicao)}
                  </select>
                </div>
              </div>
              ${state.activeRacha ? '<p class="field-help racha-position-help">Essa posição vale para o racha selecionado. Em outro racha, você poderá usar outra posição.</p>' : '<p class="field-help racha-position-help">Sem racha selecionado, essa será sua posição padrão.</p>'}

              <div class="grid-2">
                <div>
                  <label>Pé dominante</label>
                  <select id="profilePe">
                    ${option('nao_informado', 'Não informado', p.pe_dominante)}
                    ${option('direito', 'Direito', p.pe_dominante)}
                    ${option('esquerdo', 'Esquerdo', p.pe_dominante)}
                    ${option('ambos', 'Ambos', p.pe_dominante)}
                  </select>
                </div>
              </div>

              <label>Estilo de jogo</label>
              <select id="profileEstilo">
                <option value="">Selecione</option>
                ${option('marcador', 'Marcador', p.estilo_jogo)}
                ${option('armador', 'Armador', p.estilo_jogo)}
                ${option('velocista', 'Velocista', p.estilo_jogo)}
                ${option('finalizador', 'Finalizador', p.estilo_jogo)}
                ${option('goleiro', 'Goleiro', p.estilo_jogo)}
                ${option('equilibrado', 'Equilibrado', p.estilo_jogo)}
              </select>

              <label>Bio curta</label>
              <textarea id="profileBio" placeholder="Ex: jogo mais pela direita, gosto de tocar rápido...">${safe(p.bio)}</textarea>

              <button class="btn-primary" type="submit"><i data-lucide="save"></i> Salvar perfil</button>
            </form>
          </div>
        </details>

        <details class="accordion-card">
          <summary>
            <span><i data-lucide="image-up"></i> Alterar foto</span>
            <i data-lucide="chevron-down" class="summary-chevron"></i>
          </summary>
          <div class="accordion-content">
            <p class="muted">Use imagem JPG, PNG, WEBP ou GIF até 2 MB.</p>
            <label>Escolher foto</label>
            <input id="avatarFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
            <button class="btn-secondary full" data-action="upload-avatar"><i data-lucide="upload"></i> Enviar foto</button>
          </div>
        </details>
      </div>
    </div>
  `;
}

function option(value, label, selected) {
  return `<option value="${safe(value)}" ${value === selected ? 'selected' : ''}>${safe(label)}</option>`;
}

function getMyAverage() {
  const mine = state.ranking.find((r) => r.jogador_id === state.user?.id);
  return mine?.media_geral || null;
}

function getMyRachaRanking() {
  return state.ranking.find((r) => r.jogador_id === state.user?.id) || null;
}

function getProfileCardAverage() {
  return state.globalRanking?.media_geral || getMyRachaRanking()?.media_geral || null;
}

function getProfileCardAttrs() {
  return state.globalRanking || getMyRachaRanking() || null;
}

function renderProfileRatingOverview() {
  const global = state.globalRanking;
  const activeRow = getMyRachaRanking();
  const activeOverall = activeRow?.media_geral ? overallScore(activeRow.media_geral) : null;
  const globalOverall = global?.media_geral ? overallScore(global.media_geral) : null;
  const rows = state.ratingsByRacha || [];

  return `
    <div class="profile-rating-stack">
      <div class="profile-rating-summary card">
        <div>
          <p class="eyebrow">Nota do jogador</p>
          <h3>Resumo de desempenho</h3>
          <p class="muted">A nota global junta as avaliações dos rachas onde você participa. Cada racha continua mantendo sua própria nota.</p>
        </div>
        <div class="profile-rating-numbers">
          <div><span>Global</span><strong>${globalOverall || '-'}</strong></div>
          <div><span>Rachas</span><strong>${safe(global?.total_rachas || rows.length || 0)}</strong></div>
          <div><span>Votos</span><strong>${safe(global?.total_avaliacoes || 0)}</strong></div>
        </div>
      </div>

      ${state.activeRacha ? `
        <div class="profile-active-rating card">
          <div>
            <p class="eyebrow">Racha selecionado</p>
            <h3>${safe(state.activeRacha.nome)}</h3>
            <p class="muted">Nota neste racha: <strong>${activeOverall || '-'}</strong> • ${safe(activeRow?.total_avaliacoes || 0)} avaliação(ões)</p>
          </div>
          <span class="active-dot">${safe(activeRoleLabel())}</span>
        </div>
      ` : ''}

      <details class="accordion-card profile-ratings-details">
        <summary>
          <span><i data-lucide="bar-chart-3"></i> Notas por racha</span>
          <i data-lucide="chevron-down" class="summary-chevron"></i>
        </summary>
        <div class="accordion-content rating-by-racha-list">
          ${rows.length ? rows.map((row) => `
            <div class="rating-by-racha-row">
              <div>
                <strong>${safe(row.racha_nome)}</strong>
                <small>${safe(row.modalidade || '')} • ${safe(row.papel || 'jogador')}</small>
              </div>
              <div class="rating-pill">
                <strong>${row.media_geral ? overallScore(row.media_geral) : '-'}</strong>
                <span>${safe(row.total_avaliacoes || 0)} voto(s)</span>
              </div>
            </div>
          `).join('') : '<p class="muted">Você ainda não tem avaliações salvas nos rachas.</p>'}
        </div>
      </details>
    </div>
  `;
}

function renderPlayerCard(profile, average = null, rankingRow = null) {
  const overall = average ? overallScore(average) : 60;
  const tier = cardTier(overall);
  const attrs = rankingRow || {};
  const pos = positionCode(profile?.posicao_detalhada || profile?.posicao);
  const skills = cardSkillRows(attrs);
  const name = (profile?.apelido || profile?.nome || 'Jogador').toUpperCase();
  const estilo = cardLabel(profile?.estilo_jogo, positionLabel(profile?.posicao_detalhada || profile?.posicao));
  const pe = profile?.username ? usernameText(profile) : cardLabel(profile?.pe_dominante, 'pé não informado');

  return `
    <div class="player-card-premium fut-card goleio-card-v2 tier-${tier}">
      <div class="gc-v2-metal"></div>
      <div class="gc-v2-frame"></div>
      <div class="gc-v2-side-brand">GOLEIO</div>

      <div class="gc-v2-top">
        <div class="gc-v2-rating">
          <strong>${overall}</strong>
          <span>${safe(pos)}</span>
          <i class="flag-br" aria-label="Brasil"></i>
        </div>
        <div class="gc-v2-crest logo-crest" aria-label="Goleio">
          <img src="assets/logos/goleio-icon-192.png" alt="Goleio">
        </div>
      </div>

      <div class="gc-v2-photo">
        ${avatarHTML(profile, true)}
      </div>

      <div class="gc-v2-nameplate">
        <h3>${safe(name)}</h3>
        <p>${safe(estilo)} • ${safe(pe)}</p>
      </div>

      <div class="gc-v2-radar-wrap">
        ${renderSkillRadar(skills, 'gc-v2-radar')}
      </div>

      <div class="gc-v2-ball" aria-hidden="true">⚽</div>
    </div>
  `;
}


function renderStoryMiniCard(profile, average = null, rankingRow = null) {
  const overall = average ? overallScore(average) : 60;
  const attrs = rankingRow || {};
  const pos = positionCode(profile?.posicao_detalhada || profile?.posicao);
  const name = (profile?.apelido || profile?.nome || 'Jogador').toUpperCase();
  const username = profile?.username ? usernameText(profile) : '@goleio';
  const skills = cardSkillRows(attrs);

  return `
    <div class="story-mini-card">
      <div class="story-mini-top">
        <div><strong>${overall}</strong><span>${safe(pos)}</span><i class="flag-br"></i></div>
        <img src="assets/logos/goleio-icon-192.png" alt="Goleio">
      </div>
      <div class="story-mini-photo">${avatarHTML(profile, true)}</div>
      <div class="story-mini-name">
        <h3>${safe(name)}</h3>
        <p>${safe(username)}</p>
      </div>
      <div class="story-mini-radar-wrap">
        ${renderSkillRadar(skills, 'story-mini-radar')}
      </div>
    </div>
  `;
}

function renderStoryShareCard(profile, average = null, rankingRow = null) {
  const overall = average ? overallScore(average) : 60;
  const attrs = rankingRow || {};
  const pos = positionCode(profile?.posicao_detalhada || profile?.posicao);
  const name = (profile?.apelido || profile?.nome || 'Jogador').toUpperCase();
  const username = profile?.username ? usernameText(profile) : '@goleio';
  const tier = cardTier(overall);
  const skills = cardSkillRows(attrs);
  return `
    <div class="story-share-card tier-${tier}">
      <div class="story-share-metal"></div>
      <div class="story-share-frame"></div>
      <div class="story-share-brand">goleio</div>
      <div class="story-share-top">
        <div class="story-share-rating">
          <strong>${overall}</strong>
          <span>${safe(pos)}</span>
          <i class="flag-br" aria-hidden="true"></i>
        </div>
        <div class="story-share-crest" aria-label="Goleio">
          <img src="assets/logos/goleio-icon-192.png" alt="Goleio">
        </div>
      </div>
      <div class="story-share-photo">${avatarHTML(profile, true)}</div>
      <div class="story-share-nameplate">
        <h3>${safe(name)}</h3>
        <p>${safe(username)}</p>
      </div>
      <div class="story-share-radar-wrap">
        ${renderSkillRadar(skills, 'story-share-radar')}
      </div>
      <div class="story-share-ball" aria-hidden="true">⚽</div>
    </div>
  `;
}

function renderStoryShareModal() {
  const p = getMyRachaProfile();
  const average = getProfileCardAverage();
  const attrs = getProfileCardAttrs();
  const overall = average ? overallScore(average) : 60;
  const pos = positionCode(p?.posicao_detalhada || p?.posicao);
  const username = p?.username ? usernameText(p) : '@goleio';
    return `
    <div class="modal-overlay story-modal-overlay">
      <div class="player-modal story-modal" role="dialog" aria-modal="true">
        <button class="modal-close" data-action="close-story-share" aria-label="Fechar"><i data-lucide="x"></i></button>
        <div class="story-modal-head">
          <p class="eyebrow">Compartilhar</p>
          <h2>Cartinha para Story</h2>
          <p class="muted">Baixe a imagem e publique no Instagram, WhatsApp ou onde quiser.</p>
        </div>
        <div class="story-preview-wrap">
          <canvas id="storyCardPreview" class="story-card-canvas" width="1080" height="1920" aria-label="Prévia da cartinha para Story"></canvas>
        </div>
        <div class="story-actions">
          <button class="btn-primary" type="button" data-action="download-story"><i data-lucide="download"></i> Baixar imagem</button>
          <button class="btn-secondary" type="button" data-action="share-story"><i data-lucide="send"></i> Compartilhar</button>
        </div>
      </div>
    </div>
  `;
}

function openStoryShare() {
  closeModal();
  document.body.insertAdjacentHTML('beforeend', renderStoryShareModal());
  refreshIcons();
  renderStoryCanvasPreview();
}

async function storyToBlob() {
  const canvas = $('storyCardPreview');
  if (!canvas || canvas.tagName?.toLowerCase() !== 'canvas') throw new Error('Prévia do Story não encontrada.');
  await drawGoleioStoryCanvas(canvas);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não consegui gerar a imagem.')), 'image/png', 0.98);
  });
}


function canvasRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function canvasCardPath(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x + w * .18, y);
  ctx.lineTo(x + w * .82, y);
  ctx.lineTo(x + w * .96, y + h * .08);
  ctx.lineTo(x + w, y + h * .24);
  ctx.lineTo(x + w, y + h * .80);
  ctx.lineTo(x + w * .86, y + h * .95);
  ctx.lineTo(x + w * .50, y + h);
  ctx.lineTo(x + w * .14, y + h * .95);
  ctx.lineTo(x, y + h * .80);
  ctx.lineTo(x, y + h * .24);
  ctx.lineTo(x + w * .04, y + h * .08);
  ctx.closePath();
}

function loadCanvasImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawCoverImage(ctx, img, x, y, w, h, r = 0) {
  if (!img) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = Math.max(0, (ih - sh) * 0.18);
  ctx.save();
  if (r) {
    canvasRoundRect(ctx, x, y, w, h, r);
    ctx.clip();
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function drawBrazilFlag(ctx, x, y, w, h) {
  ctx.save();
  canvasRoundRect(ctx, x, y, w, h, 6);
  ctx.clip();
  ctx.fillStyle = '#159447';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#f5d43b';
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + h * .12);
  ctx.lineTo(x + w * .88, y + h / 2);
  ctx.lineTo(x + w / 2, y + h * .88);
  ctx.lineTo(x + w * .12, y + h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1c4aa5';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, h * .26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStoryRadar(ctx, skills, cx, cy, radius) {
  const list = (skills || []).map((skill) => ({ ...skill, value: normalizeSkillScore(skill.value, 60) }));
  if (!list.length) return;
  const step = (Math.PI * 2) / list.length;
  const start = -Math.PI / 2;
  ctx.save();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = 'rgba(245, 210, 72, .22)';
  for (let ring = 1; ring <= 4; ring += 1) {
    const r = radius * (ring / 4);
    ctx.beginPath();
    list.forEach((_, i) => {
      const a = start + i * step;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }
  list.forEach((_, i) => {
    const a = start + i * step;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.stroke();
  });

  const points = list.map((skill, i) => {
    const pct = Math.max(0, Math.min(1, (skill.value - 60) / 39));
    const r = radius * (.18 + pct * .82);
    const a = start + i * step;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, skill, angle: a };
  });
  ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = 'rgba(220, 178, 19, .44)';
  ctx.fill();
  ctx.strokeStyle = '#f5d22f';
  ctx.lineWidth = 4;
  ctx.shadowColor = 'rgba(245, 210, 47, .55)';
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;
  points.forEach((p) => {
    ctx.fillStyle = '#f5d22f';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5.8, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.font = '900 23px Inter, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  list.forEach((skill, i) => {
    const a = start + i * step;
    const lx = cx + Math.cos(a) * (radius + 46);
    const ly = cy + Math.sin(a) * (radius + 31);
    ctx.textAlign = Math.abs(Math.cos(a)) < .2 ? 'center' : (Math.cos(a) < 0 ? 'right' : 'left');
    ctx.fillStyle = '#f2d85c';
    ctx.fillText(skill.short, lx, ly - 15);
    ctx.fillStyle = '#fff1a8';
    ctx.fillText(String(skill.value), lx, ly + 15);
  });
  ctx.restore();
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(' ');
  let line = '';
  for (let n = 0; n < words.length; n += 1) {
    const test = line ? `${line} ${words[n]}` : words[n];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = words[n];
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y;
}

async function drawGoleioStoryCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const W = 1080;
  const H = 1920;
  canvas.width = W;
  canvas.height = H;
  const p = getMyRachaProfile();
  const average = getProfileCardAverage();
  const attrs = getProfileCardAttrs() || {};
  const overall = average ? overallScore(average) : overallFromSkills(attrs, 60);
  const skills = cardSkillRows(attrs);
  const pos = positionCode(p?.posicao_detalhada || p?.posicao);
  const name = (p?.apelido || p?.nome || 'Jogador').toUpperCase();
  const username = p?.username ? usernameText(p) : '@goleio';
  const photo = await loadCanvasImage(p?.avatar_url);
  const logo = await loadCanvasImage('assets/logos/goleio-icon-192.png');

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);
  let grad = ctx.createRadialGradient(120, 20, 20, 220, 160, 520);
  grad.addColorStop(0, 'rgba(212,175,55,.34)');
  grad.addColorStop(1, 'rgba(212,175,55,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  grad = ctx.createRadialGradient(W + 80, H * .63, 20, W + 80, H * .63, 560);
  grad.addColorStop(0, 'rgba(212,175,55,.22)');
  grad.addColorStop(1, 'rgba(212,175,55,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  canvasRoundRect(ctx, 2, 2, W - 4, H - 4, 42);
  ctx.strokeStyle = 'rgba(212,175,55,.42)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (logo) ctx.drawImage(logo, 92, 95, 92, 92);
  ctx.fillStyle = '#f4d55d';
  ctx.font = '900 46px Inter, Arial, sans-serif';
  ctx.letterSpacing = '10px';
  ctx.fillText('GOLEIO', 220, 135);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = 'rgba(255,255,255,.70)';
  ctx.font = '500 33px Inter, Arial, sans-serif';
  ctx.fillText('Crie sua cartinha', 220, 185);

  const cardX = 185;
  const cardY = 300;
  const cardW = 710;
  const cardH = 1020;
  ctx.save();
  canvasCardPath(ctx, cardX, cardY, cardW, cardH);
  ctx.clip();
  const cgrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  cgrad.addColorStop(0, '#1a1b18');
  cgrad.addColorStop(.40, '#070707');
  cgrad.addColorStop(1, '#202018');
  ctx.fillStyle = cgrad;
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.strokeStyle = 'rgba(255,255,255,.035)';
  ctx.lineWidth = 1;
  for (let i = -cardH; i < cardW; i += 32) {
    ctx.beginPath();
    ctx.moveTo(cardX + i, cardY + cardH);
    ctx.lineTo(cardX + i + cardH, cardY);
    ctx.stroke();
  }
  ctx.restore();
  canvasCardPath(ctx, cardX, cardY, cardW, cardH);
  ctx.strokeStyle = 'rgba(212,175,55,.42)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#fff1a8';
  ctx.font = '900 118px Inter, Arial, sans-serif';
  ctx.fillText(String(overall), cardX + 70, cardY + 168);
  ctx.fillStyle = '#fff';
  ctx.font = '900 50px Inter, Arial, sans-serif';
  ctx.fillText(pos, cardX + 78, cardY + 235);
  drawBrazilFlag(ctx, cardX + 78, cardY + 260, 70, 48);

  const crestX = cardX + cardW - 155;
  const crestY = cardY + 68;
  ctx.save();
  canvasRoundRect(ctx, crestX, crestY, 118, 118, 32);
  ctx.fillStyle = 'rgba(0,0,0,.38)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(212,175,55,.52)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (logo) ctx.drawImage(logo, crestX + 21, crestY + 21, 76, 76);
  ctx.restore();

  const photoX = cardX + 250;
  const photoY = cardY + 132;
  const photoW = 388;
  const photoH = 398;
  if (photo) {
    drawCoverImage(ctx, photo, photoX, photoY, photoW, photoH, 30);
  } else {
    ctx.save();
    canvasRoundRect(ctx, photoX, photoY, photoW, photoH, 30);
    ctx.fillStyle = '#212121';
    ctx.fill();
    ctx.fillStyle = '#f4d55d';
    ctx.font = '900 96px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(p), photoX + photoW / 2, photoY + photoH / 2);
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(0,0,0,.72)';
  canvasRoundRect(ctx, cardX + 185, cardY + 548, cardW - 235, 118, 0);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '900 58px Inter, Arial, sans-serif';
  ctx.fillText(name, cardX + cardW / 2 + 45, cardY + 604);
  ctx.fillStyle = 'rgba(255,255,255,.68)';
  ctx.font = '800 27px Inter, Arial, sans-serif';
  ctx.fillText(username, cardX + cardW / 2 + 45, cardY + 646);

  ctx.save();
  ctx.translate(cardX + 68, cardY + 760);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = '900 84px Inter, Arial, sans-serif';
  ctx.fillText('goleio', 0, 0);
  ctx.restore();

  ctx.strokeStyle = 'rgba(212,175,55,.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cardX + 245, cardY + 692);
  ctx.lineTo(cardX + cardW - 110, cardY + 692);
  ctx.stroke();

  drawStoryRadar(ctx, skills, cardX + cardW / 2 + 52, cardY + 875, 104);

  ctx.strokeStyle = 'rgba(212,175,55,.42)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(82, 1514);
  ctx.lineTo(W - 82, 1514);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '900 42px Inter, Arial, sans-serif';
  wrapCanvasText(ctx, 'Crie sua cartinha. Organize seu racha. Viva sua comunidade.', W / 2, 1590, 850, 56);
  ctx.fillStyle = '#f4d55d';
  ctx.font = '900 36px Inter, Arial, sans-serif';
  ctx.fillText('goleio-app.github.io/Goleio/', W / 2, 1738);
}

async function renderStoryCanvasPreview() {
  const canvas = $('storyCardPreview');
  if (!canvas || canvas.tagName?.toLowerCase() !== 'canvas') return;
  try {
    await drawGoleioStoryCanvas(canvas);
  } catch (error) {
    console.error('Erro ao desenhar Story:', error);
    toast('Não consegui montar a prévia da cartinha.');
  }
}

async function downloadStory(button = null) {
  try {
    setLoading(button, true, 'Gerando...');
    const blob = await storyToBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const p = getMyRachaProfile();
    a.href = url;
    a.download = `goleio-cartinha-${normalizeUsernameInput(p?.username || p?.apelido || 'jogador')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    toast('Imagem da cartinha gerada!');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Não consegui gerar a imagem.');
  } finally {
    setLoading(button, false);
  }
}

async function shareStory(button = null) {
  try {
    setLoading(button, true, 'Preparando...');
    const blob = await storyToBlob();
    const file = new File([blob], 'goleio-cartinha.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Minha cartinha no Goleio', text: 'Minha cartinha no Goleio ⚽' });
      toast('Pronto para compartilhar!');
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'goleio-cartinha.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
      toast('Seu navegador não compartilha direto. Baixei a imagem para você postar manualmente.');
    }
  } catch (error) {
    console.error(error);
    toast(error.message || 'Não consegui compartilhar agora.');
  } finally {
    setLoading(button, false);
  }
}



function renderDangerConfirmModal(type) {
  if (!state.activeRacha) return '';
  const configs = {
    reset: {
      icon: 'rotate-ccw',
      title: 'Zerar avaliações',
      eyebrow: 'Zona de perigo',
      description: 'Essa ação apagará todas as avaliações deste racha. O ranking será reiniciado e não será possível desfazer.',
      required: 'ZERAR NOTAS',
      inputLabel: 'Digite ZERAR NOTAS para confirmar',
      button: 'Zerar avaliações',
      action: 'confirm-reset-ratings'
    },
    leave: {
      icon: 'log-out',
      title: 'Sair da comunidade',
      eyebrow: 'Confirmar saída',
      description: `Você vai sair do racha ${state.activeRacha.nome}. Seu perfil no Goleio não será apagado, mas suas presenças e avaliações deste racha serão removidas.`,
      required: 'SAIR',
      inputLabel: 'Digite SAIR para confirmar',
      button: 'Sair do racha',
      action: 'confirm-leave-racha'
    },
    delete: {
      icon: 'trash-2',
      title: 'Excluir comunidade',
      eyebrow: 'Ação permanente',
      description: 'Essa ação apagará permanentemente o racha, membros, presenças, avaliações, sorteios e histórico relacionado. Antes, remova todos os outros membros.',
      required: state.activeRacha.nome,
      inputLabel: `Digite exatamente: ${state.activeRacha.nome}`,
      button: 'Excluir comunidade',
      action: 'confirm-delete-racha'
    }
  };
  const c = configs[type];
  if (!c) return '';
  return `
    <div class="modal-overlay danger-confirm-overlay">
      <div class="player-modal danger-confirm-modal" role="dialog" aria-modal="true">
        <button class="modal-close" data-action="close-modal" aria-label="Fechar"><i data-lucide="x"></i></button>
        <div class="danger-confirm-head">
          <span class="danger-confirm-icon"><i data-lucide="${safe(c.icon)}"></i></span>
          <div>
            <p class="eyebrow">${safe(c.eyebrow)}</p>
            <h2>${safe(c.title)}</h2>
            <p class="muted">${safe(c.description)}</p>
          </div>
        </div>
        <div class="danger-confirm-box">
          <label>${safe(c.inputLabel)}</label>
          <input id="dangerConfirmInput" data-required="${safe(c.required)}" autocomplete="off" placeholder="Confirmação obrigatória" />
          <p class="field-help">Essa confirmação evita alterações acidentais.</p>
        </div>
        <div class="form-actions danger-confirm-actions">
          <button class="btn-secondary" type="button" data-action="close-modal"><i data-lucide="x"></i> Cancelar</button>
          <button class="btn-danger" type="button" data-action="${safe(c.action)}"><i data-lucide="${safe(c.icon)}"></i> ${safe(c.button)}</button>
        </div>
      </div>
    </div>
  `;
}

function openDangerConfirm(type) {
  closeModal();
  document.body.insertAdjacentHTML('beforeend', renderDangerConfirmModal(type));
  setTimeout(() => $('dangerConfirmInput')?.focus(), 80);
  refreshIcons();
}

function dangerConfirmValue() {
  return $('dangerConfirmInput')?.value?.trim() || '';
}

function renderRacha() {
  if (!state.activeRacha) return requireActiveRachaHTML('Nenhum racha selecionado');
  const r = state.activeRacha;
  const activeMembers = state.members.filter((m) => m.status === 'ativo');
  const pendingMembers = state.members.filter((m) => m.status === 'pendente');
  const admins = activeMembers.filter((m) => m.papel === 'admin').length;
  const evaluators = activeMembers.filter((m) => m.papel === 'avaliador').length;
  const locationLine = [r.local, r.endereco].filter(Boolean).join(' • ') || 'Local não definido';

  return `
    <section class="racha-page-stack racha-page-v45">
      <div class="card racha-overview-card racha-overview-card-v45">
        <div class="racha-selected-label">
          <span>Racha selecionado</span>
          <em>${safe(activeRoleLabel())}</em>
        </div>

        <div class="racha-overview-main racha-overview-main-v45">
          ${rachaAvatarHTML(r, 'racha-emblem')}
          <div class="racha-overview-copy">
            <p class="eyebrow">${safe(r.modalidade)} • ${dayName(r.dia_semana)}${r.horario ? ` • ${safe(r.horario.slice(0,5))}` : ''}</p>
            <h3>${safe(r.nome)}</h3>
            <p class="muted">${safe(locationLine)}</p>
          </div>
        </div>

        <div class="racha-quick-chips">
          <span><strong>${activeMembers.length}</strong> membros</span>
          <span><strong>${admins}</strong> admin${admins === 1 ? '' : 's'}</span>
          <span><strong>${evaluators}</strong> avaliador${evaluators === 1 ? '' : 'es'}</span>
        </div>

        <div class="racha-overview-actions racha-overview-actions-v45">
          ${mapButtonHTML(r, true)}
          <button class="mini-btn btn-secondary" data-action="copy-code" data-code="${safe(r.codigo_convite)}"><i data-lucide="copy"></i> Código</button>
          <button class="mini-btn btn-ghost" data-action="open-racha-more"><i data-lucide="more-horizontal"></i> Mais</button>
        </div>
      </div>

      ${isAdmin() && pendingMembers.length ? `
        <button class="admin-pending-alert-card" type="button" data-action="open-admin-pending">
          <span><i data-lucide="user-check"></i></span>
          <div><strong>${pendingMembers.length} solicitação(ões) pendente(s)</strong><small>Aprove novos jogadores para entrar na comunidade.</small></div>
          <i data-lucide="arrow-right"></i>
        </button>
      ` : ''}

      ${isAdmin() ? renderAdminRachaSettings(r, pendingMembers, activeMembers) : ''}

      <div class="card players-clean-card players-clean-card-v45">
        <div class="section-headline">
          <div>
            <p class="eyebrow">Comunidade</p>
            <h3><i data-lucide="users"></i> Jogadores</h3>
          </div>
          <span class="section-count">${activeMembers.length}</span>
        </div>
        <p class="racha-tap-hint"><i data-lucide="hand-pointer"></i> Toque em um jogador para abrir a cartinha.</p>
        ${renderMembers(activeMembers)}
      </div>
    </section>
  `;
}

function renderRachaMoreModal() {
  if (!state.activeRacha) return '';
  const r = state.activeRacha;
  const activeMembers = state.members.filter((m) => m.status === 'ativo');
  const admins = activeMembers.filter((m) => m.papel === 'admin').length;
  const evaluators = activeMembers.filter((m) => m.papel === 'avaliador').length;
  const locationLine = [r.local, r.endereco].filter(Boolean).join(' • ') || 'Local não definido';
  const mapUrl = buildMapUrl(r);

  return `
    <div class="modal-overlay sheet-overlay racha-more-overlay">
      <div class="bottom-sheet racha-more-sheet" role="dialog" aria-modal="true">
        <div class="sheet-handle" aria-hidden="true"></div>
        <div class="sheet-head">
          <div>
            <p class="eyebrow">Detalhes do racha</p>
            <h2>${safe(r.nome)}</h2>
          </div>
          <button class="modal-close sheet-close" data-action="close-modal" aria-label="Fechar"><i data-lucide="x"></i></button>
        </div>

        <div class="sheet-racha-summary">
          ${rachaAvatarHTML(r, 'racha-emblem small')}
          <div>
            <strong>${safe(r.modalidade)} • ${dayName(r.dia_semana)}${r.horario ? ` • ${safe(r.horario.slice(0,5))}` : ''}</strong>
            <span>${safe(locationLine)}</span>
          </div>
        </div>

        <div class="sheet-info-grid">
          <div><span>Membros</span><strong>${activeMembers.length}</strong></div>
          <div><span>Admins</span><strong>${admins}</strong></div>
          <div><span>Avaliadores</span><strong>${evaluators}</strong></div>
        </div>

        <div class="sheet-code-box">
          <span>Código da comunidade</span>
          <strong>${safe(r.codigo_convite)}</strong>
          <button class="mini-btn btn-secondary" data-action="copy-code" data-code="${safe(r.codigo_convite)}"><i data-lucide="copy"></i> Copiar</button>
        </div>

        <div class="sheet-action-list">
          ${mapUrl ? `<a class="sheet-action-item" href="${safe(mapUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="map-pin"></i><span>Abrir no mapa</span><em>Local do racha</em></a>` : ''}
          <button class="sheet-action-item" data-action="refresh-racha"><i data-lucide="refresh-cw"></i><span>Atualizar dados</span><em>Recarregar membros e ranking</em></button>
          <button class="sheet-action-item danger" data-action="open-leave-racha-modal"><i data-lucide="log-out"></i><span>Sair da comunidade</span><em>Remover minha participação</em></button>
        </div>
      </div>
    </div>
  `;
}

function openRachaMoreModal() {
  closeModal();
  document.body.insertAdjacentHTML('beforeend', renderRachaMoreModal());
  refreshIcons();
}

function renderAdminRachaSettings(r, pendingMembers = [], activeMembers = []) {
  const rawDates = getRawUpcomingGameDates(r, isSmallScreen() ? 6 : 10);
  return `
    <details class="accordion-card admin-racha-panel" ${state.adminOpenPanel ? 'open' : ''}>
      <summary>
        <span><i data-lucide="settings-2"></i> Administração do racha</span>
        <i data-lucide="chevron-down" class="summary-chevron"></i>
      </summary>
      <div class="accordion-content admin-racha-content">
        <div class="admin-note-box">
          <i data-lucide="crown"></i>
          <div>
            <strong>Painel do administrador</strong>
            <p class="muted">Aprove jogadores, convide por @usuário, defina avaliadores, remova membros e ajuste as informações do racha.</p>
          </div>
        </div>

        ${renderAdminPendingPanel(pendingMembers)}
        ${renderAdminMembersManagement(activeMembers)}

        <details class="sub-accordion">
          <summary><span><i data-lucide="pencil-ruler"></i> Editar informações</span><i data-lucide="chevron-down"></i></summary>
          <form id="editRachaForm" class="admin-form-grid">
            <div class="full-field">
              <label>Nome do racha</label>
              <input id="editRachaNome" value="${safe(r.nome)}" required />
            </div>
            <div class="full-field">
              <label>Escudo do racha</label>
              <div class="field-help compact-help">Escolha o avatar visual da comunidade.</div>
              ${renderRachaAvatarPicker('editRachaAvatarKey', r.avatar_key || 'classico')}
            </div>
            <div>
              <label>Modalidade</label>
              <select id="editRachaModalidade">
                ${option('futsal', 'Futsal', r.modalidade)}
                ${option('society', 'Society', r.modalidade)}
                ${option('campo', 'Campo', r.modalidade)}
              </select>
            </div>
            <div>
              <label>Jogadores por time</label>
              <input id="editRachaPorTime" type="number" min="1" max="30" value="${safe(r.jogadores_por_time || 5)}" />
            </div>
            <div class="full-field">
              <label>Nome do local</label>
              <input id="editRachaLocal" value="${safe(r.local || '')}" placeholder="Nome da quadra/campo" />
            </div>
            <div class="full-field">
              <label>Endereço</label>
              <input id="editRachaEndereco" value="${safe(r.endereco || '')}" placeholder="Rua, número, bairro, cidade" />
            </div>
            <div class="full-field">
              <label>Link do Google Maps opcional</label>
              <input id="editRachaLinkMaps" value="${safe(r.link_maps || '')}" placeholder="Cole o link do local" />
              <p class="field-help">Sem API paga. O botão usa link direto ou busca pelo endereço.</p>
            </div>
            <div>
              <label>Dia do racha</label>
              <select id="editRachaDia">
                ${[0,1,2,3,4,5,6].map((d) => option(String(d), dayName(d), String(r.dia_semana))).join('')}
              </select>
            </div>
            <div>
              <label>Horário</label>
              <input id="editRachaHorario" type="time" value="${safe(r.horario ? r.horario.slice(0,5) : '')}" />
            </div>
            <div>
              <label>Máximo de jogadores</label>
              <input id="editRachaMax" type="number" min="0" max="200" value="${safe(r.max_jogadores || '')}" placeholder="Ex: 20" />
            </div>
            <div class="full-field admin-form-actions">
              <button class="btn-primary" type="submit"><i data-lucide="save"></i> Salvar alterações</button>
            </div>
          </form>
        </details>

        <details class="sub-accordion" ${state.adminOpenPanel === 'invite' ? 'open' : ''}>
          <summary><span><i data-lucide="user-plus"></i> Convidar por @usuário</span><i data-lucide="chevron-down"></i></summary>
          <form id="inviteUserForm" class="admin-cancel-form invite-user-form">
            <div>
              <label>@usuário do jogador</label>
              <div class="username-field">
                <span>@</span>
                <input id="inviteUsername" placeholder="digite para buscar" autocomplete="off" inputmode="text" />
              </div>
              <div id="inviteSearchResults" class="invite-search-results">
                ${renderInviteSearchResults()}
              </div>
            </div>
            <div>
              <label>Mensagem opcional</label>
              <input id="inviteMessage" placeholder="Ex: entra no racha de sábado" />
            </div>
            <button class="btn-secondary" type="submit"><i data-lucide="send"></i> Enviar convite</button>
          </form>
          <p class="hint">Busque pelo @ antes de enviar. O jogador recebe o convite no início do app e pode aceitar ou recusar.</p>
        </details>

        <details class="sub-accordion">
          <summary><span><i data-lucide="calendar-x-2"></i> Cancelar uma semana</span><i data-lucide="chevron-down"></i></summary>
          <form id="cancelRachaDateForm" class="admin-cancel-form">
            <div>
              <label>Data do racha</label>
              <select id="cancelRachaDate">
                ${rawDates.map((dateValue) => `<option value="${safe(dateValue)}">${formatDateBR(dateValue)} • ${dayName(dateFromInput(dateValue).getDay())}</option>`).join('')}
              </select>
            </div>
            <div>
              <label>Motivo opcional</label>
              <input id="cancelRachaMotivo" placeholder="Ex: feriado, quadra indisponível" />
            </div>
            <button class="btn-danger" type="submit"><i data-lucide="calendar-x"></i> Cancelar data</button>
          </form>

          <div class="admin-date-list">
            ${rawDates.map((dateValue) => {
              const cancelled = getCancelledDate(dateValue);
              return `
                <div class="admin-date-item ${cancelled ? 'cancelled' : ''}">
                  <div>
                    <strong>${formatDateBR(dateValue)}</strong>
                    <span>${dayName(dateFromInput(dateValue).getDay())}${cancelled?.motivo ? ` • ${safe(cancelled.motivo)}` : ''}</span>
                  </div>
                  ${cancelled
                    ? `<button class="mini-btn btn-secondary" data-action="restore-game-date" data-date="${safe(dateValue)}"><i data-lucide="rotate-ccw"></i> Reativar</button>`
                    : `<button class="mini-btn btn-danger" data-action="cancel-game-date" data-date="${safe(dateValue)}"><i data-lucide="x"></i> Cancelar</button>`}
                </div>
              `;
            }).join('')}
          </div>
        </details>

        ${renderDangerZone(activeMembers)}
      </div>
    </details>
  `;
}

function renderDangerZone(activeMembers = []) {
  const otherMembers = activeMembers.filter((m) => m.user_id !== state.user?.id).length;
  return `
    <details class="sub-accordion danger-zone-panel" ${state.adminOpenPanel === 'danger' ? 'open' : ''}>
      <summary><span><i data-lucide="shield-alert"></i> Zona de perigo</span><i data-lucide="chevron-down"></i></summary>
      <div class="danger-zone-content">
        <div class="danger-zone-warning">
          <i data-lucide="triangle-alert"></i>
          <div>
            <strong>Ações irreversíveis</strong>
            <p>Use apenas quando tiver certeza. Essas ações afetam todo o racha.</p>
          </div>
        </div>

        <div class="danger-action-row">
          <div>
            <strong>Zerar avaliações</strong>
            <p>Apaga todas as notas deste racha para começar uma nova rodada de avaliações.</p>
          </div>
          <button class="mini-btn btn-danger" data-action="open-reset-ratings-modal"><i data-lucide="rotate-ccw"></i> Zerar notas</button>
        </div>

        <div class="danger-action-row">
          <div>
            <strong>Excluir comunidade</strong>
            <p>Apaga o racha permanentemente. Antes, remova todos os outros membros ativos ou pendentes.</p>
            ${otherMembers ? `<small>${otherMembers} membro(s) ainda precisam ser removidos antes de excluir.</small>` : '<small>Somente você permanece nesta comunidade.</small>'}
          </div>
          <button class="mini-btn btn-danger" data-action="open-delete-racha-modal"><i data-lucide="trash-2"></i> Excluir racha</button>
        </div>
      </div>
    </details>
  `;
}


function renderInviteSearchResults() {
  const term = state.inviteSearchTerm || '';
  if (!term) {
    return '<p class="invite-search-help">Digite pelo menos 2 letras do @usuário.</p>';
  }
  if (state.inviteSearchLoading) {
    return '<p class="invite-search-help"><i data-lucide="loader-circle"></i> Buscando jogador...</p>';
  }
  if (term.length < 2) {
    return '<p class="invite-search-help">Continue digitando para buscar.</p>';
  }
  if (!state.inviteSearchResults?.length) {
    return '<p class="invite-search-empty">Nenhum usuário encontrado com esse @.</p>';
  }
  return `
    <div class="invite-search-list">
      ${state.inviteSearchResults.map((p) => {
        const status = inviteCandidateStatus(p);
        const disabled = status.kind !== 'available';
        return `
          <button type="button" class="invite-user-option ${disabled ? 'disabled' : ''}" ${disabled ? 'disabled' : ''} data-action="select-invite-user" data-username="${safe(p.username)}">
            ${avatarHTML(p)}
            <span>
              <strong>${safe(p.apelido || p.nome || 'Jogador')}</strong>
              <small>@${safe(p.username)} • ${safe(positionLabel(p.posicao_detalhada || p.posicao_tipo))}</small>
            </span>
            <em class="invite-status-pill ${safe(status.kind)}">${safe(status.label)}</em>
          </button>
        `;
      }).join('')}
    </div>
  `;
}


function inviteCandidateStatus(profile) {
  const userId = profile?.jogador_id || profile?.id;
  const username = normalizeUsernameInput(profile?.username || '');
  const member = state.members.find((m) => m.user_id === userId || normalizeUsernameInput(m.profiles?.username) === username);
  if (member?.status === 'ativo') return { kind: 'member', label: 'Já está no racha' };
  if (member?.status === 'pendente') return { kind: 'pending', label: 'Entrada pendente' };
  const invited = state.convites?.find?.((c) => normalizeUsernameInput(c.convidado_username || c.username || '') === username);
  if (invited) return { kind: 'pending', label: 'Convite pendente' };
  return { kind: 'available', label: 'Convidar' };
}

function updateInviteSearchBox() {
  const box = $('inviteSearchResults');
  if (!box) return;
  box.innerHTML = renderInviteSearchResults();
  refreshIcons();
}

function scheduleInviteUserSearch(rawValue) {
  const term = normalizeUsernameInput(rawValue || '');
  state.inviteSearchTerm = term;
  state.inviteSearchResults = [];
  clearTimeout(scheduleInviteUserSearch._timer);

  if (!term || term.length < 2) {
    state.inviteSearchLoading = false;
    updateInviteSearchBox();
    return;
  }

  state.inviteSearchLoading = true;
  updateInviteSearchBox();
  scheduleInviteUserSearch._timer = setTimeout(() => searchInviteUsers(term), 280);
}

async function searchInviteUsers(term) {
  try {
    const { data, error } = await sb.rpc('buscar_jogadores', { p_termo: term });
    if (error) throw error;
    if (state.inviteSearchTerm !== term) return;
    state.inviteSearchResults = (data || []).filter((p) => p.jogador_id !== state.user?.id);
  } catch (error) {
    console.error(error);
    state.inviteSearchResults = [];
    toast(error.message || 'Não consegui buscar usuários agora.');
  } finally {
    if (state.inviteSearchTerm === term) {
      state.inviteSearchLoading = false;
      updateInviteSearchBox();
    }
  }
}

function renderAdminPendingPanel(pendingMembers) {
  return `
    <details class="sub-accordion" ${pendingMembers.length || state.adminOpenPanel === 'pending' ? 'open' : ''}>
      <summary>
        <span><i data-lucide="user-check"></i> Aprovações pendentes <em class="admin-counter">${pendingMembers.length}</em></span>
        <i data-lucide="chevron-down"></i>
      </summary>
      <div class="admin-panel-body">
        ${pendingMembers.length ? renderMembers(pendingMembers, true) : '<p class="muted admin-empty-line">Nenhum jogador aguardando aprovação.</p>'}
      </div>
    </details>
  `;
}

function renderAdminMembersManagement(activeMembers) {
  return `
    <details class="sub-accordion" ${state.adminOpenPanel === 'members' ? 'open' : ''}>
      <summary>
        <span><i data-lucide="users-round"></i> Jogadores e permissões <em class="admin-counter">${activeMembers.length}</em></span>
        <i data-lucide="chevron-down"></i>
      </summary>
      <div class="admin-panel-body">
        <p class="hint admin-permission-hint">Use essa área para definir administradores/avaliadores ou remover alguém da comunidade. Os cards públicos ficam limpos, mostrando só o perfil do jogador.</p>
        ${activeMembers.length ? `<div class="admin-member-list">${activeMembers.map(renderAdminMemberRow).join('')}</div>` : '<p class="muted admin-empty-line">Nenhum jogador ativo.</p>'}
      </div>
    </details>
  `;
}

function renderAdminMemberRow(member) {
  const p = mergeMemberProfile(member);
  const isSelf = member.user_id === state.user?.id;
  const isOwner = member.user_id === state.activeRacha?.dono_id;
  return `
    <article class="admin-member-row">
      ${avatarHTML(p)}
      <div class="admin-member-main">
        <strong>${safe(p.apelido || p.nome || 'Jogador')}</strong>
        <div class="member-meta compact-meta">
          ${roleBadge(member.papel, { full: true })}
          ${isOwner ? '<span class="role-badge role-owner">Dono</span>' : ''}
          <span class="status-badge">${safe(positionLabel(p.posicao_detalhada || p.posicao))}</span>
          <span class="status-badge username-badge">${safe(usernameText(p))}</span>
        </div>
      </div>
      <div class="admin-member-actions">
        <button class="mini-btn btn-ghost" data-action="open-player-profile" data-user-id="${safe(member.user_id)}"><i data-lucide="id-card"></i> Perfil</button>
        ${(!isSelf && !isOwner) ? renderAdminPermissionButtons(member) : `<span class="admin-lock-note">${isSelf ? 'Você' : 'Dono'}</span>`}
      </div>
    </article>
  `;
}

function renderAdminPermissionButtons(member) {
  const role = member.papel || 'jogador';
  const buttons = [];
  if (role !== 'jogador') {
    buttons.push(`<button class="mini-btn btn-secondary" data-action="set-member-role" data-member-id="${safe(member.id)}" data-role="jogador"><i data-lucide="user"></i> Jogador</button>`);
  }
  if (role !== 'avaliador') {
    buttons.push(`<button class="mini-btn btn-secondary" data-action="set-member-role" data-member-id="${safe(member.id)}" data-role="avaliador"><i data-lucide="star"></i> Avaliador</button>`);
  }
  if (role !== 'admin') {
    buttons.push(`<button class="mini-btn btn-secondary" data-action="set-member-role" data-member-id="${safe(member.id)}" data-role="admin"><i data-lucide="crown"></i> Admin</button>`);
  }
  buttons.push(`<button class="mini-btn btn-danger" data-action="remove-member" data-member-id="${safe(member.id)}" data-player-name="${safe(member.profiles?.apelido || member.profiles?.nome || 'jogador')}"><i data-lucide="user-x"></i> Remover</button>`);
  return buttons.join('');
}

function renderMembers(members, showApproval = false) {
  if (!members.length) return '<p class="muted">Nenhum jogador encontrado.</p>';
  return `<div class="member-list compact-members">
    ${members.map((m) => {
      const p = mergeMemberProfile(m);
      const meta = showApproval
        ? `${statusBadge(m.status)} <span class="status-badge">${safe(positionLabel(p.posicao_detalhada || p.posicao))}</span> <span class="status-badge username-badge">${safe(usernameText(p))}</span>`
        : `${roleBadge(m.papel)} <span class="status-badge">${safe(positionLabel(p.posicao_detalhada || p.posicao))}</span> <span class="status-badge username-badge">${safe(usernameText(p))}</span>`;
      return `
        <div class="member-card compact-member-card clean-player-row" data-action="open-player-profile" data-user-id="${safe(m.user_id)}" role="button" tabindex="0">
          ${avatarHTML(p)}
          <div class="compact-member-info">
            <strong>${safe(p.apelido || p.nome || 'Jogador')}</strong>
            <div class="member-meta compact-meta">${meta}</div>
          </div>
          <div class="member-actions compact-actions">
            ${showApproval ? `
              <button class="mini-btn btn-secondary icon-only" title="Aprovar" data-action="approve-member" data-member-id="${safe(m.id)}"><i data-lucide="check"></i></button>
              <button class="mini-btn btn-danger icon-only" title="Recusar" data-action="reject-member" data-member-id="${safe(m.id)}"><i data-lucide="x"></i></button>
            ` : `
              ${canEvaluate() && m.user_id !== state.user.id ? `<button class="mini-btn btn-secondary icon-only" title="Avaliar" data-action="open-evaluate" data-user-id="${safe(m.user_id)}"><i data-lucide="star"></i></button>` : ''}
              ${m.user_id === state.user.id ? '<span class="hint you-chip">Você</span>' : ''}
            `}
          </div>
        </div>
      `;
    }).join('')}
  </div>`;
}

function renderPlayerModal(userId) {
  const member = state.members.find((m) => m.user_id === userId);
  if (!member) return '';
  const p = mergeMemberProfile(member);
  const rank = state.ranking.find((r) => r.jogador_id === userId);
  const overall = rank?.media_geral ? overallScore(rank.media_geral) : 60;
  const skills = [
    ['Finalização', rank?.media_finalizacao],
    ['Passe', rank?.media_passe],
    ['Marcação', rank?.media_marcacao],
    ['Velocidade', rank?.media_velocidade],
    ['Drible', rank?.media_drible],
    ['Goleiro', rank?.media_goleiro]
  ];
  return `
    <div class="modal-overlay">
      <div class="player-modal fifa-profile-modal" role="dialog" aria-modal="true">
        <button class="modal-close" data-action="close-modal" aria-label="Fechar"><i data-lucide="x"></i></button>
        <div class="fifa-modal-grid">
          <div class="fifa-modal-card-area">
            ${renderPlayerCard(p, rank?.media_geral, rank)}
          </div>
          <div class="fifa-modal-info">
            <p class="eyebrow">Perfil do jogador</p>
            <h2>${safe(p.apelido || p.nome || 'Jogador')}</h2>
            <p class="muted">${safe(p.nome || '')} ${p.username ? `• ${safe(usernameText(p))}` : ''}</p>
            <div class="modal-info-grid">
              <div><span>Overall</span><strong>${overall}</strong></div>
              <div><span>Posição</span><strong>${safe(positionLabel(p.posicao_detalhada || p.posicao))}</strong></div>
              <div><span>Estilo</span><strong>${safe(cardLabel(p.estilo_jogo, 'Não informado'))}</strong></div>
              <div><span>Pé</span><strong>${safe(cardLabel(p.pe_dominante, 'Não informado'))}</strong></div>
              <div><span>Status</span><strong>${safe(member.status)}</strong></div>
              <div><span>Avaliações</span><strong>${safe(rank?.total_avaliacoes || 0)}</strong></div>
            </div>
            ${p.bio ? `<div class="modal-bio"><span>Bio</span><p>${safe(p.bio)}</p></div>` : ''}
            <div class="modal-skills">
              ${skills.map(([label, value]) => `
                <div class="modal-skill"><span>${safe(label)}</span><strong>${moneylessNumber(value, '3')}</strong></div>
              `).join('')}
            </div>
            ${canEvaluate() && userId !== state.user.id ? `<button class="btn-primary" data-action="open-evaluate" data-user-id="${safe(userId)}"><i data-lucide="star"></i> Avaliar jogador</button>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function openPlayerProfile(userId) {
  closeModal();
  document.body.insertAdjacentHTML('beforeend', renderPlayerModal(userId));
  refreshIcons();
}

function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach((el) => el.remove());
}

function renderPresenca() {
  if (!state.activeRacha) return requireActiveRachaHTML('Presença indisponível');
  if (!isMatchingRachaDay(state.selectedDate, state.activeRacha)) {
    state.selectedDate = getDefaultGameDate(state.activeRacha);
  }
  const myPresence = state.presencas.find((p) => p.user_id === state.user.id)?.status || null;
  const stats = ['confirmado', 'espera', 'talvez', 'nao_vou'].reduce((acc, key) => {
    acc[key] = state.presencas.filter((p) => p.status === key).length;
    return acc;
  }, {});
  const totalRespondidos = Object.values(stats).reduce((a, b) => a + b, 0);
  const selectedLabel = `${dayName(dateFromInput(state.selectedDate).getDay())}, ${formatDateBR(state.selectedDate)}`;

  return `
    <section class="presence-lite page-flow">
      <div class="card presence-next-card-v29">
        <div class="presence-next-main">
          <p class="eyebrow">Próximo jogo</p>
          <h3>${selectedLabel}</h3>
          <p class="muted">${safe(state.activeRacha.nome)}${state.activeRacha.horario ? ` • ${safe(state.activeRacha.horario.slice(0, 5))}` : ''}</p>
        </div>
        <div class="presence-status-compact status-${safe(myPresence || 'sem-resposta')}">
          <span>Status</span>
          <strong>${myPresence ? presenceStatusLabel(myPresence) : 'Responder'}</strong>
        </div>
      </div>

      <details class="accordion-card presence-date-collapsed" ${myPresence ? '' : 'open'}>
        <summary><span><i data-lucide="calendar-days"></i> Escolher outra data</span><i data-lucide="chevron-down" class="summary-chevron"></i></summary>
        <div class="accordion-content">${renderGameDatePicker('presence')}</div>
      </details>

      <div class="card presence-response-card-v29">
        <div class="section-title-row compact-title-row">
          <div><p class="eyebrow">Sua resposta</p><h3>${myPresence ? presenceStatusLabel(myPresence) : 'Vai jogar?'}</h3></div>
          <span class="pro-counter">${totalRespondidos} resposta(s)</span>
        </div>
        <div class="presence-actions-compact">
          <button class="presence-pill-action ${myPresence === 'confirmado' ? 'active' : ''}" data-action="set-presence" data-status="confirmado"><i data-lucide="check-circle"></i> Vou jogar</button>
          <button class="presence-pill-action ${myPresence === 'talvez' ? 'active' : ''}" data-action="set-presence" data-status="talvez"><i data-lucide="circle-help"></i> Talvez</button>
          <button class="presence-pill-action ${myPresence === 'espera' ? 'active' : ''}" data-action="set-presence" data-status="espera"><i data-lucide="list-plus"></i> Espera</button>
          <button class="presence-pill-action danger ${myPresence === 'nao_vou' ? 'active' : ''}" data-action="set-presence" data-status="nao_vou"><i data-lucide="x-circle"></i> Não vou</button>
        </div>
      </div>

      <div class="presence-stats-grid compact-presence-stats">
        <div class="pro-stat"><span>Confirmados</span><strong>${stats.confirmado}</strong></div>
        <div class="pro-stat"><span>Espera</span><strong>${stats.espera}</strong></div>
        <div class="pro-stat"><span>Talvez</span><strong>${stats.talvez}</strong></div>
      </div>

      <details class="accordion-card presence-list-collapsed">
        <summary><span><i data-lucide="list-checks"></i> Ver lista do dia</span><i data-lucide="chevron-down" class="summary-chevron"></i></summary>
        <div class="accordion-content">
          <button class="mini-btn btn-ghost" data-action="refresh-presence" type="button"><i data-lucide="refresh-cw"></i> Atualizar</button>
          ${renderPresenceList()}
        </div>
      </details>
    </section>
  `;
}

function renderPresenceList() {
  const activeMembers = state.members.filter((m) => m.status === 'ativo');
  if (!activeMembers.length) return '<p class="muted">Nenhum membro ativo.</p>';

  const groups = [
    ['confirmado', 'Confirmados', 'check-circle-2'],
    ['espera', 'Lista de espera', 'list-plus'],
    ['talvez', 'Talvez', 'circle-help'],
    ['sem resposta', 'Sem resposta', 'clock-3'],
    ['nao_vou', 'Não vão', 'x-circle']
  ];

  const itemsByStatus = (status) => activeMembers.filter((m) => {
    const pres = state.presencas.find((x) => x.user_id === m.user_id)?.status || 'sem resposta';
    return pres === status;
  });

  return `
    <div class="presence-groups">
      ${groups.map(([status, title, icon]) => {
        const items = itemsByStatus(status);
        if (!items.length && status !== 'confirmado') return '';
        return `
          <div class="presence-group">
            <div class="presence-group-title"><span><i data-lucide="${icon}"></i>${title}</span><b>${items.length}</b></div>
            ${items.length ? items.map((m) => {
              const p = mergeMemberProfile(m);
              return `
                <button type="button" class="presence-player-row" data-action="open-player-profile" data-user-id="${safe(m.user_id)}">
                  ${avatarHTML(p)}
                  <span><strong>${safe(p.apelido || p.nome)}</strong><small>${safe(positionLabel(p.posicao_detalhada || p.posicao))} • ${safe(usernameText(p))}</small></span>
                  ${statusBadge(status)}
                </button>
              `;
            }).join('') : `<p class="muted empty-line">Ninguém confirmado ainda.</p>`}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function rankingOverall(row) {
  return row?.media_geral ? overallScore(row.media_geral) : overallFromSkills(row);
}

function attrOverall(value) {
  return value ? normalizeSkillScore(value) : 60;
}

function rankingMedal(index) {
  if (index >= 0 && index <= 2) return '<i data-lucide="crown"></i>';
  return `#${index + 1}`;
}

function buildRankingProfile(row) {
  return {
    id: row.jogador_id,
    nome: row.nome,
    apelido: row.apelido,
    avatar_url: row.avatar_url,
    posicao: row.posicao,
    username: row.username,
    posicao_tipo: row.posicao_tipo,
    posicao_detalhada: row.posicao_detalhada,
    posicao_setor: row.posicao_setor,
    estilo_jogo: `${row.total_avaliacoes || 0} avaliação(ões)`,
    pe_dominante: 'Goleio'
  };
}

function rankingModeInfo(mode = state.rankingMode || 'geral') {
  const modes = {
    geral: { label: 'Geral', short: 'OVR', icon: 'trophy', help: 'Classificação geral por overall.' },
    finalizacao: { label: 'Finalização', short: 'FIN', icon: 'target', help: 'Ranking por finalização.' },
    passe: { label: 'Passe', short: 'PAS', icon: 'send', help: 'Ranking por qualidade de passe.' },
    velocidade: { label: 'Velocidade', short: 'VEL', icon: 'zap', help: 'Ranking por velocidade.' },
    drible: { label: 'Drible', short: 'DRI', icon: 'footprints', help: 'Ranking por drible.' },
    defesa: { label: 'Defensiva', short: 'DEF', icon: 'shield', help: 'Ranking por habilidade defensiva.' },
    ataque: { label: 'Ofensiva', short: 'ATA', icon: 'flame', help: 'Ranking por habilidade ofensiva.' },
    goleiro: { label: 'Goleiro', short: 'GOL', icon: 'hand', help: 'Ranking por habilidade de goleiro.' }
  };
  return modes[mode] || modes.geral;
}

function rankingMetricScore(row, mode = state.rankingMode || 'geral') {
  if (!row) return 60;
  const map = {
    geral: 'media_geral',
    finalizacao: 'media_finalizacao',
    passe: 'media_passe',
    velocidade: 'media_velocidade',
    drible: 'media_drible',
    defesa: 'media_hab_defensiva',
    goleiro: 'media_hab_goleiro'
  };
  if (mode === 'ataque') return getOffensiveSkill(row);
  if (mode === 'defesa') return getSkillValue(row, ['media_hab_defensiva', 'media_marcacao']);
  if (mode === 'goleiro') return getSkillValue(row, ['media_hab_goleiro', 'media_goleiro']);
  const key = map[mode] || 'media_geral';
  return row?.[key] ? normalizeSkillScore(row[key]) : (mode === 'geral' ? overallFromSkills(row) : 60);
}

function sortedRankingRows(rows, mode = state.rankingMode || 'geral') {
  return [...rows].sort((a, b) => rankingMetricScore(b, mode) - rankingMetricScore(a, mode) || Number(b.total_avaliacoes || 0) - Number(a.total_avaliacoes || 0));
}

function renderRankingTabs() {
  const modes = ['geral', 'finalizacao', 'passe', 'velocidade', 'drible', 'defesa', 'ataque', 'goleiro'];
  const active = state.rankingMode || 'geral';
  return `
    <div class="ranking-tabs" role="tablist" aria-label="Filtros do ranking">
      ${modes.map((mode) => {
        const info = rankingModeInfo(mode);
        return `
          <button type="button" class="ranking-tab ${active === mode ? 'active' : ''}" data-action="set-ranking-mode" data-mode="${safe(mode)}">
            <i data-lucide="${safe(info.icon)}"></i>
            <span>${safe(info.label)}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderPodiumMiniCard(row, realIndex, mode = state.rankingMode || 'geral') {
  if (!row) return '';
  const profile = buildRankingProfile(row);
  const score = rankingMetricScore(row, mode);
  const info = rankingModeInfo(mode);
  const name = row.apelido || row.nome || 'Jogador';
  const position = positionCode(row.posicao_detalhada || row.posicao);
  return `
    <button type="button" class="podium-player-card podium-place-${realIndex + 1}" data-action="open-player-profile" data-user-id="${safe(row.jogador_id)}">
      <span class="podium-medal podium-crown podium-crown-${realIndex + 1}">${rankingMedal(realIndex)}</span>
      <div class="podium-card-shell">
        <div class="podium-card-top">
          <strong>${score}</strong>
          <span>${safe(position)}</span>
        </div>
        <div class="podium-card-photo">${avatarHTML(profile, true)}</div>
        <div class="podium-card-name">
          <b>${safe(name)}</b>
          <small>${safe(info.short)} • ${safe(row.total_avaliacoes || 0)} voto(s)</small>
        </div>
      </div>
      <div class="podium-base"><strong>${realIndex + 1}º</strong><span>${safe(info.label)}</span></div>
    </button>
  `;
}

function renderRankingPodium(topRows, mode = state.rankingMode || 'geral') {
  const podiumOrder = [1, 0, 2].filter((idx) => topRows[idx]);
  if (!podiumOrder.length) return '';
  return `
    <section class="ranking-podium-section card">
      <div class="section-headline podium-headline">
        <div>
          <p class="eyebrow">Pódio da temporada</p>
          <h3><i data-lucide="crown"></i> Top 3 do racha</h3>
        </div>
        <span class="section-count">${safe(rankingModeInfo(mode).label)}</span>
      </div>
      <div class="ranking-podium-premium">
        ${podiumOrder.map((idx) => renderPodiumMiniCard(topRows[idx], idx, mode)).join('')}
      </div>
    </section>
  `;
}

function renderRankingHighlights(rows) {
  const bestOverall = sortedRankingRows(rows, 'geral')[0];
  const bestAttack = sortedRankingRows(rows, 'ataque')[0];
  const bestPass = sortedRankingRows(rows, 'passe')[0];
  const bestDefense = sortedRankingRows(rows, 'defesa')[0];
  const bestGoal = sortedRankingRows(rows, 'goleiro')[0];
  const highlights = [
    ['Melhor geral', bestOverall, rankingMetricScore(bestOverall, 'geral'), 'trophy'],
    ['Hab. ofensiva', bestAttack, rankingMetricScore(bestAttack, 'ataque'), 'flame'],
    ['Melhor passe', bestPass, rankingMetricScore(bestPass, 'passe'), 'send'],
    ['Hab. defensiva', bestDefense, rankingMetricScore(bestDefense, 'defesa'), 'shield'],
    ['Hab. goleiro', bestGoal, rankingMetricScore(bestGoal, 'goleiro'), 'hand']
  ];

  return `
    <section class="ranking-awards card">
      <div class="section-headline awards-headline">
        <div>
          <p class="eyebrow">Prêmios da temporada</p>
          <h3><i data-lucide="sparkles"></i> Destaques do racha</h3>
        </div>
      </div>
      <div class="ranking-highlights premium-awards-grid">
        ${highlights.map(([label, row, score, icon]) => `
          <button type="button" class="ranking-highlight premium-award" data-action="open-player-profile" data-user-id="${safe(row?.jogador_id || '')}">
            <i data-lucide="${icon}"></i>
            <span>${safe(label)}</span>
            <strong>${safe(row?.apelido || row?.nome || '-')}</strong>
            <em>${score || 60}</em>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function renderMyRankingCard(rows, mode = state.rankingMode || 'geral') {
  const index = rows.findIndex((row) => row.jogador_id === state.user?.id);
  if (index < 0) return '';
  const row = rows[index];
  const info = rankingModeInfo(mode);
  return `
    <section class="my-ranking-card card">
      <div class="my-ranking-left">
        <p class="eyebrow">Seu desempenho</p>
        <h3>${index + 1}º lugar no ranking</h3>
        <p class="muted">${safe(info.help)}</p>
      </div>
      <div class="my-ranking-score">
        <span>${safe(info.short)}</span>
        <strong>${rankingMetricScore(row, mode)}</strong>
        <small>${safe(row.total_avaliacoes || 0)} voto(s)</small>
      </div>
    </section>
  `;
}

function renderRankingRow(row, index, mode = state.rankingMode || 'geral') {
  const profile = buildRankingProfile(row);
  const score = rankingMetricScore(row, mode);
  const info = rankingModeInfo(mode);
  const miniStats = cardSkillRows(row).slice(0, 4).map((skill) => [skill.short, skill.value]);
  return `
    <div class="ranking-row premium-ranking-row ${index < 3 ? 'top-ranked-row' : ''}">
      <div class="ranking-position">${rankingMedal(index)}</div>
      ${avatarHTML(profile)}
      <div class="ranking-player-info">
        <strong>${safe(row.apelido || row.nome || 'Jogador')}</strong>
        <span>${safe(positionCode(row.posicao_detalhada || row.posicao))} • ${row.total_avaliacoes || 0} voto(s)</span>
        <div class="ranking-mini-stats">
          ${miniStats.map(([label, value]) => `<small><b>${cardScore(value)}</b> ${label}</small>`).join('')}
        </div>
      </div>
      <div class="ranking-score">
        <strong>${score}</strong>
        <span>${safe(info.short)}</span>
      </div>
      <div class="ranking-actions">
        <button class="mini-btn btn-ghost" data-action="open-player-profile" data-user-id="${safe(row.jogador_id)}"><i data-lucide="id-card"></i></button>
        ${canEvaluate() && row.jogador_id !== state.user?.id ? `<button class="mini-btn btn-secondary" data-action="open-evaluate" data-user-id="${safe(row.jogador_id)}"><i data-lucide="star"></i></button>` : ''}
      </div>
    </div>
  `;
}

function renderRanking() {
  if (!state.activeRacha) return requireActiveRachaHTML('Ranking indisponível');
  if (!state.ranking.length) {
    return `
      <div class="ranking-empty card">
        <div class="empty-icon"><i data-lucide="trophy"></i></div>
        <h3>Ranking ainda zerado</h3>
        <p class="muted">Quando os jogadores começarem a ser avaliados, o Goleio monta o pódio e o placar geral automaticamente.</p>
      </div>
    `;
  }

  const mode = state.rankingMode || 'geral';
  const rows = sortedRankingRows(state.ranking, mode);
  const totalVotes = state.ranking.reduce((sum, row) => sum + Number(row.total_avaliacoes || 0), 0);
  const avgOverall = Math.round(state.ranking.reduce((sum, row) => sum + rankingOverall(row), 0) / state.ranking.length);
  const leader = rows[0];
  const info = rankingModeInfo(mode);

  return `
    <section class="ranking-pro ranking-premium-page">
      <div class="ranking-hero card premium-ranking-hero">
        <div>
          <p class="eyebrow">Temporada do racha</p>
          <h3><i data-lucide="trophy"></i> Ranking do Goleio</h3>
          <p class="muted">Pódio, prêmios e classificação da comunidade.</p>
        </div>
        <div class="ranking-hero-score">
          <span>Líder em ${safe(info.label)}</span>
          <strong>${rankingMetricScore(leader, mode)}</strong>
          <small>${safe(leader.apelido || leader.nome || 'Jogador')}</small>
        </div>
      </div>

      ${renderRankingTabs()}

      ${renderRankingPodium(rows.slice(0, 3), mode)}

      <div class="ranking-summary premium-ranking-summary">
        <div><span>Jogadores avaliados</span><strong>${state.ranking.length}</strong></div>
        <div><span>Total de votos</span><strong>${totalVotes}</strong></div>
        <div><span>Média geral</span><strong>${avgOverall}</strong></div>
      </div>

      ${renderMyRankingCard(rows, mode)}

      <div class="card leaderboard-card premium-leaderboard-card">
        <div class="leaderboard-head">
          <div>
            <p class="eyebrow">Classificação completa</p>
            <h3><i data-lucide="list-ordered"></i> Lista dos jogadores</h3>
          </div>
          <span>${rows.length} atleta(s)</span>
        </div>
        <div class="leaderboard-list">
          ${rows.map((row, index) => renderRankingRow(row, index, mode)).join('')}
        </div>
      </div>

      ${renderRankingHighlights(state.ranking)}
    </section>
  `;
}

function modeLabel(mode) {
  const labels = {
    posicoes: 'Posição + nota',
    equilibrado: 'Equilibrado por nota',
    aleatorio: 'Aleatório'
  };
  return labels[mode] || 'Sorteio';
}

function formatDateTimeBR(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function teamsToHTML(teams = []) {
  if (!Array.isArray(teams) || !teams.length) {
    return '<p class="muted">Nenhum time salvo neste sorteio.</p>';
  }
  return `
    <div class="draw-results-head">
      <div><p class="eyebrow">Resultado</p><h3>Times sorteados</h3></div>
      <span>${teams.length} time(s)</span>
    </div>
    ${teams.map((team) => {
      const total = Number(team.total || 0);
      const avg = team.players?.length ? (total / team.players.length) : 0;
      return `
        <div class="team-card team-card-pro">
          <div class="team-card-head">
            <div><span>${safe(team.name || 'Time')}</span><strong>Média ${avg ? avg.toFixed(2) : '-'}</strong></div>
            <b>${team.players?.length || 0}</b>
          </div>
          <ul>
            ${(team.players || []).map((p) => `
              <li>
                <span class="team-player-icon">${p.isGoalkeeper ? '🧤' : '⚽'}</span>
                <span class="team-player-name">${safe(p.name || 'Jogador')}<small>${safe(positionCode(p.posicao_detalhada || p.posicao || p.posicao_tipo))}</small></span>
                <strong>${Number(p.score || 0).toFixed(1)}</strong>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }).join('')}
  `;
}

function renderUltimoSorteio() {
  if (!state.activeRacha) return requireActiveRachaHTML('Times indisponíveis');
  const last = latestSorteio();
  if (!last) {
    return `
      <section class="last-draw-page page-flow">
        <div class="pro-hero-card glass-card compact-info-hero">
          <div>
            <p class="eyebrow">Times do racha</p>
            <h3>Nenhum sorteio salvo ainda</h3>
            <p class="muted">Quando o administrador gerar os times, a última lista aparecerá aqui para todos os jogadores.</p>
          </div>
          <div class="draw-readiness waiting">
            <span>Aguardando</span>
            <strong>0</strong>
            <small>sorteios</small>
          </div>
        </div>
      </section>
    `;
  }

  state.lastTeamsText = teamsToText(last.resultado || [], last.modo || 'equilibrado', formatDateTimeBR(last.created_at));
  return `
    <section class="last-draw-page page-flow">
      <div class="pro-hero-card glass-card compact-info-hero">
        <div>
          <p class="eyebrow">Times do racha</p>
          <h3>Última lista sorteada</h3>
          <p class="muted">${safe(modeLabel(last.modo))} • ${safe(formatDateTimeBR(last.created_at))}</p>
        </div>
        <button class="btn-secondary compact-copy-btn" data-action="copy-teams"><i data-lucide="send"></i> Copiar</button>
      </div>
      <div class="card clean-card pro-section-card">
        ${teamsToHTML(last.resultado || [])}
      </div>
    </section>
  `;
}

function renderSorteio() {
  if (!state.activeRacha) return requireActiveRachaHTML('Sorteio indisponível');
  if (!isAdmin()) return renderUltimoSorteio();

  const nextDate = getDefaultGameDate(state.activeRacha);
  if (state.selectedDate !== nextDate) state.selectedDate = nextDate;

  const confirmed = state.presencas.filter((p) => p.status === 'confirmado').length;
  const enough = confirmed >= 2;
  const perTeam = Number(state.activeRacha.jogadores_por_time || 5);
  const estimatedTeams = enough ? Math.max(1, Math.ceil(confirmed / perTeam)) : 0;
  const selectedMode = selectedDrawMode();
  const modeDescriptions = {
    equilibrado: 'Distribui pela nota média para deixar os times parelhos.',
    posicoes: 'Prioriza posição e habilidade ao montar os times.',
    aleatorio: 'Sorteio puro para quem quer rapidez total.'
  };

  return `
    <section class="sorteio-pro page-flow sorteio-clean-v2">
      <div class="pro-hero-card sorteio-hero glass-card">
        <div>
          <p class="eyebrow">Sorteio inteligente</p>
          <h3>Próximo racha</h3>
          <p class="muted">${dayName(state.activeRacha.dia_semana)} • ${safe(state.activeRacha.horario ? state.activeRacha.horario.slice(0,5) : '--:--')} • ${safe(state.activeRacha.local || 'Local não definido')}</p>
        </div>
        <div class="draw-readiness ${enough ? 'ready' : 'waiting'}">
          <span>${enough ? 'Pronto' : 'Aguardando'}</span>
          <strong>${confirmed}</strong>
          <small>confirmado(s)</small>
        </div>
      </div>

      <div class="card clean-card pro-section-card sorteio-card">
        <div class="next-game-compact">
          <div>
            <p class="eyebrow">Data do sorteio</p>
            <h3><i data-lucide="calendar-days"></i> ${formatDateBR(nextDate)}</h3>
            <p class="muted">O sorteio usa apenas o próximo jogo programado dessa comunidade.</p>
          </div>
          <div class="next-game-stats">
            <div><span>Confirmados</span><strong>${confirmed}</strong></div>
            <div><span>Times</span><strong>${estimatedTeams || '-'}</strong></div>
            <div><span>Por time</span><strong>${safe(perTeam)}</strong></div>
          </div>
        </div>

        ${!enough ? `
          <div class="pro-alert warning"><i data-lucide="triangle-alert"></i><span>Confirme pelo menos 2 jogadores para liberar um sorteio útil.</span></div>
        ` : ''}

        <div class="sorteio-controls pro-controls">
          <div class="full-span">
            <label>Modo do sorteio</label>
            <div class="draw-mode-grid compact-mode-grid">
              ${drawModeCard('equilibrado', 'Equilibrado por nota', 'Times mais parelhos.', selectedMode === 'equilibrado')}
              ${drawModeCard('posicoes', 'Posição + nota', 'Distribui funções em campo.', selectedMode === 'posicoes')}
              ${drawModeCard('aleatorio', 'Aleatório', 'Sorteio rápido.', selectedMode === 'aleatorio')}
            </div>
            <p class="field-help draw-mode-help">${modeDescriptions[selectedMode]}</p>
          </div>
          <div>
            <label>Jogadores por time</label>
            <input id="sorteioPorTime" type="number" min="1" max="30" value="${safe(state.activeRacha.jogadores_por_time || 5)}" />
          </div>
        </div>

        <div class="form-actions sorteio-actions sticky-actions">
          <button class="btn-primary" data-action="generate-teams"><i data-lucide="sparkles"></i> Gerar times</button>
          <button class="btn-secondary" data-action="copy-teams"><i data-lucide="send"></i> Copiar WhatsApp</button>
        </div>
        <div id="teamsResult" class="team-result teams-result-pro"></div>
      </div>
    </section>
  `;
}

function renderEvaluationForm(userId) {
  const member = state.members.find((m) => m.user_id === userId);
  if (!member) return '';
  const p = mergeMemberProfile(member);
  const rank = state.ranking.find((r) => r.jogador_id === userId) || {};
  const overall = rank?.media_geral ? overallScore(rank.media_geral) : overallFromSkills(rank);
  const position = positionCode(p?.posicao_detalhada || p?.posicao);
  const existing = state.currentEvaluation?.avaliado_id === userId ? state.currentEvaluation : null;

  const evalValue = (key, fallback = 75) => {
    const legacyMap = {
      hab_defensiva: 'marcacao',
      hab_goleiro: 'goleiro'
    };
    const raw = existing?.[key] ?? existing?.[legacyMap[key]];
    return normalizeSkillScore(raw, fallback);
  };

  const attrs = [
    ['finalizacao', 'Finalização', 'target', 78],
    ['passe', 'Passe', 'send', 78],
    ['velocidade', 'Velocidade', 'zap', 78],
    ['drible', 'Drible', 'footprints', 78],
    ['hab_defensiva', 'Hab. Defensiva', 'shield', 75],
    ['hab_ofensiva', 'Hab. Ofensiva', 'flame', 78],
    ['hab_goleiro', 'Hab. Goleiro', 'hand', 60]
  ];

  const skill = ([key, label, icon, fallback]) => {
    const current = evalValue(key, fallback);
    const pct = Math.max(0, Math.min(100, ((current - 60) / 39) * 100));
    return `
      <div class="eval-slider-row" data-eval-skill="${safe(key)}">
        <div class="eval-slider-icon"><i data-lucide="${safe(icon)}"></i></div>
        <div class="eval-slider-main">
          <div class="eval-slider-head">
            <strong>${safe(label)}</strong>
            <b id="eval_label_${safe(key)}">${current}</b>
          </div>
          <div class="eval-range-wrap" style="--value:${pct}%">
            <span>60</span>
            <input
              class="eval-range"
              type="range"
              id="eval_${safe(key)}"
              data-key="${safe(key)}"
              min="60"
              max="99"
              step="1"
              value="${current}"
              required
              aria-label="${safe(label)}"
            />
            <span>99</span>
          </div>
        </div>
      </div>
    `;
  };

  return `
    <div class="card evaluation-card-v2 slider-evaluation-card" id="evaluationCard">
      <div class="eval-player-head">
        ${avatarHTML(p)}
        <div class="eval-player-info">
          <span>${existing ? 'Editando avaliação' : 'Avaliando jogador'}</span>
          <strong>${safe(p.apelido || p.nome || 'Jogador')}</strong>
          <small>${safe(position)} • overall ${safe(overall)} • ${safe(rank?.total_avaliacoes || 0)} avaliação(ões)</small>
        </div>
      </div>

      <form id="evaluationForm" data-user-id="${safe(userId)}">
        <div class="eval-quick-box">
          <div>
            <h3><i data-lucide="sliders-horizontal"></i> Habilidades do jogador</h3>
            <p class="muted">${existing ? 'Você já avaliou esse jogador neste racha. Arraste as barrinhas para atualizar.' : 'Arraste as barrinhas de 60 a 99 para montar a cartinha do jogador.'}</p>
          </div>
          <div class="eval-presets">
            <button type="button" data-action="eval-preset" data-preset="equilibrado">Equilibrado</button>
            <button type="button" data-action="eval-preset" data-preset="bom">Bom</button>
            <button type="button" data-action="eval-preset" data-preset="craque">Craque</button>
            <button type="button" data-action="eval-preset" data-preset="atacante">Atacante</button>
            <button type="button" data-action="eval-preset" data-preset="marcador">Defensivo</button>
            <button type="button" data-action="eval-preset" data-preset="goleiro">Goleiro</button>
          </div>
        </div>

        <div class="eval-slider-list">
          ${attrs.map(skill).join('')}
        </div>

        <details class="eval-more">
          <summary>
            <span><i data-lucide="message-square-text"></i> Comentário opcional</span>
            <i data-lucide="chevron-down" class="summary-chevron"></i>
          </summary>
          <div class="eval-more-content">
            <label>Comentário opcional</label>
            <textarea id="eval_comentario" placeholder="Ex: bom passe, rápido, defende bem, finaliza forte...">${safe(existing?.comentario || '')}</textarea>
          </div>
        </details>

        <div class="eval-actions">
          <button class="btn-primary" type="submit" data-after="next"><i data-lucide="arrow-right-circle"></i> Salvar e próximo</button>
          <button class="btn-secondary" type="submit" data-after="ranking"><i data-lucide="save"></i> Só salvar</button>
        </div>
      </form>
    </div>
  `;
}

async function handleSubmit(event) {
  const form = event.target;
  if (!form?.id) return;

  if (form.id === 'loginForm') {
    event.preventDefault();
    await login(form.querySelector('button'));
  }

  if (form.id === 'registerForm') {
    event.preventDefault();
    await register(form.querySelector('button'));
  }

  if (form.id === 'createRachaForm') {
    event.preventDefault();
    await createRacha(form.querySelector('button'));
  }

  if (form.id === 'joinRachaForm') {
    event.preventDefault();
    await joinRacha(form.querySelector('button'));
  }

  if (form.id === 'editRachaForm') {
    event.preventDefault();
    await saveRachaSettings(form.querySelector('button'));
  }

  if (form.id === 'cancelRachaDateForm') {
    event.preventDefault();
    await cancelGameDate($('cancelRachaDate')?.value, form.querySelector('button'));
  }

  if (form.id === 'inviteUserForm') {
    event.preventDefault();
    await inviteUserByUsername(form.querySelector('button'));
  }

  if (form.id === 'rachaProfilePositionForm') {
    event.preventDefault();
    await saveRachaProfilePosition(form.querySelector('button'));
  }

  if (form.id === 'profileForm') {
    event.preventDefault();
    await saveProfile(form.querySelector('button'));
  }

  if (form.id === 'evaluationForm') {
    event.preventDefault();
    await saveEvaluation(form, event.submitter);
  }
}

async function handlePointerNav(event) {
  const nav = event.target.closest?.('.nav-btn[data-view]');
  if (!nav) return;

  // Em mobile, alguns navegadores/emuladores seguram o :hover e atrasam o click.
  // Usar pointerup deixa a troca de aba imediata e evita a sensação de travamento.
  if (event.pointerType === 'touch' || window.innerWidth <= 900) {
    event.preventDefault();
    lastNavPointerTime = Date.now();
    await navigateToView(nav.dataset.view);
  }
}

async function navigateToView(view) {
  const requestedView = view || 'dashboard';
  const allowedViews = getAllowedViews();
  if (!allowedViews.includes(requestedView)) {
    state.currentView = 'dashboard';
    renderApp();
    toast('Selecione um racha ativo para acessar essa área.');
    return;
  }

  state.currentView = requestedView;
  const needsFreshData = Boolean(hasActiveRacha() && ['racha', 'presenca', 'ranking', 'sorteio'].includes(state.currentView));
  state.contentLoading = needsFreshData;

  renderApp();

  if (needsFreshData) {
    startProgress();
    try {
      await loadRachaData();
    } catch (error) {
      console.error(error);
      toast('Não consegui atualizar os dados do racha agora. Tente novamente.');
    } finally {
      state.contentLoading = false;
      stopProgress();
      renderApp();
    }
  }
}

async function handleClick(event) {
  const nav = event.target.closest('[data-view]');
  if (nav) {
    if (Date.now() - lastNavPointerTime < 450) {
      event.preventDefault();
      return;
    }
    await navigateToView(nav.dataset.view);
    return;
  }

  if (event.target.classList?.contains('modal-overlay')) {
    if (event.target.classList.contains('mandatory-profile-overlay')) return;
    closeModal();
    return;
  }

  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === 'toggle-password') {
    togglePasswordVisibility(actionEl.dataset.target, actionEl);
    return;
  }

  if (action === 'go-dashboard') {
    state.currentView = 'dashboard';
    renderApp();
  }
  if (action === 'focus-create-racha' || action === 'open-create-racha-modal') {
    openHomeFormModal('create');
    return;
  }
  if (action === 'focus-join-racha' || action === 'open-join-racha-modal') {
    openHomeFormModal('join');
    return;
  }
  if (action === 'select-racha') await selectRacha(actionEl.dataset.rachaId);
  if (action === 'copy-code') await copyText(actionEl.dataset.code, 'Código copiado!');
  if (action === 'open-racha-more') { openRachaMoreModal(); return; }
  if (action === 'refresh-racha') { startProgress(); await loadRachaData(); stopProgress(); closeModal(); renderApp(); toast('Racha atualizado.'); return; }
  if (action === 'cancel-game-date') await cancelGameDate(actionEl.dataset.date, actionEl);
  if (action === 'restore-game-date') await restoreGameDate(actionEl.dataset.date, actionEl);
  if (action === 'refresh-presence') { startProgress(); await loadPresencas(state.selectedDate); stopProgress(); renderApp(); toast('Presença atualizada.'); }
  if (action === 'select-presence-date') { await loadPresencas(actionEl.dataset.date); renderApp(); }
  if (action === 'select-sorteio-date') { await loadPresencas(actionEl.dataset.date); state.currentView = 'sorteio'; renderApp(); }
  if (action === 'approve-member') { state.adminOpenPanel = 'pending'; await updateMemberStatus(actionEl.dataset.memberId, 'ativo'); return; }
  if (action === 'reject-member') { state.adminOpenPanel = 'pending'; await updateMemberStatus(actionEl.dataset.memberId, 'removido'); return; }
  if (action === 'remove-member') { state.adminOpenPanel = 'members'; await removeMember(actionEl.dataset.memberId, actionEl.dataset.playerName); return; }
  if (action === 'set-member-role') { state.adminOpenPanel = 'members'; await updateMemberRole(actionEl.dataset.memberId, actionEl.dataset.role); return; }
  if (action === 'open-reset-ratings-modal') { state.adminOpenPanel = 'danger'; openDangerConfirm('reset'); return; }
  if (action === 'confirm-reset-ratings') { await resetRachaRatings(actionEl); return; }
  if (action === 'open-delete-racha-modal') { state.adminOpenPanel = 'danger'; openDangerConfirm('delete'); return; }
  if (action === 'confirm-delete-racha') { await deleteRachaCommunity(actionEl); return; }
  if (action === 'open-leave-racha-modal') { openDangerConfirm('leave'); return; }
  if (action === 'confirm-leave-racha') { await leaveRachaCommunity(actionEl); return; }
  if (action === 'open-admin-pending') {
    state.currentView = 'racha';
    state.adminOpenPanel = 'pending';
    renderApp();
    setTimeout(() => document.querySelector('.admin-racha-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    return;
  }
  if (action === 'dismiss-presence-reminder') { dismissPresenceReminder(); return; }
  if (action === 'go-presence-from-reminder') { await goPresenceFromReminder(); return; }
  if (action === 'select-invite-user') {
    const input = $('inviteUsername');
    if (input) input.value = normalizeUsernameInput(actionEl.dataset.username || '');
    state.inviteSearchTerm = input?.value || '';
    state.inviteSearchResults = [];
    updateInviteSearchBox();
    toast(`@${state.inviteSearchTerm} selecionado.`);
    return;
  }
  if (action === 'answer-invite') await answerInvite(actionEl.dataset.inviteId, actionEl.dataset.accept === 'true', actionEl);
  if (action === 'upload-avatar') await uploadAvatar(actionEl);
  if (action === 'set-presence') await setPresence(actionEl.dataset.status);
  if (action === 'open-player-profile') openPlayerProfile(actionEl.dataset.userId);
  if (action === 'close-modal' || action === 'close-story-share') closeModal();
  if (action === 'open-story-share') openStoryShare();
  if (action === 'download-story') await downloadStory(actionEl);
  if (action === 'share-story') await shareStory(actionEl);
  if (action === 'open-evaluate') { closeModal(); await openEvaluate(actionEl.dataset.userId); }
  if (action === 'eval-rate') updateEvalRating(actionEl.dataset.key, Number(actionEl.dataset.value));
  if (action === 'eval-preset') applyEvalPreset(actionEl.dataset.preset);
  if (action === 'generate-teams') await generateTeams(actionEl);
  if (action === 'set-ranking-mode') { state.rankingMode = actionEl.dataset.mode || 'geral'; renderApp(); return; }
  if (action === 'copy-teams') await copyTeams();
}

async function handleChange(event) {
  if (event.target.name === 'rachaAvatarKey' || event.target.name === 'editRachaAvatarKey') {
    updateRachaAvatarPickerUI(event.target);
    return;
  }
  if (event.target.id === 'rachaRequiredPosition') {
    const type = $('rachaRequiredType');
    if (type) type.value = positionTypeFromDetailed(event.target.value);
  }
  if (event.target.name === 'sorteioModo') {
    state.sorteioMode = event.target.value || 'equilibrado';
    renderApp();
  }
  if (event.target.id === 'presenceDate') {
    await loadPresencas(event.target.value);
    renderApp();
  }
  if (event.target.id === 'sorteioDate') {
    await loadPresencas(event.target.value);
    renderApp();
    state.currentView = 'sorteio';
    renderApp();
  }
}

function handleInput(event) {
  if (event.target.classList?.contains('eval-range')) {
    updateEvalSlider(event.target.dataset.key, event.target.value);
  }
  if (event.target.id === 'registerTelefone' || event.target.id === 'profileTelefone') {
    applyPhoneMask(event.target);
  }
  if (['registerUsername', 'profileUsername', 'inviteUsername'].includes(event.target.id)) {
    event.target.value = normalizeUsernameInput(event.target.value);
  }
  if (event.target.id === 'registerUsername') {
    scheduleRegisterUsernameCheck(event.target.value);
  }
  if (event.target.id === 'inviteUsername') {
    scheduleInviteUserSearch(event.target.value);
  }
}

async function login(button) {
  try {
    setLoading(button, true, 'Entrando...');
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      console.error(error);
      toast('Login não realizado. Confira email e senha.');
      return;
    }
    toast('Bem-vindo ao Goleio!');
  } catch (error) {
    console.error(error);
    toast('Não consegui conectar agora. Verifique sua internet e tente de novo.');
  } finally {
    setLoading(button, false);
  }
}

async function register(button) {
  try {
    setLoading(button, true, 'Criando...');
    const nome = $('registerNome').value.trim();
    const apelido = $('registerApelido').value.trim() || null;
    const telefone = formatPhoneBR($('registerTelefone').value.trim()) || null;
    const username = normalizeUsernameInput($('registerUsername')?.value || '');
    const posicaoDetalhada = $('registerPosicaoDetalhada')?.value || 'meia_armador';
    const email = $('registerEmail').value.trim();
    const password = $('registerPassword').value;

    if (!nome) {
      toast('Informe seu nome.');
      $('registerNome')?.focus();
      return;
    }

    if (!isUsernameValid(username)) {
      setRegisterUsernameStatus('error', 'Escolha um @usuário válido com pelo menos 3 caracteres.');
      $('registerUsername')?.focus();
      toast('Escolha um @usuário válido antes de criar a conta.');
      return;
    }

    let availability;
    try {
      availability = await checkUsernameAvailability(username, null);
    } catch (error) {
      toast('Não consegui verificar o @usuário agora. Tente novamente.');
      return;
    }

    if (!availability.available) {
      setRegisterUsernameStatus('error', availability.message);
      $('registerUsername')?.focus();
      toast('Esse @usuário já está em uso. Escolha outro.');
      return;
    }

    setRegisterUsernameStatus('success', availability.message);

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome,
          apelido,
          username,
          telefone,
          posicao_detalhada: posicaoDetalhada,
          posicao_tipo: positionTypeFromDetailed(posicaoDetalhada)
        }
      }
    });

    if (error) {
      console.error(error);
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered')) {
        toast('Esse email já está cadastrado. Use a aba Entrar.');
      } else {
        toast(error.message || 'Erro ao criar conta.');
      }
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      const profilePayload = {
        id: userId,
        email,
        nome,
        apelido,
        telefone,
        username,
        posicao_detalhada: posicaoDetalhada,
        posicao_tipo: positionTypeFromDetailed(posicaoDetalhada)
      };

      const { data: savedProfile, error: profileError } = await sb
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' })
        .select('*')
        .single();

      if (profileError) {
        console.error(profileError);
        const duplicate = String(profileError.message || '').toLowerCase().includes('duplicate');
        toast(duplicate ? 'Esse @usuário já está em uso. Faça cadastro novamente com outro @.' : 'Conta criada, mas não consegui salvar o perfil completo.');
        await sb.auth.signOut();
        showAuth();
        return;
      }
      state.profile = savedProfile;
    }

    if (!data.session) {
      const { error: loginError } = await sb.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
    }

    toast('Conta criada! Bem-vindo ao Goleio.');
    await loadInitialData();
  } catch (error) {
    console.error(error);
    toast('Não consegui criar a conta agora. Verifique sua internet e tente de novo.');
  } finally {
    setLoading(button, false);
    showAppLoader(false);
    stopProgress();
  }
}

async function logout() {
  await sb.auth.signOut();
  toast('Você saiu do Goleio.');
}

async function createRacha(button) {
  setLoading(button, true, 'Criando...');
  const payload = {
    nome: $('rachaNome').value.trim(),
    modalidade: $('rachaModalidade').value,
    local: $('rachaLocal').value.trim() || null,
    endereco: $('rachaEndereco')?.value.trim() || null,
    link_maps: $('rachaLinkMaps')?.value.trim() || null,
    dia_semana: Number($('rachaDia').value),
    horario: $('rachaHorario').value || null,
    jogadores_por_time: Number($('rachaPorTime').value || 5),
    max_jogadores: $('rachaMax').value ? Number($('rachaMax').value) : null,
    avatar_key: selectedRadioValue('rachaAvatarKey', 'classico'),
    dono_id: state.user.id
  };

  const { data, error } = await sb.from('rachas').insert(payload).select('*').single();
  setLoading(button, false);

  if (error) {
    console.error(error);
    toast('Erro ao criar racha. Confira se seu perfil foi criado.');
    return;
  }

  await loadMemberships();
  await selectRacha(data.id, false);
  closeModal();
  state.currentView = 'racha';
  renderApp();
  toast(`Racha criado! Código: ${data.codigo_convite}`);
}

async function joinRacha(button) {
  setLoading(button, true, 'Entrando...');
  const codigo = $('codigoConvite').value.trim();
  const { data, error } = await sb.rpc('entrar_racha_por_codigo', { p_codigo: codigo });
  setLoading(button, false);

  if (error) {
    console.error(error);
    toast(error.message || 'Código inválido.');
    return;
  }

  await loadMemberships();
  closeModal();
  renderApp();
  const result = data?.[0];
  toast(result?.status_membro === 'ativo' ? 'Você já está ativo neste racha.' : `Pedido enviado para ${result?.nome || 'o racha'}.`);
}

async function selectRacha(rachaId, shouldRender = true) {
  const membership = state.memberships.find((m) => m.racha_id === rachaId && m.status === 'ativo' && m.rachas);
  if (!membership) {
    toast('Esse racha ainda não está ativo para você.');
    return;
  }
  state.activeMembership = membership;
  state.activeRacha = membership.rachas;
  state.selectedDate = getDefaultGameDate(state.activeRacha);
  localStorage.setItem('goleio_active_racha', rachaId);
  state.currentView = 'racha';
  state.contentLoading = true;
  if (shouldRender) renderApp();
  startProgress();
  try {
    await loadRachaData();
  } catch (error) {
    console.error(error);
    toast('Não consegui abrir esse racha agora.');
  } finally {
    state.contentLoading = false;
    stopProgress();
    if (shouldRender) renderApp();
    if (shouldRender) scheduleRequiredRachaProfileModal();
  }
}

async function removeMember(memberId, playerName = 'jogador') {
  if (!isAdmin()) {
    toast('Apenas admin pode remover jogadores.');
    return;
  }
  const member = state.members.find((m) => m.id === memberId);
  if (!member) {
    toast('Jogador não encontrado.');
    return;
  }
  if (member.user_id === state.user?.id) {
    toast('Você não pode remover seu próprio acesso por aqui.');
    return;
  }
  if (member.user_id === state.activeRacha?.dono_id) {
    toast('O dono do racha não pode ser removido.');
    return;
  }
  const name = playerName || member.profiles?.apelido || member.profiles?.nome || 'jogador';
  const ok = window.confirm(`Remover ${name} da comunidade do racha?`);
  if (!ok) return;
  await updateMemberStatus(memberId, 'removido');
}

async function updateMemberStatus(memberId, status) {
  if (!isAdmin()) {
    toast('Apenas admin pode alterar membros.');
    return;
  }
  const { error } = await sb
    .from('racha_membros')
    .update({ status })
    .eq('id', memberId);

  if (error) {
    console.error(error);
    toast('Erro ao atualizar membro.');
    return;
  }
  await loadRachaData();
  renderApp();
  toast(status === 'ativo' ? 'Jogador aprovado!' : 'Jogador removido.');
}

async function updateMemberRole(memberId, role) {
  if (!isAdmin()) {
    toast('Apenas admin pode alterar permissões.');
    return;
  }
  const valid = ['admin', 'avaliador', 'jogador'];
  if (!valid.includes(role)) return;
  const { error } = await sb
    .from('racha_membros')
    .update({ papel: role })
    .eq('id', memberId);

  if (error) {
    console.error(error);
    toast('Erro ao alterar permissão.');
    return;
  }
  await loadRachaData();
  renderApp();
  toast(role === 'admin' ? 'Jogador promovido a admin.' : role === 'avaliador' ? 'Jogador virou avaliador.' : 'Permissão alterada para jogador.');
}

async function resetRachaRatings(button = null) {
  if (!state.activeRacha) return;
  const confirmacao = dangerConfirmValue();
  if (confirmacao !== 'ZERAR NOTAS') {
    toast('Digite exatamente ZERAR NOTAS para confirmar.');
    $('dangerConfirmInput')?.focus();
    return;
  }
  try {
    setLoading(button, true, 'Zerando...');
    const { data, error } = await sb.rpc('resetar_avaliacoes_racha', {
      p_racha_id: state.activeRacha.id,
      p_confirmacao: confirmacao
    });
    if (error) throw error;
    closeModal();
    await loadRachaData();
    renderApp();
    const count = data?.[0]?.avaliacoes_removidas ?? 0;
    toast(`${count} avaliação(ões) removida(s). Ranking reiniciado.`);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao zerar avaliações.');
  } finally {
    setLoading(button, false);
  }
}

async function leaveRachaCommunity(button = null) {
  if (!state.activeRacha) return;
  const confirmacao = dangerConfirmValue();
  if (confirmacao !== 'SAIR') {
    toast('Digite exatamente SAIR para confirmar.');
    $('dangerConfirmInput')?.focus();
    return;
  }
  try {
    setLoading(button, true, 'Saindo...');
    const rachaId = state.activeRacha.id;
    const { error } = await sb.rpc('sair_do_racha', {
      p_racha_id: rachaId,
      p_confirmacao: confirmacao
    });
    if (error) throw error;
    closeModal();
    localStorage.removeItem('goleio_active_racha');
    state.activeRacha = null;
    state.activeMembership = null;
    state.members = [];
    state.ranking = [];
    state.presencas = [];
    state.sorteios = [];
    state.currentView = 'dashboard';
    await loadMemberships();
    chooseDefaultActiveRacha();
    if (state.activeRacha) await loadRachaData();
    renderApp();
    toast('Você saiu da comunidade.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao sair do racha.');
  } finally {
    setLoading(button, false);
  }
}

async function deleteRachaCommunity(button = null) {
  if (!state.activeRacha) return;
  const confirmacao = dangerConfirmValue();
  if (confirmacao !== state.activeRacha.nome) {
    toast('Digite exatamente o nome do racha para excluir.');
    $('dangerConfirmInput')?.focus();
    return;
  }
  try {
    setLoading(button, true, 'Excluindo...');
    const { error } = await sb.rpc('excluir_racha_comunidade', {
      p_racha_id: state.activeRacha.id,
      p_nome_confirmacao: confirmacao
    });
    if (error) throw error;
    closeModal();
    localStorage.removeItem('goleio_active_racha');
    state.activeRacha = null;
    state.activeMembership = null;
    state.members = [];
    state.ranking = [];
    state.presencas = [];
    state.sorteios = [];
    state.currentView = 'dashboard';
    await loadMemberships();
    chooseDefaultActiveRacha();
    if (state.activeRacha) await loadRachaData();
    renderApp();
    toast('Comunidade excluída.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao excluir comunidade.');
  } finally {
    setLoading(button, false);
  }
}

async function inviteUserByUsername(button) {
  state.adminOpenPanel = 'invite';
  if (!isAdmin() || !state.activeRacha) {
    toast('Apenas admin pode convidar por @usuário.');
    return;
  }
  const username = normalizeUsernameInput($('inviteUsername')?.value || '');
  if (username.length < 3) {
    toast('Digite um @usuário válido.');
    return;
  }

  try {
    setLoading(button, true, 'Enviando...');
    const localMatch = state.inviteSearchResults.find((p) => normalizeUsernameInput(p.username) === username);
    if (localMatch) {
      const status = inviteCandidateStatus(localMatch);
      if (status.kind !== 'available') {
        toast(status.kind === 'member' ? 'Esse jogador já está no racha.' : 'Esse jogador já tem entrada pendente.');
        return;
      }
    }

    const { data, error } = await sb.rpc('convidar_jogador_para_racha', {
      p_racha_id: state.activeRacha.id,
      p_username: username,
      p_mensagem: $('inviteMessage')?.value?.trim() || null
    });
    if (error) throw error;

    const result = data?.[0];
    toast(result?.status_convite === 'ja_membro' ? 'Esse jogador já faz parte do racha.' : `Convite enviado para @${username}.`);
    if ($('inviteUsername')) $('inviteUsername').value = '';
    if ($('inviteMessage')) $('inviteMessage').value = '';
    state.inviteSearchResults = [];
    state.inviteSearchTerm = '';
    updateInviteSearchBox();
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao enviar convite.');
  } finally {
    setLoading(button, false);
  }
}

async function answerInvite(inviteId, accept, button = null) {
  try {
    setLoading(button, true, accept ? 'Aceitando...' : 'Recusando...');
    const { error } = await sb.rpc('responder_convite_racha', {
      p_convite_id: inviteId,
      p_aceitar: accept
    });
    if (error) throw error;

    await loadMemberships();
    await loadConvites();
    chooseDefaultActiveRacha();
    if (state.activeRacha) await loadRachaData();
    renderApp();
    toast(accept ? 'Convite aceito! Você já entrou no racha.' : 'Convite recusado.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao responder convite.');
  } finally {
    setLoading(button, false);
  }
}

async function saveRachaSettings(button) {
  if (!isAdmin() || !state.activeRacha) {
    toast('Apenas admin pode editar o racha.');
    return;
  }
  setLoading(button, true, 'Salvando...');
  const payload = {
    nome: $('editRachaNome').value.trim(),
    modalidade: $('editRachaModalidade').value,
    local: $('editRachaLocal').value.trim() || null,
    endereco: $('editRachaEndereco')?.value.trim() || null,
    link_maps: $('editRachaLinkMaps')?.value.trim() || null,
    dia_semana: Number($('editRachaDia').value),
    horario: $('editRachaHorario').value || null,
    jogadores_por_time: Number($('editRachaPorTime').value || 5),
    max_jogadores: $('editRachaMax').value ? Number($('editRachaMax').value) : null,
    avatar_key: selectedRadioValue('editRachaAvatarKey', state.activeRacha?.avatar_key || 'classico')
  };

  const { data, error } = await sb
    .from('rachas')
    .update(payload)
    .eq('id', state.activeRacha.id)
    .select('*')
    .single();

  setLoading(button, false);
  if (error) {
    console.error(error);
    toast('Erro ao editar racha. Confira se você é admin.');
    return;
  }

  state.activeRacha = data;
  state.selectedDate = getDefaultGameDate(data);
  await loadMemberships();
  const updatedMembership = state.memberships.find((m) => m.racha_id === data.id && m.status === 'ativo');
  if (updatedMembership) {
    state.activeMembership = updatedMembership;
    state.activeRacha = updatedMembership.rachas || data;
  }
  await loadRachaData();
  renderApp();
  toast('Informações do racha atualizadas.');
}

async function cancelGameDate(dateValue, button = null) {
  if (!isAdmin() || !state.activeRacha) {
    toast('Apenas admin pode cancelar datas.');
    return;
  }
  if (!dateValue) {
    toast('Escolha uma data para cancelar.');
    return;
  }
  setLoading(button, true, 'Cancelando...');
  const motivo = $('cancelRachaMotivo')?.value?.trim() || null;
  const { error } = await sb.from('racha_datas_canceladas').upsert({
    racha_id: state.activeRacha.id,
    data_jogo: dateValue,
    motivo,
    criado_por: state.user.id
  }, { onConflict: 'racha_id,data_jogo' });

  setLoading(button, false);
  if (error) {
    console.error(error);
    toast('Erro ao cancelar essa data. Rode o patch SQL da etapa 13.');
    return;
  }

  await loadCancelledDates();
  if (state.selectedDate === dateValue) state.selectedDate = getDefaultGameDate(state.activeRacha);
  await loadPresencas(state.selectedDate);
  renderApp();
  toast(`Racha de ${formatDateBR(dateValue)} cancelado.`);
}

async function restoreGameDate(dateValue, button = null) {
  if (!isAdmin() || !state.activeRacha) {
    toast('Apenas admin pode reativar datas.');
    return;
  }
  setLoading(button, true, 'Reativando...');
  const { error } = await sb
    .from('racha_datas_canceladas')
    .delete()
    .eq('racha_id', state.activeRacha.id)
    .eq('data_jogo', dateValue);

  setLoading(button, false);
  if (error) {
    console.error(error);
    toast('Erro ao reativar essa data.');
    return;
  }

  await loadCancelledDates();
  state.selectedDate = dateValue;
  await loadPresencas(state.selectedDate);
  renderApp();
  toast(`Racha de ${formatDateBR(dateValue)} reativado.`);
}

async function saveProfile(button) {
  setLoading(button, true, 'Salvando...');
  try {
    const username = normalizeUsernameInput($('profileUsername').value);
    if (!isUsernameValid(username)) {
      toast('Informe um @usuário válido com pelo menos 3 caracteres.');
      $('profileUsername')?.focus();
      return;
    }

    const availability = await checkUsernameAvailability(username, state.user.id);
    if (!availability.available) {
      toast('Esse @usuário já está em uso. Escolha outro.');
      $('profileUsername')?.focus();
      return;
    }

    const selectedDetailed = $('profilePosicaoDetalhada').value;
    const selectedType = $('profilePosicaoTipo').value;
    const selectedSector = positionSector(selectedDetailed);

    const payload = {
      nome: $('profileNome').value.trim(),
      apelido: $('profileApelido').value.trim() || null,
      username,
      telefone: formatPhoneBR($('profileTelefone').value.trim()) || null,
      posicao_detalhada: selectedDetailed,
      posicao_tipo: selectedType,
      posicao_setor: selectedSector,
      pe_dominante: $('profilePe').value,
      estilo_jogo: $('profileEstilo').value || null,
      bio: $('profileBio').value.trim() || null
    };

    const { data, error } = await sb
      .from('profiles')
      .update(payload)
      .eq('id', state.user.id)
      .select('*')
      .single();

    if (error) {
      console.error(error);
      const msg = String(error.message || '');
      if (msg.includes('duplicate')) toast('Esse @usuário já está em uso.');
      else if (msg.includes('profiles_posicao_detalhada')) toast('Rode o SQL de correção de posições e tente salvar novamente.');
      else toast('Erro ao salvar perfil.');
      return;
    }
    state.profile = data;

    if (state.activeMembership?.id && state.activeRacha?.id) {
      const { error: memberError } = await sb
        .from('racha_membros')
        .update({
          posicao_detalhada: selectedDetailed,
          posicao_tipo: selectedType,
          posicao_setor: selectedSector
        })
        .eq('id', state.activeMembership.id);
      if (memberError) console.warn('Posição do racha não salva:', memberError.message);
      await loadMemberships();
      chooseDefaultActiveRacha();
      await loadRachaData();
    }

    renderApp();
    toast('Perfil salvo.');
  } catch (error) {
    console.error(error);
    toast('Erro ao salvar perfil. Tente novamente.');
  } finally {
    setLoading(button, false);
  }
}

async function uploadAvatar(button) {
  const file = $('avatarFile')?.files?.[0];
  if (!file) {
    toast('Escolha uma foto primeiro.');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    toast('A foto precisa ter até 2 MB.');
    return;
  }

  setLoading(button, true, 'Enviando...');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${state.user.id}/avatar.${ext}`;

  const { error: uploadError } = await sb.storage.from('avatars').upload(path, file, {
    upsert: true,
    cacheControl: '3600'
  });

  if (uploadError) {
    console.error(uploadError);
    setLoading(button, false);
    toast('Erro ao enviar foto. Confira o bucket avatars.');
    return;
  }

  const { data: publicData } = sb.storage.from('avatars').getPublicUrl(path);
  const avatarUrl = `${publicData.publicUrl}?v=${Date.now()}`;
  const { data, error } = await sb
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', state.user.id)
    .select('*')
    .single();

  setLoading(button, false);
  if (error) {
    console.error(error);
    toast('Foto enviada, mas não consegui salvar no perfil.');
    return;
  }
  state.profile = data;
  await loadRachaData();
  renderApp();
  toast('Foto atualizada!');
}

async function setPresence(status) {
  if (!state.activeRacha) return;

  let finalStatus = status;
  const max = Number(state.activeRacha.max_jogadores || 0);
  const current = state.presencas.find((p) => p.user_id === state.user.id)?.status;
  const confirmados = state.presencas.filter((p) => p.status === 'confirmado').length;
  if (status === 'confirmado' && max && confirmados >= max && current !== 'confirmado') {
    finalStatus = 'espera';
    toast('Racha lotado. Você entrou na lista de espera.');
  }

  const { error } = await sb.from('presencas').upsert({
    racha_id: state.activeRacha.id,
    user_id: state.user.id,
    data_jogo: state.selectedDate,
    status: finalStatus
  }, { onConflict: 'racha_id,user_id,data_jogo' });

  if (error) {
    console.error(error);
    toast('Erro ao confirmar presença.');
    return;
  }
  await loadPresencas(state.selectedDate);
  renderApp();
  toast(`Presença marcada como: ${finalStatus}`);
}

async function openEvaluate(userId) {
  if (!state.activeRacha) return;
  if (!canEvaluate()) {
    toast('Somente admin ou avaliador pode avaliar jogadores.');
    return;
  }
  state.currentEvaluation = null;
  try {
    const { data, error } = await sb
      .from('avaliacoes')
      .select('*')
      .eq('racha_id', state.activeRacha.id)
      .eq('avaliador_id', state.user.id)
      .eq('avaliado_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    state.currentEvaluation = data || null;
  } catch (error) {
    console.warn('Avaliação existente não carregada:', error.message);
    state.currentEvaluation = null;
  }
  document.getElementById('evaluationCard')?.remove();
  const content = $('content');
  content.insertAdjacentHTML('afterbegin', renderEvaluationForm(userId));
  refreshIcons();
  document.getElementById('evaluationCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateEvalSlider(key, value) {
  const valid = Math.max(60, Math.min(99, Number(value) || 60));
  const input = document.getElementById(`eval_${key}`);
  const label = document.getElementById(`eval_label_${key}`);
  const group = document.querySelector(`[data-eval-skill="${key}"]`);
  if (!input || !group) return;
  input.value = valid;
  const pct = Math.max(0, Math.min(100, ((valid - 60) / 39) * 100));
  group.style.setProperty('--value', `${pct}%`);
  group.querySelector('.eval-range-wrap')?.style.setProperty('--value', `${pct}%`);
  if (label) label.textContent = String(valid);
}

function updateEvalRating(key, value) {
  updateEvalSlider(key, value);
}

function applyEvalPreset(preset) {
  const base = {
    finalizacao: 75,
    passe: 75,
    velocidade: 75,
    drible: 75,
    hab_defensiva: 75,
    hab_ofensiva: 75,
    hab_goleiro: 60
  };
  const presets = {
    equilibrado: base,
    bom: { finalizacao: 80, passe: 80, velocidade: 80, drible: 80, hab_defensiva: 78, hab_ofensiva: 80, hab_goleiro: 60 },
    craque: { finalizacao: 92, passe: 90, velocidade: 88, drible: 93, hab_defensiva: 72, hab_ofensiva: 94, hab_goleiro: 60 },
    atacante: { finalizacao: 93, passe: 82, velocidade: 86, drible: 88, hab_defensiva: 68, hab_ofensiva: 92, hab_goleiro: 60 },
    marcador: { finalizacao: 70, passe: 76, velocidade: 82, drible: 72, hab_defensiva: 92, hab_ofensiva: 74, hab_goleiro: 60 },
    goleiro: { finalizacao: 60, passe: 72, velocidade: 70, drible: 65, hab_defensiva: 78, hab_ofensiva: 65, hab_goleiro: 94 }
  };
  const values = presets[preset] || base;
  Object.entries(values).forEach(([key, value]) => updateEvalSlider(key, value));
  document.querySelectorAll('.eval-presets button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.preset === preset);
  });
}

function nextEvaluableMember(currentUserId) {
  const list = state.members
    .filter((m) => m.status === 'ativo' && m.user_id !== state.user.id)
    .sort((a, b) => String(a.profiles?.apelido || a.profiles?.nome || '').localeCompare(String(b.profiles?.apelido || b.profiles?.nome || '')));
  if (!list.length) return null;
  const idx = list.findIndex((m) => m.user_id === currentUserId);
  return list[(idx + 1 + list.length) % list.length] || null;
}

async function saveEvaluation(form, submitter = null) {
  if (!canEvaluate()) {
    toast('Você não tem permissão para avaliar neste racha.');
    return;
  }

  setLoading(submitter, true, 'Salvando...');
  try {
    const targetUserId = form.dataset.userId;
    const payload = {
      p_racha_id: state.activeRacha.id,
      p_avaliado_id: targetUserId,
      p_finalizacao: Number($('eval_finalizacao').value),
      p_passe: Number($('eval_passe').value),
      p_velocidade: Number($('eval_velocidade').value),
      p_drible: Number($('eval_drible').value),
      p_hab_defensiva: Number($('eval_hab_defensiva').value),
      p_hab_ofensiva: Number($('eval_hab_ofensiva').value),
      p_hab_goleiro: Number($('eval_hab_goleiro').value),
      p_comentario: $('eval_comentario')?.value.trim() || null
    };

    const { error } = await sb.rpc('salvar_avaliacao_unica', payload);
    if (error) throw error;

    await Promise.all([loadRanking(), loadGlobalProfileStats()]);

    const after = submitter?.dataset?.after || 'ranking';
    state.currentEvaluation = null;
    if (after === 'next') {
      const next = nextEvaluableMember(targetUserId);
      state.currentView = 'racha';
      renderApp();
      if (next && next.user_id !== targetUserId) {
        setTimeout(() => openEvaluate(next.user_id), 80);
        toast('Avaliação atualizada. Próximo jogador aberto.');
        return;
      }
    }

    state.currentView = 'ranking';
    renderApp();
    toast('Avaliação atualizada!');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao salvar avaliação.');
  } finally {
    setLoading(submitter, false);
  }
}

function buildTeams(players, perTeam, mode) {
  const totalTeams = Math.max(1, Math.ceil(players.length / Math.max(1, perTeam)));
  const teams = Array.from({ length: totalTeams }, (_, i) => ({ name: `Time ${i + 1}`, players: [], total: 0 }));
  const shuffled = shuffle([...players]);

  if (mode === 'aleatorio') {
    shuffled.forEach((player) => {
      const target = teams.slice().sort((a, b) => a.players.length - b.players.length)[0];
      target.players.push(player);
      target.total += player.score;
    });
    return teams;
  }

  if (mode === 'posicoes') return buildTeamsByPosition(shuffled, teams, perTeam);

  const goalkeepers = shuffled.filter((p) => p.isGoalkeeper).sort((a, b) => b.score - a.score);
  const linePlayers = shuffled.filter((p) => !p.isGoalkeeper).sort((a, b) => b.score - a.score);

  goalkeepers.forEach((player, index) => {
    const target = teams[index % teams.length];
    if (target.players.length < perTeam) {
      target.players.push(player);
      target.total += player.score;
    } else {
      linePlayers.push(player);
    }
  });

  linePlayers.forEach((player) => {
    const target = teams
      .filter((team) => team.players.length < perTeam)
      .sort((a, b) => a.total - b.total || a.players.length - b.players.length)[0] || teams[teams.length - 1];
    target.players.push(player);
    target.total += player.score;
  });

  return teams;
}

async function generateTeams(button) {
  if (!state.activeRacha) return;
  if (!isAdmin()) {
    toast('Apenas administradores podem gerar sorteios.');
    return;
  }

  setLoading(button, true, 'Sorteando...');
  try {
    const date = getDefaultGameDate(state.activeRacha);
    state.selectedDate = date;
    await loadPresencas(date);
    await Promise.all([loadMembers(), loadRanking()]);

    const perTeam = Number($('sorteioPorTime')?.value || state.activeRacha.jogadores_por_time || 5);
    const mode = selectedDrawMode();
    state.sorteioMode = mode;
    const confirmedIds = new Set(state.presencas.filter((p) => p.status === 'confirmado').map((p) => p.user_id));

    const players = state.members
      .filter((m) => m.status === 'ativo' && confirmedIds.has(m.user_id))
      .map((m) => {
        const profile = mergeMemberProfile(m);
        const rank = state.ranking.find((r) => r.jogador_id === m.user_id);
        const score = Number(rank?.media_geral || 3);
        const detailed = profile.posicao_detalhada || profile.posicao || null;
        const type = profile.posicao_tipo || profile.posicao || (detailed === 'goleiro' ? 'goleiro' : 'linha');
        return {
          id: m.user_id,
          name: profile.apelido || profile.nome || 'Jogador',
          posicao: profile.posicao || 'linha',
          posicao_tipo: type,
          posicao_detalhada: detailed,
          posicao_setor: profile.posicao_setor || positionSector(detailed),
          score,
          isGoalkeeper: ['goleiro', 'ambos'].includes(type) || detailed === 'goleiro'
        };
      });

    if (players.length < 2) {
      toast('Confirme pelo menos 2 jogadores para sortear.');
      return;
    }

    const teams = buildTeams(players, perTeam, mode);
    state.lastTeamsText = teamsToText(teams, mode, date);
    renderTeams(teams);

    const { error } = await sb.from('sorteios').insert({
      racha_id: state.activeRacha.id,
      criado_por: state.user.id,
      modo: mode,
      jogadores_por_time: perTeam,
      resultado: teams
    });
    if (error) {
      console.warn('Sorteio gerado, mas não salvo:', error.message);
      toast('Times gerados, mas não consegui salvar o histórico.');
      return;
    }

    await loadLatestSorteios();
    toast('Times gerados!');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao gerar times. Tente novamente.');
  } finally {
    setLoading(button, false);
  }
}

function buildTeamsByPosition(players, teams, perTeam) {
  const ordered = [...players].sort((a, b) => b.score - a.score);
  const groups = {
    gol: ordered.filter((p) => p.isGoalkeeper || p.posicao_setor === 'gol'),
    defesa: ordered.filter((p) => !p.isGoalkeeper && p.posicao_setor === 'defesa'),
    meio: ordered.filter((p) => !p.isGoalkeeper && p.posicao_setor === 'meio'),
    ataque: ordered.filter((p) => !p.isGoalkeeper && p.posicao_setor === 'ataque'),
    semSetor: ordered.filter((p) => !p.isGoalkeeper && (!['defesa', 'meio', 'ataque'].includes(p.posicao_setor)))
  };

  const distribute = (list) => {
    list.forEach((player) => {
      const target = teams
        .filter((team) => team.players.length < perTeam)
        .sort((a, b) => {
          const aSameSector = a.players.filter((p) => p.posicao_setor === player.posicao_setor).length;
          const bSameSector = b.players.filter((p) => p.posicao_setor === player.posicao_setor).length;
          return aSameSector - bSameSector || a.total - b.total || a.players.length - b.players.length;
        })[0] || teams[teams.length - 1];
      target.players.push(player);
      target.total += player.score;
    });
  };

  distribute(groups.gol);
  distribute(groups.defesa);
  distribute(groups.meio);
  distribute(groups.ataque);
  distribute(groups.semSetor);
  return teams;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function renderTeams(teams) {
  const el = $('teamsResult');
  if (!el) return;
  el.innerHTML = teamsToHTML(teams);
}

function teamsToText(teams, mode, date) {
  let text = `*GOLEIO* - Sorteio ${mode === 'posicoes' ? 'por posições' : mode === 'equilibrado' ? 'equilibrado' : 'aleatório'}\nData: ${date}\n\n`;
  teams.forEach((team) => {
    text += `🏆 ${team.name} - média ${team.players.length ? (team.total / team.players.length).toFixed(2) : '-'}\n`;
    team.players.forEach((p) => {
      text += `- ${p.isGoalkeeper ? '🧤' : '⚽'} ${p.name} (${positionCode(p.posicao_detalhada || p.posicao)})\n`;
    });
    text += '\n';
  });
  return text.trim();
}

async function copyTeams() {
  if (!state.lastTeamsText) {
    const last = latestSorteio();
    if (last) state.lastTeamsText = teamsToText(last.resultado || [], last.modo || 'equilibrado', formatDateTimeBR(last.created_at));
  }
  if (!state.lastTeamsText) {
    toast(isAdmin() ? 'Gere os times primeiro.' : 'Ainda não existe uma lista sorteada.');
    return;
  }
  await copyText(state.lastTeamsText, 'Times copiados!');
}

async function copyText(text, successMessage = 'Copiado!') {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage);
  } catch (error) {
    console.error(error);
    toast('Não consegui copiar. O navegador pode ter bloqueado.');
  }
}

window.addEventListener('DOMContentLoaded', init);
