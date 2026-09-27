'use strict';

const EXAM_DATE = '2026-09-29';
const STORE_KEY = 'jpvocab.v1';

/* ============================================================
 * 유틸
 * ============================================================ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KANJI_RE = /[㐀-鿿々]/;
const KATA_RE = /[ァ-ヺ]/;
const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const toKata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const stripTilde = (s) => s.replace(/[～~〜]/g, '');
const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ja = (s) => `<span lang="ja">${esc(s)}</span>`;

/* ============================================================
 * 단어 데이터 정리
 * ============================================================ */
const WORDS = [];
const WORD_BY_KEY = {};
const SECTIONS = [];
LESSONS.forEach((L, li) => {
  L.sections.forEach((S) => {
    const sec = { id: S.id, lessonId: L.id, lesson: L.title, title: S.title, full: `${L.title} ${S.title}`, keys: [], badge: li };
    S.words.forEach(([jp, kana, ko]) => {
      kana = kana || jp;
      const key = jp + '|' + kana;
      let w = WORD_BY_KEY[key];
      if (!w) {
        w = {
          key, jp, kana, ko,
          answer: stripTilde(kana),
          hasKanji: KANJI_RE.test(jp),
          hasKata: KATA_RE.test(jp),
          secs: [],
        };
        WORD_BY_KEY[key] = w;
        WORDS.push(w);
      }
      w.secs.push(S.id);
      if (!sec.keys.includes(key)) sec.keys.push(key);
    });
    SECTIONS.push(sec);
  });
});
const lessonKeys = (lessonId) => [...new Set(SECTIONS.filter((s) => s.lessonId === lessonId).flatMap((s) => s.keys))];
const ALL_KEYS = WORDS.map((w) => w.key);

/* ============================================================
 * 저장소
 * ============================================================ */
const DEFAULT_SETTINGS = {
  types: { read: true, toJp: true },
  write: 'normal', // normal | more | always
  len: 15,
  sfx: true,
  tts: true,
  goal: 100,
  full: false,
};
let state = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* 무시 */ }
  s = s && typeof s === 'object' ? s : {};
  s.words = s.words || {};
  s.wrong = s.wrong || {};
  s.days = s.days || {};
  s.sessions = s.sessions || [];
  s.xp = s.xp || 0;
  s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings || {});
  s.settings.types = Object.assign({}, DEFAULT_SETTINGS.types, s.settings.types || {});
  // v2: 답하면 단어 읽어주기를 기본으로 켬
  if (!s.settings.v2) { s.settings.tts = true; s.settings.v2 = true; }
  // v3: 홈 화면에 설치한 앱으로 열었으면 전체 화면(아래 검은 내비게이션 바 숨김)을 기본으로 켬
  if (!s.settings.v3) {
    s.settings.full = !!(window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);
    s.settings.v3 = true;
  }
  // v4: 전체 화면 기본값은 다시 끔 (내비게이션 바는 보이게, 원하면 설정에서 켜기)
  if (!s.settings.v4) { s.settings.full = false; s.settings.v4 = true; }
  // v5: 뜻 맞히기(객관식) 제거
  delete s.settings.types.meaning;
  delete s.settings.write;
  if (!s.settings.types.read && !s.settings.types.toJp) s.settings.types = { read: true, toJp: true };
  return s;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { toast('저장 공간에 기록하지 못했어요'); }
}
function today() {
  const k = dayKey();
  return (state.days[k] = state.days[k] || { q: 0, c: 0, xp: 0, t: 0 });
}
function streak() {
  let n = 0;
  const d = new Date();
  if (!(state.days[dayKey(d)] && state.days[dayKey(d)].q)) d.setDate(d.getDate() - 1);
  while (state.days[dayKey(d)] && state.days[dayKey(d)].q) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const lv = (key) => (state.words[key] ? state.words[key].lv : 0);
function mastery(keys) {
  if (!keys.length) return 0;
  return Math.round((keys.reduce((a, k) => a + lv(k), 0) / (keys.length * 5)) * 100);
}

/* ============================================================
 * 문제 생성
 * ============================================================ */
const DAKU = {};
['かが', 'きぎ', 'くぐ', 'けげ', 'こご', 'さざ', 'しじ', 'すず', 'せぜ', 'そぞ', 'ただ', 'てで', 'とど', 'はばぱ', 'ひびぴ', 'ふぶぷ', 'へべぺ', 'ほぼぽ']
  .forEach((g) => [...g].forEach((c) => { DAKU[c] = [...g].filter((x) => x !== c); }));
const SIZE = {};
['やゃ', 'ゆゅ', 'よょ', 'つっ'].forEach(([a, b]) => { SIZE[a] = b; SIZE[b] = a; });
const CONFUSE = {
  シ: 'ツソ', ツ: 'シソ', ソ: 'ンツ', ン: 'ソシ', ク: 'タケ', タ: 'クヌ', ワ: 'ウフ', ウ: 'ワ', ル: 'レ', レ: 'ル',
  チ: 'テ', テ: 'チ', ヌ: 'スメ', ス: 'ヌ', コ: 'ユロ', ユ: 'コ', ロ: 'コ', メ: 'ナヌ', ナ: 'メ', マ: 'ア', ア: 'マ',
  フ: 'ワ', ケ: 'ク', ヲ: 'ラ', ラ: 'ヲ', ホ: 'ポ', ハ: 'バ', ト: 'ド', イ: 'ィ', ー: 'ッ',
  ぬ: 'め', め: 'ぬ', わ: 'ね', ね: 'れわ', れ: 'ね', る: 'ろ', ろ: 'る', は: 'ほ', ほ: 'は', さ: 'ち', ち: 'さ',
  き: 'さ', あ: 'お', お: 'あ', い: 'り', り: 'い', こ: 'に', に: 'こ', う: 'つ', し: 'つ', ま: 'も', も: 'ま',
};
const HIRA_POOL = [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわんがぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽっゃゅょ'];
const KATA_POOL = [...toKata(HIRA_POOL.join('')), 'ー'];

function tileBank(answer) {
  const chars = [...answer];
  const cands = [];
  chars.forEach((c) => {
    const hc = toHira(c);
    const back = (x) => (KATA_RE.test(c) ? toKata(x) : x);
    [...(CONFUSE[c] || '')].forEach((x) => cands.push(x));
    (DAKU[hc] || []).forEach((x) => cands.push(back(x)));
    if (SIZE[hc]) cands.push(back(SIZE[hc]));
  });
  const kataAns = KATA_RE.test(answer);
  if (kataAns && !chars.includes('ー')) cands.push('ー', 'ー');
  if (!kataAns && !chars.includes('う')) cands.push('う');
  const nDis = Math.min(7, Math.max(3, Math.round(chars.length * 0.7)));
  const exclude = new Set(chars);
  const dis = [];
  for (const x of shuffle(cands)) {
    if (dis.length >= nDis) break;
    if (!exclude.has(x) && !dis.includes(x)) dis.push(x);
  }
  const pool = kataAns ? KATA_POOL : HIRA_POOL;
  let guard = 0;
  while (dis.length < nDis && guard++ < 200) {
    const x = pick(pool);
    if (!exclude.has(x) && !dis.includes(x)) dis.push(x);
  }
  return shuffle([...chars, ...dis]).map((ch, id) => ({ id, ch }));
}

// 로마자 → 가나 변환 (일본어 키보드가 없어도 영어 자판으로 입력: hokkaidou → ほっかいどう)
const ROMA = {};
(() => {
  const add = (table) => Object.entries(table).forEach(([k, v]) => { ROMA[k] = v; });
  add({ a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' });
  const rows = {
    k: 'かきくけこ', g: 'がぎぐげご', s: 'さしすせそ', z: 'ざじずぜぞ', t: 'たちつてと', d: 'だぢづでど',
    n: 'なにぬねの', h: 'はひふへほ', b: 'ばびぶべぼ', p: 'ぱぴぷぺぽ', m: 'まみむめも', r: 'らりるれろ',
  };
  Object.entries(rows).forEach(([c, kana]) => [...'aiueo'].forEach((v, n) => { ROMA[c + v] = kana[n]; }));
  // 요음 (きゃ 등)
  const yoon = { k: 'き', g: 'ぎ', s: 'し', z: 'じ', t: 'ち', c: 'ち', d: 'ぢ', n: 'に', h: 'ひ', b: 'び', p: 'ぴ', m: 'み', r: 'り', j: 'じ' };
  Object.entries(yoon).forEach(([c, k]) => {
    ROMA[c + 'ya'] = k + 'ゃ'; ROMA[c + 'yu'] = k + 'ゅ'; ROMA[c + 'yo'] = k + 'ょ';
  });
  add({
    ya: 'や', yu: 'ゆ', yo: 'よ', ye: 'いぇ', wa: 'わ', wo: 'を', wi: 'うぃ', we: 'うぇ',
    shi: 'し', sha: 'しゃ', shu: 'しゅ', sho: 'しょ', she: 'しぇ',
    chi: 'ち', cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', che: 'ちぇ',
    tsu: 'つ', tsa: 'つぁ', fu: 'ふ', fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
    ja: 'じゃ', ji: 'じ', ju: 'じゅ', je: 'じぇ', jo: 'じょ',
    thi: 'てぃ', thu: 'てゅ', dhi: 'でぃ', dhu: 'でゅ', twu: 'とぅ', dwu: 'どぅ',
    va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
    ca: 'か', cu: 'く', co: 'こ', qa: 'くぁ', qi: 'くぃ', qe: 'くぇ', qo: 'くぉ',
  });
  // 작은 글자: x 또는 l (xa→ぁ, xtu→っ, xya→ゃ)
  [['a', 'ぁ'], ['i', 'ぃ'], ['u', 'ぅ'], ['e', 'ぇ'], ['o', 'ぉ'], ['ya', 'ゃ'], ['yu', 'ゅ'], ['yo', 'ょ'], ['tu', 'っ'], ['tsu', 'っ'], ['wa', 'ゎ']]
    .forEach(([k, v]) => { ROMA['x' + k] = v; ROMA['l' + k] = v; });
})();
const ROMA_PREFIX = new Set();
Object.keys(ROMA).forEach((k) => { for (let n = 1; n <= k.length; n++) ROMA_PREFIX.add(k.slice(0, n)); });

// final=false: 입력 중(끝의 n 이나 덜 친 자음은 그대로 둠), final=true: 제출할 때(끝의 n → ん)
function romaToKana(str, kata, final) {
  const src = str.toLowerCase();
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const nx = src[i + 1];
    if (c === '-' ) { out += 'ー'; i++; continue; }
    if (!/[a-z']/.test(c)) { out += str[i]; i++; continue; }         // 가나 등은 그대로
    if (c === 'n') {
      if (nx === undefined) { out += final ? 'ん' : 'n'; i++; continue; }
      if (nx === 'n' || nx === "'") { out += 'ん'; i += 2; continue; }
      if (!/[aiueoy]/.test(nx)) { out += 'ん'; i++; continue; }
    }
    if (c !== 'n' && /[bcdfghjkmpqrstvwxyz]/.test(c) && (nx === c || (c === 't' && nx === 'c'))) {
      out += 'っ'; i++; continue;                                        // 촉음: kka → っか, tch → っち
    }
    let hit = false;
    for (let len = 4; len >= 1; len--) {
      const chunk = src.substr(i, len);
      if (chunk.length === len && ROMA[chunk]) { out += ROMA[chunk]; i += len; hit = true; break; }
    }
    if (hit) continue;
    const rest = src.slice(i);
    if (!final && ROMA_PREFIX.has(rest)) { out += rest; break; }          // 아직 치는 중
    out += str[i]; i++;
  }
  return kata ? toKata(out) : out;
}

// 문제는 모두 직접 쓰기(가나 조립) — 시험 형식:
//   한자 → 히라가나 / 한국어 → 히라가나 / 외래어(한국어) → 가타카나
function typeName(q) {
  if (q.type === 'read') return '한자 → 히라가나';
  return q.w.hasKata ? '외래어 → 가타카나' : '한국어 → 히라가나';
}

function eligibleTypes(w, forced) {
  const t = state.settings.types;
  const allow = (x) => (forced ? forced === x : t[x]);
  const list = [];
  if (allow('read') && w.hasKanji) list.push('read');
  if (allow('toJp')) list.push('toJp');
  if (!list.length) list.push(w.hasKanji && forced === 'read' ? 'read' : 'toJp');
  return list;
}
function chooseType(w, forced) {
  const list = eligibleTypes(w, forced);
  // 외래어는 가타카나 쓰기 위주
  if (w.hasKata && list.includes('toJp') && Math.random() < 0.7) return 'toJp';
  return pick(list);
}

function makeQuestion(w, type) {
  // 가타카나만으로 된 답이면 가타카나로, 그 외엔 히라가나로 자동 변환
  const kata = KATA_RE.test(w.answer) && !/[\u3041-\u3096]/.test(w.answer);
  const q = { w, type, answer: w.answer, mode: 'tiles', kata, tiles: tileBank(w.answer), picked: [] };
  if (type === 'read') {
    q.prompt = w.jp; q.promptLang = 'ja';
    q.label = KATA_RE.test(w.answer) ? '읽는 법을 쓰세요' : '읽는 법을 히라가나로 쓰세요';
  } else {
    q.prompt = w.ko; q.promptLang = 'ko';
    q.label = w.hasKata ? '가타카나로 쓰세요' : '히라가나로 쓰세요';
  }
  q.typed = '';
  return q;
}

/* ============================================================
 * 효과음 / 발음
 * ============================================================ */
let actx = null;
let master = null;
function audio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
    const comp = actx.createDynamicsCompressor();
    master = actx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(actx.destination);
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
// iOS 등은 첫 터치 때 오디오를 깨워야 소리가 나요
['pointerdown', 'touchstart', 'keydown'].forEach((ev) =>
  window.addEventListener(ev, () => {
    if (state.settings.sfx) audio();
    if (state.settings.tts && 'speechSynthesis' in window) {
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { /* 무시 */ }
    }
  }, { once: true, passive: true }));

// 종소리 같은 음 하나: 기본음 + 배음, 빠른 어택 + 자연스러운 감쇠
function tone(freq, at, dur, o = {}) {
  const ctx = actx;
  const t = ctx.currentTime + at;
  const out = ctx.createGain();
  const peak = o.gain ?? 0.22;
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.008));
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = out;
  if (o.lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    out.connect(f);
    node = f;
  }
  node.connect(master);
  (o.partials || [[1, 1]]).forEach(([mul, g]) => {
    const osc = ctx.createOscillator();
    const pg = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq * mul, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(freq * mul * o.slide, t + dur);
    pg.gain.value = g;
    osc.connect(pg).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  });
}
const BELL = [[1, 1], [2, 0.35], [3, 0.12], [4.2, 0.05]];
const SFX = {
  // 정답: 밝게 올라가는 "띠-링"
  right() {
    tone(1046.5, 0, 0.35, { partials: BELL, gain: 0.2 });   // C6
    tone(1568, 0.09, 0.6, { partials: BELL, gain: 0.22 });  // G6
    tone(2093, 0.09, 0.45, { gain: 0.04 });
  },
  // 오답: 낮게 내려가는 "뚱-둥"
  wrong() {
    tone(330, 0, 0.18, { type: 'triangle', gain: 0.28, lowpass: 900, partials: [[1, 1], [2, 0.3]] });
    tone(220, 0.15, 0.32, { type: 'triangle', gain: 0.28, lowpass: 700, partials: [[1, 1], [2, 0.3]], slide: 0.92 });
  },
  // 연속 정답 보너스
  combo() {
    [1318.5, 1568, 2093, 2637].forEach((f, i) => tone(f, 0.28 + i * 0.05, 0.3, { partials: BELL, gain: 0.08 }));
  },
  // 레슨 완료 팡파레
  done() {
    const seq = [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36]];
    seq.forEach(([f, at]) => tone(f, at, 0.3, { type: 'triangle', partials: [[1, 1], [2, 0.25]], gain: 0.18 }));
    [1046.5, 1318.5, 1568].forEach((f) => tone(f, 0.55, 1.1, { partials: BELL, gain: 0.12 }));
  },
  // 글자 타일 누를 때 "톡"
  tap() {
    tone(1400, 0, 0.06, { type: 'triangle', gain: 0.07, slide: 0.6 });
  },
  untap() {
    tone(900, 0, 0.06, { type: 'triangle', gain: 0.06, slide: 0.7 });
  },
  flip() {
    tone(600, 0, 0.12, { type: 'sine', gain: 0.06, slide: 1.8 });
  },
};
function sfx(name) {
  if (!state.settings.sfx) return;
  try { if (audio()) SFX[name](); } catch (e) { /* 무시 */ }
}

/* ============================================================
 * 아이콘 (SVG)
 * ============================================================ */
const ICONS = {
  flame: '<path fill="currentColor" stroke="none" d="M13.2 2.2s.9 3.6-1.7 6.2c-1.4 1.4-2.1-1-2.1-1S6.5 10.3 6.5 14.6A5.5 5.5 0 0 0 12 20.1a5.5 5.5 0 0 0 5.5-5.5c0-5.4-4.3-7.7-4.3-12.4z"/>',
  bolt: '<path fill="currentColor" stroke="none" d="M13.5 2 4.5 13.5h6.5L9.8 22l9.2-12h-6.6z"/>',
  note: '<path fill="currentColor" stroke="none" d="M6 2.5h11a2.5 2.5 0 0 1 2.5 2.5v16.5H7.5A2.5 2.5 0 0 1 5 19V3.5a1 1 0 0 1 1-1z"/><path stroke="#fff" d="M9 7.5h6.5M9 11h4"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  swap: '<path d="M4 8h15l-4-4M20 16H5l4 4"/>',
  home: '<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
  wrong: '<path d="M6 2.5h11a2.5 2.5 0 0 1 2.5 2.5v16.5H7.5A2.5 2.5 0 0 1 5 19V3.5a1 1 0 0 1 1-1z"/><path d="M10 8l4.5 4.5M14.5 8 10 12.5"/>',
  book: '<path d="M2.5 5h6.5a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5h-7zM21.5 5H15a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5h7z"/>',
  chart: '<path d="M5 20V11M12 20V4M19 20v-7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  speaker: '<path fill="currentColor" d="M11 5 6.5 9H3.5v6h3L11 19z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h1M10.5 10h1M14.5 10h1M7.5 14h9"/>',
  tiles: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  star: '<path fill="currentColor" stroke="none" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
  cards: '<rect x="3" y="6" width="13" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/>',
  retry: '<path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5"/>',
};
const ic = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// 단어가 나오는 과/파트 표시
const SEC_BY_ID = {};
SECTIONS.forEach((sec) => { SEC_BY_ID[sec.id] = sec; });
function secLabel(w) {
  return w.secs.map((id) => SEC_BY_ID[id].full).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
}
function lessonTag(w) {
  const lessons = [...new Set(w.secs.map((id) => SEC_BY_ID[id].lesson))];
  return `<span class="ltag" title="${esc(secLabel(w))}">${esc(lessons.join('·'))}</span>`;
}

function speak(text) {
  if (!('speechSynthesis' in window)) { toast('이 브라우저는 발음 듣기를 지원하지 않아요'); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(stripTilde(text));
    u.lang = 'ja-JP';
    u.rate = 0.9;
    const v = speechSynthesis.getVoices().find((x) => /ja[-_]JP/i.test(x.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) { /* 무시 */ }
}

/* ============================================================
 * 화면 전환
 * ============================================================ */
let currentTab = 'home';
let currentView = 'home';
function show(view) {
  currentView = view;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  const isTab = ['home', 'wrong', 'words', 'stats'].includes(view);
  $('#tabbar').classList.toggle('hidden', !isTab);
  if (isTab) {
    currentTab = view;
    $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === view));
    RENDER[view]();
  }
}
function openOverlay(view) {
  history.pushState({ overlay: view }, '');
  show(view);
}
function closeOverlay() {
  if (history.state && history.state.overlay) history.back();
  else { S = null; F = null; show(currentTab); }
}
window.addEventListener('popstate', () => {
  if (!['home', 'wrong', 'words', 'stats'].includes(currentView)) {
    if (S) saveSessionTime();
    S = null; F = null;
    show(currentTab);
  }
});
$$('#tabbar button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ============================================================
 * 퀴즈 세션
 * ============================================================ */
let S = null;

function pickForSession(keys, len) {
  const scored = keys.map((k) => {
    const s = state.words[k];
    let score = Math.random() * 3;
    if (!s) score += 4;
    else score += (5 - s.lv) * 1.5;
    if (state.wrong[k]) score += 4;
    return { k, score };
  });
  return shuffle(scored.sort((a, b) => b.score - a.score).slice(0, len).map((x) => x.k));
}

function startQuiz(keys, opts = {}) {
  const srcKeys = [...new Set(keys)];
  keys = srcKeys.filter((k) => WORD_BY_KEY[k]);
  if (opts.type === 'read') keys = keys.filter((k) => WORD_BY_KEY[k].hasKanji);
  if (opts.type === 'kata') keys = keys.filter((k) => WORD_BY_KEY[k].hasKata);
  if (opts.type === 'hira') keys = keys.filter((k) => !WORD_BY_KEY[k].hasKata);
  if (!keys.length) { toast('풀 단어가 없어요'); return; }
  const len = opts.all ? keys.length : Math.min(keys.length, opts.len || state.settings.len);
  const chosen = opts.all ? shuffle(keys) : pickForSession(keys, len);
  const forced = opts.type === 'kata' || opts.type === 'hira' ? 'toJp' : opts.type;
  const queue = chosen.map((k) => {
    const w = WORD_BY_KEY[k];
    return makeQuestion(w, chooseType(w, forced));
  });
  S = {
    title: opts.title || '연습', opts, srcKeys, queue, idx: 0, total: queue.length, solved: 0,
    firstRight: 0, xp: 0, combo: 0, maxCombo: 0, start: Date.now(), timeSaved: 0,
    wrongKeys: new Set(), graduated: [], answered: false,
  };
  if (currentView === 'result') { history.replaceState({ overlay: 'quiz' }, ''); show('quiz'); }
  else openOverlay('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = S.queue[S.idx];
  S.answered = false;
  $('#q-bar').style.width = (S.solved / S.total) * 100 + '%';
  renderCombo();
  const promptCls = q.promptLang === 'ko' ? 'ko' : [...q.prompt].length > 5 ? 'long' : '';
  let html = `
    <div class="q-meta">
      <span class="lesson-pill">${esc(secLabel(q.w))}</span>
      <span class="q-type ${q.retry ? 'retry' : ''}">${q.retry ? ic('retry') + '다시 한 번 · ' : ''}${typeName(q)}</span>
    </div>
    <div class="q-label">${esc(q.label)}</div>
    <div class="prompt"><div class="t ${promptCls}" ${q.promptLang === 'ja' ? 'lang="ja"' : ''}>${esc(q.prompt)}</div></div>`;
  html += `<div id="tileArea"></div>`;
  $('#q-main').innerHTML = html;
  $('#q-main').scrollTop = 0;
  renderTiles();
  renderFootAsk();
  persistQuiz();
}

function renderTiles() {
  const q = S.queue[S.idx];
  const area = $('#tileArea');
  if (q.kbd) {
    area.innerHTML = `
      <input class="text-answer" id="typed" lang="ja" type="text" inputmode="text" enterkeyhint="done"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        placeholder="${q.kata ? '예) arubaito → アルバイト' : '예) hokkaidou → ほっかいどう'}">
      <div class="conv-preview" id="convPreview" lang="ja"></div>
      <div class="type-hint">
        영어 자판으로 로마자를 치면 ${q.kata ? '<b>가타카나</b>' : '<b>히라가나</b>'}로 바뀌어요 (일본어 키보드도 OK)<br>
        ん = <b>nn</b> · 촉음 っ = 자음 두 번 (<b>tt</b>) · 장음 ー = <b>-</b>${q.kata ? ' · ティ = <b>thi</b> · フィ = <b>fi</b> · ウェ = <b>we</b>' : ' · を = <b>wo</b>'}
      </div>
      <button class="btn ghost small kbd-toggle" id="kbdToggle">${ic('tiles')}글자 타일로 풀기</button>`;
    $('#typed').value = q.typed || '';
    bindTyping(q);
  } else {
    const pickedSet = new Set(q.picked);
    const byId = Object.fromEntries(q.tiles.map((t) => [t.id, t]));
    area.innerHTML = `
      <div class="tile-line" id="tileLine">${q.picked.map((id) => `<button class="tile" data-id="${id}">${esc(byId[id].ch)}</button>`).join('')}</div>
      <div class="bank">${q.tiles.map((t) => `<button class="tile ${pickedSet.has(t.id) ? 'used' : ''}" data-id="${t.id}">${esc(t.ch)}</button>`).join('')}</div>
      <div class="tile-hint">글자를 순서대로 눌러 단어를 만드세요 · 다시 누르면 빠져요</div>
      <button class="btn ghost small kbd-toggle" id="kbdToggle">${ic('keyboard')}키보드로 입력 (로마자 가능)</button>`;
    reserveLine(q);
    $$('#tileLine .tile').forEach((b) => b.addEventListener('click', () => {
      if (S.answered) return;
      q.picked = q.picked.filter((id) => id !== +b.dataset.id);
      sfx('untap');
      renderTiles(); updateCheck();
    }));
    $$('.bank .tile').forEach((b) => b.addEventListener('click', () => {
      if (S.answered) return;
      const id = +b.dataset.id;
      if (!q.picked.includes(id)) q.picked.push(id);
      sfx('tap');
      renderTiles(); updateCheck();
    }));
  }
  $('#kbdToggle').addEventListener('click', () => {
    if (S.answered) return;
    q.kbd = !q.kbd;
    renderTiles(); updateCheck();
  });
}

// 답 칸 높이를 정답 글자 수만큼 미리 확보 → 타일을 눌러도 칸이 늘어나 아래가 밀리지 않음
function reserveLine(q) {
  const line = $('#tileLine');
  const sample = $('.bank .tile');
  if (!line || !sample) return;
  const cs = getComputedStyle(line);
  const gap = parseFloat(cs.columnGap) || 6;
  const rowGap = parseFloat(cs.rowGap) || gap;
  const tw = sample.offsetWidth;
  const th = sample.offsetHeight;
  const perRow = Math.max(1, Math.floor((line.clientWidth + gap) / (tw + gap)));
  const rows = Math.max(1, Math.ceil(Math.max([...q.answer].length, q.picked.length) / perRow));
  const extra = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
  line.style.minHeight = extra + rows * th + (rows - 1) * rowGap + 'px';
}

function bindTyping(q) {
  const inp = $('#typed');
  let composing = false;
  const convert = () => {
    if (S.answered) return;
    const conv = romaToKana(inp.value, q.kata, false);
    if (!composing && conv !== inp.value) {
      inp.value = conv;
      inp.setSelectionRange(conv.length, conv.length);
    }
    q.typed = inp.value;
    // 키보드가 글자를 조합 중일 때도 바뀔 결과를 미리 보여줌
    const final = romaToKana(inp.value, q.kata, true);
    $('#convPreview').textContent = final && final !== inp.value ? '→ ' + final : '';
    updateCheck();
  };
  inp.addEventListener('compositionstart', () => { composing = true; });
  inp.addEventListener('compositionend', () => { composing = false; convert(); });
  inp.addEventListener('input', (e) => { composing = !!e.isComposing; convert(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); onFootPrimary(); }
  });
  inp.focus({ preventScroll: true });
}

function userAnswer(q) {
  if (!q.kbd) {
    const byId = Object.fromEntries(q.tiles.map((t) => [t.id, t.ch]));
    return q.picked.map((id) => byId[id]).join('');
  }
  const v = (q.typed || '').normalize('NFKC').replace(/\s+/g, '');
  return stripTilde(romaToKana(v, q.kata, true));
}
function isCorrect(q, a) {
  if (a === q.answer) return true;
  // ラベンダーばたけ / ごうコン 처럼 히라가나·가타카나가 섞인 답은 글자 종류는 따지지 않음
  const mixed = KATA_RE.test(q.answer) && /[\u3041-\u3096]/.test(q.answer);
  return mixed && toHira(a) === toHira(q.answer);
}
function hasAnswer(q) {
  return userAnswer(q).length > 0;
}
function updateCheck() {
  const b = $('#checkBtn');
  if (b) b.disabled = !hasAnswer(S.queue[S.idx]);
}

function renderFootAsk() {
  // 버튼 줄은 항상 같은 자리에 고정, 정답 안내는 그 위로 올라오는 패널
  const f = $('#q-foot');
  f.className = 'quiz-foot';
  f.innerHTML = `
    <div class="fb-sheet" id="fbSheet"></div>
    <div class="foot-row">
      <button class="btn skip" id="skipBtn">모르겠어요</button>
      <button class="btn primary" id="checkBtn" disabled>확인</button>
    </div>`;
  $('#q-main').style.paddingBottom = '';
  $('#skipBtn').addEventListener('click', () => submit(true));
  $('#checkBtn').addEventListener('click', () => submit(false));
}

function submit(skipped) {
  if (!S || S.answered) return;
  const q = S.queue[S.idx];
  if (!skipped && !hasAnswer(q)) return;
  S.answered = true;
  let ok = false;
  const mine = skipped ? '' : userAnswer(q);
  if (!skipped) ok = isCorrect(q, mine);
  const first = !q.retry;
  const gained = ok ? (first ? 10 : 5) : 0;
  record(q.w, ok, first, gained);

  if (ok) {
    S.solved++;
    S.combo++;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    if (first) S.firstRight++;
    S.xp += gained;
    sfx('right');
    if (S.combo > 0 && S.combo % 5 === 0) sfx('combo');
  } else {
    S.combo = 0;
    S.wrongKeys.add(q.w.key);
    const retry = makeQuestion(q.w, q.type);
    retry.retry = true;
    const pos = Math.min(S.queue.length, S.idx + 3 + Math.floor(Math.random() * 3));
    S.queue.splice(pos, 0, retry);
    sfx('wrong');
  }

  // 정답 표시
  const inp = $('#typed');
  if (inp) {
    inp.value = mine;
    inp.readOnly = true;
    inp.classList.add(ok ? 'right' : 'wrong');
    $('#convPreview').textContent = '';
  }
  const line = $('#tileLine');
  if (line) line.classList.add(ok ? 'right' : 'wrong');
  const main = $('#q-main');
  main.classList.remove('shake', 'pop');
  void main.offsetWidth;
  main.classList.add(ok ? 'pop' : 'shake');
  $('#q-bar').style.width = (S.solved / S.total) * 100 + '%';
  renderCombo();

  const w = q.w;
  const praise = ['훌륭해요!', '정답!', '좋아요!', '완벽해요!', '대단해요!'];
  const f = $('#q-foot');
  f.className = 'quiz-foot ' + (ok ? 'ok' : 'bad');
  f.innerHTML = `
    <div class="fb-sheet feedback" id="fbSheet">
      <div class="fb-head"><span class="ico">${ic(ok ? 'check' : 'x')}</span>${ok ? pick(praise) + (S.combo >= 3 ? ` <small>${S.combo}연속 정답</small>` : '') : skipped ? '정답을 확인하세요' : '오답이에요'}</div>
      <div class="fb-ans">
        ${!ok && mine ? `<div class="fb-mine">내 답: <span lang="ja">${esc(mine)}</span></div>` : ''}
        ${ok ? '' : '<div>정답:</div>'}
        <span class="big" lang="ja">${esc(w.jp)}</span>
        ${w.kana !== w.jp ? `<span lang="ja">【${esc(w.kana)}】</span>` : ''}
        <button class="speak" id="fbSpeak" aria-label="발음 듣기">${ic('speaker')}</button>
        <div>${esc(w.ko)}</div>
        <div class="fb-src">${esc(secLabel(w))}</div>
      </div>
    </div>
    <div class="foot-row">
      <button class="btn ${ok ? 'primary' : 'red'}" id="nextBtn">계속</button>
    </div>`;
  // 패널이 문제를 가리지 않게: 패널 높이만큼 아래 여백을 주고, 정답 표시 부분이 보이게 스크롤
  const sheetH = $('#fbSheet').offsetHeight;
  main.style.paddingBottom = sheetH + 16 + 'px';
  const focusEl = $('#tileLine', main) || $('#typed', main);
  if (focusEl) {
    const mr = main.getBoundingClientRect();
    const er = focusEl.getBoundingClientRect();
    const hidden = er.bottom - (mr.bottom - sheetH - 8);
    if (hidden > 0) main.scrollTop += hidden;
  }
  $('#fbSpeak').addEventListener('click', () => speak(w.kana));
  $('#nextBtn').addEventListener('click', nextQuestion);
  // 효과음이 끝날 즈음 단어 읽어주기
  persistQuiz();
  if (state.settings.tts) { clearTimeout(speakTimer); speakTimer = setTimeout(() => speak(w.kana), state.settings.sfx ? 380 : 0); }
  $('#nextBtn').focus({ preventScroll: true });
}

let speakTimer = null;
function renderCombo() {
  $('#q-combo').innerHTML = S.combo >= 3 ? `${ic('flame')}${S.combo}` : '';
}

function nextQuestion() {
  if (!S) return;
  clearTimeout(speakTimer);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  S.idx++;
  if (S.idx >= S.queue.length) finishQuiz();
  else renderQuestion();
}

function record(w, ok, first, gained) {
  const ws = (state.words[w.key] = state.words[w.key] || { c: 0, w: 0, s: 0, lv: 0, last: 0 });
  ws.last = Date.now();
  const d = today();
  d.q++;
  if (ok) {
    ws.c++; ws.s++;
    if (first) ws.lv = Math.min(5, ws.lv + 1);
    d.c++;
    d.xp += gained;
    state.xp += gained;
    const wn = state.wrong[w.key];
    if (wn && first) {
      wn.fix = (wn.fix || 0) + 1;
      if (wn.fix >= 2) { delete state.wrong[w.key]; S.graduated.push(w); }
    }
  } else {
    ws.w++; ws.s = 0;
    ws.lv = Math.max(0, ws.lv - 2);
    const prev = state.wrong[w.key];
    state.wrong[w.key] = { added: Date.now(), fix: 0, n: ((prev && prev.n) || 0) + 1 };
  }
  save();
}

function saveSessionTime() {
  if (!S) return;
  const secs = Math.round((Date.now() - S.start) / 1000) - S.timeSaved;
  if (secs > 0) { today().t += Math.min(secs, 3600); S.timeSaved += secs; save(); }
  persistQuiz();
}

/* ------------------------------------------------------------
 * 이어서 하기: 진행 중인 퀴즈/플래시카드를 저장해 두고 다시 불러오기
 * ------------------------------------------------------------ */
const RESUME_KEY = 'jpvocab.resume';
function writeResume(data) {
  try { localStorage.setItem(RESUME_KEY, JSON.stringify(data)); } catch (e) { /* 무시 */ }
}
function clearResume() {
  try { localStorage.removeItem(RESUME_KEY); } catch (e) { /* 무시 */ }
}
function loadResume() {
  try {
    const r = JSON.parse(localStorage.getItem(RESUME_KEY));
    if (!r || !Array.isArray(r.queue)) return null;
    const keys = r.kind === 'quiz' ? r.queue.map((q) => q.key) : r.queue;
    if (!keys.length || !keys.every((k) => WORD_BY_KEY[k])) return null;
    return r;
  } catch (e) {
    return null;
  }
}
function persistQuiz() {
  if (!S) return;
  writeResume({
    kind: 'quiz', saved: Date.now(),
    title: S.title, opts: S.opts, srcKeys: S.srcKeys,
    // 답을 확인한 뒤 나갔으면 다음 문제부터
    idx: S.answered ? S.idx + 1 : S.idx,
    total: S.total, solved: S.solved, firstRight: S.firstRight, xp: S.xp,
    combo: S.combo, maxCombo: S.maxCombo,
    elapsed: Date.now() - S.start, timeSaved: S.timeSaved,
    wrongKeys: [...S.wrongKeys], graduated: S.graduated.map((w) => w.key),
    queue: S.queue.map((q) => ({ key: q.w.key, type: q.type, retry: !!q.retry })),
  });
}
function resumeQuiz(r) {
  S = {
    title: r.title, opts: r.opts || {}, srcKeys: r.srcKeys || [],
    queue: r.queue.map((q) => Object.assign(makeQuestion(WORD_BY_KEY[q.key], q.type === 'read' ? 'read' : 'toJp'), { retry: !!q.retry })),
    idx: r.idx, total: r.total, solved: r.solved, firstRight: r.firstRight, xp: r.xp,
    combo: r.combo, maxCombo: r.maxCombo,
    start: Date.now() - r.elapsed, timeSaved: r.timeSaved,
    wrongKeys: new Set(r.wrongKeys), graduated: r.graduated.map((k) => WORD_BY_KEY[k]).filter(Boolean),
    answered: false,
  };
  openOverlay('quiz');
  if (S.idx >= S.queue.length) finishQuiz();
  else renderQuestion();
}
function persistFlash() {
  if (!F) return;
  writeResume({
    kind: 'flash', saved: Date.now(),
    title: F.title, queue: F.queue, idx: F.idx, total: F.total, unknown: [...F.unknown], koFirst: flashKoFirst,
  });
}
function resumeFlash(r) {
  F = { title: r.title, queue: r.queue, idx: r.idx, total: r.total, known: 0, flipped: false, unknown: new Set(r.unknown) };
  flashKoFirst = !!r.koFirst;
  openOverlay('flash');
  renderFlash();
}
function resumeProgress(r) {
  if (r.kind === 'quiz') return { done: r.solved, all: r.total, text: `${r.solved} / ${r.total}문제` };
  const done = Math.min(r.idx, r.total);
  return { done, all: r.queue.length, text: `카드 ${r.idx} / ${r.queue.length}장` };
}
// 앱을 내리거나 닫을 때도 진행 상황 저장
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  if (S) saveSessionTime();
  if (F) persistFlash();
});
window.addEventListener('pagehide', () => { if (S) saveSessionTime(); if (F) persistFlash(); });

function finishQuiz() {
  saveSessionTime();
  clearResume();
  const secs = Math.round((Date.now() - S.start) / 1000);
  const acc = S.total ? Math.round((S.firstRight / S.total) * 100) : 0;
  state.sessions.unshift({ ts: Date.now(), title: S.title, n: S.total, right: S.firstRight, xp: S.xp, secs });
  state.sessions = state.sessions.slice(0, 100);
  save();
  sfx('done');
  const wrongWords = [...S.wrongKeys].map((k) => WORD_BY_KEY[k]);
  const last = S;
  const d = today();
  const heading = acc === 100 ? '완벽해요!' : acc >= 80 ? '레슨 완료!' : acc >= 50 ? '잘했어요!' : '레슨 완료';
  const msg = acc === 100 ? '완벽해요! 전부 한 번에 맞혔어요' : acc >= 80 ? '아주 잘했어요!' : acc >= 50 ? '좋아요, 조금만 더!' : '틀린 단어는 오답노트에 모아 뒀어요';
  $('#result-body').innerHTML = `
    <div class="result-hero">
      <div class="hero-badge ${acc >= 80 ? '' : 'plain'}">${ic('star')}</div>
      <h2>${heading}</h2>
      <p>${esc(last.title)} · ${esc(msg)}</p>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="h">획득 XP</div><div class="v">${last.xp}</div></div>
      <div class="kpi green"><div class="h">정확도</div><div class="v">${acc}%</div></div>
      <div class="kpi blue"><div class="h">시간</div><div class="v">${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</div></div>
    </div>
    <div class="card goal"><span>오늘 목표</span><div class="gbar"><i style="width:${Math.min(100, (d.xp / state.settings.goal) * 100)}%"></i></div><b>${d.xp}/${state.settings.goal} XP</b></div>
    ${last.graduated.length ? `<div class="section-title">오답노트 졸업 (${last.graduated.length})</div>${wordList(last.graduated)}` : ''}
    ${wrongWords.length ? `<div class="section-title">이번에 틀린 단어 (${wrongWords.length})</div>${wordList(wrongWords)}` : ''}
    <div class="mt" style="display:grid;gap:10px;margin-top:20px">
      ${wrongWords.length ? `<button class="btn red" id="rRetryWrong">틀린 단어만 다시 풀기 (${wrongWords.length})</button>` : ''}
      <button class="btn primary" id="rAgain">같은 범위 한 번 더</button>
      <button class="btn" id="rHome">홈으로</button>
    </div>`;
  bindWordList($('#result-body'));
  if (wrongWords.length) $('#rRetryWrong').addEventListener('click', () => startQuiz(wrongWords.map((w) => w.key), { title: '방금 틀린 단어', all: true }));
  $('#rAgain').addEventListener('click', () => startQuiz(last.srcKeys, Object.assign({}, last.opts)));
  $('#rHome').addEventListener('click', closeOverlay);
  S = null;
  show('result');
  $('#result-body').scrollTop = 0;
}

function quitQuiz() {
  const started = S && (S.idx > 0 || S.answered);
  saveSessionTime();
  if (started) toast('저장했어요. 홈에서 이어서 할 수 있어요');
  else clearResume();
  closeOverlay();
}
$('#quitBtn').addEventListener('click', quitQuiz);

// 키보드 단축키 (PC)
document.addEventListener('keydown', (e) => {
  if (currentView === 'quiz' && S) {
    const q = S.queue[S.idx];
    if (e.target && e.target.id === 'typed') return;
    if (e.key === 'Enter') { e.preventDefault(); onFootPrimary(); return; }
    if (!S.answered && !q.kbd && e.key === 'Backspace') { q.picked.pop(); renderTiles(); updateCheck(); }
  } else if (currentView === 'flash' && F) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
    if (e.key === 'ArrowLeft') flashMark(false);
    if (e.key === 'ArrowRight') flashMark(true);
  }
});
function onFootPrimary() {
  if (!S) return;
  if (S.answered) nextQuestion();
  else if (hasAnswer(S.queue[S.idx])) submit(false);
}

/* ============================================================
 * 플래시카드
 * ============================================================ */
let F = null;
let flashKoFirst = false;
function startFlash(keys, title) {
  keys = [...new Set(keys)];
  if (!keys.length) { toast('단어가 없어요'); return; }
  F = { title, queue: shuffle(keys), idx: 0, total: keys.length, known: 0, flipped: false, unknown: new Set() };
  openOverlay('flash');
  renderFlash();
}
function renderFlash() {
  if (F.idx >= F.queue.length) {
    clearResume();
    const n = F.unknown.size;
    $('#f-bar').style.width = '100%';
    $('#f-main').innerHTML = `
      <div class="empty"><b>카드 ${F.total}장 완료!</b>
      <p>${n ? `모르는 단어 ${n}개를 오답노트에 추가했어요.` : '전부 알고 있어요!'}</p></div>
      <div style="display:grid;gap:10px">
        ${n ? `<button class="btn red" id="fQuizUnknown">모르는 단어 퀴즈 풀기</button>` : ''}
        <button class="btn primary" id="fQuizAll">이 범위 퀴즈 풀기</button>
        <button class="btn" id="fHome">닫기</button>
      </div>`;
    const unknown = [...F.unknown];
    const all = [...new Set(F.queue)];
    if (n) $('#fQuizUnknown').addEventListener('click', () => { history.replaceState({ overlay: 'quiz' }, ''); F = null; startQuizReplace(unknown, { title: '모르는 단어', all: true }); });
    $('#fQuizAll').addEventListener('click', () => { history.replaceState({ overlay: 'quiz' }, ''); const t = F.title; F = null; startQuizReplace(all, { title: t }); });
    $('#fHome').addEventListener('click', closeOverlay);
    return;
  }
  persistFlash();
  const w = WORD_BY_KEY[F.queue[F.idx]];
  F.flipped = false;
  $('#f-bar').style.width = (F.idx / F.queue.length) * 100 + '%';
  const src = `<div class="fsrc">${esc(secLabel(w))}</div>`;
  const front = src + (flashKoFirst
    ? `<div class="mid">${esc(w.ko)}</div>`
    : `<div class="big" lang="ja">${esc(w.jp)}</div>`);
  const back = src + `<div class="big" lang="ja">${esc(w.jp)}</div>
      ${w.kana !== w.jp ? `<div class="sub" lang="ja">${esc(w.kana)}</div>` : ''}
      <div class="mid">${esc(w.ko)}</div>`;
  $('#f-main').innerHTML = `
    <div class="note" style="text-align:center">${esc(F.title)} · ${F.idx + 1} / ${F.queue.length}</div>
    <button class="fcard" id="fcard" aria-label="카드 뒤집기">
      <div class="inner">
        <div class="face front">${front}<div class="hint">탭해서 뒤집기</div></div>
        <div class="face back">${back}<div class="hint">탭해서 다시 뒤집기</div></div>
      </div>
    </button>
    <button class="btn ghost small" id="fSpeak" style="margin:0 auto">${ic('speaker')}발음 듣기</button>
    <div class="row">
      <button class="btn red" id="fNo">몰라요</button>
      <button class="btn primary" id="fYes">알아요</button>
    </div>`;
  $('#fcard').addEventListener('click', flipCard);
  $('#fSpeak').addEventListener('click', () => speak(w.kana));
  $('#fNo').addEventListener('click', () => flashMark(false));
  $('#fYes').addEventListener('click', () => flashMark(true));
}
function startQuizReplace(keys, opts) {
  // 플래시카드 화면 → 퀴즈 화면 (히스토리 한 칸 재사용)
  currentView = 'result';
  startQuiz(keys, opts);
}
function flipCard() {
  if (!F || F.idx >= F.queue.length) return;
  F.flipped = !F.flipped;
  sfx('flip');
  $('#fcard').classList.toggle('flipped', F.flipped);
}
function flashMark(known) {
  if (!F || F.idx >= F.queue.length) return;
  const k = F.queue[F.idx];
  sfx(known ? 'right' : 'wrong');
  if (!known) {
    if (!F.unknown.has(k)) {
      F.unknown.add(k);
      const prev = state.wrong[k];
      state.wrong[k] = { added: Date.now(), fix: 0, n: ((prev && prev.n) || 0) + 1 };
      save();
    }
    F.queue.push(k); // 뒤에서 한 번 더
  }
  F.idx++;
  renderFlash();
}
$('#flashQuit').addEventListener('click', () => {
  if (F && F.idx > 0 && F.idx < F.queue.length) { persistFlash(); toast('저장했어요. 홈에서 이어서 할 수 있어요'); }
  else if (F && F.idx === 0) clearResume();
  closeOverlay();
});
$('#flashDir').addEventListener('click', () => {
  flashKoFirst = !flashKoFirst;
  toast(flashKoFirst ? '앞면: 한국어 / 뒷면: 일본어' : '앞면: 일본어 / 뒷면: 뜻');
  if (F) renderFlash();
});

/* ============================================================
 * 공통: 단어 리스트
 * ============================================================ */
function dots(key) {
  const l = lv(key);
  return `<span class="dots">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</span>`;
}
function wordList(words, opt = {}) {
  if (!words.length) return '';
  return `<div class="wlist">${words.map((w) => {
    const s = state.words[w.key];
    const wn = state.wrong[w.key];
    return `
      <div class="witem" data-key="${esc(w.key)}">
        <div class="jp ${opt.hideJp ? 'hide-txt' : ''}"><b lang="ja">${esc(w.jp)}</b>${w.kana !== w.jp ? `<small lang="ja">${esc(w.kana)}</small>` : ''}</div>
        <div class="src">${lessonTag(w)}</div>
        <div class="ko ${opt.hideKo ? 'hide-txt' : ''}">${esc(w.ko)}</div>
        <div class="side">
          ${opt.wrongMode && wn ? `<span class="fix">복습 <b>${wn.fix || 0}</b>/2</span>` : dots(w.key)}
          ${s && s.w ? `<span class="wcount">틀림 ${s.w}</span>` : ''}
        </div>
        ${opt.del ? `<button class="del" data-del="${esc(w.key)}" aria-label="오답노트에서 빼기">${ic('close')}</button>` : ''}
      </div>`;
  }).join('')}</div>`;
}
function bindWordList(root) {
  $$('.witem', root).forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('.del')) return;
    $$('.hide-txt', el).forEach((h) => h.classList.remove('hide-txt'));
    speak(WORD_BY_KEY[el.dataset.key].kana);
  }));
}

/* ============================================================
 * 탭 렌더링
 * ============================================================ */
const BADGES = ['회화', '문법', '연습'];
function examInfo() {
  const [y, m, d] = EXAM_DATE.split('-').map(Number);
  const exam = new Date(y, m - 1, d);
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((exam - t0) / 86400000);
  return diff > 0 ? `D-${diff}` : diff === 0 ? 'D-DAY' : null;
}

const RENDER = {
  home() {
    $('#h-streak').textContent = streak();
    $('#h-xp').textContent = state.xp;
    $('#h-wrong').textContent = Object.keys(state.wrong).length;
    const d = today();
    const dday = examInfo();
    const wrongN = Object.keys(state.wrong).length;
    const learned = ALL_KEYS.filter((k) => lv(k) >= 3).length;
    const resume = loadResume();
    let html = '';
    if (resume) {
      const pr = resumeProgress(resume);
      html += `
      <div class="card resume-card">
        <div class="rc-head"><span class="rc-kind">${resume.kind === 'quiz' ? '퀴즈' : '플래시카드'}</span><b>이어서 하기</b></div>
        <div class="rc-title">${esc(resume.title)}</div>
        <div class="rc-prog"><span class="mini-bar"><i style="width:${pr.all ? (pr.done / pr.all) * 100 : 0}%"></i></span><small>${pr.text}</small></div>
        <div class="row">
          <button class="btn" id="rcDiscard">처음부터</button>
          <button class="btn blue" id="rcGo">이어서 하기</button>
        </div>
      </div>`;
    }
    html += `
      <div class="card exam-card">
        <div class="dday">${dday || '단어퀴즈'}</div>
        <div class="meta">9월 29일(화) 단어퀴즈 · 범위 1–2과 단어 (${ALL_KEYS.length}개)</div>
        <div class="tags"><span>한자 → 히라가나</span><span>한국어 → 히라가나</span><span>외래어 → 가타카나</span></div>
        <button class="btn" id="examBtn">시험 대비 퀴즈 시작</button>
      </div>
      <div class="card goal"><span>오늘</span><div class="gbar"><i style="width:${Math.min(100, (d.xp / state.settings.goal) * 100)}%"></i></div><b>${d.xp}/${state.settings.goal} XP</b></div>
      <div class="note" style="margin:-4px 4px 0">외운 단어 ${learned}/${ALL_KEYS.length} · 오늘 ${d.q}문제</div>

      <div class="section-title">집중 연습</div>
      <div class="drill-grid">
        <button class="drill" data-drill="read"><span class="e" lang="ja">漢</span><b>한자 → 히라가나</b><small>漢字 → かな</small></button>
        <button class="drill" data-drill="hira"><span class="e" lang="ja">あ</span><b>한국어 → 히라가나</b><small>한국어 → かな</small></button>
        <button class="drill" data-drill="kata"><span class="e" lang="ja">カ</span><b>외래어 → 가타카나</b><small>한국어 → カナ</small></button>
      </div>

      <div class="section-title">복습</div>
      <button class="unit" id="wrongUnit">
        <span class="badge b5">${ic('wrong')}</span>
        <span class="info"><b>오답노트 복습</b><small>${wrongN ? `틀린 단어 ${wrongN}개가 기다려요` : '아직 틀린 단어가 없어요'}</small></span>
        <span class="go">›</span>
      </button>
      <button class="unit" id="flashAll">
        <span class="badge b2">${ic('cards')}</span>
        <span class="info"><b>플래시카드로 외우기</b><small>1–2과 전체 단어를 카드로 넘겨보기</small></span>
        <span class="go">›</span>
      </button>`;
    LESSONS.forEach((L) => {
      const lk = lessonKeys(L.id);
      html += `<div class="lesson-head"><h2>${esc(L.title)}</h2><button class="btn small blue" data-lesson="${L.id}">${esc(L.title)} 전체 ▶</button></div>`;
      SECTIONS.filter((s) => s.lessonId === L.id).forEach((s, i) => {
        const m = mastery(s.keys);
        html += `
          <button class="unit" data-sec="${s.id}">
            <span class="badge ${m >= 80 ? 'gold' : 'b' + (i + 1)}">${m >= 80 ? ic('star') : BADGES[i]}</span>
            <span class="info"><b>${esc(s.title)}</b><small>${s.keys.length}단어 · 숙련도 ${m}%</small><span class="mini-bar"><i style="width:${m}%"></i></span></span>
            <span class="go">›</span>
          </button>`;
      });
      html += `<div class="note" style="margin:0 4px">${esc(L.title)} 숙련도 ${mastery(lk)}%</div>`;
    });
    html += `<p class="note" style="text-align:center;margin-top:28px">기록은 이 기기의 브라우저에 저장돼요 · 기록 탭에서 백업할 수 있어요</p>`;
    const body = $('#home-body');
    body.innerHTML = html;
    if (resume) {
      $('#rcGo').addEventListener('click', () => (resume.kind === 'quiz' ? resumeQuiz(resume) : resumeFlash(resume)));
      // 같은 범위를 새로 시작 (지금까지 쌓인 학습 기록은 그대로)
      $('#rcDiscard').addEventListener('click', () => {
        clearResume();
        if (resume.kind === 'quiz') startQuiz(resume.srcKeys, Object.assign({}, resume.opts));
        else startFlash([...new Set(resume.queue)], resume.title);
      });
    }
    $('#examBtn').addEventListener('click', () => startQuiz(ALL_KEYS, { title: '시험 대비 (1–2과)', keys: ALL_KEYS }));
    $$('[data-drill]', body).forEach((b) => b.addEventListener('click', () => {
      const t = b.dataset.drill;
      const title = { read: '한자 → 히라가나', hira: '한국어 → 히라가나', kata: '외래어 → 가타카나' }[t];
      startQuiz(ALL_KEYS, { title, type: t, keys: ALL_KEYS });
    }));
    $('#wrongUnit').addEventListener('click', startWrongReview);
    $('#flashAll').addEventListener('click', () => startFlash(ALL_KEYS, '1–2과 전체'));
    $$('[data-lesson]', body).forEach((b) => b.addEventListener('click', () => {
      const L = LESSONS.find((x) => x.id === b.dataset.lesson);
      const keys = lessonKeys(L.id);
      startQuiz(keys, { title: `${L.title} 전체`, keys });
    }));
    $$('[data-sec]', body).forEach((b) => b.addEventListener('click', () => {
      const s = SECTIONS.find((x) => x.id === b.dataset.sec);
      startQuiz(s.keys, { title: s.full, keys: s.keys });
    }));
  },

  wrong() {
    const keys = Object.keys(state.wrong).filter((k) => WORD_BY_KEY[k])
      .sort((a, b) => (state.wrong[b].n || 0) - (state.wrong[a].n || 0) || state.wrong[b].added - state.wrong[a].added);
    const body = $('#wrong-body');
    if (!keys.length) {
      body.innerHTML = `<div class="empty"><b>오답노트가 비어 있어요</b><p>퀴즈에서 틀리거나 플래시카드에서 “몰라요”를 누른 단어가 여기에 모여요.</p></div>
        <button class="btn primary" id="wGo">퀴즈 풀러 가기</button>`;
      $('#wGo').addEventListener('click', () => show('home'));
      return;
    }
    body.innerHTML = `
      <div class="card" style="text-align:center">
        <div class="wrong-ico">${ic('wrong')}</div>
        <b style="font-size:20px">틀린 단어 ${keys.length}개</b>
        <p class="note" style="margin:4px 0 14px">복습 퀴즈에서 <b>서로 다른 세션에서 2번</b> 한 번에 맞히면 졸업해요</p>
        <div style="display:grid;gap:10px">
          <button class="btn red" id="wStart">오답 복습 시작 (${Math.min(keys.length, 20)}문제)</button>
          <div class="row">
            <button class="btn" id="wAll">전부 풀기</button>
            <button class="btn" id="wFlash">카드로 보기</button>
          </div>
        </div>
      </div>
      <div class="toolbar"><button class="btn small ghost" id="wClear">오답노트 비우기</button></div>
      ${wordList(keys.map((k) => WORD_BY_KEY[k]), { del: true, wrongMode: true })}`;
    bindWordList(body);
    $('#wStart').addEventListener('click', startWrongReview);
    $('#wAll').addEventListener('click', () => startQuiz(keys, { title: '오답노트 전체', all: true, keys }));
    $('#wFlash').addEventListener('click', () => startFlash(keys, '오답노트'));
    $('#wClear').addEventListener('click', () => {
      if (!confirm('오답노트를 모두 비울까요?')) return;
      state.wrong = {}; save(); RENDER.wrong();
    });
    $$('[data-del]', body).forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      delete state.wrong[b.dataset.del]; save(); RENDER.wrong();
      toast('오답노트에서 뺐어요');
    }));
  },

  words() {
    const body = $('#words-body');
    const f = wordsFilter;
    const chips = [{ id: 'all', t: '전체' }, ...SECTIONS.map((s) => ({ id: s.id, t: s.full }))];
    body.innerHTML = `
      <div class="chips">${chips.map((c) => `<button class="chip ${f.sec === c.id ? 'on' : ''}" data-chip="${c.id}">${esc(c.t)}</button>`).join('')}</div>
      <input class="search" id="wSearch" type="search" placeholder="검색 (일본어/한국어)" value="${esc(f.q)}">
      <div class="toolbar">
        <button class="btn small ${f.hideKo ? 'blue' : ''}" id="tKo">${f.hideKo ? '뜻 보이기' : '뜻 가리기'}</button>
        <button class="btn small ${f.hideJp ? 'blue' : ''}" id="tJp">${f.hideJp ? '단어 보이기' : '단어 가리기'}</button>
        <button class="btn small ${f.sort === 'weak' ? 'blue' : ''}" id="tSort">${f.sort === 'weak' ? '약한 순 (켜짐)' : '약한 순'}</button>
      </div>
      <div class="row" style="margin-bottom:14px">
        <button class="btn primary" id="wQuiz">이 범위 퀴즈</button>
        <button class="btn blue" id="wCards">플래시카드</button>
      </div>
      <div id="wListWrap"></div>`;
    const title = () => (f.sec === 'all' ? '1–2과 전체' : SECTIONS.find((x) => x.id === f.sec).full);
    let current = [];
    const renderList = () => {
      const keys = f.sec === 'all' ? ALL_KEYS : SECTIONS.find((s) => s.id === f.sec).keys;
      const q = f.q.trim().toLowerCase();
      let words = keys.map((k) => WORD_BY_KEY[k]);
      if (q) words = words.filter((w) => w.jp.includes(q) || w.kana.includes(q) || w.ko.toLowerCase().includes(q) || toHira(w.kana).includes(toHira(q)));
      if (f.sort === 'weak') words = words.slice().sort((a, b) => lv(a.key) - lv(b.key) || ((state.words[b.key] || {}).w || 0) - ((state.words[a.key] || {}).w || 0));
      current = words.map((w) => w.key);
      const wrap = $('#wListWrap');
      wrap.innerHTML = `<p class="note">${words.length}단어 · 가린 칸은 탭하면 보여요 · 탭하면 발음이 나와요</p>
        ${words.length ? wordList(words, { hideKo: f.hideKo, hideJp: f.hideJp }) : '<div class="empty">검색 결과가 없어요</div>'}`;
      bindWordList(wrap);
    };
    renderList();
    $$('[data-chip]', body).forEach((b) => b.addEventListener('click', () => { f.sec = b.dataset.chip; RENDER.words(); }));
    $('#wSearch').addEventListener('input', (e) => { f.q = e.target.value; renderList(); });
    $('#tKo').addEventListener('click', () => { f.hideKo = !f.hideKo; RENDER.words(); });
    $('#tJp').addEventListener('click', () => { f.hideJp = !f.hideJp; RENDER.words(); });
    $('#tSort').addEventListener('click', () => { f.sort = f.sort === 'weak' ? '' : 'weak'; RENDER.words(); });
    $('#wQuiz').addEventListener('click', () => startQuiz(current, { title: title() }));
    $('#wCards').addEventListener('click', () => startFlash(current, title()));
  },

  stats() {
    const body = $('#stats-body');
    const days = Object.entries(state.days).filter(([, v]) => v.q > 0);
    const totalQ = days.reduce((a, [, v]) => a + v.q, 0);
    const totalC = days.reduce((a, [, v]) => a + v.c, 0);
    const totalT = days.reduce((a, [, v]) => a + (v.t || 0), 0);
    const seen = ALL_KEYS.filter((k) => state.words[k]).length;
    const mastered = ALL_KEYS.filter((k) => lv(k) >= 4).length;

    // 최근 14일
    const cols = [];
    const dd = new Date();
    dd.setDate(dd.getDate() - 13);
    for (let i = 0; i < 14; i++) {
      const k = dayKey(dd);
      cols.push({ k, d: dd.getDate(), v: (state.days[k] && state.days[k].q) || 0, today: i === 13 });
      dd.setDate(dd.getDate() + 1);
    }
    const max = Math.max(10, ...cols.map((c) => c.v));

    const weak = ALL_KEYS.filter((k) => state.words[k] && state.words[k].w > 0)
      .sort((a, b) => state.words[b].w - state.words[a].w || lv(a) - lv(b))
      .slice(0, 10)
      .map((k) => WORD_BY_KEY[k]);

    body.innerHTML = `
      <div class="tiles">
        <div class="stat-tile"><div><b>${streak()}일</b><small>연속 학습</small></div></div>
        <div class="stat-tile"><div><b>${state.xp}</b><small>총 XP</small></div></div>
        <div class="stat-tile"><div><b>${totalQ ? Math.round((totalC / totalQ) * 100) : 0}%</b><small>정답률 (${totalC}/${totalQ})</small></div></div>
        <div class="stat-tile"><div><b>${mastered}/${ALL_KEYS.length}</b><small>마스터한 단어</small></div></div>
        <div class="stat-tile"><div><b>${seen}/${ALL_KEYS.length}</b><small>풀어 본 단어</small></div></div>
        <div class="stat-tile"><div><b>${Math.round(totalT / 60)}분</b><small>총 학습 시간 · ${days.length}일</small></div></div>
      </div>

      <div class="card">
        <b>최근 14일 푼 문제 수</b>
        <div class="chart">${cols.map((c) => `
          <div class="col"><em>${c.v || ''}</em><i class="${c.v ? '' : 'zero'} ${c.today ? 'today' : ''}" style="height:${(c.v / max) * 100}%"></i><span>${c.d}</span></div>`).join('')}
        </div>
        <div class="legend">초록 막대 = 오늘</div>
      </div>

      <div class="card">
        <b style="display:block;margin-bottom:10px">범위별 숙련도</b>
        ${SECTIONS.map((s) => {
          const m = mastery(s.keys);
          return `<div class="sec-row"><div class="l">${esc(s.full)}<span>${m}%</span></div><div class="mini-bar"><i style="width:${m}%"></i></div></div>`;
        }).join('')}
        <p class="note">숙련도: 한 번에 맞히면 +1칸, 틀리면 −2칸 (단어당 최대 5칸)</p>
      </div>

      ${weak.length ? `<div class="section-title">자주 틀린 단어 TOP ${weak.length}</div>${wordList(weak)}
        <button class="btn red mt" id="sWeak">자주 틀린 단어 퀴즈</button>` : ''}

      ${state.sessions.length ? `<div class="section-title">최근 학습</div><div class="card">${state.sessions.slice(0, 10).map((s) => {
        const d = new Date(s.ts);
        return `<div class="hist-item"><div>${esc(s.title)}<br><span>${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span></div><div style="text-align:right">${s.right}/${s.n}<br><span>${s.xp} XP</span></div></div>`;
      }).join('')}</div>` : ''}

      <div class="section-title">백업</div>
      <div class="card">
        <p class="note" style="margin-top:0">기록은 이 브라우저에만 저장돼요. 브라우저 데이터를 지우면 사라지니 가끔 백업하세요.</p>
        <div class="row">
          <button class="btn small" id="bExport">백업 저장</button>
          <button class="btn small" id="bImport">불러오기</button>
        </div>
        <input type="file" id="bFile" accept="application/json,.json" hidden>
        <button class="btn small ghost mt" id="bReset" style="width:100%;color:var(--red)">기록 전체 초기화</button>
      </div>`;
    bindWordList(body);
    if (weak.length) $('#sWeak').addEventListener('click', () => { const k = weak.map((w) => w.key); startQuiz(k, { title: '자주 틀린 단어', all: true, keys: k }); });
    $('#bExport').addEventListener('click', exportData);
    $('#bImport').addEventListener('click', () => $('#bFile').click());
    $('#bFile').addEventListener('change', importData);
    $('#bReset').addEventListener('click', () => {
      if (!confirm('모든 학습 기록을 지울까요? 되돌릴 수 없어요.')) return;
      const settings = state.settings;
      localStorage.removeItem(STORE_KEY);
      state = load();
      state.settings = settings;
      save();
      RENDER.stats();
      toast('기록을 초기화했어요');
    });
  },
};
const wordsFilter = { sec: 'all', q: '', hideKo: false, hideJp: false, sort: '' };

function startWrongReview() {
  const keys = Object.keys(state.wrong).filter((k) => WORD_BY_KEY[k]);
  if (!keys.length) { toast('오답노트가 비어 있어요'); return; }
  startQuiz(keys, { title: '오답노트 복습', len: 20, keys });
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `jp-vocab-backup-${dayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data || typeof data !== 'object' || !data.words) throw new Error('bad');
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      state = load();
      toast('백업을 불러왔어요');
      show(currentTab);
    } catch (err) {
      toast('백업 파일을 읽지 못했어요');
    }
  };
  r.readAsText(file);
  e.target.value = '';
}

/* ============================================================
 * 전체 화면 (안드로이드 아래 내비게이션 바 숨기기)
 * ============================================================ */
const CAN_FULL = !!document.documentElement.requestFullscreen;
function enterFull() {
  if (!CAN_FULL || document.fullscreenElement) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}
function exitFull() {
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}
// 전체 화면은 사용자 터치가 있어야 켤 수 있어서, 켜 둔 경우 터치할 때마다 확인
document.addEventListener('click', () => { if (state.settings.full) enterFull(); }, true);
document.addEventListener('fullscreenchange', () => setTimeout(fitHeight, 100));

/* ============================================================
 * 설정
 * ============================================================ */
function renderSettings() {
  const s = state.settings;
  const seg = (name, opts, cur) => `<div class="seg">${opts.map(([v, t]) => `<button data-set="${name}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  $('#settings-body').innerHTML = `
    <div class="set-group"><b>문제 유형</b>
      <div class="seg">
        <button data-type="read" class="${s.types.read ? 'on' : ''}">한자 → 히라가나</button>
        <button data-type="toJp" class="${s.types.toJp ? 'on' : ''}">한국어 → 가나</button>
      </div>
      <small>모든 문제는 직접 쓰기예요. "한국어 → 가나"는 일반 단어는 히라가나, 외래어는 가타카나로 써요.</small>
    </div>
    <div class="set-group"><b>한 번에 푸는 문제 수</b>
      ${seg('len', [[10, '10'], [15, '15'], [20, '20'], [30, '30']], s.len)}
    </div>
    <div class="set-group"><b>하루 목표</b>
      ${seg('goal', [[50, '50 XP'], [100, '100 XP'], [200, '200 XP'], [300, '300 XP']], s.goal)}
    </div>
    <div class="set-group"><b>소리</b>
      <div class="seg">
        <button data-toggle="sfx" class="${s.sfx ? 'on' : ''}">효과음 ${s.sfx ? 'ON' : 'OFF'}</button>
        <button data-toggle="tts" class="${s.tts ? 'on' : ''}">답하면 단어 읽기 ${s.tts ? 'ON' : 'OFF'}</button>
      </div>
    </div>
    ${CAN_FULL ? `<div class="set-group"><b>전체 화면</b>
      <div class="seg"><button data-toggle="full" class="${s.full ? 'on' : ''}">전체 화면 ${s.full ? 'ON' : 'OFF'}</button></div>
      <small>화면 아래 검은 막대(안드로이드 내비게이션 바)와 위 상태 표시줄을 숨겨요. 켜 두면 앱을 열고 처음 터치할 때 자동으로 전체 화면이 돼요.</small>
    </div>` : ''}`;
  $$('[data-type]', $('#settings-body')).forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.type;
    s.types[t] = !s.types[t];
    if (!s.types.read && !s.types.toJp) { s.types[t] = true; toast('최소 한 가지는 켜야 해요'); }
    save(); renderSettings();
  }));
  $$('[data-set]', $('#settings-body')).forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.v;
    s[b.dataset.set] = /^\d+$/.test(v) ? +v : v;
    save(); renderSettings();
  }));
  $$('[data-toggle]', $('#settings-body')).forEach((b) => b.addEventListener('click', () => {
    s[b.dataset.toggle] = !s[b.dataset.toggle];
    save(); renderSettings();
    if (b.dataset.toggle === 'tts' && s.tts) speak('はい');
    if (b.dataset.toggle === 'full') { if (s.full) enterFull(); else exitFull(); }
  }));
}
$('#settingsBtn').addEventListener('click', () => { renderSettings(); $('#sheet').hidden = false; });
$('#sheetClose').addEventListener('click', () => { $('#sheet').hidden = true; show(currentTab); });
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') { $('#sheet').hidden = true; show(currentTab); } });

/* ============================================================
 * 시작
 * ============================================================ */
$$('[data-ic]').forEach((el) => { el.outerHTML = ic(el.dataset.ic); });

// 화면 높이 = 지금 실제로 보이는 영역 (삼성 인터넷/크롬 아래 툴바, 키보드, 폴더블 화면 전환 대응)
function fitHeight() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-h', Math.round(h) + 'px');
  window.scrollTo(0, 0);
}
fitHeight();
window.addEventListener('resize', fitHeight);
window.addEventListener('orientationchange', () => setTimeout(fitHeight, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitHeight);
if ('speechSynthesis' in window) speechSynthesis.getVoices();
show('home');
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
