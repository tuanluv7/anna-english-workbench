/* ================= 新概念·雅思单词工作台 核心逻辑 ================= */
"use strict";

/* ---------------- 本地存储 ---------------- */
const DB_KEY = "nce_ielts_workbench_v1";
const DEFAULT_SETTINGS = {
  rate: 1, accent: "uk", imgs: true, preload: true, offline: false, cast: false,
  dailyNew: 20, dailyRev: 60, rest: false, night: false, hideLowFreq: false,
  intervals: [5, 30, 720, 1440, 2880, 5760, 10080, 21600, 43200, 86400] // 分钟
};
const IV_LABELS = ["5分钟","30分钟","12小时","1天","2天","4天","7天","15天","30天","60天"];

let DB = loadDB();
function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      d.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
      return Object.assign({ rev:{}, notes:{}, sents:{}, img:{}, fav:[], done:{}, log:{}, ach:{}, tags:[], checkins:{}, myWords:{}, streak:{last:"",days:0} }, d);
    }
  } catch (e) {}
  return { rev:{}, notes:{}, sents:{}, img:{}, fav:[], done:{}, log:{}, ach:{}, tags:["新概念必背","雅思7分写作词","易混淆易错词"], checkins:{}, myWords:{}, streak:{last:"",days:0}, settings: {...DEFAULT_SETTINGS} };
}
function save() { localStorage.setItem(DB_KEY, JSON.stringify(DB)); }

/* ---------------- 工具 ---------------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(t._tm); t._tm = setTimeout(() => t.hidden = true, 2200);
}
function logToday(field, n = 1) {
  const k = todayKey();
  if (!DB.log[k]) DB.log[k] = { add:0, rev:0, ok:0, ng:0, quizOk:0, quizNg:0 };
  DB.log[k][field] = (DB.log[k][field] || 0) + n;
  touchStreak(); save();
}
function touchStreak() {
  const k = todayKey();
  if (DB.streak.last === k) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yk = `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,"0")}-${String(y.getDate()).padStart(2,"0")}`;
  DB.streak.days = (DB.streak.last === yk) ? DB.streak.days + 1 : 1;
  DB.streak.last = k;
  $("#streakChip").textContent = `🔥 连续 ${DB.streak.days} 天`;
  if (DB.streak.days >= 3) unlock("streak3");
  if (DB.streak.days >= 7) unlock("streak7");
}
function fmtAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 60) return m + " 分钟";
  if (m < 1440) return Math.round(m/60) + " 小时";
  return Math.round(m/1440) + " 天";
}

/* ---------------- 成就 ---------------- */
function unlock(id) {
  if (DB.ach[id]) return;
  DB.ach[id] = Date.now(); save();
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (a) toast(`🏅 成就解锁：${a.icon} ${a.name}`);
}
function checkLibAch() {
  const n = Object.keys(DB.rev).length;
  if (n >= 1) unlock("first_word");
  if (n >= 20) unlock("lib20");
  if (n >= 50) unlock("lib50");
  const stars = Object.keys(DB.rev).filter(w => WORDS[w] && WORDS[w].star).length;
  if (stars >= 10) unlock("ielts_star");
  const mastered = Object.values(DB.rev).filter(r => r.mastered).length;
  if (mastered >= 10) unlock("master10");
}

/* ---------------- 语音 TTS ---------------- */
const TTS = {
  loop: false, cur: null,
  speak(text, accent, rate, btn) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = accent === "us" ? "en-US" : "en-GB";
    const vs = speechSynthesis.getVoices().filter(v => v.lang.replace("_","-").startsWith(u.lang));
    if (vs.length) u.voice = vs.find(v => /female|natural|google/i.test(v.name)) || vs[0];
    u.rate = rate || 1;
    this.cur = u;
    if (btn) { btn.classList.add("playing"); }
    u.onend = () => {
      if (btn) btn.classList.remove("playing");
      if (this.loop && this.cur === u) setTimeout(() => this.speak(text, accent, rate, btn), 450);
    };
    speechSynthesis.speak(u);
  },
  stop() { this.loop = false; this.cur = null; speechSynthesis.cancel(); $$(".pron-btn.playing").forEach(b => b.classList.remove("playing")); }
};
if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();

/* ---------------- 复习引擎（艾宾浩斯） ---------------- */
const iv = () => DB.settings.intervals;
function addToReview(w, opts = {}) {
  const now = Date.now();
  if (!DB.rev[w]) {
    const added = Object.values(DB.log[todayKey()] || {}).length ? (DB.log[todayKey()].add || 0) : 0;
    if (added >= DB.settings.dailyNew) { toast(`已达今日新增上限 ${DB.settings.dailyNew} 词，可在设置中调整`); return false; }
    DB.rev[w] = { t0: now, stage: 0, due: now + iv()[0] * 60000, ok: 0, ng: 0, mastered: false, tags: [], last: now };
    logToday("add"); checkLibAch(); save(); updateDueBadge();
    return true;
  } else if (opts.reset) {
    const r = DB.rev[w]; r.mastered = false; r.stage = 0; r.due = now + iv()[0] * 60000; save(); updateDueBadge();
    return true;
  }
  return false;
}
function markMastered(w, val = true) {
  if (!DB.rev[w]) DB.rev[w] = { t0: Date.now(), stage: 0, due: Date.now(), ok: 0, ng: 0, mastered: false, tags: [], last: Date.now() };
  DB.rev[w].mastered = val; save(); checkLibAch(); updateDueBadge();
}
function gradeWord(w, correct) {
  const r = DB.rev[w]; if (!r) return;
  const now = Date.now();
  r.last = now;
  if (correct) {
    r.ok++; r.stage = Math.min(r.stage + 1, iv().length - 1);
    r.due = now + iv()[r.stage] * 60000;
    logToday("ok");
  } else {
    r.ng++; r.stage = 0;
    r.due = now + iv()[0] * 60000; // 重置周期，高频重复
    logToday("ng");
  }
  logToday("rev"); save(); updateDueBadge();
}
function dueWords(tagFilter) {
  if (DB.settings.rest) return [];
  const now = Date.now();
  return Object.entries(DB.rev)
    .filter(([w, r]) => !r.mastered && r.due <= now && WORDS[w])
    .filter(([w, r]) => !tagFilter || (r.tags || []).includes(tagFilter))
    .sort((a, b) => (b[1].ng - a[1].ng) || (a[1].due - b[1].due)) // 错题优先
    .map(([w]) => w);
}
function wrongBook() {
  return Object.entries(DB.rev).filter(([w, r]) => r.ng >= 2 && !r.mastered && WORDS[w])
    .sort((a, b) => b[1].ng - a[1].ng).map(([w]) => w);
}
function updateDueBadge() {
  const n = dueWords().length;
  const b = $("#dueBadge"); b.hidden = n === 0; b.textContent = n;
}

/* ---------------- 导航 ---------------- */
function openMenu() { document.querySelector(".app").classList.add("menu-open"); $("#navOverlay").hidden = false; }
function closeMenu() { document.querySelector(".app").classList.remove("menu-open"); $("#navOverlay").hidden = true; }
function switchPage(page) { const b = $(`.nav-item[data-page="${page}"]`); if (b) b.click(); }
$("#hamburger").onclick = openMenu;
$("#navClose").onclick = closeMenu;
$("#navOverlay").onclick = closeMenu;

$("#mainNav").addEventListener("click", e => {
  const btn = e.target.closest(".nav-item"); if (!btn) return;
  $$(".nav-item").forEach(x => x.classList.toggle("active", x === btn));
  const page = btn.dataset.page;
  $$(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + page));
  TTS.stop();
  if (page === "home") renderHome();
  if (page === "review") renderReview();
  if (page === "library") renderLibrary();
  if (page === "ielts") renderIelts();
  if (page === "dashboard") renderDashboard();
  if (page === "settings") renderSettings();
  closeMenu(); // 手机端选择菜单后自动收起抽屉
});
$("#nightToggle").addEventListener("click", () => {
  DB.settings.night = !DB.settings.night; save(); applyNight();
});
function applyNight() {
  document.body.classList.toggle("dark", DB.settings.night);
  $("#nightToggle").textContent = DB.settings.night ? "☀️ 日间模式" : "🌙 夜间护眼";
}

/* ================= 页面1：章节阅读区 ================= */
let currentChapter = null;
function renderTree() {
  const root = $("#bookTree"); root.innerHTML = "";
  BOOKS.forEach((bk, bi) => {
    const node = document.createElement("div");
    node.className = "book-node" + (bi === 0 ? " open" : "");
    node.innerHTML = `<div class="book-head"><span style="color:${bk.color}">📕</span>
      <div>${esc(bk.name)}<span class="bh-diff">${esc(bk.diff)}</span></div><span class="arrow">▶</span></div>
      <div class="chapter-list">${bk.chapters.map(ch => {
        const done = DB.done[ch.id] && DB.done[ch.id].rewriteDone;
        const fav = DB.fav.includes(ch.id);
        return `<div class="chapter-item" data-ch="${ch.id}">${fav ? "⭐" : "📄"} ${esc(ch.title)}${done ? '<span class="ch-done">✓已仿写</span>' : ""}</div>`;
      }).join("")}</div>`;
    node.querySelector(".book-head").onclick = () => node.classList.toggle("open");
    node.querySelectorAll(".chapter-item").forEach(item => item.onclick = () => openChapter(item.dataset.ch));
    root.appendChild(node);
  });
}
function findChapter(id) {
  for (const bk of BOOKS) for (const ch of bk.chapters) if (ch.id === id) return { bk, ch };
  return null;
}
/* 文章解析：{core} [ext]，支持 {显示|原形} */
function parseArticle(text) {
  return text.replace(/\{([^}]+)\}|\[([^\]]+)\]/g, (m, core, ext) => {
    const raw = core || ext;
    const [disp, base] = raw.includes("|") ? raw.split("|") : [raw, raw.toLowerCase()];
    const key = base.toLowerCase();
    const cls = core ? "w-core" : "w-ext";
    const r = DB.rev[key];
    const dim = r && r.mastered ? " mastered-dim" : "";
    const flag = r && r.mastered ? '<span class="m-flag">💤</span>' : "";
    return `<span class="w ${cls}${dim}" data-w="${esc(key)}">${esc(disp)}${flag}</span>`;
  });
}
function openChapter(chId) {
  const found = findChapter(chId); if (!found) return;
  let { bk, ch } = found;
  const isList = !ch.article && Array.isArray(ch.words);
  if (isList) ch = Object.assign({}, ch, { core: ch.words, ext: [], article: ch.words.map(w => `{${w}}`).join("　") });
  currentChapter = chId;
  $$(".chapter-item").forEach(i => i.classList.toggle("active", i.dataset.ch === chId));
  const panel = $("#articlePanel");
  const fav = DB.fav.includes(chId);
  const doneRec = DB.done[chId] || {};

  /* —— 填空练习自动生成 —— */
  const coreWords = ch.core || [];
  const coreWs = coreWords.map(w => WORDS[w]).filter(Boolean);
  let basicQs, synQs;
  if (isList) {
    basicQs = coreWs.filter(x => x.defs && x.defs[0]).slice(0, 6).map(x => ({ w: x.w, sent: "＿＿＿", hint: x.defs[0].pos + " " + x.defs[0].base }));
    synQs = coreWs.filter(x => x.syn && x.syn.length).slice(0, 4).map(x => ({ w: x.w, syn: x.syn.join(" / "), hint: x.defs[0].pos + " " + x.defs[0].base }));
  } else {
    basicQs = coreWs.filter(x => x.ex && x.ex.toLowerCase().includes(x.w)).slice(0, 5).map(x => ({
      w: x.w, sent: x.ex.replace(new RegExp(x.w, "i"), "＿＿＿"), hint: x.defs[0].base, cn: x.exCn
    }));
    const allWs = [...coreWords, ...(ch.ext||[])].map(w => WORDS[w]).filter(Boolean);
    synQs = allWs.filter(x => x.syn && x.syn.length).slice(0, 5).map(x => ({
      w: x.w, syn: x.syn.join(" / "), hint: x.defs[0].pos + " " + x.defs[0].base
    }));
  }

  panel.innerHTML = `
    <div class="art-head">
      <h2>${esc(ch.title)}</h2>
      <span class="diff-tag">🎯 ${esc(bk.diff)}</span>
    </div>
    <div class="art-tools">
      <button class="tool-btn ${fav ? "on" : ""}" id="favBtn">${fav ? "⭐ 已收藏" : "☆ 收藏文章"}</button>
      <button class="tool-btn" id="readAloudBtn">🔊 全文朗读</button>
      <button class="tool-btn" id="addAllBtn">📥 本章核心词全部加入复习库</button>
    </div>
    <div class="article-body ${isList ? "list-mode" : ""}" id="articleBody">${parseArticle(ch.article)}</div>

    <div class="section-block">
      <h3>📝 课后填空练习 <span class="hint-text">（第1-5题·新概念基础难度，第6-10题·雅思同义替换难度；答错自动加入复习库）</span></h3>
      <div id="quizArea">
        ${basicQs.map((q, i) => `<div class="quiz-item"><span class="q-no">${i+1}.</span> ${esc(q.sent)}
          <input data-ans="${esc(q.w)}" placeholder="填入单词"><span class="hint-text">（${esc(q.hint)}）</span></div>`).join("")}
        ${synQs.map((q, i) => `<div class="quiz-item"><span class="q-no">${i+6}.</span> 雅思同义替换：＿＿＿ ≈ <b>${esc(q.syn)}</b>
          <input data-ans="${esc(q.w)}" placeholder="填入本章单词"><span class="hint-text">（${esc(q.hint)}）</span></div>`).join("")}
      </div>
      <button class="btn btn-primary btn-sm" id="gradeQuizBtn">✅ 提交批改</button>
      <div class="quiz-result" id="quizResult"></div>
    </div>

    <div class="section-block">
      <h3>✍️ 章节仿写任务 <span class="hint-text">（用本章全部核心单词写一段短文，熟练度将同步艾宾浩斯复习周期）</span></h3>
      <div class="pack-words">${coreWords.map(w => `<span class="used-chip" data-uw="${esc(w)}">${esc(w)}</span>`).join("")}</div>
      <textarea class="rewrite-box" id="rewriteBox" placeholder="Write a short passage using all the core words above...">${esc(doneRec.rewriteText || "")}</textarea>
      <div style="margin-top:10px;display:flex;gap:10px;align-items:center">
        <button class="btn btn-ok btn-sm" id="rewriteSaveBtn">💾 提交归档</button>
        <span class="rewrite-status" id="rewriteStatus">${doneRec.rewriteDone ? "✅ 已归档 · 熟练度已同步复习周期" : ""}</span>
      </div>
    </div>`;

  /* 事件绑定 */
  $("#articleBody").addEventListener("click", e => {
    const span = e.target.closest(".w"); if (span) openWordModal(span.dataset.w);
  });
  $("#favBtn").onclick = () => {
    const i = DB.fav.indexOf(chId);
    i >= 0 ? DB.fav.splice(i, 1) : DB.fav.push(chId);
    save(); openChapter(chId); renderTree(); toast(i >= 0 ? "已取消收藏" : "⭐ 文章已收藏");
  };
  $("#readAloudBtn").onclick = () => {
    const plain = isList ? coreWords.join(". ") : ch.article.replace(/\{([^}|]+)(\|[^}]*)?\}/g, "$1").replace(/\[([^\]|]+)(\|[^\]]*)?\]/g, "$1");
    TTS.loop = false; TTS.speak(plain, DB.settings.accent, DB.settings.rate);
    toast("🔊 朗读中…切换页面可停止");
  };
  $("#addAllBtn").onclick = () => {
    let n = 0; coreWords.forEach(w => { if (addToReview(w)) n++; });
    toast(n ? `已加入 ${n} 个核心词到复习库` : "核心词均已在复习库中");
  };
  $("#gradeQuizBtn").onclick = () => {
    let right = 0, total = 0, wrongWs = [];
    $$("#quizArea input").forEach(inp => {
      total++;
      const ok = inp.value.trim().toLowerCase() === inp.dataset.ans.toLowerCase();
      inp.classList.toggle("right", ok); inp.classList.toggle("wrong", !ok);
      let tail = inp.parentElement.querySelector(".ans-show");
      if (!ok) {
        if (!tail) { tail = document.createElement("span"); tail.className = "ans-show"; inp.after(tail); }
        tail.textContent = "→ " + inp.dataset.ans;
        wrongWs.push(inp.dataset.ans); addToReview(inp.dataset.ans, { reset: true });
      } else if (tail) tail.remove();
      logToday(ok ? "quizOk" : "quizNg");
    });
    right = total - wrongWs.length;
    $("#quizResult").innerHTML = `得分 <b style="color:var(--brand)">${right}/${total}</b>${wrongWs.length ? `　❌ 错题已自动加入复习库：${wrongWs.map(esc).join(", ")}` : "　🎉 全对！"}`;
    if (right === total && total > 0) unlock("quiz_perfect");
    if (!DB.done[chId]) DB.done[chId] = {};
    DB.done[chId].quizDone = true; DB.done[chId].quizScore = right + "/" + total; save();
  };
  const checkRewrite = () => {
    const text = ($("#rewriteBox").value || "").toLowerCase();
    let hit = 0;
    $$(".used-chip[data-uw]").forEach(chip => {
      const w = chip.dataset.uw;
      const used = text.includes(w) || text.includes(w.slice(0, -1)); // 容忍词形变化
      chip.classList.toggle("hit", used); if (used) hit++;
    });
    return hit;
  };
  $("#rewriteBox").addEventListener("input", checkRewrite);
  checkRewrite();
  $("#rewriteSaveBtn").onclick = () => {
    const text = $("#rewriteBox").value.trim();
    if (text.split(/\s+/).length < 15) { toast("短文至少 15 个单词哦"); return; }
    const hit = checkRewrite();
    if (!DB.done[chId]) DB.done[chId] = {};
    DB.done[chId].rewriteDone = true; DB.done[chId].rewriteText = text; DB.done[chId].rewriteHit = hit + "/" + ch.core.length;
    /* 熟练度同步：已用到的核心词视为一次答对，推进复习周期 */
    coreWords.forEach(w => {
      if (text.toLowerCase().includes(w) && DB.rev[w] && !DB.rev[w].mastered) gradeWord(w, true);
    });
    save(); unlock("chapter_done"); renderTree();
    $("#rewriteStatus").textContent = `✅ 已归档 · 核心词覆盖 ${hit}/${coreWords.length} · 熟练度已同步复习周期`;
    toast("✍️ 仿写已归档，单词熟练度已更新");
  };
}

/* 全文搜索 */
$("#globalSearch").addEventListener("input", e => {
  const q = e.target.value.trim().toLowerCase();
  $$("#articleBody .w").forEach(s => s.classList.toggle("searched", !!q && s.dataset.w.includes(q)));
  if (!q) return;
  const hits = Object.keys(WORDS).filter(w => w.includes(q) || WORDS[w].defs.some(d => d.base.includes(q)));
  if (hits.length === 1 && hits[0] === q) openWordModal(q);
});

/* ================= 单词弹窗（六模块固定顺序） ================= */
let modalWord = null, imgIdx = 0;
function openWordModal(wkey) {
  const W = WORDS[wkey]; if (!W) return;
  modalWord = wkey; imgIdx = 0;
  const r = DB.rev[wkey];
  const bookName = (BOOKS.find(b => b.id === W.book) || {}).name || "";
  const slides = getSlides(wkey);
  const catNames = { r:"阅读学术", w:"写作逻辑", s:"口语场景", l:"听力场景" };

  $("#wordModal").innerHTML = `
  <div class="wm-top">
    <div class="wm-word-row">
      <span class="wm-word">${esc(W.w)}</span>
      <div class="wm-tags">
        <span class="tag tag-book">${esc(bookName)}</span>
        <span class="tag tag-lv">雅思 ${esc(W.lv)}</span>
        ${W.star ? `<span class="tag tag-star">⭐ 真题高频×${W.freq}</span>` : ""}
        ${(W.cat||[]).map(c => `<span class="tag tag-book">${catNames[c]}</span>`).join("")}
        ${r && r.mastered ? `<span class="tag" style="background:var(--ok-bg);color:var(--ok)">💤 已休眠</span>` : ""}
      </div>
      <button class="wm-close" id="wmClose">✕</button>
    </div>
  </div>

  <div class="wm-module"><div class="wm-mt"><span class="no">1</span>国际音标</div>
    <div class="ipa-row"><span><b>英</b>${esc(W.uk)}</span><span><b>美</b>${esc(W.us)}</span></div>
  </div>

  <div class="wm-module"><div class="wm-mt"><span class="no">2</span>标准发音 · 变速循环</div>
    <div class="pron-row">
      <button class="pron-btn" id="playUK">🇬🇧 英音</button>
      <button class="pron-btn" id="playUS">🇺🇸 美音</button>
      <div class="rate-wrap">语速 <input type="range" id="rateSlider" min="0.75" max="1.5" step="0.25" value="${DB.settings.rate}"><b id="rateVal">${DB.settings.rate}x</b></div>
      <label class="loop-chk"><input type="checkbox" id="loopChk"> 🔁 循环</label>
    </div>
  </div>

  <div class="wm-module"><div class="wm-mt"><span class="no">3</span>完整释义</div>
    ${(W.defs||[]).map(d => `<div class="def-item"><span class="def-pos">${esc(d.pos)}</span>
      <div class="def-lines">
        <div class="dl"><b>基础</b>${esc(d.base)}</div>
        <div class="dl"><b>书面</b>${esc(d.formal)}</div>
        <div class="dl dl-ielts"><b>雅思</b>${esc(d.ielts)}</div>
      </div></div>`).join("")}
  </div>

  <div class="wm-module"><div class="wm-mt"><span class="no">4</span>记忆图片 ${W.defs.length > 1 ? '<span class="hint-text">（多释义多图·左右滑动）</span>' : ""}</div>
    ${DB.settings.imgs ? `
    <div class="img-stage" id="imgStage"></div>
    <div class="img-tools">
      <label class="btn btn-ghost btn-sm">📤 上传本地图片替换<input type="file" id="imgUpload" accept="image/*" hidden></label>
      ${DB.img[wkey] ? '<button class="btn btn-ghost btn-sm" id="imgReset">↩️ 恢复默认图</button>' : ""}
    </div>` : `<div class="hint-text">图片显示已在设置中关闭</div>`}
  </div>

  <div class="wm-module"><div class="wm-mt"><span class="no">5</span>同源词拓展 · 雅思同义替换</div>
    <div class="cog-grid">${(W.cog||[]).map(c => `<span class="cog-chip"><b>${esc(c[0])}</b> ${esc(c[1])}<span>${esc(c[2])}</span></span>`).join("") || '<span class="hint-text">基础词暂无同源拓展</span>'}</div>
    <div class="syn-row">雅思高频同义替换：${(W.syn&&W.syn.length)?W.syn.map(s=>`<span class="syn">${esc(s)}</span>`).join(""):'<span class="hint-text">暂无</span>'}</div>
    <div class="wex-box">✒️ 写作高分例句：${esc(W.wex||"基础词暂无雅思写作例句，可后续补充")}</div>
  </div>

  <div class="wm-module"><div class="wm-mt"><span class="no">6</span>联想记忆卡片</div>
    <div class="mn-card">
      <div class="mn-line"><b>记忆口诀</b>　${esc(W.mn||"（暂无记忆口诀）")}</div>
      ${W.ex ? `<div class="mn-ex">“${esc(W.ex)}”</div><div class="mn-ex-cn">${esc(W.exCn||"")}</div>` : '<div class="hint-text">暂无场景例句</div>'}
      ${parseFloat(W.lv) >= 6.5 ? `<div class="mn-line" style="margin-top:8px"><b>雅思真题语料</b>　<i>${esc(W.wex)}</i></div>` : ""}
    </div>
  </div>

  <div class="wm-actions">
    <div class="wm-main-btns">
      <button class="btn ${r && !r.mastered ? "btn-ghost" : "btn-primary"}" id="btnAddRev">${r && !r.mastered ? "✅ 已在复习库" : "📥 加入复习库"}</button>
      <button class="btn ${r && r.mastered ? "btn-warn" : "btn-ok"}" id="btnMaster">${r && r.mastered ? "🔄 取消休眠·重新学习" : "💤 标记已掌握（休眠）"}</button>
    </div>
    <div class="wm-sub">
      <div class="wm-sub-head">📒 个人笔记 <span class="hint-text">记忆技巧 / 易错点，永久绑定该单词</span></div>
      <textarea id="noteBox" placeholder="写下你的记忆技巧、易错点…">${esc(DB.notes[wkey] || "")}</textarea>
      <div class="sub-foot"><span class="hint-text">${DB.notes[wkey] ? "已保存 ✓" : ""}</span><button class="btn btn-primary btn-sm" id="noteSave">保存笔记</button></div>
    </div>
    <div class="wm-sub">
      <div class="wm-sub-head">✏️ 造句练习 <span class="hint-text">自造英文句子，AI 自动批改常见语法问题</span></div>
      <textarea id="sentBox" placeholder="Use “${esc(W.w)}” to make your own sentence..."></textarea>
      <div class="sub-foot"><span class="hint-text">共 ${(DB.sents[wkey]||[]).length} 条造句记录</span><button class="btn btn-ok btn-sm" id="sentSave">提交批改并保存</button></div>
      <div class="sent-list" id="sentList">${(DB.sents[wkey]||[]).map(s => `<div class="s-item">${esc(s.s)}<span class="s-fb ${s.good?"good":""}">${esc(s.fb)}</span></div>`).join("")}</div>
    </div>
    <div class="wm-sub">
      <div class="wm-sub-head">🏷️ 分组标签</div>
      <div>${DB.tags.map(t => {
        const on = r && (r.tags||[]).includes(t);
        return `<span class="tag-pill ${on?"sel":""}" data-tag="${esc(t)}">${esc(t)}</span>`;
      }).join("")}<span class="tag-pill" id="newTagBtn">＋新建标签</span></div>
    </div>
  </div>`;

  renderImgStage(wkey);
  $("#wordModalMask").hidden = false;

  /* —— 事件 —— */
  $("#wmClose").onclick = closeWordModal;
  const getRate = () => parseFloat($("#rateSlider").value);
  $("#rateSlider").oninput = e => { $("#rateVal").textContent = e.target.value + "x"; };
  $("#loopChk").onchange = e => { TTS.loop = e.target.checked; if (!e.target.checked) TTS.stop(); };
  $("#playUK").onclick = () => { TTS.loop = $("#loopChk").checked; TTS.speak(W.w, "uk", getRate(), $("#playUK")); };
  $("#playUS").onclick = () => { TTS.loop = $("#loopChk").checked; TTS.speak(W.w, "us", getRate(), $("#playUS")); };
  $("#btnAddRev").onclick = () => {
    if (addToReview(wkey, { reset: !!(r && r.mastered) })) { toast(`📥 「${W.w}」已加入复习库，5分钟后进入首轮复习`); openWordModal(wkey); }
    else toast("该词已在复习库中");
  };
  $("#btnMaster").onclick = () => {
    const isM = DB.rev[wkey] && DB.rev[wkey].mastered;
    markMastered(wkey, !isM);
    toast(!isM ? `💤 「${W.w}」已休眠，不再推送复习` : `🔄 「${W.w}」已唤醒，重新进入复习周期`);
    if (!isM === false) addToReview(wkey, { reset: true });
    openWordModal(wkey);
    if (currentChapter) openChapter(currentChapter);
  };
  $("#noteSave").onclick = () => { DB.notes[wkey] = $("#noteBox").value.trim(); save(); toast("📒 笔记已保存并永久绑定"); };
  $("#sentSave").onclick = () => {
    const s = $("#sentBox").value.trim(); if (!s) return;
    const fb = aiCheckSentence(s, W);
    if (!DB.sents[wkey]) DB.sents[wkey] = [];
    DB.sents[wkey].unshift({ s, fb: fb.msg, good: fb.good, t: Date.now() }); save();
    openWordModal(wkey); toast("✏️ 造句已批改并保存");
  };
  if ($("#imgUpload")) $("#imgUpload").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { DB.img[wkey] = [rd.result]; save(); imgIdx = 0; renderImgStage(wkey); toast("🖼️ 已替换为自定义图片"); };
    rd.readAsDataURL(f);
  };
  if ($("#imgReset")) $("#imgReset").onclick = () => { delete DB.img[wkey]; save(); imgIdx = 0; openWordModal(wkey); };
  $$("#wordModal .tag-pill[data-tag]").forEach(p => p.onclick = () => {
    if (!DB.rev[wkey]) { toast("请先加入复习库再打标签"); return; }
    const tags = DB.rev[wkey].tags = DB.rev[wkey].tags || [];
    const i = tags.indexOf(p.dataset.tag);
    i >= 0 ? tags.splice(i, 1) : tags.push(p.dataset.tag);
    save(); openWordModal(wkey);
  });
  $("#newTagBtn").onclick = () => {
    const t = prompt("新标签名称（如：雅思7分写作词）"); if (!t) return;
    if (!DB.tags.includes(t)) DB.tags.push(t); save(); openWordModal(wkey);
  };
}
function getSlides(wkey) {
  const W = WORDS[wkey];
  if (DB.img[wkey]) return DB.img[wkey].map(src => ({ type: "img", src, cap: "自定义图片" }));
  return (W.defs||[]).map(d => ({ type: "emoji", emoji: d.emoji || W.emoji, cap: `${d.pos} ${d.base}` }));
}
function renderImgStage(wkey) {
  const stage = $("#imgStage"); if (!stage) return;
  const slides = getSlides(wkey);
  const s = slides[Math.max(0, Math.min(imgIdx, slides.length - 1))];
  stage.innerHTML = `
    <div class="img-slide">${s.type === "img" ? `<img class="img-real" src="${s.src}">` : `<div class="img-emoji">${s.emoji}</div>`}
      <div class="img-cap">${esc(s.cap)}</div></div>
    ${slides.length > 1 ? `<button class="img-nav img-prev" id="imgPrev">‹</button><button class="img-nav img-next" id="imgNext">›</button>
    <div class="img-dots">${slides.map((_, i) => `<i class="${i === imgIdx ? "on" : ""}"></i>`).join("")}</div>` : ""}`;
  if ($("#imgPrev")) $("#imgPrev").onclick = () => { imgIdx = (imgIdx - 1 + slides.length) % slides.length; renderImgStage(wkey); };
  if ($("#imgNext")) $("#imgNext").onclick = () => { imgIdx = (imgIdx + 1) % slides.length; renderImgStage(wkey); };
}
function closeWordModal() { $("#wordModalMask").hidden = true; TTS.stop(); if (currentChapter) { const q=$("#globalSearch").value; renderTreeSafe(); } }
function renderTreeSafe(){ /* 保持阅读页状态即可 */ }
$("#wordModalMask").addEventListener("click", e => { if (e.target === $("#wordModalMask")) closeWordModal(); });

/* 简易 AI 语法批改（本地规则引擎） */
function aiCheckSentence(s, W) {
  const issues = [];
  const lower = s.toLowerCase();
  const stem = W.w.length > 4 ? W.w.slice(0, -1) : W.w;
  if (!lower.includes(W.w) && !lower.includes(stem)) issues.push(`句中未使用目标词 “${W.w}”`);
  if (!/^[A-Z"']/.test(s.trim())) issues.push("句首应大写");
  if (!/[.!?]["']?$/.test(s.trim())) issues.push("句末缺少标点（. ! ?）");
  if (s.trim().split(/\s+/).length < 4) issues.push("句子过短，建议补充场景细节");
  if (/\bi is\b|\bhe are\b|\bshe are\b|\bthey is\b|\bit are\b/i.test(s)) issues.push("主谓一致错误（如 he are → he is）");
  if (/\ba [aeiou]/i.test(s)) issues.push("元音开头的词前应用 an 而不是 a");
  if (/ {2,}/.test(s)) issues.push("存在多余空格");
  return issues.length
    ? { good: false, msg: "🤖 AI批改：" + issues.join("；") }
    : { good: true, msg: "🤖 AI批改：语法检查通过，表达自然，继续保持！" };
}

/* ================= 页面2：复习中心 ================= */
let reviewMode = "img", reviewTag = "";
function renderReview() {
  const due = dueWords(reviewTag || undefined);
  const allRev = Object.entries(DB.rev).filter(([w]) => WORDS[w]);
  const learning = allRev.filter(([, r]) => !r.mastered).length;
  const mastered = allRev.filter(([, r]) => r.mastered).length;
  const wrongs = wrongBook();
  const tk = DB.log[todayKey()] || {};
  const confPairs = CONFUSABLES.filter(c => c.inLib.some(w => DB.rev[w]) || c.inLib.length === 0);

  $("#reviewRoot").innerHTML = `
  <div class="rv-grid">
    <div class="stat-card hl"><div class="sc-num">${due.length}</div><div class="sc-label">今日待复习单词</div></div>
    <div class="stat-card"><div class="sc-num">${learning}</div><div class="sc-label">复习库学习中</div></div>
    <div class="stat-card"><div class="sc-num" style="color:var(--ok)">${mastered}</div><div class="sc-label">已掌握（休眠）</div></div>
    <div class="stat-card"><div class="sc-num" style="color:var(--danger)">${wrongs.length}</div><div class="sc-label">错题本单词</div></div>
  </div>

  ${DB.settings.rest ? `<div class="panel" style="border-color:var(--warn)"><h3>😴 休息日模式已开启</h3><div class="hint-text">遗忘周期已暂停，学习记录不会丢失。可在「工作台设置」中关闭。</div></div>` : ""}

  <div class="panel">
    <h3>⏳ 艾宾浩斯复习周期 <span class="p-extra">答对→延后周期 · 答错→重置周期高频推送</span></h3>
    <div class="cycle-bar">${IV_LABELS.map((l, i) => `<div class="cycle-step" id="cyc${i}">${l}</div>`).join("")}</div>
    <div class="hint-text">点击下方任意到期单词可查看其所处周期；今日已复习 ${tk.rev || 0} 次，正确率 ${tk.rev ? Math.round((tk.ok || 0) / tk.rev * 100) : 0}%</div>
  </div>

  <div class="panel">
    <h3>🎮 选择复习模式</h3>
    <div class="mode-row">
      <div class="mode-card ${reviewMode === "img" ? "sel" : ""}" data-mode="img"><div class="mc-icon">🖼️</div><div class="mc-name">单词看图认义</div><div class="mc-desc">看图和单词，四选一选释义</div></div>
      <div class="mode-card ${reviewMode === "def" ? "sel" : ""}" data-mode="def"><div class="mc-icon">💡</div><div class="mc-name">释义猜单词</div><div class="mc-desc">看中文释义，默写单词</div></div>
      <div class="mode-card ${reviewMode === "listen" ? "sel" : ""}" data-mode="listen"><div class="mc-icon">🎧</div><div class="mc-name">听音默写单词</div><div class="mc-desc">听发音，拼写单词</div></div>
    </div>
    <div style="margin-top:12px">
      <span class="hint-text">标签分组复习：</span>
      <span class="tag-pill ${!reviewTag ? "sel" : ""}" data-rtag="">全部</span>
      ${DB.tags.map(t => `<span class="tag-pill ${reviewTag === t ? "sel" : ""}" data-rtag="${esc(t)}">${esc(t)}</span>`).join("")}
    </div>
    <div style="margin-top:14px;display:flex;gap:10px;align-items:center">
      <button class="btn btn-primary" id="startReviewBtn">🚀 一键开启批量复习（${Math.min(due.length, DB.settings.dailyRev)} 词）</button>
      <span class="hint-text">每日复习上限 ${DB.settings.dailyRev} 词（设置中可调）· 错题优先推送</span>
    </div>
  </div>

  <div class="panel">
    <h3>📌 到期单词队列 <span class="p-extra">共 ${due.length} 词</span></h3>
    <div class="due-list">${due.slice(0, 12).map(w => {
      const r = DB.rev[w];
      const late = Date.now() - r.due;
      return `<div class="due-item"><span class="d-word" data-dw="${esc(w)}">${esc(w)}</span>
        <span class="d-stage">第 ${r.stage + 1} 轮 · ${IV_LABELS[r.stage]}</span>
        <span class="d-stage">✅${r.ok} ❌${r.ng}</span>
        <span class="d-late">已到期 ${fmtAgo(r.due)}</span>
        ${(r.tags||[]).map(t => `<span class="tag tag-book">${esc(t)}</span>`).join("")}</div>`;
    }).join("") || '<div class="hint-text">暂无到期单词。去「章节阅读区」点击红色单词加入复习库吧！</div>'}
    ${due.length > 12 ? `<div class="hint-text" style="margin-top:6px">…还有 ${due.length - 12} 词，开启批量复习查看全部</div>` : ""}</div>
  </div>

  <div class="panel">
    <h3>🆚 易混淆单词对比复习本 <span class="p-extra">AI 自动识别形近/义近词 · 成对推送</span></h3>
    <div class="conf-grid">${CONFUSABLES.map(c => `
      <div class="conf-card">
        <div class="conf-vs">${esc(c.a)} <span class="vs">VS</span> ${esc(c.b)}</div>
        <div class="conf-m"><b>${esc(c.a)}</b>：${esc(c.am)}<br><b>${esc(c.b)}</b>：${esc(c.bm)}</div>
        <div class="conf-tip">💡 ${esc(c.tip)}</div>
      </div>`).join("")}</div>
  </div>

  <div class="panel">
    <h3>🧯 遗忘错题复盘 <span class="p-extra">多次答错单词 · 每日强制优先复习</span></h3>
    ${wrongs.map(w => {
      const r = DB.rev[w];
      return `<div class="wrong-item"><span class="d-word" data-dw="${esc(w)}" style="font-weight:700;font-family:Georgia,serif;cursor:pointer">${esc(w)}</span>
        <span class="w-cnt">遗忘 ${r.ng} 次</span><span class="hint-text">${esc(WORDS[w].defs[0].base)}</span></div>`;
    }).join("") || '<div class="hint-text">太棒了，暂无高频遗忘单词！</div>'}
    ${wrongs.length ? `<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" id="exportWrongPdf">🖨️ 导出错题本 PDF</button></div>` : ""}
  </div>`;

  $$("#reviewRoot .mode-card").forEach(c => c.onclick = () => { reviewMode = c.dataset.mode; renderReview(); });
  $$("#reviewRoot [data-rtag]").forEach(p => p.onclick = () => { reviewTag = p.dataset.rtag; renderReview(); });
  $$("#reviewRoot [data-dw]").forEach(x => x.onclick = () => openWordModal(x.dataset.dw));
  $("#startReviewBtn").onclick = () => startReviewSession();
  if ($("#exportWrongPdf")) $("#exportWrongPdf").onclick = exportWrongPdf;
}

/* —— 批量复习会话 —— */
let session = null;
function startReviewSession() {
  const queue = dueWords(reviewTag || undefined).slice(0, DB.settings.dailyRev);
  if (!queue.length) { toast("当前没有到期的复习单词"); return; }
  session = { queue, idx: 0, right: 0, wrong: 0 };
  unlock("first_review");
  renderQuizCard();
  $("#quizModalMask").hidden = false;
}
function renderQuizCard() {
  const w = session.queue[session.idx];
  const W = WORDS[w];
  const r = DB.rev[w];
  const prog = Math.round(session.idx / session.queue.length * 100);
  let body = "";
  if (reviewMode === "img") {
    const wrongOpts = Object.keys(WORDS).filter(k => k !== w).sort(() => Math.random() - .5).slice(0, 3);
    const opts = [w, ...wrongOpts].sort(() => Math.random() - .5);
    body = `<div class="qm-stage">
      <div class="qm-emoji">${DB.img[w] ? `<img class="img-real" style="max-height:90px" src="${DB.img[w][0]}">` : (W.defs[0].emoji || W.emoji)}</div>
      <div class="qm-big">${esc(W.w)}</div><div class="qm-sub">这个单词的正确释义是？</div></div>
      <div class="qm-opts">${opts.map(k => `<button class="qm-opt" data-opt="${esc(k)}">${esc(WORDS[k].defs[0].pos)} ${esc(WORDS[k].defs[0].base)}</button>`).join("")}</div>`;
  } else if (reviewMode === "def") {
    body = `<div class="qm-stage"><div class="qm-emoji">💡</div>
      <div class="qm-sub">${W.defs.map(d => `${esc(d.pos)} ${esc(d.base)}`).join("；")}<br>雅思等级 ${W.lv} · 首字母 <b>${W.w[0].toUpperCase()}</b> · ${W.w.length} 个字母</div></div>
      <div class="qm-input-row"><input id="qmInput" placeholder="输入单词拼写" autocomplete="off"><button class="btn btn-primary" id="qmSubmit">提交</button></div>`;
  } else {
    body = `<div class="qm-stage"><div class="qm-emoji">🎧</div>
      <div class="qm-sub">听发音，拼写单词（可反复播放）</div>
      <div style="margin-top:10px"><button class="pron-btn" id="qmPlay">🔊 播放发音</button></div></div>
      <div class="qm-input-row"><input id="qmInput" placeholder="输入你听到的单词" autocomplete="off"><button class="btn btn-primary" id="qmSubmit">提交</button></div>`;
  }
  $("#quizModal").innerHTML = `
    <div class="qm-head"><span>艾宾浩斯复习 · 第 ${session.idx + 1}/${session.queue.length} 词 · 当前第 ${r.stage + 1} 轮</span>
    <button class="wm-close" id="qmClose">✕</button></div>
    <div class="qm-prog"><i style="width:${prog}%"></i></div>
    ${body}<div id="qmFb"></div><div class="qm-foot" id="qmFoot"></div>`;
  $("#qmClose").onclick = endSession;
  if ($("#qmPlay")) { $("#qmPlay").onclick = () => TTS.speak(W.w, DB.settings.accent, DB.settings.rate, $("#qmPlay")); setTimeout(() => TTS.speak(W.w, DB.settings.accent, DB.settings.rate), 300); }
  $$("#quizModal .qm-opt").forEach(b => b.onclick = () => answer(b.dataset.opt === w, b));
  if ($("#qmSubmit")) {
    const doSubmit = () => answer(($("#qmInput").value || "").trim().toLowerCase() === w);
    $("#qmSubmit").onclick = doSubmit;
    $("#qmInput").addEventListener("keydown", e => { if (e.key === "Enter") doSubmit(); });
    $("#qmInput").focus();
  }
}
function answer(correct, optBtn) {
  const w = session.queue[session.idx];
  const W = WORDS[w];
  gradeWord(w, correct);
  correct ? session.right++ : session.wrong++;
  $$("#quizModal .qm-opt").forEach(b => {
    b.disabled = true;
    if (b.dataset.opt === w) b.classList.add("right");
    else if (b === optBtn && !correct) b.classList.add("wrong");
  });
  const r = DB.rev[w];
  $("#qmFb").innerHTML = `<div class="qm-fb ${correct ? "good" : "bad"}">
    ${correct ? `✅ 正确！「${esc(w)}」进入第 ${r.stage + 1} 轮，${IV_LABELS[r.stage]}后再见`
              : `❌ 答错了。正确答案：<b>${esc(w)}</b> ${esc(W.uk)} — ${esc(W.defs[0].base)}<br>周期已重置，将高频重复推送。口诀：${esc(W.mn)}`}</div>`;
  $("#qmFoot").innerHTML = `<button class="btn btn-ghost btn-sm" id="qmDetail">查看词卡</button><button class="btn btn-primary" id="qmNext">${session.idx + 1 >= session.queue.length ? "完成复习" : "下一词 →"}</button>`;
  $("#qmDetail").onclick = () => openWordModal(w);
  $("#qmNext").onclick = () => {
    session.idx++;
    if (session.idx >= session.queue.length) finishSession(); else renderQuizCard();
  };
  TTS.speak(w, DB.settings.accent, DB.settings.rate);
}
function finishSession() {
  const { right, wrong, queue } = session;
  $("#quizModal").innerHTML = `
    <div class="qm-stage"><div class="qm-emoji">${wrong === 0 ? "🎉" : "💪"}</div>
    <div class="qm-big" style="font-family:inherit;font-size:20px">本轮复习完成</div>
    <div class="qm-sub">共 ${queue.length} 词 · 答对 <b style="color:var(--ok)">${right}</b> · 答错 <b style="color:var(--danger)">${wrong}</b> · 正确率 ${Math.round(right / queue.length * 100)}%<br>
    答对的单词已延后周期，答错的单词已重置为 5 分钟后高频推送。</div></div>
    <div class="qm-foot"><button class="btn btn-primary" id="qmDone">返回复习中心</button></div>`;
  $("#qmDone").onclick = endSession;
}
function endSession() { $("#quizModalMask").hidden = true; session = null; TTS.stop(); renderReview(); }

function exportWrongPdf() {
  const ws = wrongBook();
  const win = window.open("", "_blank");
  win.document.write(`<html><head><title>遗忘错题本</title><style>
    body{font-family:"Microsoft YaHei",sans-serif;padding:30px;color:#222}h1{font-size:20px}
    table{width:100%;border-collapse:collapse;margin-top:14px}td,th{border:1px solid #999;padding:8px 10px;font-size:13px;text-align:left}
    th{background:#f0f0f0}</style></head><body>
    <h1>📕 遗忘错题本（${todayKey()}）</h1>
    <table><tr><th>单词</th><th>音标(英)</th><th>释义</th><th>遗忘次数</th><th>记忆口诀</th></tr>
    ${ws.map(w => { const W = WORDS[w], r = DB.rev[w]; return `<tr><td><b>${esc(w)}</b></td><td>${esc(W.uk)}</td><td>${esc(W.defs.map(d => d.pos + d.base).join("；"))}</td><td>${r.ng}</td><td>${esc(W.mn)}</td></tr>`; }).join("")}
    </table><script>window.print()<\/script></body></html>`);
  win.document.close();
}

/* ================= 页面3：单词总库 ================= */
let libSel = new Set();
let libFilters = { book: "", lv: "", status: "", cat: "", q: "", sort: "az" };
function wordStatus(w) {
  const r = DB.rev[w];
  if (!r) return ["new", "未收录"];
  if (r.mastered) return ["mastered", "已掌握💤"];
  if (r.ng >= 2) return ["wrongy", `易错×${r.ng}`];
  return ["learning", `第${r.stage + 1}轮`];
}
function renderLibrary() {
  const f = libFilters;
  let list = Object.keys(WORDS);
  /* 跨册高频词 与 低频冷门词 */
  const highFreq = list.filter(w => WORDS[w].star && WORDS[w].freq >= 9);
  if (DB.settings.hideLowFreq) list = list.filter(w => WORDS[w].star || WORDS[w].freq > 3);
  if (f.book) list = list.filter(w => WORDS[w].book === f.book);
  if (f.lv) list = list.filter(w => parseFloat(WORDS[w].lv) >= parseFloat(f.lv) && parseFloat(WORDS[w].lv) < parseFloat(f.lv) + 1);
  if (f.status) list = list.filter(w => wordStatus(w)[0] === f.status);
  if (f.cat) list = list.filter(w => (WORDS[w].cat || []).includes(f.cat));
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter(w => w.includes(q) || WORDS[w].uk.includes(q) || WORDS[w].defs.some(d => d.base.includes(q) || d.pos.includes(q))); }
  if (f.sort === "az") list.sort();
  if (f.sort === "ng") list.sort((a, b) => ((DB.rev[b] || {}).ng || 0) - ((DB.rev[a] || {}).ng || 0));
  if (f.sort === "date") list.sort((a, b) => ((DB.rev[b] || {}).t0 || 0) - ((DB.rev[a] || {}).t0 || 0));
  if (f.sort === "lv") list.sort((a, b) => parseFloat(WORDS[b].lv) - parseFloat(WORDS[a].lv));

  $("#libraryRoot").innerHTML = `
  <div class="panel">
    <h3>🔁 跨册高频汇总本 <span class="p-extra">新概念反复出现 + 雅思真题高频（freq≥9）自动抓取，避免重复学习</span></h3>
    <div class="cog-grid">${highFreq.map(w => `<span class="cog-chip" style="cursor:pointer" data-hw="${esc(w)}"><b>${esc(w)}</b><span>×${WORDS[w].freq}次 · ${esc(WORDS[w].defs[0].base)}</span></span>`).join("")}</div>
    <div class="hint-text" style="margin-top:6px">💤 冷门低频词（freq≤3 且非星标）可在下方开关一键隐藏，开启「词库轻量化模式」。</div>
    <label class="loop-chk" style="margin-top:6px"><input type="checkbox" id="hideLowChk" ${DB.settings.hideLowFreq ? "checked" : ""}> 隐藏低频冷门词（词库轻量化模式）</label>
  </div>

  <div class="panel">
    <h3>📝 我的单词本 <span class="p-extra">个人生词 · 可新增 / 编辑 / 删除</span></h3>
    <div style="margin-bottom:12px"><button class="btn btn-primary btn-sm" id="addMyWord">➕ 新增我的单词</button></div>
    <div id="myWordsWrap">${myWordsHtml()}</div>
  </div>

  <div class="filter-bar">
    <input type="search" id="libQ" placeholder="🔍 按单词/音标/词性/释义检索" value="${esc(f.q)}">
    <select id="libBook"><option value="">全部册</option>${BOOKS.map(b => `<option value="${b.id}" ${f.book === b.id ? "selected" : ""}>${b.name}</option>`).join("")}</select>
    <select id="libLv"><option value="">雅思分级</option>${["4","5","6","7"].map(l => `<option value="${l}" ${f.lv === l ? "selected" : ""}>${l}.0-${l}.5+</option>`).join("")}</select>
    <select id="libStatus"><option value="">掌握状态</option>
      <option value="new" ${f.status === "new" ? "selected" : ""}>未收录</option>
      <option value="learning" ${f.status === "learning" ? "selected" : ""}>学习中</option>
      <option value="wrongy" ${f.status === "wrongy" ? "selected" : ""}>易错词</option>
      <option value="mastered" ${f.status === "mastered" ? "selected" : ""}>已掌握</option></select>
    <select id="libCat"><option value="">雅思专项</option>
      <option value="r" ${f.cat === "r" ? "selected" : ""}>阅读学术词</option><option value="w" ${f.cat === "w" ? "selected" : ""}>写作逻辑词</option>
      <option value="s" ${f.cat === "s" ? "selected" : ""}>口语场景词</option><option value="l" ${f.cat === "l" ? "selected" : ""}>听力场景词</option></select>
    <select id="libSort"><option value="az" ${f.sort === "az" ? "selected" : ""}>按字母排序</option>
      <option value="ng" ${f.sort === "ng" ? "selected" : ""}>按遗忘次数</option>
      <option value="date" ${f.sort === "date" ? "selected" : ""}>按学习日期</option>
      <option value="lv" ${f.sort === "lv" ? "selected" : ""}>按雅思等级</option></select>
  </div>

  <div class="batch-bar">
    <span class="sel-cnt">已选 <b>${libSel.size}</b> 词</span>
    <button class="btn btn-ghost btn-sm" id="selAll">全选本页</button>
    <button class="btn btn-primary btn-sm" id="batchAdd">📥 批量加入复习库</button>
    <button class="btn btn-ok btn-sm" id="batchMaster">💤 批量标记已掌握</button>
    <button class="btn btn-ghost btn-sm" id="batchTag">🏷️ 批量打标签</button>
    <button class="btn btn-ghost btn-sm" id="expCsv">📊 导出 Excel</button>
    <button class="btn btn-ghost btn-sm" id="expDoc">📄 导出 Word</button>
    <button class="btn btn-ghost btn-sm" id="expPdf">🖨️ 导出 PDF</button>
    <button class="btn btn-ghost btn-sm" style="color:var(--danger)" id="batchDel">🗑️ 移出复习库</button>
  </div>

  <table class="lib-table"><thead><tr>
    <th></th><th>单词</th><th>音标(英/美)</th><th>释义</th><th>册·雅思级</th><th>专项</th><th>状态</th><th>✅/❌</th>
  </tr></thead><tbody>
  ${list.length ? list.map(w => { const W = WORDS[w]; const [sc, st] = wordStatus(w); const r = DB.rev[w];
    return `<tr>
      <td><input type="checkbox" data-cb="${esc(w)}" ${libSel.has(w) ? "checked" : ""}></td>
      <td class="lt-word" data-lw="${esc(w)}">${W.star ? "⭐" : ""}${esc(w)}</td>
      <td class="hint-text">${esc(W.uk)}<br>${esc(W.us)}</td>
      <td>${esc(W.defs.map(d => d.pos + " " + d.base).join("；"))}</td>
      <td class="hint-text">${esc((BOOKS.find(b => b.id === W.book) || {}).name || "")} · ${esc(W.lv)}</td>
      <td class="hint-text">${(W.cat || []).map(c => ({ r:"读", w:"写", s:"说", l:"听" }[c])).join("/")}</td>
      <td><span class="st-chip st-${sc}">${st}</span></td>
      <td class="hint-text">${r ? r.ok + "/" + r.ng : "-"}</td></tr>`; }).join("") : `<tr><td colspan="8"><div class="empty-box"><div class="eb-icon">🔍</div>没有匹配的单词，换个筛选条件或搜索词试试。<div class="eb-btn"><button class="btn btn-ghost btn-sm" id="clearFilter">清空筛选</button></div></div></td></tr>`}
  </tbody></table>
  <div class="hint-text" style="margin-top:8px">共 ${list.length} 词 · 词库分阶段加载：仅当前筛选结果参与渲染</div>`;

  /* 绑定 */
  $("#hideLowChk").onchange = e => { DB.settings.hideLowFreq = e.target.checked; save(); renderLibrary(); };
  $$("#libraryRoot [data-hw]").forEach(x => x.onclick = () => openWordModal(x.dataset.hw));
  $("#libQ").oninput = e => { libFilters.q = e.target.value; renderLibrary(); };
  ["libBook|book", "libLv|lv", "libStatus|status", "libCat|cat", "libSort|sort"].forEach(pair => {
    const [id, key] = pair.split("|");
    $("#" + id).onchange = e => { libFilters[key] = e.target.value; renderLibrary(); };
  });
  $$("#libraryRoot [data-cb]").forEach(cb => cb.onchange = () => { cb.checked ? libSel.add(cb.dataset.cb) : libSel.delete(cb.dataset.cb); $(".sel-cnt b").textContent = libSel.size; });
  $$("#libraryRoot .lt-word").forEach(x => x.onclick = () => openWordModal(x.dataset.lw));
  $("#selAll").onclick = () => { list.forEach(w => libSel.add(w)); renderLibrary(); };
  $("#batchAdd").onclick = () => { let n = 0; libSel.forEach(w => { if (addToReview(w)) n++; }); toast(`批量加入 ${n} 词`); libSel.clear(); renderLibrary(); };
  $("#batchMaster").onclick = () => { libSel.forEach(w => markMastered(w, true)); toast(`批量休眠 ${libSel.size} 词`); libSel.clear(); renderLibrary(); };
  $("#batchTag").onclick = () => {
    const t = prompt("输入标签名（已有：" + DB.tags.join("、") + "）"); if (!t) return;
    if (!DB.tags.includes(t)) DB.tags.push(t);
    libSel.forEach(w => { if (!DB.rev[w]) addToReview(w); if (DB.rev[w]) { DB.rev[w].tags = DB.rev[w].tags || []; if (!DB.rev[w].tags.includes(t)) DB.rev[w].tags.push(t); } });
    save(); toast(`已为 ${libSel.size} 词打上「${t}」标签`); libSel.clear(); renderLibrary();
  };
  $("#batchDel").onclick = () => {
    if (!libSel.size) return;
    if (!confirm(`确认将 ${libSel.size} 个单词移出复习库？学习记录将被删除。`)) return;
    libSel.forEach(w => delete DB.rev[w]); save(); updateDueBadge(); libSel.clear(); renderLibrary(); toast("已移出复习库");
  };
  const pick = () => (libSel.size ? [...libSel] : list);
  $("#expCsv").onclick = () => {
    const rows = [["单词","英式音标","美式音标","释义","册","雅思等级","真题频次","状态","答对","答错"]];
    pick().forEach(w => { const W = WORDS[w], r = DB.rev[w] || {}; rows.push([w, W.uk, W.us, W.defs.map(d => d.pos + d.base).join("；"), (BOOKS.find(b => b.id === W.book) || {}).name, W.lv, W.freq, wordStatus(w)[1], r.ok || 0, r.ng || 0]); });
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadFile(csv, `单词表_${todayKey()}.csv`, "text/csv");
  };
  $("#expDoc").onclick = () => {
    const html = `<html><head><meta charset="utf-8"></head><body><h2>单词表 ${todayKey()}</h2><table border="1" cellpadding="6" style="border-collapse:collapse">
      <tr><th>单词</th><th>音标</th><th>释义</th><th>记忆口诀</th></tr>
      ${pick().map(w => { const W = WORDS[w]; return `<tr><td><b>${esc(w)}</b></td><td>${esc(W.uk)}</td><td>${esc(W.defs.map(d => d.pos + d.base).join("；"))}</td><td>${esc(W.mn)}</td></tr>`; }).join("")}</table></body></html>`;
    downloadFile(html, `单词表_${todayKey()}.doc`, "application/msword");
  };
  $("#expPdf").onclick = () => {
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>单词表</title><style>body{font-family:"Microsoft YaHei";padding:24px}td,th{border:1px solid #888;padding:6px 8px;font-size:12px}table{border-collapse:collapse;width:100%}</style></head><body>
      <h2>单词表（${todayKey()}）</h2><table><tr><th>单词</th><th>音标</th><th>释义</th></tr>
      ${pick().map(w => { const W = WORDS[w]; return `<tr><td><b>${esc(w)}</b></td><td>${esc(W.uk)}</td><td>${esc(W.defs.map(d => d.pos + d.base).join("；"))}</td></tr>`; }).join("")}</table><script>window.print()<\/script></body></html>`);
    win.document.close();
  };
  /* —— 我的单词本 绑定 —— */
  $("#addMyWord").onclick = () => openMyWordModal();
  $$("#myWordsWrap [data-edit]").forEach(b => b.onclick = () => openMyWordModal(b.dataset.edit));
  $$("#myWordsWrap [data-del]").forEach(b => b.onclick = () => {
    if (confirm("确认删除个人单词「" + b.dataset.del + "」？此操作不可恢复。")) { delete DB.myWords[b.dataset.del]; save(); toast("🗑 已删除「" + b.dataset.del + "」"); renderLibrary(); }
  });
  $$("#myWordsWrap [data-rev]").forEach(b => b.onclick = () => { TTS.loop = false; TTS.speak(b.dataset.rev, DB.settings.accent, DB.settings.rate); toast("🔊 朗读：" + b.dataset.rev); });
  const cf = $("#clearFilter"); if (cf) cf.onclick = () => { libFilters = { book: "", lv: "", status: "", cat: "", q: "", sort: "az" }; renderLibrary(); };
}
function downloadFile(content, name, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
  toast("📦 已导出：" + name);
}

/* ================= 页面4：雅思专项 ================= */
let ieltsTab = "r";
function renderIelts() {
  const catNames = { r:"📖 阅读学术词", w:"✒️ 写作逻辑词", s:"🗣️ 口语场景词", l:"🎧 听力场景词" };
  const tabs = [...Object.entries(catNames), ["star", "⭐ 真题高频词"], ["upgrade", "🚀 写作替换词库"], ["speak", "🎤 口语跟读训练"]];
  let body = "";
  if (["r", "w", "s", "l"].includes(ieltsTab)) {
    const list = Object.keys(WORDS).filter(w => (WORDS[w].cat || []).includes(ieltsTab)).sort((a, b) => WORDS[b].freq - WORDS[a].freq);
    body = `<div style="margin-bottom:10px"><button class="btn btn-primary btn-sm" id="catRevBtn">🚀 单独开启本专项复习（加入复习库）</button></div>
      <div class="iw-grid">${list.map(w => { const W = WORDS[w]; return `
      <div class="iw-card" data-iw="${esc(w)}">
        <div class="iw-word">${W.star ? "⭐" : ""}${esc(w)}<span class="freq">真题×${W.freq}</span></div>
        <div class="iw-def">${esc(W.uk)}<br>${esc(W.defs[0].pos)} ${esc(W.defs[0].base)}</div>
      </div>`; }).join("")}</div>`;
  } else if (ieltsTab === "star") {
    const list = Object.keys(WORDS).filter(w => WORDS[w].star).sort((a, b) => WORDS[b].freq - WORDS[a].freq);
    body = `<div class="hint-text" style="margin-bottom:10px">自动匹配单词在雅思真题阅读/听力原文中的出现频次，高频词自动标星、优先推送复习。</div>
      <div class="iw-grid">${list.map(w => { const W = WORDS[w]; return `
      <div class="iw-card" data-iw="${esc(w)}">
        <div class="iw-word">⭐${esc(w)}<span class="freq">真题×${W.freq}</span></div>
        <div class="iw-def">${esc(W.defs[0].pos)} ${esc(W.defs[0].base)} · 雅思${esc(W.lv)}</div>
      </div>`; }).join("")}</div>`;
  } else if (ieltsTab === "upgrade") {
    body = `<div class="panel" style="margin:0"><h3>✒️ 雅思写作加分替换词 <span class="p-extra">替代新概念基础词，快速提升作文用词档次</span></h3>
      <table class="up-table"><tr><td style="color:var(--text3);font-size:12px">基础词（避免）</td><td style="color:var(--text3);font-size:12px">高分替换</td><td style="color:var(--text3);font-size:12px">示例搭配</td></tr>
      ${WRITING_UPGRADES.map(u => `<tr><td class="u-basic">${esc(u.basic)}</td><td class="u-up" ${u.inLib ? `data-iw="${esc(u.inLib)}"` : ""}>${esc(u.up)}</td><td class="hint-text">${esc(u.note)}</td></tr>`).join("")}</table></div>`;
  } else {
    body = SPEAKING_PACKS.map((p, pi) => `
      <div class="panel speak-pack"><h3>💬 ${esc(p.topic)} <span class="p-extra">新概念生活词 + 雅思口语话题词</span></h3>
        <div class="pack-words">${p.words.map(w => `<span class="cog-chip" style="cursor:pointer" data-iw="${esc(w)}"><b>${esc(w)}</b></span>`).join("")}</div>
        <div class="speak-dialog">${esc(p.dialog)}</div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" data-play="${pi}">🔊 整段跟读播放</button>
          <button class="btn btn-ghost btn-sm" data-rec="${pi}">🎙️ 录音对比发音</button>
          <span class="hint-text" id="recHint${pi}"></span>
        </div><audio id="recAudio${pi}" controls hidden style="margin-top:8px;width:100%"></audio></div>`).join("");
  }
  $("#ieltsRoot").innerHTML = `<div class="ielts-tabs">${tabs.map(([k, n]) => `<button class="itab ${ieltsTab === k ? "on" : ""}" data-tab="${k}">${n}</button>`).join("")}</div>${body}`;
  $$("#ieltsRoot .itab").forEach(t => t.onclick = () => { ieltsTab = t.dataset.tab; TTS.stop(); renderIelts(); });
  $$("#ieltsRoot [data-iw]").forEach(x => x.onclick = () => openWordModal(x.dataset.iw));
  if ($("#catRevBtn")) $("#catRevBtn").onclick = () => {
    const list = Object.keys(WORDS).filter(w => (WORDS[w].cat || []).includes(ieltsTab));
    let n = 0; list.forEach(w => { if (addToReview(w)) n++; });
    toast(n ? `已将 ${n} 个专项词加入复习库` : "专项词已全部在复习库中（或达今日上限）");
  };
  $$("#ieltsRoot [data-play]").forEach(b => b.onclick = () => {
    const p = SPEAKING_PACKS[+b.dataset.play];
    TTS.loop = false; TTS.speak(p.dialog.replace(/^[AB]: /gm, ""), DB.settings.accent, Math.min(DB.settings.rate, 1));
  });
  $$("#ieltsRoot [data-rec]").forEach(b => b.onclick = async () => {
    const pi = b.dataset.rec, hint = $("#recHint" + pi), audio = $("#recAudio" + pi);
    if (b._recorder && b._recorder.state === "recording") { b._recorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream); const chunks = [];
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => {
        audio.src = URL.createObjectURL(new Blob(chunks)); audio.hidden = false;
        hint.textContent = "✅ 录音完成，播放对比标准发音"; b.textContent = "🎙️ 录音对比发音";
        stream.getTracks().forEach(t => t.stop());
      };
      rec.start(); b._recorder = rec; b.textContent = "⏹️ 停止录音"; hint.textContent = "🔴 录音中…再次点击停止";
    } catch (err) { hint.textContent = "⚠️ 无法访问麦克风：" + err.message; }
  });
}

/* ================= 页面5：学习数据看板 ================= */
function renderDashboard() {
  const totalCh = BOOKS.reduce((s, b) => s + b.chapters.length, 0);
  const doneCh = Object.values(DB.done).filter(d => d.rewriteDone).length;
  const starWords = Object.keys(WORDS).filter(w => WORDS[w].star);
  const starGot = starWords.filter(w => DB.rev[w] && (DB.rev[w].mastered || DB.rev[w].stage >= 3)).length;
  const allRev = Object.entries(DB.rev).filter(([w]) => WORDS[w]);
  const totOk = allRev.reduce((s, [, r]) => s + r.ok, 0), totNg = allRev.reduce((s, [, r]) => s + r.ng, 0);
  const forgetRate = totOk + totNg ? Math.round(totNg / (totOk + totNg) * 100) : 0;
  const avgRev = allRev.length ? ((totOk + totNg) / allRev.length).toFixed(1) : 0;

  /* 近7日柱状数据 */
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const l = DB.log[k] || {};
    days.push({ label: `${d.getMonth()+1}/${d.getDate()}`, add: l.add || 0, rev: l.rev || 0, ok: l.ok || 0 });
  }
  const maxAdd = Math.max(1, ...days.map(d => d.add)), maxRev = Math.max(1, ...days.map(d => d.rev));
  const tk = DB.log[todayKey()] || {};
  const memMinutes = Math.round(((tk.rev || 0) * 0.5 + (tk.add || 0) * 1.2) * 10) / 10;
  const rank = allRev.filter(([, r]) => r.ng > 0).sort((a, b) => b[1].ng - a[1].ng).slice(0, 8);

  /* 周报 */
  const wAdd = days.reduce((s, d) => s + d.add, 0), wRev = days.reduce((s, d) => s + d.rev, 0), wOk = days.reduce((s, d) => s + d.ok, 0);
  const weakCats = {};
  rank.forEach(([w]) => (WORDS[w].cat || []).forEach(c => weakCats[c] = (weakCats[c] || 0) + 1));
  const weakest = Object.entries(weakCats).sort((a, b) => b[1] - a[1])[0];
  const catN = { r:"阅读学术词", w:"写作逻辑词", s:"口语场景词", l:"听力场景词" };

  $("#dashRoot").innerHTML = `
  <div class="panel">
    <h3>🛤️ 双路线学习进度</h3>
    <div class="prog-row"><div class="prog-label"><span>📕 新概念全册完成进度（按章节仿写归档）</span><b>${doneCh}/${totalCh} 章</b></div>
      <div class="prog-track"><div class="prog-fill" style="width:${Math.round(doneCh / totalCh * 100)}%"></div></div></div>
    <div class="prog-row"><div class="prog-label"><span>🎯 雅思核心词掌握进度（星标词达第4轮+）</span><b>${starGot}/${starWords.length} 词</b></div>
      <div class="prog-track"><div class="prog-fill green" style="width:${Math.round(starGot / Math.max(1, starWords.length) * 100)}%"></div></div></div>
  </div>

  <div class="dash-grid">
    <div class="panel"><h3>📈 每日新增背诵量（近7日）</h3>
      <div class="bar-chart">${days.map(d => `<div class="bar-col"><span class="b-num">${d.add}</span><div class="bar" style="height:${d.add / maxAdd * 80}%"></div><span class="b-label">${d.label}</span></div>`).join("")}</div></div>
    <div class="panel"><h3>🔄 每日复习完成量（近7日）</h3>
      <div class="bar-chart">${days.map(d => `<div class="bar-col"><span class="b-num">${d.rev}</span><div class="bar g" style="height:${d.rev / maxRev * 80}%"></div><span class="b-label">${d.label}</span></div>`).join("")}</div></div>
  </div>

  <div class="rv-grid">
    <div class="stat-card"><div class="sc-num" style="color:var(--danger)">${forgetRate}%</div><div class="sc-label">单词遗忘率</div></div>
    <div class="stat-card"><div class="sc-num">${avgRev}</div><div class="sc-label">平均复习次数/词</div></div>
    <div class="stat-card"><div class="sc-num" style="color:var(--ok)">${memMinutes}</div><div class="sc-label">今日有效记忆时长(分钟)</div></div>
    <div class="stat-card"><div class="sc-num" style="color:var(--warn)">${tk.rev ? Math.round((tk.ok || 0) / tk.rev * 100) : 0}%</div><div class="sc-label">今日复习正确率</div></div>
  </div>

  <div class="dash-grid">
    <div class="panel"><h3>🏆 遗忘错题单词排行</h3>
      ${rank.map(([w, r], i) => `<div class="rank-item"><span class="r-no">${i + 1}</span><b style="font-family:Georgia,serif;cursor:pointer" data-dw="${esc(w)}">${esc(w)}</b>
        <span class="hint-text">${esc(WORDS[w].defs[0].base)}</span><span style="margin-left:auto;color:var(--danger);font-size:12px">遗忘${r.ng}次</span></div>`).join("") || '<div class="hint-text">暂无遗忘记录</div>'}</div>
    <div class="panel"><h3>📋 本周学习报告 <span class="p-extra">自动生成</span></h3>
      <div class="report-box">
        📆 近 7 日共新增 <b>${wAdd}</b> 词、完成复习 <b>${wRev}</b> 次，复习正确率 <b>${wRev ? Math.round(wOk / wRev * 100) : 0}%</b>。<br>
        🔥 当前连续打卡 <b>${DB.streak.days}</b> 天，复习库累计 <b>${allRev.length}</b> 词，已休眠 <b>${allRev.filter(([, r]) => r.mastered).length}</b> 词。<br>
        ${weakest ? `⚠️ 薄弱板块分析：错题集中在 <b>${catN[weakest[0]]}</b>（${weakest[1]} 个高频遗忘词），建议在「雅思专项」中开启该专项复习。` : "✅ 暂无明显薄弱板块，保持当前节奏！"}<br>
        💡 明日建议：优先清空错题本，再学习新章节；答错词将以 5 分钟为起点高频重复。
      </div></div>
  </div>

  <div class="panel"><h3>🎖️ 学习成就打卡</h3>
    <div class="ach-grid">${ACHIEVEMENTS.map(a => `<div class="ach-card ${DB.ach[a.id] ? "got" : ""}"><div class="a-icon">${a.icon}</div><div class="a-name">${a.name}</div><div class="a-desc">${a.desc}</div></div>`).join("")}</div></div>`;
  $$("#dashRoot [data-dw]").forEach(x => x.onclick = () => openWordModal(x.dataset.dw));
}

/* ================= 页面6：工作台设置 ================= */
function renderSettings() {
  const s = DB.settings;
  $("#settingsRoot").innerHTML = `
  <div class="set-grid">
    <div class="panel"><h3>🔊 发音与显示</h3>
      <div class="set-row"><span class="s-label">默认发音语速<span class="s-hint">0.75x - 1.5x</span></span>
        <select id="setRate">${[0.75, 1, 1.25, 1.5].map(r => `<option value="${r}" ${s.rate == r ? "selected" : ""}>${r}x</option>`).join("")}</select></div>
      <div class="set-row"><span class="s-label">默认音源</span>
        <select id="setAccent"><option value="uk" ${s.accent === "uk" ? "selected" : ""}>🇬🇧 英音</option><option value="us" ${s.accent === "us" ? "selected" : ""}>🇺🇸 美音</option></select></div>
      <div class="set-row"><span class="s-label">记忆图片显示</span><label class="switch"><input type="checkbox" id="setImgs" ${s.imgs ? "checked" : ""}><i></i></label></div>
      <div class="set-row"><span class="s-label">图片预加载缓存<span class="s-hint">打开章节时预取本章词图</span></span><label class="switch"><input type="checkbox" id="setPreload" ${s.preload ? "checked" : ""}><i></i></label></div>
      <div class="set-row"><span class="s-label">夜间护眼模式</span><label class="switch"><input type="checkbox" id="setNight" ${s.night ? "checked" : ""}><i></i></label></div>
    </div>

    <div class="panel"><h3>⏱️ 复习与学习强度</h3>
      <div class="set-row"><span class="s-label">每日新增单词上限<span class="s-hint">防止一次性推送过多</span></span><input type="number" id="setDailyNew" min="1" max="200" value="${s.dailyNew}"></div>
      <div class="set-row"><span class="s-label">每日复习上限</span><input type="number" id="setDailyRev" min="5" max="500" value="${s.dailyRev}"></div>
      <div class="set-row"><span class="s-label">休息日暂停遗忘周期<span class="s-hint">暂停推送，学习记录不丢失</span></span><label class="switch"><input type="checkbox" id="setRest" ${s.rest ? "checked" : ""}><i></i></label></div>
      <div class="set-row" style="flex-direction:column;align-items:flex-start;gap:8px"><span class="s-label">自定义复习周期（分钟，逗号分隔）<span class="s-hint">标准艾宾浩斯：5,30,720,1440,2880,5760,10080,21600,43200,86400</span></span>
        <input style="width:100%" id="setIntervals" value="${s.intervals.join(",")}"></div>
      <div style="margin-top:10px"><button class="btn btn-primary btn-sm" id="saveIntervals">保存周期设置</button></div>
    </div>

    <div class="panel"><h3>📡 离线与投屏</h3>
      <div class="set-row"><span class="s-label">离线学习模式<span class="s-hint">提前缓存章节文章、图片与音频</span></span><label class="switch"><input type="checkbox" id="setOffline" ${s.offline ? "checked" : ""}><i></i></label></div>
      <div class="set-row"><span class="s-label">单词一键投屏<span class="s-hint">复习时大字投屏展示单词卡</span></span><label class="switch"><input type="checkbox" id="setCast" ${s.cast ? "checked" : ""}><i></i></label></div>
    </div>

    <div class="panel danger-zone"><h3>💾 数据分册备份 / 导出 / 清空</h3>
      <div class="set-row" style="border:none;flex-wrap:wrap">
        <select id="bakBook"><option value="">全部数据</option>${BOOKS.map(b => `<option value="${b.id}">${b.name}</option>`).join("")}</select>
        <div>
          <button class="btn btn-ghost btn-sm" id="bakExport">📤 备份导出 JSON</button>
          <label class="btn btn-ghost btn-sm">📥 导入恢复<input type="file" id="bakImport" accept=".json" hidden></label>
          <button class="btn btn-sm" style="background:var(--core-bg);color:var(--danger)" id="bakClear">🗑️ 清空所选数据</button>
        </div>
      </div>
      <div class="hint-text">备份包含：复习记录、笔记、造句、自定义图片、标签、日志与成就。分册导出仅包含该册单词的学习数据。</div>
    </div>
  </div>`;

  $("#setRate").onchange = e => { s.rate = parseFloat(e.target.value); save(); };
  $("#setAccent").onchange = e => { s.accent = e.target.value; save(); };
  $("#setImgs").onchange = e => { s.imgs = e.target.checked; save(); };
  $("#setPreload").onchange = e => { s.preload = e.target.checked; save(); toast(e.target.checked ? "已开启图片预加载缓存" : "已关闭预加载"); };
  $("#setNight").onchange = e => { s.night = e.target.checked; save(); applyNight(); };
  $("#setDailyNew").onchange = e => { s.dailyNew = Math.max(1, +e.target.value || 20); save(); };
  $("#setDailyRev").onchange = e => { s.dailyRev = Math.max(5, +e.target.value || 60); save(); };
  $("#setRest").onchange = e => { s.rest = e.target.checked; save(); updateDueBadge(); toast(e.target.checked ? "😴 休息日模式开启，周期已暂停" : "周期恢复推送"); };
  $("#saveIntervals").onclick = () => {
    const arr = $("#setIntervals").value.split(",").map(x => parseInt(x.trim())).filter(x => x > 0);
    if (arr.length < 3) { toast("至少需要 3 个周期节点"); return; }
    s.intervals = arr; save(); toast("✅ 复习周期已更新");
  };
  $("#setOffline").onchange = e => { s.offline = e.target.checked; save(); toast(e.target.checked ? "📡 离线模式：本地词库与语音引擎已可离线使用" : "已关闭离线模式"); };
  $("#setCast").onchange = e => { s.cast = e.target.checked; save(); toast(e.target.checked ? "📺 投屏开关已开启" : "已关闭投屏"); };
  $("#bakExport").onclick = () => {
    const bookId = $("#bakBook").value;
    let data = DB;
    if (bookId) {
      const inBook = w => WORDS[w] && WORDS[w].book === bookId;
      data = { ...DB, rev: {}, notes: {}, sents: {}, img: {} };
      Object.keys(DB.rev).forEach(w => { if (inBook(w)) data.rev[w] = DB.rev[w]; });
      Object.keys(DB.notes).forEach(w => { if (inBook(w)) data.notes[w] = DB.notes[w]; });
      Object.keys(DB.sents).forEach(w => { if (inBook(w)) data.sents[w] = DB.sents[w]; });
      Object.keys(DB.img).forEach(w => { if (inBook(w)) data.img[w] = DB.img[w]; });
    }
    downloadFile(JSON.stringify(data, null, 2), `词库备份_${bookId || "全部"}_${todayKey()}.json`, "application/json");
  };
  $("#bakImport").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        ["rev", "notes", "sents", "img"].forEach(k => Object.assign(DB[k], d[k] || {}));
        if (d.log) Object.assign(DB.log, d.log);
        if (d.tags) d.tags.forEach(t => { if (!DB.tags.includes(t)) DB.tags.push(t); });
        save(); updateDueBadge(); toast("✅ 数据导入合并成功");
      } catch (err) { toast("❌ 导入失败：文件格式错误"); }
    };
    rd.readAsText(f);
  };
  $("#bakClear").onclick = () => {
    const bookId = $("#bakBook").value;
    const name = bookId ? (BOOKS.find(b => b.id === bookId) || {}).name : "全部";
    if (!confirm(`⚠️ 确认清空「${name}」的学习数据？此操作不可恢复，建议先导出备份。`)) return;
    if (bookId) {
      const inBook = w => WORDS[w] && WORDS[w].book === bookId;
      Object.keys(DB.rev).forEach(w => { if (inBook(w)) delete DB.rev[w]; });
      Object.keys(DB.notes).forEach(w => { if (inBook(w)) delete DB.notes[w]; });
      Object.keys(DB.sents).forEach(w => { if (inBook(w)) delete DB.sents[w]; });
      Object.keys(DB.img).forEach(w => { if (inBook(w)) delete DB.img[w]; });
    } else {
      DB = { rev:{}, notes:{}, sents:{}, img:{}, fav:[], done:{}, log:{}, ach:{}, tags: DB.tags, checkins:{}, myWords:{}, streak:{last:"",days:0}, settings: DB.settings };
    }
    save(); updateDueBadge(); renderSettings(); toast("🗑️ 已清空所选数据");
  };
}

/* ================= 工作台总览（首页） ================= */
function buildActivity() {
  const items = [];
  Object.entries(DB.rev).forEach(([w, r]) => { if (WORDS[w]) items.push({ w, t: r.last || r.t0 || 0, type: r.mastered ? "已掌握" : "复习中" }); });
  items.sort((a, b) => b.t - a.t);
  return items.slice(0, 6);
}
function doCheckin() {
  const k = todayKey();
  if (DB.checkins[k]) { toast("今天已经打卡啦 ✅"); return; }
  DB.checkins[k] = Date.now();
  touchStreak(); save();
  toast("📅 今日打卡成功！已连续 " + DB.streak.days + " 天");
  renderHome();
}
function renderHome() {
  const due = dueWords();
  const allRev = Object.entries(DB.rev).filter(([w]) => WORDS[w]);
  const learning = allRev.filter(([, r]) => !r.mastered).length;
  const mastered = allRev.filter(([, r]) => r.mastered).length;
  const wrongs = wrongBook();
  const tk = DB.log[todayKey()] || {};
  const totalCh = BOOKS.reduce((s, b) => s + b.chapters.length, 0);
  const doneCh = Object.values(DB.done).filter(d => d.rewriteDone).length;
  const myCount = Object.keys(DB.myWords || {}).length;
  const k = todayKey();
  const checked = !!DB.checkins[k];
  const checkedTime = checked ? new Date(DB.checkins[k]).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
  const acts = buildActivity();
  const hour = new Date().getHours();
  const greet = hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
  const chkPct = allRev.length ? Math.round(mastered / allRev.length * 100) : 0;

  $("#homeRoot").innerHTML = `
  <div class="home-hero">
    <div><div class="hh-greet">${greet}，Anna 👋</div><div class="hh-sub">${k} · 连续打卡 ${DB.streak.days} 天</div></div>
    <div class="hh-spacer"></div>
    <button class="checkin-btn ${checked ? "done" : ""}" id="checkinBtn">${checked ? ("✅ 今日已打卡 " + checkedTime) : "📅 今日打卡"}</button>
  </div>

  <div class="rv-grid">
    <div class="stat-card hl" data-go="review"><div class="sc-num">${due.length}</div><div class="sc-label">今日待复习</div></div>
    <div class="stat-card" data-go="library"><div class="sc-num">${allRev.length}</div><div class="sc-label">复习库总量</div></div>
    <div class="stat-card" data-go="library"><div class="sc-num" style="color:var(--ok)">${mastered}</div><div class="sc-label">已掌握休眠</div></div>
    <div class="stat-card" data-go="review"><div class="sc-num" style="color:var(--danger)">${wrongs.length}</div><div class="sc-label">错题本</div></div>
  </div>

  <div class="home-quick">
    <button class="q-card" data-go="reading"><div class="qc-icon">📚</div><div class="qc-name">章节阅读</div><div class="qc-desc">读课文 · 点词学习</div></button>
    <button class="q-card" data-go="review"><div class="qc-icon">🔄</div><div class="qc-name">复习中心</div><div class="qc-desc">${due.length} 词待复习</div></button>
    <button class="q-card" data-go="library"><div class="qc-icon">🗃️</div><div class="qc-name">单词总库</div><div class="qc-desc">${myCount ? myCount + " 个我的单词" : "管理生词"}</div></button>
    <button class="q-card" data-go="ielts"><div class="qc-icon">🎯</div><div class="qc-name">雅思专项</div><div class="qc-desc">分项突破</div></button>
    <button class="q-card" data-go="dashboard"><div class="qc-icon">📊</div><div class="qc-name">学习看板</div><div class="qc-desc">数据报告</div></button>
  </div>

  <div class="home-cols">
    <div class="panel">
      <h3>📌 待办与进度</h3>
      ${due.length ? `<div class="hint-text">你有 <b style="color:var(--brand)">${due.length}</b> 个单词到期，去「复习中心」巩固一下吧。</div>` : `<div class="empty-box"><div class="eb-icon">🎉</div>暂无到期单词，复习计划完成得很好！</div>`}
      <div class="prog-row" style="margin-top:14px"><div class="prog-label"><span>📕 新概念章节仿写进度</span><b>${doneCh}/${totalCh}</b></div><div class="prog-track"><div class="prog-fill" style="width:${Math.round(doneCh / Math.max(1, totalCh) * 100)}%"></div></div></div>
      <div class="prog-row"><div class="prog-label"><span>🗃️ 复习库掌握度</span><b>${mastered}/${allRev.length}</b></div><div class="prog-track"><div class="prog-fill green" style="width:${chkPct}%"></div></div></div>
      ${wrongs.length ? `<div class="hint-text" style="margin-top:8px;color:var(--danger)">⚠️ 错题本 ${wrongs.length} 词需重点复习</div>` : ""}
      ${tk.rev ? `<div class="hint-text" style="margin-top:8px">今日已复习 <b>${tk.rev}</b> 次，正确率 <b>${Math.round((tk.ok || 0) / tk.rev * 100)}%</b></div>` : ""}
    </div>
    <div class="panel">
      <h3>🕒 最近学习动态</h3>
      ${acts.length ? acts.map(a => `<div class="home-act-item"><span class="ha-w" data-ha="${esc(a.w)}">${esc(a.w)}</span><span class="hint-text">${a.type}</span><span class="ha-meta">${fmtAgo(a.t)}</span></div>`).join("") : `<div class="empty-box"><div class="eb-icon">🌱</div>还没有学习记录，去「章节阅读区」点一个红色单词开始吧！</div>`}
    </div>
  </div>`;

  $$("#homeRoot .q-card").forEach(c => c.onclick = () => switchPage(c.dataset.go));
  $$("#homeRoot .stat-card[data-go]").forEach(c => c.onclick = () => switchPage(c.dataset.go));
  $$("#homeRoot [data-ha]").forEach(x => x.onclick = () => openWordModal(x.dataset.ha));
  $("#checkinBtn").onclick = doCheckin;
}

/* ================= 我的单词本（新增 / 编辑 / 删除） ================= */
function myWordsHtml() {
  const keys = Object.keys(DB.myWords || {});
  if (!keys.length) return `<div class="empty-box"><div class="eb-icon">📝</div>你还没有新增个人单词。<br>点击「➕ 新增我的单词」建立自己的生词本吧！</div>`;
  return `<div class="mywords-list">` + keys.map(k => {
    const m = DB.myWords[k];
    return `<div class="mw-row"><div><div class="mw-w">${esc(m.w)}</div><div class="mw-d">${esc(m.uk || "")} ${esc(m.pos || "")} ${esc(m.base || "")}</div></div>
      <div class="mw-acts">
        <button class="mw-mini rev" data-rev="${esc(k)}">🔊 朗读</button>
        <button class="mw-mini" data-edit="${esc(k)}">✎ 编辑</button>
        <button class="mw-mini del" data-del="${esc(k)}">🗑 删除</button>
      </div></div>`;
  }).join("") + `</div>`;
}
function openMyWordModal(editKey) {
  const m = editKey ? DB.myWords[editKey] : null;
  $("#myWordModal").innerHTML = `
    <h3>${m ? "✎ 编辑我的单词" : "➕ 新增我的单词"}<span class="mw-close" id="mwClose">✕</span></h3>
    <div class="mw-field"><label>单词（英文，必填）</label><input id="mwW" value="${esc(m ? m.w : "")}" placeholder="例如：serendipity"></div>
    <div class="mw-field"><label>英式音标</label><input id="mwUk" value="${esc(m ? m.uk : "")}" placeholder="/ˌserənˈdɪpəti/"></div>
    <div class="mw-field"><label>美式音标</label><input id="mwUs" value="${esc(m ? m.us : "")}" placeholder="/ˌserənˈdɪpəti/"></div>
    <div class="mw-field"><label>词性</label><input id="mwPos" value="${esc(m ? m.pos : "")}" placeholder="n. / v. / adj."></div>
    <div class="mw-field"><label>释义</label><input id="mwBase" value="${esc(m ? m.base : "")}" placeholder="意外发现珍奇事物的本领"></div>
    <div class="mw-field"><label>所属册（用于归类）</label><select id="mwBook">${BOOKS.map(b => `<option value="${b.id}" ${m && m.book === b.id ? "selected" : ""}>${b.name}</option>`).join("")}<option value="mine" ${m && m.book === "mine" ? "selected" : ""}>个人生词</option></select></div>
    <div class="mw-foot">
      ${m ? `<button class="btn btn-ghost" id="mwCancel">取消</button>` : ""}
      <button class="btn btn-primary" id="mwSave">${m ? "保存修改" : "添加单词"}</button>
    </div>`;
  $("#myWordModalMask").hidden = false;
  $("#mwClose").onclick = closeMyWordModal;
  if ($("#mwCancel")) $("#mwCancel").onclick = closeMyWordModal;
  $("#mwSave").onclick = () => {
    const w = ($("#mwW").value || "").trim().toLowerCase();
    if (!w) { toast("请填写单词"); return; }
    const rec = { w, uk: $("#mwUk").value.trim(), us: $("#mwUs").value.trim(), pos: $("#mwPos").value.trim(), base: $("#mwBase").value.trim(), book: $("#mwBook").value };
    if (editKey && editKey !== w && DB.myWords[editKey]) delete DB.myWords[editKey];
    DB.myWords[w] = rec; save();
    toast(m ? "✅ 已保存修改「" + w + "」" : "➕ 已新增单词「" + w + "」");
    closeMyWordModal(); renderLibrary();
  };
}
function closeMyWordModal() { $("#myWordModalMask").hidden = true; }

/* ================= 初始化 ================= */
applyNight();
renderTree();
renderHome();
updateDueBadge();
$("#streakChip").textContent = `🔥 连续 ${DB.streak.days} 天`;
setInterval(updateDueBadge, 60000);
/* 默认打开第一章，展示分阶段加载效果说明后由用户点击；这里保留空状态引导 */
