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
  presencas: [],
  cancelledDates: [],
  currentView: 'dashboard',
  selectedDate: new Date().toISOString().slice(0, 10),
  lastTeamsText: ''
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
    button.dataset.oldText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i> ${text}`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.oldText || button.innerHTML;
  }
  refreshIcons();
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
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
  const p = String(posicao || 'linha').toLowerCase();
  if (p.includes('gol')) return 'GOL';
  if (p.includes('amb')) return 'AMB';
  return 'LIN';
}

function cardScore(value, fallback = 60) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  const score = Math.round(Number(value) * 20);
  return Math.max(20, Math.min(100, score));
}

function cardLabel(value, fallback = 'Equilibrado') {
  const text = String(value || '').trim();
  if (!text || text === 'nao_informado') return fallback;
  return text.replace(/_/g, ' ');
}

function statusBadge(status) {
  return `<span class="status-badge status-${safe(status)}">${safe(status || '-')}</span>`;
}

function roleBadge(papel) {
  return `<span class="role-badge ${papel === 'admin' ? 'role-admin' : ''}">${papel === 'admin' ? 'Admin' : 'Jogador'}</span>`;
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

function isAdmin() {
  return state.activeMembership?.papel === 'admin' && state.activeMembership?.status === 'ativo';
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
  if (!validateConfig()) return;
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  bindBaseEvents();

  const { data } = await sb.auth.getSession();
  state.session = data.session;
  state.user = data.session?.user || null;

  sb.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    state.user = session?.user || null;
    if (state.user) {
      await loadInitialData();
    } else {
      resetState();
      showAuth();
    }
  });

  if (state.user) {
    await loadInitialData();
  } else {
    showAuth();
  }
}

function resetState() {
  state.profile = null;
  state.memberships = [];
  state.activeMembership = null;
  state.activeRacha = null;
  state.members = [];
  state.ranking = [];
  state.presencas = [];
  state.cancelledDates = [];
  state.currentView = 'dashboard';
  state.selectedDate = today();
  state.lastTeamsText = '';
}

function bindBaseEvents() {
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('pointerup', handlePointerNav, { passive: false });
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleInput);

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
}

function showAuth() {
  $('authView').classList.remove('hidden');
  $('appView').classList.add('hidden');
  refreshIcons();
}

function showApp() {
  $('authView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  renderApp();
}

async function loadInitialData() {
  await ensureProfile();
  await loadMemberships();
  chooseDefaultActiveRacha();
  if (state.activeRacha) {
    await loadRachaData();
  }
  showApp();
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
      rachas (
        id,
        nome,
        modalidade,
        local,
        dia_semana,
        horario,
        jogadores_por_time,
        max_jogadores,
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

function chooseDefaultActiveRacha() {
  const savedId = localStorage.getItem('goleio_active_racha');
  const activeMemberships = state.memberships.filter((m) => m.status === 'ativo' && m.rachas);
  let selected = activeMemberships.find((m) => m.racha_id === savedId) || activeMemberships[0] || null;

  state.activeMembership = selected;
  state.activeRacha = selected?.rachas || null;
  if (state.activeRacha) state.selectedDate = getDefaultGameDate(state.activeRacha);
}

async function loadRachaData() {
  if (!state.activeRacha) return;
  await loadCancelledDates();
  if (!state.selectedDate || !isMatchingRachaDay(state.selectedDate, state.activeRacha) || isDateCancelled(state.selectedDate)) {
    state.selectedDate = getDefaultGameDate(state.activeRacha);
  }
  await Promise.all([loadMembers(), loadRanking(), loadPresencas(state.selectedDate)]);
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
      profiles (
        id,
        nome,
        apelido,
        email,
        telefone,
        avatar_url,
        posicao,
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

function renderApp() {
  const profileName = state.profile?.apelido || state.profile?.nome || 'Jogador';
  $('topEyebrow').textContent = `Olá, ${profileName}`;
  $('topTitle').textContent = getViewTitle();
  $('activeRachaPill').textContent = state.activeRacha ? `${state.activeRacha.nome} • ${state.activeMembership?.papel === 'admin' ? 'Admin' : 'Jogador'}` : 'Nenhum racha ativo';

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.currentView);
  });

  const content = $('content');
  const renderers = {
    dashboard: renderDashboard,
    perfil: renderPerfil,
    racha: renderRacha,
    presenca: renderPresenca,
    ranking: renderRanking,
    sorteio: renderSorteio
  };
  content.innerHTML = (renderers[state.currentView] || renderDashboard)();
  refreshIcons();
  // Evita que o Chrome mobile/emulador mantenha a tela deslocada para o lado
  // quando uma faixa horizontal de datas é tocada/arrastada.
  requestAnimationFrame(() => {
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
    const app = $('appView');
    if (app) app.scrollLeft = 0;
  });
  lastRenderedView = state.currentView;
}

function getViewTitle() {
  const titles = {
    dashboard: 'Início do racha',
    perfil: 'Minha cartinha',
    racha: 'Comunidade do racha',
    presenca: 'Confirmação de presença',
    ranking: 'Ranking do Goleio',
    sorteio: 'Sorteio inteligente'
  };
  return titles[state.currentView] || 'Goleio';
}

function renderDashboard() {
  const activeCount = state.memberships.filter((m) => m.status === 'ativo').length;
  const pendingCount = state.memberships.filter((m) => m.status === 'pendente').length;
  const profileName = state.profile?.apelido || state.profile?.nome || 'Jogador';
  const active = state.activeRacha;
  const nextDate = active ? getDefaultGameDate(active) : null;
  const totalMemberships = state.memberships.length;

  return `
    <div class="home-stack">
      <section class="home-hero-card glass-card">
        <div class="home-hero-copy">
          <p class="eyebrow">Olá, ${safe(profileName)}</p>
          <h3>${active ? 'Seu racha está pronto' : 'Comece seu racha premium'}</h3>
          <p class="muted">
            ${active
              ? `${safe(active.nome)} • ${dayName(active.dia_semana)}${active.horario ? ` às ${safe(active.horario.slice(0, 5))}` : ''}`
              : 'Crie uma comunidade, convide os jogadores e monte times equilibrados com cartinhas.'}
          </p>
          <div class="hero-actions-row">
            ${active ? `
              <button class="btn-primary" data-view="presenca" type="button"><i data-lucide="calendar-check"></i> Confirmar presença</button>
              <button class="btn-secondary" data-view="sorteio" type="button"><i data-lucide="shuffle"></i> Sortear</button>
            ` : `
              <button class="btn-primary" type="button" data-action="focus-create-racha"><i data-lucide="plus-circle"></i> Criar racha</button>
              <button class="btn-secondary" type="button" data-action="focus-join-racha"><i data-lucide="key-round"></i> Entrar por código</button>
            `}
          </div>
        </div>

        <div class="home-hero-panel">
          <span class="hero-panel-label">Próximo jogo</span>
          <strong>${nextDate ? formatDateBR(nextDate) : '--/--'}</strong>
          <small>${active ? `${dayName(active.dia_semana)}${active.horario ? ` • ${safe(active.horario.slice(0, 5))}` : ''}` : 'Sem racha selecionado'}</small>
        </div>
      </section>

      <div class="home-metrics-grid">
        <div class="home-metric">
          <i data-lucide="shield-check"></i>
          <div><span>Ativos</span><strong>${activeCount}</strong></div>
        </div>
        <div class="home-metric">
          <i data-lucide="hourglass"></i>
          <div><span>Pendentes</span><strong>${pendingCount}</strong></div>
        </div>
        <div class="home-metric">
          <i data-lucide="id-card"></i>
          <div><span>Posição</span><strong>${safe(state.profile?.posicao || 'linha')}</strong></div>
        </div>
      </div>

      <div class="home-action-grid">
        <details id="createRachaDetails" class="accordion-card home-action-card">
          <summary>
            <span class="action-summary-main">
              <span class="action-icon"><i data-lucide="plus-circle"></i></span>
              <span><b>Criar novo racha</b><small>Você vira admin e aprova os jogadores.</small></span>
            </span>
            <i data-lucide="chevron-down" class="summary-chevron"></i>
          </summary>
          <div class="accordion-content">
            <form id="createRachaForm">
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

              <label>Local</label>
              <input id="rachaLocal" placeholder="Nome da quadra/campo" />

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
          </div>
        </details>

        <details id="joinRachaDetails" class="accordion-card home-action-card">
          <summary>
            <span class="action-summary-main">
              <span class="action-icon"><i data-lucide="key-round"></i></span>
              <span><b>Entrar por código</b><small>Solicite entrada em um racha existente.</small></span>
            </span>
            <i data-lucide="chevron-down" class="summary-chevron"></i>
          </summary>
          <div class="accordion-content">
            <form id="joinRachaForm">
              <label>Código de convite</label>
              <input id="codigoConvite" placeholder="Ex: GOL-A1B2C3" required />
              <button class="btn-primary" type="submit"><i data-lucide="log-in"></i> Pedir entrada</button>
            </form>
          </div>
        </details>
      </div>

      <section class="card clean-card home-section-card">
        <div class="section-headline">
          <div>
            <p class="eyebrow">Comunidades</p>
            <h3><i data-lucide="users"></i> Meus rachas</h3>
          </div>
          <span class="section-count">${totalMemberships}</span>
        </div>
        ${renderMembershipList()}
      </section>
    </div>
  `;
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
      const roleText = m.papel === 'admin' ? 'Admin' : 'Jogador';
      return `
        <article class="racha-row-card ${isActive ? 'selected' : ''}">
          <div class="racha-row-icon"><i data-lucide="shield"></i></div>
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
  const p = state.profile || {};
  return `
    <div class="card-grid profile-layout">
      ${renderPlayerCard(p, getMyAverage())}

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

              <label for="profileTelefone">WhatsApp</label>
              <input id="profileTelefone" type="tel" inputmode="numeric" maxlength="15" value="${safe(formatPhoneBR(p.telefone))}" placeholder="(34) 99999-9999" autocomplete="tel-national" />

              <div class="grid-2">
                <div>
                  <label>Posição</label>
                  <select id="profilePosicao">
                    ${option('linha', 'Linha', p.posicao)}
                    ${option('goleiro', 'Goleiro', p.posicao)}
                    ${option('ambos', 'Ambos', p.posicao)}
                  </select>
                </div>
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

function renderPlayerCard(profile, average = null, rankingRow = null) {
  const overall = average ? Math.round(Number(average) * 20) : 60;
  const tier = cardTier(overall);
  const attrs = rankingRow || {};
  const pos = positionCode(profile?.posicao);
  const skills = [
    ['PAC', attrs.media_velocidade],
    ['FIN', attrs.media_finalizacao],
    ['PAS', attrs.media_passe],
    ['DRI', attrs.media_drible],
    ['MAR', attrs.media_marcacao],
    ['GOL', attrs.media_goleiro]
  ];
  const name = (profile?.apelido || profile?.nome || 'Jogador').toUpperCase();
  const estilo = cardLabel(profile?.estilo_jogo, 'Craque do racha');
  const pe = cardLabel(profile?.pe_dominante, 'pé não informado');

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

      <div class="gc-v2-stats">
        ${skills.map(([label, value]) => `
          <div class="gc-v2-stat"><strong>${cardScore(value)}</strong><span>${label}</span></div>
        `).join('')}
      </div>

      <div class="gc-v2-ball" aria-hidden="true">⚽</div>
    </div>
  `;
}

function renderRacha() {
  if (!state.activeRacha) return requireActiveRachaHTML('Nenhum racha selecionado');
  const r = state.activeRacha;
  const activeMembers = state.members.filter((m) => m.status === 'ativo');
  const pendingMembers = state.members.filter((m) => m.status === 'pendente');

  return `
    <div class="card">
      <div class="card-top">
        <div>
          <p class="eyebrow">${safe(r.modalidade)}</p>
          <h3>${safe(r.nome)}</h3>
          <p class="muted">${safe(r.local || 'Local não definido')} • ${dayName(r.dia_semana)} ${r.horario ? `às ${safe(r.horario.slice(0,5))}` : ''}</p>
        </div>
        <div class="overall"><strong>${activeMembers.length}</strong><span>membros</span></div>
      </div>
      <div class="form-actions">
        <button class="btn-secondary" data-action="copy-code" data-code="${safe(r.codigo_convite)}"><i data-lucide="copy"></i> Código: ${safe(r.codigo_convite)}</button>
        <button class="btn-ghost" data-action="refresh-racha"><i data-lucide="refresh-cw"></i> Atualizar</button>
      </div>
    </div>

    ${isAdmin() ? renderAdminRachaSettings(r) : ''}
    ${isAdmin() ? renderAdminPending(pendingMembers) : ''}

    <div class="card">
      <h3><i data-lucide="users"></i> Jogadores do racha</h3>
      ${renderMembers(activeMembers)}
    </div>
  `;
}

function renderAdminRachaSettings(r) {
  const rawDates = getRawUpcomingGameDates(r, isSmallScreen() ? 6 : 10);
  return `
    <details class="accordion-card admin-racha-panel">
      <summary>
        <span><i data-lucide="settings-2"></i> Administração do racha</span>
        <i data-lucide="chevron-down" class="summary-chevron"></i>
      </summary>
      <div class="accordion-content admin-racha-content">
        <div class="admin-note-box">
          <i data-lucide="crown"></i>
          <div>
            <strong>Controle do dono/admin</strong>
            <p class="muted">Edite local, dia, horário e cancele semanas específicas sem apagar o racha.</p>
          </div>
        </div>

        <details class="sub-accordion" open>
          <summary><span><i data-lucide="pencil-ruler"></i> Editar informações</span><i data-lucide="chevron-down"></i></summary>
          <form id="editRachaForm" class="admin-form-grid">
            <div class="full-field">
              <label>Nome do racha</label>
              <input id="editRachaNome" value="${safe(r.nome)}" required />
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
              <label>Local/endereço</label>
              <input id="editRachaLocal" value="${safe(r.local || '')}" placeholder="Nome da quadra/campo ou endereço" />
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
      </div>
    </details>
  `;
}

function renderAdminPending(pendingMembers) {
  return `
    <div class="card">
      <h3><i data-lucide="user-check"></i> Aprovações pendentes</h3>
      ${pendingMembers.length ? renderMembers(pendingMembers, true) : '<p class="muted">Nenhum jogador aguardando aprovação.</p>'}
    </div>
  `;
}

function renderMembers(members, showApproval = false) {
  if (!members.length) return '<p class="muted">Nenhum jogador encontrado.</p>';
  return `<div class="member-list compact-members">
    ${members.map((m) => {
      const p = m.profiles || {};
      return `
        <div class="member-card compact-member-card">
          ${avatarHTML(p)}
          <div class="compact-member-info">
            <strong>${safe(p.apelido || p.nome || 'Jogador')}</strong>
            <div class="member-meta compact-meta">
              ${statusBadge(m.status)} ${roleBadge(m.papel)} <span class="status-badge">${safe(p.posicao || 'linha')}</span>
            </div>
          </div>
          <div class="member-actions compact-actions">
            <button class="mini-btn btn-ghost" data-action="open-player-profile" data-user-id="${safe(m.user_id)}"><i data-lucide="id-card"></i> Perfil</button>
            ${showApproval ? `
              <button class="mini-btn btn-secondary" data-action="approve-member" data-member-id="${safe(m.id)}"><i data-lucide="check"></i></button>
              <button class="mini-btn btn-danger" data-action="reject-member" data-member-id="${safe(m.id)}"><i data-lucide="x"></i></button>
            ` : `
              ${m.user_id !== state.user.id ? `<button class="mini-btn btn-secondary" data-action="open-evaluate" data-user-id="${safe(m.user_id)}"><i data-lucide="star"></i></button>` : '<span class="hint">Você</span>'}
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
  const p = member.profiles || {};
  const rank = state.ranking.find((r) => r.jogador_id === userId);
  const overall = rank?.media_geral ? Math.round(Number(rank.media_geral) * 20) : 60;
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
            <p class="muted">${safe(p.nome || '')}</p>
            <div class="modal-info-grid">
              <div><span>Overall</span><strong>${overall}</strong></div>
              <div><span>Posição</span><strong>${safe(p.posicao || 'linha')}</strong></div>
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
            ${userId !== state.user.id ? `<button class="btn-primary" data-action="open-evaluate" data-user-id="${safe(userId)}"><i data-lucide="star"></i> Avaliar jogador</button>` : ''}
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
  const myPresence = state.presencas.find((p) => p.user_id === state.user.id)?.status || 'talvez';
  const stats = ['confirmado', 'espera', 'talvez', 'nao_vou'].reduce((acc, key) => {
    acc[key] = state.presencas.filter((p) => p.status === key).length;
    return acc;
  }, {});

  return `
    <div class="mobile-stack">
      <div class="card clean-card presence-main-card">
        <h3><i data-lucide="calendar-check"></i> Confirmar presença</h3>
        ${renderGameDatePicker('presence')}
        <p class="current-status">${formatDateBR(state.selectedDate)} <span>${safe(myPresence)}</span></p>
        <div class="presence-buttons">
          <button class="btn-secondary primary-choice" data-action="set-presence" data-status="confirmado"><i data-lucide="check-circle"></i> Vou jogar</button>
          <button class="btn-secondary" data-action="set-presence" data-status="talvez"><i data-lucide="circle-help"></i> Talvez</button>
          <button class="btn-secondary" data-action="set-presence" data-status="espera"><i data-lucide="list-plus"></i> Espera</button>
          <button class="btn-danger" data-action="set-presence" data-status="nao_vou"><i data-lucide="x-circle"></i> Não vou</button>
        </div>
      </div>

      <div class="stat-row compact-stats presence-stats">
        <div class="stat"><span class="muted">Confirmados</span><strong>${stats.confirmado}</strong></div>
        <div class="stat"><span class="muted">Espera</span><strong>${stats.espera}</strong></div>
        <div class="stat"><span class="muted">Não vão</span><strong>${stats.nao_vou}</strong></div>
      </div>

      <div class="card clean-card">
        <h3><i data-lucide="list-checks"></i> Lista do dia</h3>
        ${renderPresenceList()}
      </div>
    </div>
  `;
}

function renderPresenceList() {
  const activeMembers = state.members.filter((m) => m.status === 'ativo');
  if (!activeMembers.length) return '<p class="muted">Nenhum membro ativo.</p>';

  return `<div class="member-list">
    ${activeMembers.map((m) => {
      const p = m.profiles || {};
      const pres = state.presencas.find((x) => x.user_id === m.user_id)?.status || 'sem resposta';
      return `
        <div class="member-card">
          ${avatarHTML(p)}
          <div>
            <strong>${safe(p.apelido || p.nome)}</strong>
            <p class="muted">${safe(p.posicao || 'linha')}</p>
            ${statusBadge(pres)}
          </div>
          <div></div>
        </div>
      `;
    }).join('')}
  </div>`;
}

function rankingOverall(row) {
  return row?.media_geral ? Math.round(Number(row.media_geral) * 20) : 60;
}

function attrOverall(value) {
  return value ? Math.round(Number(value) * 20) : 60;
}

function rankingMedal(index) {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return `#${index + 1}`;
}

function buildRankingProfile(row) {
  return {
    id: row.jogador_id,
    nome: row.nome,
    apelido: row.apelido,
    avatar_url: row.avatar_url,
    posicao: row.posicao,
    estilo_jogo: `${row.total_avaliacoes || 0} avaliação(ões)`,
    pe_dominante: 'Goleio'
  };
}

function renderRankingPodium(topRows) {
  const podiumOrder = [1, 0, 2].filter((idx) => topRows[idx]);
  return `
    <div class="ranking-podium">
      ${podiumOrder.map((realIndex) => {
        const row = topRows[realIndex];
        const profile = buildRankingProfile(row);
        const overall = rankingOverall(row);
        return `
          <button type="button" class="podium-player podium-${realIndex + 1}" data-action="open-player-profile" data-user-id="${safe(row.jogador_id)}">
            <span class="podium-rank">${rankingMedal(realIndex)}</span>
            ${avatarHTML(profile)}
            <strong>${safe(row.apelido || row.nome || 'Jogador')}</strong>
            <small>${safe(positionCode(row.posicao))} • ${row.total_avaliacoes || 0} voto(s)</small>
            <span class="podium-overall">${overall}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderRankingHighlights(rows) {
  const bestOverall = rows[0];
  const bestAttack = [...rows].sort((a, b) => (Number(b.media_finalizacao || 0) + Number(b.media_passe || 0) + Number(b.media_drible || 0)) - (Number(a.media_finalizacao || 0) + Number(a.media_passe || 0) + Number(a.media_drible || 0)))[0];
  const bestDefense = [...rows].sort((a, b) => Number(b.media_marcacao || 0) - Number(a.media_marcacao || 0))[0];
  const bestGoal = [...rows].sort((a, b) => Number(b.media_goleiro || 0) - Number(a.media_goleiro || 0))[0];
  const highlights = [
    ['Troféu geral', bestOverall, rankingOverall(bestOverall), 'trophy'],
    ['Ataque', bestAttack, attrOverall(((Number(bestAttack?.media_finalizacao || 0) + Number(bestAttack?.media_passe || 0) + Number(bestAttack?.media_drible || 0)) / 3) || null), 'flame'],
    ['Marcação', bestDefense, attrOverall(bestDefense?.media_marcacao), 'shield'],
    ['Goleiro', bestGoal, attrOverall(bestGoal?.media_goleiro), 'hand']
  ];

  return `
    <div class="ranking-highlights">
      ${highlights.map(([label, row, score, icon]) => `
        <button type="button" class="ranking-highlight" data-action="open-player-profile" data-user-id="${safe(row?.jogador_id || '')}">
          <i data-lucide="${icon}"></i>
          <span>${safe(label)}</span>
          <strong>${safe(row?.apelido || row?.nome || '-')}</strong>
          <em>${score || 60}</em>
        </button>
      `).join('')}
    </div>
  `;
}

function renderRankingRow(row, index) {
  const profile = buildRankingProfile(row);
  const overall = rankingOverall(row);
  const miniStats = [
    ['PAC', row.media_velocidade],
    ['FIN', row.media_finalizacao],
    ['PAS', row.media_passe],
    ['MAR', row.media_marcacao]
  ];
  return `
    <div class="ranking-row">
      <div class="ranking-position">${rankingMedal(index)}</div>
      ${avatarHTML(profile)}
      <div class="ranking-player-info">
        <strong>${safe(row.apelido || row.nome || 'Jogador')}</strong>
        <span>${safe(positionCode(row.posicao))} • ${row.total_avaliacoes || 0} avaliação(ões)</span>
        <div class="ranking-mini-stats">
          ${miniStats.map(([label, value]) => `<small><b>${cardScore(value)}</b> ${label}</small>`).join('')}
        </div>
      </div>
      <div class="ranking-score">
        <strong>${overall}</strong>
        <span>OVR</span>
      </div>
      <div class="ranking-actions">
        <button class="mini-btn btn-ghost" data-action="open-player-profile" data-user-id="${safe(row.jogador_id)}"><i data-lucide="id-card"></i></button>
        ${row.jogador_id !== state.user?.id ? `<button class="mini-btn btn-secondary" data-action="open-evaluate" data-user-id="${safe(row.jogador_id)}"><i data-lucide="star"></i></button>` : ''}
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
        <p class="muted">Quando os jogadores começarem a se avaliar, o Goleio monta o pódio e o placar geral automaticamente.</p>
      </div>
    `;
  }

  const rows = [...state.ranking].sort((a, b) => Number(b.media_geral || 0) - Number(a.media_geral || 0));
  const totalVotes = rows.reduce((sum, row) => sum + Number(row.total_avaliacoes || 0), 0);
  const avgOverall = Math.round(rows.reduce((sum, row) => sum + rankingOverall(row), 0) / rows.length);
  const leader = rows[0];

  return `
    <section class="ranking-pro">
      <div class="ranking-hero card">
        <div>
          <p class="eyebrow">Temporada do racha</p>
          <h3><i data-lucide="trophy"></i> Ranking geral</h3>
          <p class="muted">Classificação por overall. Toque em um jogador para abrir a cartinha completa.</p>
        </div>
        <div class="ranking-hero-score">
          <span>Líder</span>
          <strong>${rankingOverall(leader)}</strong>
          <small>${safe(leader.apelido || leader.nome || 'Jogador')}</small>
        </div>
      </div>

      <div class="ranking-summary">
        <div><span>Jogadores avaliados</span><strong>${rows.length}</strong></div>
        <div><span>Total de votos</span><strong>${totalVotes}</strong></div>
        <div><span>Média do racha</span><strong>${avgOverall}</strong></div>
      </div>

      ${renderRankingPodium(rows.slice(0, 3))}
      ${renderRankingHighlights(rows)}

      <div class="card leaderboard-card">
        <div class="leaderboard-head">
          <div>
            <p class="eyebrow">Placar completo</p>
            <h3>Lista dos jogadores</h3>
          </div>
          <span>${rows.length} atleta(s)</span>
        </div>
        <div class="leaderboard-list">
          ${rows.map((row, index) => renderRankingRow(row, index)).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderSorteio() {
  if (!state.activeRacha) return requireActiveRachaHTML('Sorteio indisponível');
  const confirmed = state.presencas.filter((p) => p.status === 'confirmado').length;
  return `
    <div class="card clean-card sorteio-card">
      <h3><i data-lucide="shuffle"></i> Sorteio inteligente</h3>
      <p class="muted">Escolha uma data do racha. O sorteio usa apenas quem marcou “Vou jogar”.</p>
      ${renderGameDatePicker('sorteio')}
      <div class="sorteio-summary">
        <div><span>Data</span><strong>${formatDateBR(state.selectedDate)}</strong></div>
        <div><span>Confirmados</span><strong>${confirmed}</strong></div>
      </div>
      <div class="sorteio-controls">
        <div>
          <label>Modo</label>
          <select id="sorteioModo">
            <option value="equilibrado">Equilibrado por nota</option>
            <option value="aleatorio">Aleatório</option>
          </select>
        </div>
        <div>
          <label>Jogadores por time</label>
          <input id="sorteioPorTime" type="number" min="1" max="30" value="${safe(state.activeRacha.jogadores_por_time || 5)}" />
        </div>
      </div>
      <div class="form-actions sorteio-actions">
        <button class="btn-primary" data-action="generate-teams"><i data-lucide="sparkles"></i> Gerar times</button>
        <button class="btn-secondary" data-action="copy-teams"><i data-lucide="copy"></i> Copiar</button>
      </div>
      <div id="teamsResult" class="team-result"></div>
    </div>
  `;
}

function renderEvaluationForm(userId) {
  const member = state.members.find((m) => m.user_id === userId);
  if (!member) return '';
  const p = member.profiles || {};
  const rank = state.ranking.find((r) => r.jogador_id === userId) || {};
  const overall = rank?.media_geral ? Math.round(Number(rank.media_geral) * 20) : 60;
  const position = positionCode(p?.posicao);

  const coreAttrs = [
    ['finalizacao', 'Finalização', 'FIN'],
    ['passe', 'Passe', 'PAS'],
    ['marcacao', 'Marcação', 'MAR'],
    ['velocidade', 'Velocidade', 'PAC'],
    ['drible', 'Drible', 'DRI'],
    ['goleiro', 'Goleiro', 'GOL']
  ];
  const extraAttrs = [
    ['resistencia', 'Resistência', 'RES'],
    ['fair_play', 'Fair play', 'FAIR'],
    ['compromisso', 'Compromisso', 'COMP']
  ];

  const skill = ([key, label, abbr]) => `
    <div class="eval-skill" data-eval-skill="${safe(key)}">
      <div class="eval-skill-head">
        <div>
          <strong>${safe(abbr)}</strong>
          <span>${safe(label)}</span>
        </div>
        <b id="eval_label_${safe(key)}">3/5</b>
      </div>
      <input type="hidden" id="eval_${safe(key)}" value="3" required />
      <div class="eval-stars" role="group" aria-label="Nota para ${safe(label)}">
        ${[1,2,3,4,5].map((value) => `
          <button type="button" class="eval-star ${value <= 3 ? 'active' : ''}" data-action="eval-rate" data-key="${safe(key)}" data-value="${value}" aria-label="${value} de 5">★</button>
        `).join('')}
      </div>
    </div>
  `;

  return `
    <div class="card evaluation-card-v2" id="evaluationCard">
      <div class="eval-player-head">
        ${avatarHTML(p)}
        <div class="eval-player-info">
          <span>Avaliando jogador</span>
          <strong>${safe(p.apelido || p.nome || 'Jogador')}</strong>
          <small>${safe(position)} • overall ${safe(overall)} • ${safe(rank?.total_avaliacoes || 0)} avaliação(ões)</small>
        </div>
      </div>

      <form id="evaluationForm" data-user-id="${safe(userId)}">
        <div class="eval-quick-box">
          <div>
            <h3><i data-lucide="zap"></i> Avaliação rápida</h3>
            <p class="muted">Toque em um perfil pronto ou ajuste pelas estrelas.</p>
          </div>
          <div class="eval-presets">
            <button type="button" data-action="eval-preset" data-preset="equilibrado">Equilibrado</button>
            <button type="button" data-action="eval-preset" data-preset="bom">Bom</button>
            <button type="button" data-action="eval-preset" data-preset="craque">Craque</button>
            <button type="button" data-action="eval-preset" data-preset="atacante">Atacante</button>
            <button type="button" data-action="eval-preset" data-preset="marcador">Marcador</button>
            <button type="button" data-action="eval-preset" data-preset="goleiro">Goleiro</button>
          </div>
        </div>

        <div class="eval-skills-grid">
          ${coreAttrs.map(skill).join('')}
        </div>

        <details class="eval-more">
          <summary>
            <span><i data-lucide="sliders-horizontal"></i> Ajustes extras e comentário</span>
            <i data-lucide="chevron-down" class="summary-chevron"></i>
          </summary>
          <div class="eval-more-content">
            <div class="eval-skills-grid compact">
              ${extraAttrs.map(skill).join('')}
            </div>
            <label>Comentário opcional</label>
            <textarea id="eval_comentario" placeholder="Ex: melhorou no passe, marcou bem, chegou no horário..."></textarea>
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
  state.currentView = view || 'dashboard';

  // Primeiro troca a tela imediatamente. Depois carrega dados do racha em segundo passo.
  // Assim o usuário nunca fica preso visualmente na aba anterior.
  renderApp();

  if (state.activeRacha && ['racha', 'presenca', 'ranking', 'sorteio'].includes(state.currentView)) {
    try {
      await loadRachaData();
    } catch (error) {
      console.error(error);
      toast('Não consegui atualizar os dados do racha agora. Tente novamente.');
    }
    renderApp();
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
  if (action === 'focus-create-racha') {
    const details = $('createRachaDetails');
    if (details) {
      details.open = true;
      details.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => $('rachaNome')?.focus(), 280);
    }
  }
  if (action === 'focus-join-racha') {
    const details = $('joinRachaDetails');
    if (details) {
      details.open = true;
      details.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => $('codigoConvite')?.focus(), 280);
    }
  }
  if (action === 'select-racha') await selectRacha(actionEl.dataset.rachaId);
  if (action === 'copy-code') await copyText(actionEl.dataset.code, 'Código copiado!');
  if (action === 'refresh-racha') { await loadRachaData(); renderApp(); toast('Racha atualizado.'); }
  if (action === 'cancel-game-date') await cancelGameDate(actionEl.dataset.date, actionEl);
  if (action === 'restore-game-date') await restoreGameDate(actionEl.dataset.date, actionEl);
  if (action === 'refresh-presence') { await loadPresencas(state.selectedDate); renderApp(); toast('Presença atualizada.'); }
  if (action === 'select-presence-date') { await loadPresencas(actionEl.dataset.date); renderApp(); }
  if (action === 'select-sorteio-date') { await loadPresencas(actionEl.dataset.date); state.currentView = 'sorteio'; renderApp(); }
  if (action === 'approve-member') await updateMemberStatus(actionEl.dataset.memberId, 'ativo');
  if (action === 'reject-member') await updateMemberStatus(actionEl.dataset.memberId, 'removido');
  if (action === 'upload-avatar') await uploadAvatar(actionEl);
  if (action === 'set-presence') await setPresence(actionEl.dataset.status);
  if (action === 'open-player-profile') openPlayerProfile(actionEl.dataset.userId);
  if (action === 'close-modal') closeModal();
  if (action === 'open-evaluate') { closeModal(); openEvaluate(actionEl.dataset.userId); }
  if (action === 'eval-rate') updateEvalRating(actionEl.dataset.key, Number(actionEl.dataset.value));
  if (action === 'eval-preset') applyEvalPreset(actionEl.dataset.preset);
  if (action === 'generate-teams') await generateTeams(actionEl);
  if (action === 'copy-teams') await copyTeams();
}

async function handleChange(event) {
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
  if (event.target.id === 'registerTelefone' || event.target.id === 'profileTelefone') {
    applyPhoneMask(event.target);
  }
}

async function login(button) {
  setLoading(button, true, 'Entrando...');
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  setLoading(button, false);
  if (error) {
    console.error(error);
    toast('Login não realizado. Confira email e senha.');
    return;
  }
  toast('Bem-vindo ao Goleio!');
}

async function register(button) {
  setLoading(button, true, 'Criando...');
  const nome = $('registerNome').value.trim();
  const apelido = $('registerApelido').value.trim() || null;
  const telefone = formatPhoneBR($('registerTelefone').value.trim()) || null;
  const email = $('registerEmail').value.trim();
  const password = $('registerPassword').value;

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { nome, apelido } }
  });

  if (error) {
    console.error(error);
    setLoading(button, false);
    toast(error.message || 'Erro ao criar conta.');
    return;
  }

  const userId = data.user?.id;
  if (userId && telefone) {
    await sb.from('profiles').update({ telefone }).eq('id', userId);
  }

  setLoading(button, false);
  toast('Conta criada! Você já pode usar o app.');
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
    dia_semana: Number($('rachaDia').value),
    horario: $('rachaHorario').value || null,
    jogadores_por_time: Number($('rachaPorTime').value || 5),
    max_jogadores: $('rachaMax').value ? Number($('rachaMax').value) : null,
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
  await loadRachaData();
  state.currentView = 'racha';
  if (shouldRender) renderApp();
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
    dia_semana: Number($('editRachaDia').value),
    horario: $('editRachaHorario').value || null,
    jogadores_por_time: Number($('editRachaPorTime').value || 5),
    max_jogadores: $('editRachaMax').value ? Number($('editRachaMax').value) : null
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
  const payload = {
    nome: $('profileNome').value.trim(),
    apelido: $('profileApelido').value.trim() || null,
    telefone: formatPhoneBR($('profileTelefone').value.trim()) || null,
    posicao: $('profilePosicao').value,
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

  setLoading(button, false);
  if (error) {
    console.error(error);
    toast('Erro ao salvar perfil.');
    return;
  }
  state.profile = data;
  renderApp();
  toast('Perfil salvo.');
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

function openEvaluate(userId) {
  if (!state.activeRacha) return;
  document.getElementById('evaluationCard')?.remove();
  const content = $('content');
  content.insertAdjacentHTML('afterbegin', renderEvaluationForm(userId));
  refreshIcons();
  document.getElementById('evaluationCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateEvalRating(key, value) {
  const valid = Math.max(1, Math.min(5, Number(value) || 3));
  const input = document.getElementById(`eval_${key}`);
  const label = document.getElementById(`eval_label_${key}`);
  const group = document.querySelector(`[data-eval-skill="${key}"]`);
  if (!input || !group) return;
  input.value = valid;
  if (label) label.textContent = `${valid}/5`;
  group.querySelectorAll('.eval-star').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.value) <= valid);
  });
}

function applyEvalPreset(preset) {
  const base = {
    finalizacao: 3,
    passe: 3,
    marcacao: 3,
    velocidade: 3,
    drible: 3,
    goleiro: 3,
    resistencia: 3,
    fair_play: 3,
    compromisso: 3
  };
  const presets = {
    equilibrado: base,
    bom: Object.fromEntries(Object.keys(base).map((key) => [key, 4])),
    craque: { ...base, finalizacao: 5, passe: 5, drible: 5, velocidade: 4, marcacao: 3, goleiro: 2, resistencia: 4, fair_play: 4, compromisso: 4 },
    atacante: { ...base, finalizacao: 5, passe: 4, drible: 4, velocidade: 4, marcacao: 2, goleiro: 1, resistencia: 4, fair_play: 4, compromisso: 4 },
    marcador: { ...base, finalizacao: 3, passe: 3, drible: 3, velocidade: 4, marcacao: 5, goleiro: 2, resistencia: 5, fair_play: 4, compromisso: 4 },
    goleiro: { ...base, finalizacao: 2, passe: 3, drible: 2, velocidade: 3, marcacao: 3, goleiro: 5, resistencia: 4, fair_play: 4, compromisso: 4 }
  };
  const values = presets[preset] || base;
  Object.entries(values).forEach(([key, value]) => updateEvalRating(key, value));
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
  const targetUserId = form.dataset.userId;
  const payload = {
    racha_id: state.activeRacha.id,
    avaliador_id: state.user.id,
    avaliado_id: targetUserId,
    finalizacao: Number($('eval_finalizacao').value),
    passe: Number($('eval_passe').value),
    marcacao: Number($('eval_marcacao').value),
    velocidade: Number($('eval_velocidade').value),
    drible: Number($('eval_drible').value),
    resistencia: Number($('eval_resistencia').value),
    goleiro: Number($('eval_goleiro').value),
    fair_play: Number($('eval_fair_play').value),
    compromisso: Number($('eval_compromisso').value),
    comentario: $('eval_comentario').value.trim() || null
  };

  const { error } = await sb.from('avaliacoes').upsert(payload, {
    onConflict: 'racha_id,avaliador_id,avaliado_id'
  });

  if (error) {
    console.error(error);
    toast('Erro ao salvar avaliação.');
    return;
  }

  await loadRanking();

  const after = submitter?.dataset?.after || 'ranking';
  if (after === 'next') {
    const next = nextEvaluableMember(targetUserId);
    state.currentView = 'racha';
    renderApp();
    if (next && next.user_id !== targetUserId) {
      setTimeout(() => openEvaluate(next.user_id), 80);
      toast('Avaliação salva. Próximo jogador aberto.');
      return;
    }
  }

  state.currentView = 'ranking';
  renderApp();
  toast('Avaliação salva!');
}

async function generateTeams(button) {
  if (!state.activeRacha) return;
  setLoading(button, true, 'Sorteando...');

  try {
    const date = state.selectedDate;
    await loadPresencas(date);
    await loadMembers();
    await loadRanking();

  const perTeam = Number($('sorteioPorTime')?.value || state.activeRacha.jogadores_por_time || 5);
  const mode = $('sorteioModo')?.value || 'equilibrado';
  const confirmedIds = new Set(state.presencas.filter((p) => p.status === 'confirmado').map((p) => p.user_id));
  const players = state.members
    .filter((m) => m.status === 'ativo' && confirmedIds.has(m.user_id))
    .map((m) => {
      const profile = m.profiles || {};
      const rank = state.ranking.find((r) => r.jogador_id === m.user_id);
      return {
        id: m.user_id,
        name: profile.apelido || profile.nome || 'Jogador',
        posicao: profile.posicao || 'linha',
        score: Number(rank?.media_geral || 3),
        isGoalkeeper: ['goleiro', 'ambos'].includes(profile.posicao)
      };
    });

  if (players.length < 2) {
    setLoading(button, false);
    toast('Confirme pelo menos 2 jogadores para sortear.');
    return;
  }

  const teams = buildTeams(players, perTeam, mode);
  state.lastTeamsText = teamsToText(teams, mode, date);
  renderTeams(teams);

  if (isAdmin()) {
    await sb.from('sorteios').insert({
      racha_id: state.activeRacha.id,
      criado_por: state.user.id,
      modo: mode,
      jogadores_por_time: perTeam,
      resultado: teams
    });
  }

    setLoading(button, false);
    toast('Times gerados!');
  } catch (error) {
    console.error(error);
    setLoading(button, false);
    toast('Erro ao gerar times. Tente novamente.');
  }
}

function buildTeams(players, perTeam, mode) {
  const totalTeams = Math.max(1, Math.ceil(players.length / perTeam));
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
  el.innerHTML = teams.map((team) => `
    <div class="team-card">
      <h4>${safe(team.name)}</h4>
      <p class="team-score">Força média: ${team.players.length ? (team.total / team.players.length).toFixed(2) : '-'}</p>
      <ul>
        ${team.players.map((p) => `<li>${p.isGoalkeeper ? '🧤' : '⚽'} ${safe(p.name)} <span class="muted">(${p.score.toFixed(1)})</span></li>`).join('')}
      </ul>
    </div>
  `).join('');
}

function teamsToText(teams, mode, date) {
  let text = `*GOLEIO* - Sorteio ${mode === 'equilibrado' ? 'equilibrado' : 'aleatório'}\nData: ${date}\n\n`;
  teams.forEach((team) => {
    text += `🏆 ${team.name} - média ${team.players.length ? (team.total / team.players.length).toFixed(2) : '-'}\n`;
    team.players.forEach((p) => {
      text += `- ${p.isGoalkeeper ? '🧤' : '⚽'} ${p.name}\n`;
    });
    text += '\n';
  });
  return text.trim();
}

async function copyTeams() {
  if (!state.lastTeamsText) {
    toast('Gere os times primeiro.');
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
