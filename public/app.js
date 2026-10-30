'use strict';
/* Aurora OS — 클라이언트 측 암호화(PBKDF2 + AES-256-GCM) 웹 데스크톱 */
const $ = (s) => document.querySelector(s);
const h = (t, a = {}, ...k) => {
  const e = document.createElement(t);
  for (const [n, v] of Object.entries(a)) n === 'on' ? Object.entries(v).forEach(([x, f]) => e.addEventListener(x, f)) : n === 'text' ? (e.textContent = v) : e.setAttribute(n, v);
  e.append(...k); return e;
};
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const LS = { get: (k) => localStorage.getItem('aurora.' + k), set: (k, v) => localStorage.setItem('aurora.' + k, v) };

let key = null, state = { files: { 'readme.txt': 'Aurora OS에 오신 것을 환영합니다.\n모든 파일은 이 기기에서 암호화되어 저장됩니다.' }, accent: '#ff7a90' };

/* ---------- 암호화 ---------- */
async function derive(pw, salt) {
  const m = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, m, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return b64(iv) + '.' + b64(ct);
}
async function open(blob) {
  const [iv, ct] = blob.split('.');
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct))));
}

/* ---------- 저장 + 타임 트래블 ---------- */
async function save(label = '변경') {
  const blob = await seal(state);
  LS.set('vault', blob);
  const hist = JSON.parse(LS.get('hist') || '[]');
  hist.push({ t: Date.now(), l: label, b: blob });
  LS.set('hist', JSON.stringify(hist.slice(-40)));
  document.documentElement.style.setProperty('--accent', state.accent);
}

/* ---------- 잠금 화면 ---------- */
function showLock() {
  key = null; $('#desktop').hidden = true; $('#bar').hidden = true;
  const first = !LS.get('vault'), lock = $('#lock');
  lock.hidden = false; lock.replaceChildren();
  const pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: first ? '새 마스터 암호 (10자 이상)' : '마스터 암호', 'aria-label': '마스터 암호' });
  const msg = h('p', { class: 'err', 'aria-live': 'polite' });
  const form = h('form', {}, h('h1', { text: 'Aurora' }), h('p', { text: first ? '암호는 서버로 전송되지 않습니다. 분실하면 복구할 수 없습니다.' : '잠금을 해제하세요.' }), pw, h('button', { class: 'go', text: first ? '운영체제 만들기' : '잠금 해제' }), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); msg.textContent = '';
    if (first && pw.value.length < 10) { msg.textContent = '암호는 10자 이상이어야 합니다.'; return; }
    let salt = LS.get('salt') ? unb64(LS.get('salt')) : crypto.getRandomValues(new Uint8Array(16));
    key = await derive(pw.value, salt);
    try {
      if (first) { LS.set('salt', b64(salt)); await save('초기 설치'); } else state = await open(LS.get('vault'));
    } catch { key = null; msg.textContent = '암호가 맞지 않습니다.'; return; }
    pw.value = ''; boot();
  });
  lock.append(form); pw.focus();
}

/* ---------- 창 관리자 ---------- */
let z = 10, wins = new Map();
function openWin(id, title, build, w = 520, hgt = 380) {
  if (wins.has(id)) { focusWin(id); return; }
  const body = h('div', { class: 'body' });
  const close = h('button', { text: '✕', 'aria-label': '닫기', on: { click: () => { win.remove(); wins.delete(id); renderBar(); } } });
  const mini = h('button', { text: '–', 'aria-label': '최소화', on: { click: () => { win.hidden = true; renderBar(); } } });
  const tb = h('div', { class: 'tb' }, h('b', { text: title }), h('span', {}, mini, close));
  const win = h('section', { class: 'win', role: 'dialog', 'aria-label': title, style: `width:${w}px;height:${hgt}px;left:${60 + wins.size * 32}px;top:${50 + wins.size * 28}px` }, tb, body);
  let dx, dy, drag = false;
  tb.addEventListener('pointerdown', (e) => { if (e.target.tagName === 'BUTTON') return; drag = true; dx = e.clientX - win.offsetLeft; dy = e.clientY - win.offsetTop; tb.setPointerCapture(e.pointerId); focusWin(id); });
  tb.addEventListener('pointermove', (e) => { if (drag) { win.style.left = Math.max(0, e.clientX - dx) + 'px'; win.style.top = Math.max(0, e.clientY - dy) + 'px'; } });
  tb.addEventListener('pointerup', () => (drag = false));
  win.addEventListener('pointerdown', () => focusWin(id));
  $('#desktop').append(win); wins.set(id, { win, title }); build(body); focusWin(id);
}
function focusWin(id) {
  wins.forEach((v, k) => v.win.classList.toggle('focus', k === id));
  const v = wins.get(id); v.win.hidden = false; v.win.style.zIndex = ++z; renderBar();
}

/* ---------- 앱: 터미널 ---------- */
function termApp(b) {
  const out = h('div', { class: 'term mono', text: 'Aurora Shell — help 를 입력하세요\n' });
  const inp = h('input', { class: 'mono', 'aria-label': '명령 입력', spellcheck: 'false', autocomplete: 'off' });
  const line = h('div', { class: 'mono' }, '$ ', inp); out.append(line); b.append(out);
  b.addEventListener('click', () => inp.focus());
  const print = (t) => { out.insertBefore(document.createTextNode(t + '\n'), line); b.scrollTop = b.scrollHeight; };
  const cmds = {
    help: () => 'ls, cat <f>, rm <f>, write <f> <텍스트>, hash <f>, neofetch, clear, lock',
    ls: () => Object.keys(state.files).join('\n') || '(비어 있음)',
    cat: (a) => state.files[a[0]] ?? 'no such file',
    rm: async (a) => (delete state.files[a[0]], await save('삭제 ' + a[0]), '삭제됨'),
    write: async (a) => (state.files[a[0]] = a.slice(1).join(' '), await save('쓰기 ' + a[0]), '저장됨'),
    hash: async (a) => b64(await crypto.subtle.digest('SHA-256', enc.encode(state.files[a[0]] ?? ''))),
    neofetch: () => `Aurora OS 1.0\ncpu cores: ${navigator.hardwareConcurrency}\ncrypto: AES-256-GCM / PBKDF2-600k\nfiles: ${Object.keys(state.files).length}`,
    clear: () => { [...out.childNodes].forEach((n) => n !== line && n.remove()); return ''; },
    lock: () => (showLock(), '')
  };
  inp.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const [c, ...a] = inp.value.trim().split(/\s+/); print('$ ' + inp.value); inp.value = '';
    if (!c) return; const r = cmds[c] ? await cmds[c](a) : c + ': 알 수 없는 명령'; if (r) print(r);
  });
  inp.focus();
}

/* ---------- 앱: 금고(파일) ---------- */
function filesApp(b) {
  let cur = null;
  const list = h('div', { class: 'list' }), ta = h('textarea', { class: 'mono', rows: 10, 'aria-label': '파일 내용' }), name = h('input', { placeholder: '파일 이름', 'aria-label': '파일 이름' });
  const draw = () => { list.replaceChildren(...Object.keys(state.files).map((f) => h('button', { text: f, class: f === cur ? 'sel' : '', on: { click: () => { cur = f; name.value = f; ta.value = state.files[f]; draw(); } } }))); };
  const saveBtn = h('button', { class: 'go', text: '저장', on: { click: async () => { const n = name.value.trim(); if (!n) return; if (cur && cur !== n) delete state.files[cur]; state.files[n] = ta.value; cur = n; await save('저장 ' + n); draw(); } } });
  const del = h('button', { text: '삭제', on: { click: async () => { if (cur) { delete state.files[cur]; await save('삭제 ' + cur); cur = null; name.value = ta.value = ''; draw(); } } } });
  b.append(h('div', { class: 'row' }, h('button', { text: '새 파일', on: { click: () => { cur = null; name.value = ta.value = ''; draw(); name.focus(); } } }), saveBtn, del), list, h('div', { class: 'row' }, name), ta); draw();
}

/* ---------- 앱: 타임 트래블 (새 기능) ---------- */
function timeApp(b) {
  const hist = JSON.parse(LS.get('hist') || '[]');
  const info = h('p'), range = h('input', { type: 'range', min: 0, max: Math.max(0, hist.length - 1), value: hist.length - 1, 'aria-label': '시점 선택' });
  const prev = h('pre', { class: 'mono' });
  const show = async () => { const s = hist[range.value]; if (!s) return; info.textContent = new Date(s.t).toLocaleString('ko-KR') + ' · ' + s.l; const st = await open(s.b); prev.textContent = Object.keys(st.files).join('\n'); };
  range.addEventListener('input', show);
  const go = h('button', { class: 'go', text: '이 시점으로 되돌리기', on: { click: async () => { state = await open(hist[range.value].b); await save('되돌림'); b.replaceChildren(); timeApp(b); } } });
  b.append(h('p', { text: '데스크톱 전체를 과거의 어느 시점으로든 되돌립니다. 모든 스냅샷은 암호화됩니다.' }), range, info, prev, go); show();
}

/* ---------- 앱: 모니터 ---------- */
function monApp(b) {
  const c = h('canvas', { width: 480, height: 90 }), t = h('p', { class: 'mono' }); b.append(c, t);
  const ctx = c.getContext('2d'), pts = []; let last = performance.now(), alive = true;
  const loop = (n) => {
    if (!alive || !c.isConnected) return; const fps = Math.round(1000 / (n - last)); last = n; pts.push(fps); if (pts.length > 120) pts.shift();
    ctx.clearRect(0, 0, 480, 90); ctx.strokeStyle = state.accent; ctx.beginPath(); pts.forEach((v, i) => ctx[i ? 'lineTo' : 'moveTo'](i * 4, 90 - Math.min(v, 120) * .75)); ctx.stroke();
    const m = performance.memory; t.textContent = `FPS ${fps} · 코어 ${navigator.hardwareConcurrency}` + (m ? ` · 메모리 ${(m.usedJSHeapSize / 1048576).toFixed(0)}MB` : '') + ` · 창 ${wins.size}`;
    requestAnimationFrame(loop);
  }; requestAnimationFrame(loop);
}

/* ---------- 앱: 설정 ---------- */
function setApp(b) {
  const col = h('input', { type: 'color', value: state.accent, 'aria-label': '강조 색' });
  col.addEventListener('change', async () => { state.accent = col.value; await save('테마'); });
  const wipe = h('button', { text: '모든 데이터 삭제', on: { click: () => { if (confirm('금고와 기록이 모두 지워집니다. 계속할까요?')) { localStorage.clear(); location.reload(); } } } });
  b.append(h('p', { text: '강조 색' }), col, h('p', { text: '10분간 입력이 없으면 자동으로 잠깁니다.' }), wipe);
}

/* ---------- 작업 표시줄 ---------- */
const APPS = [['term', '터미널', termApp], ['files', '금고', filesApp], ['time', '타임 트래블', timeApp, 440, 360], ['mon', '모니터', monApp, 520, 200], ['set', '설정', setApp, 360, 240]];
function renderBar() {
  const bar = $('#bar'); bar.replaceChildren();
  bar.append(h('div', { class: 'apps' }, ...APPS.map(([id, n, f, w, hh]) => h('button', { text: n, on: { click: () => openWin(id, n, f, w, hh) } }))));
  bar.append(h('div', { class: 'apps' }, ...[...wins].filter(([, v]) => !v.win.hidden || true).map(([id, v]) => h('button', { class: 'tk', text: v.title, on: { click: () => focusWin(id) } }))));
  bar.append(h('div', { class: 'sp' }), h('button', { text: '잠금', on: { click: showLock } }), h('span', { class: 'clk', text: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) }));
}
let idle; const bump = () => { clearTimeout(idle); if (key) idle = setTimeout(showLock, 600000); };
['pointerdown', 'keydown'].forEach((e) => addEventListener(e, bump));
function boot() {
  document.documentElement.style.setProperty('--accent', state.accent);
  $('#lock').hidden = true; $('#desktop').hidden = false; $('#bar').hidden = false; wins.forEach((v) => v.win.remove()); wins.clear();
  renderBar(); openWin('term', '터미널', termApp); bump();
}
if ('serviceWorker' in navigator) { /* 오프라인 지원은 다음 버전 */ }
showLock();
