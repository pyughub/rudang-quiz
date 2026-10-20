const STORE_KEY = "rudang-quiz-v1";
const TOPICS = ["全部", "党章", "党纪", "党史", "理论", "二十大", "四中全会"];

const state = {
  view: "home",
  topic: "全部",
  wrongOnly: false,
  index: 0,
  order: [],
  picked: new Set(),
  draft: "",
  locked: false,
  revealed: false,
  verdict: null
};

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}
function saveStore(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
function bucket() {
  const all = loadStore();
  if (!all[state.view]) all[state.view] = { ok: {}, bad: {} };
  return all;
}

function norm(s) {
  return String(s || "").trim().replace(/\s+/g, "").replace(/[。．.、，,]/g, "");
}
function fillOutcome(input, answers) {
  const n = norm(input);
  if (!n) return "empty";
  const accepted = answers.map((a) => norm(a));
  if (accepted.includes(n)) return "ok";
  if (accepted.some((a) => a.startsWith(n))) return "pending";
  return "bad";
}
function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pool() {
  const raw = BANK[state.view] || [];
  const store = loadStore()[state.view] || { ok: {}, bad: {} };
  return raw.filter((q) => {
    if (state.topic !== "全部" && q.topic !== state.topic) return false;
    if (state.wrongOnly && !store.bad[q.id]) return false;
    return true;
  });
}
function current() {
  const items = pool();
  const id = state.order[state.index];
  return items.find((q) => q.id === id) || null;
}
function resetOrder() {
  state.order = shuffle(pool().map((q) => q.id));
  state.index = 0;
  clearAttempt();
}
let fillTimer = 0;
function clearFillTimer() {
  clearTimeout(fillTimer);
  fillTimer = 0;
}
function clearAttempt() {
  clearFillTimer();
  state.picked = new Set();
  state.draft = "";
  state.locked = false;
  state.revealed = false;
  state.verdict = null;
}
function grade(q, ok) {
  clearFillTimer();
  const all = bucket();
  if (ok) { all[state.view].ok[q.id] = true; delete all[state.view].bad[q.id]; }
  else { all[state.view].bad[q.id] = true; delete all[state.view].ok[q.id]; }
  saveStore(all);
  state.locked = true;
  state.verdict = ok ? "ok" : "bad";
  render();
}
function tallyText() {
  const s = loadStore();
  const ok = ["fill", "choice"].reduce((n, k) => n + Object.keys((s[k] || {}).ok || {}).length, 0);
  const bad = ["fill", "choice"].reduce((n, k) => n + Object.keys((s[k] || {}).bad || {}).length, 0);
  return `做对 ${ok}　待复习 ${bad}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderHome() {
  const counts = { fill: BANK.fill.length, choice: BANK.choice.length, short: BANK.short.length };
  document.getElementById("tally").textContent = tallyText();
  document.getElementById("app").innerHTML = `
    <div class="modes">
      <button class="mode" data-go="fill"><strong>填空</strong><span>${counts.fill} 题。写到关键词自动判断，答错会给出正确答案。</span></button>
      <button class="mode" data-go="choice"><strong>选择</strong><span>${counts.choice} 题。点选后自动判断，多选须选全。</span></button>
      <button class="mode" data-go="short"><strong>简答</strong><span>${counts.short} 题。只展示标准答案，不判断你写得对不对。</span></button>
    </div>`;
  document.getElementById("app").querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.go;
      state.topic = "全部";
      state.wrongOnly = false;
      resetOrder();
      render();
    });
  });
}

function renderQuiz() {
  const items = pool();
  if (!state.order.length || !items.some((q) => state.order.includes(q.id))) resetOrder();
  state.order = state.order.filter((id) => items.some((q) => q.id === id));
  if (state.index >= state.order.length) state.index = 0;
  const q = current();
  document.getElementById("tally").textContent = tallyText();
  const title = { fill: "填空", choice: "选择", short: "简答" }[state.view];
  const topicOpts = TOPICS.map((t) => `<option ${t === state.topic ? "selected" : ""}>${t}</option>`).join("");
  const wrongBtn = state.view === "short" ? "" : `<button type="button" class="ghost" id="wrongOnly">${state.wrongOnly ? "查看全部" : "只看错题"}</button>`;
  if (!q) {
    document.getElementById("app").innerHTML = `
      <div class="bar">
        <button type="button" class="ghost" id="back">返回</button>
        <select id="topic">${topicOpts}</select>
        ${wrongBtn}
      </div>
      <p class="stem">${state.wrongOnly ? "这个范围里还没有错题。" : "没有题目。"}</p>`;
    bindBar();
    return;
  }
  const n = state.order.length;
  let body = "";
  if (state.view === "fill") body = fillBody(q);
  else if (state.view === "choice") body = choiceBody(q);
  else body = shortBody(q);
  document.getElementById("app").innerHTML = `
    <div class="bar">
      <button type="button" class="ghost" id="back">返回</button>
      <select id="topic">${topicOpts}</select>
      ${wrongBtn}
      <button type="button" class="ghost" id="reshuffle">换顺序</button>
      <span class="progress">${state.index + 1} / ${n}　${escapeHtml(q.topic)}</span>
    </div>
    ${body}
    <div class="actions">
      <button type="button" class="ghost" id="prev">上一题</button>
      <button type="button" class="ghost" id="next">下一题</button>
    </div>`;
  bindBar();
  if (state.view === "fill") bindFill(q);
  if (state.view === "choice") bindChoice(q);
  if (state.view === "short") bindShort(q);
  document.getElementById("prev").onclick = () => { if (state.index > 0) { state.index--; clearAttempt(); render(); } };
  document.getElementById("next").onclick = () => {
    if (state.index < state.order.length - 1) { state.index++; clearAttempt(); render(); }
  };
}

function fillBody(q) {
  const [before, after] = q.prompt.split("____");
  const cls = state.verdict === "ok" ? "ok" : state.verdict === "bad" ? "bad" : "";
  const verdict = state.verdict === "ok"
    ? `<p class="verdict ok">对了。<span class="seal">对</span></p>`
    : state.verdict === "bad"
      ? `<p class="verdict bad">错了。正确答案：${escapeHtml(q.answers[0])}</p>`
      : `<p class="verdict"></p>`;
  return `
    <p class="stem blank">${escapeHtml(before)}<input id="blank" class="${cls}" value="${escapeHtml(state.draft)}" ${state.locked ? "disabled" : ""} aria-label="填空"> ${escapeHtml(after || "")}</p>
    ${verdict}`;
}
function choiceBody(q) {
  const letters = "ABCDEFGHIJ";
  const opts = q.options.map((text, i) => {
    let cls = "opt";
    if (state.picked.has(i)) cls += " picked";
    if (state.locked) {
      if (q.answer.includes(i)) cls += " right";
      else if (state.picked.has(i)) cls += " wrong";
    }
    const type = q.multi ? "checkbox" : "radio";
    return `<label class="${cls}"><input type="${type}" name="opt" value="${i}" ${state.picked.has(i) ? "checked" : ""} ${state.locked ? "disabled" : ""}><span>${letters[i]}. ${escapeHtml(text)}</span></label>`;
  }).join("");
  const verdict = state.verdict === "ok"
    ? `<p class="verdict ok">对了。<span class="seal">对</span></p>`
    : state.verdict === "bad"
      ? `<p class="verdict bad">错了。正确答案：${q.answer.map((i) => letters[i]).join("、")}</p>`
      : `<p class="verdict">${q.multi && state.picked.size ? "选全后自动判断。" : ""}</p>`;
  return `
    <p class="stem">${escapeHtml(q.stem)}${q.multi && !q.stem.includes("多选") ? "（多选）" : ""}</p>
    <div class="options">${opts}</div>
    ${verdict}`;
}
function shortBody(q) {
  const answer = state.revealed
    ? `<div class="standard">${escapeHtml(q.answer)}</div>`
    : `<button type="button" class="check" id="reveal">查看标准答案</button>`;
  return `<p class="stem">${escapeHtml(q.stem)}</p>${answer}`;
}

function bindBar() {
  const back = document.getElementById("back");
  if (back) back.onclick = () => { state.view = "home"; render(); };
  const topic = document.getElementById("topic");
  if (topic) topic.onchange = () => { state.topic = topic.value; resetOrder(); render(); };
  const wrong = document.getElementById("wrongOnly");
  if (wrong) wrong.onclick = () => { state.wrongOnly = !state.wrongOnly; resetOrder(); render(); };
  const reshuffle = document.getElementById("reshuffle");
  if (reshuffle) reshuffle.onclick = () => { resetOrder(); render(); };
}
function bindFill(q) {
  const input = document.getElementById("blank");
  if (!input || state.locked) return;
  input.focus();
  const end = input.value.length;
  input.setSelectionRange(end, end);
  let composing = false;
  const settle = (force) => {
    state.draft = input.value;
    const outcome = fillOutcome(input.value, q.answers);
    if (outcome === "ok") grade(q, true);
    else if (outcome === "bad" || (force && outcome === "pending")) grade(q, false);
  };
  const watch = () => {
    if (composing) return;
    clearFillTimer();
    const outcome = fillOutcome(input.value, q.answers);
    if (outcome === "pending") {
      state.draft = input.value;
      fillTimer = setTimeout(() => {
        if (state.locked || current()?.id !== q.id) return;
        settle(true);
      }, 700);
      return;
    }
    settle(false);
  };
  input.addEventListener("compositionstart", () => { composing = true; clearFillTimer(); });
  input.addEventListener("compositionend", () => { composing = false; watch(); });
  input.addEventListener("input", (e) => {
    if (e.isComposing || composing) return;
    watch();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    clearFillTimer();
    if (!norm(input.value)) return;
    settle(true);
  });
}
function bindChoice(q) {
  document.querySelectorAll(".opt input").forEach((el) => {
    el.addEventListener("change", () => {
      if (q.multi) {
        state.picked = new Set([...document.querySelectorAll(".opt input:checked")].map((n) => Number(n.value)));
      } else {
        state.picked = new Set([Number(el.value)]);
      }
      const picked = [...state.picked];
      if (!q.multi) {
        grade(q, sameSet(picked, q.answer));
        return;
      }
      if (picked.some((i) => !q.answer.includes(i))) grade(q, false);
      else if (sameSet(picked, q.answer)) grade(q, true);
      else {
        document.querySelectorAll(".opt").forEach((lab) => {
          lab.classList.toggle("picked", lab.querySelector("input").checked);
        });
        const verdict = document.querySelector(".verdict");
        if (verdict) verdict.textContent = picked.length ? "选全后自动判断。" : "";
      }
    });
  });
}
function bindShort() {
  const btn = document.getElementById("reveal");
  if (!btn) return;
  btn.onclick = () => { state.revealed = true; render(); };
}

function render() {
  if (state.view === "home") renderHome();
  else renderQuiz();
}
render();
