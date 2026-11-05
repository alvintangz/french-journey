/* Mon Voyage — French vocabulary trainer. Plain JS, no build step. Progress lives in localStorage. */
(() => {
  "use strict";

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]/gu, " ").replace(/\s+/g, " ").trim();
  const stripArticle = fr => fr.replace(/^(le |la |les |l'|l’|un |une )/i, "");
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const LEVELS = [["a1", "A1"], ["a2", "A2"], ["b1", "B1"], ["b2", "B2"], ["custom", "★ Mine"]];
  const STATUSES = [["all", "All"], ["new", "New"], ["learning", "Still learning"], ["practice", "Needs practice"], ["memorized", "Memorized"]];
  const STATUS_LABEL = { new: "New", learning: "Still learning", practice: "Needs practice", memorized: "Memorized" };
  const STATUS_ICON = { new: "⚪", learning: "🟡", practice: "🔴", memorized: "🟢" };

  // ---------- state ----------
  const KEY = "monvoyage.v1";
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
  const S = {
    progress: saved.progress || {},
    custom: saved.custom || [],
    settings: Object.assign({ autoplay: true, voiceURI: "", rate: 0.9 }, saved.settings),
    levels: saved.levels || ["a1"],
    status: saved.status || "all",
    shuffle: saved.shuffle ?? true,
    tab: "learn"
  };
  const persist = () => localStorage.setItem(KEY, JSON.stringify({ progress: S.progress, custom: S.custom, settings: S.settings, levels: S.levels, status: S.status, shuffle: S.shuffle }));

  const allWords = () => {
    const out = [];
    for (const lv of Object.keys(VOCAB)) VOCAB[lv].forEach((w, i) => out.push({ id: `${lv}-${i}`, level: lv, fr: w[0], en: w[1], emoji: w[2], ex: w[3], exEn: w[4] }));
    S.custom.forEach(w => out.push(Object.assign({ level: "custom" }, w)));
    return out;
  };
  const statusOf = w => S.progress[w.id] || "new";
  const setStatus = (w, st) => { S.progress[w.id] = st; persist(); };
  const filtered = () => allWords().filter(w => S.levels.includes(w.level) && (S.status === "all" || statusOf(w) === S.status));

  // ---------- speech ----------
  let voices = [];
  const scoreVoice = v => {
    let s = 0;
    if (/^fr[-_]FR/i.test(v.lang)) s += 10; else if (/^fr/i.test(v.lang)) s += 6;
    if (/neural|premium|enhanced|natural|online/i.test(v.name)) s += 8;
    if (/google|microsoft|amélie|thomas|audrey|marie|hortense|denise|henri/i.test(v.name)) s += 3;
    if (v.localService === false) s += 1;
    return s;
  };
  const loadVoices = () => {
    if (!("speechSynthesis" in window)) return;
    voices = speechSynthesis.getVoices().filter(v => /^fr/i.test(v.lang)).sort((a, b) => scoreVoice(b) - scoreVoice(a));
    const sel = $("#voiceSel");
    sel.innerHTML = voices.length ? voices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join("") : `<option>No French voice found</option>`;
    if (voices.length) sel.value = voices.some(v => v.voiceURI === S.settings.voiceURI) ? S.settings.voiceURI : voices[0].voiceURI;
  };
  const speak = text => {
    if (!("speechSynthesis" in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = S.settings.rate;
    const v = voices.find(v => v.voiceURI === S.settings.voiceURI) || voices[0];
    if (v) { u.voice = v; u.lang = v.lang; }
    speechSynthesis.speak(u);
  };
  const speakWord = w => speak(w.fr);
  const autoSpeak = w => { if (S.settings.autoplay) setTimeout(() => speakWord(w), 150); };

  // ---------- shell: tabs, filters, settings ----------
  const main = $("#main");
  const chipRow = (el, items, isOn, onClick) => {
    el.innerHTML = items.map(([k, label]) => `<button class="chip ${isOn(k) ? "on" : ""}" data-k="${k}">${label}</button>`).join("");
    el.onclick = e => { const b = e.target.closest("button"); if (b) onClick(b.dataset.k); };
  };
  function renderFilters() {
    chipRow($("#levelChips"), LEVELS, k => S.levels.includes(k), k => {
      S.levels = S.levels.includes(k) ? S.levels.filter(x => x !== k) : [...S.levels, k];
      if (!S.levels.length) S.levels = [k];
      persist(); refresh();
    });
    chipRow($("#statusChips"), STATUSES, k => S.status === k, k => { S.status = k; persist(); refresh(); });
    $("#shuffleToggle").checked = S.shuffle;
    $("#deckCount").textContent = `${filtered().length} words`;
  }
  $("#shuffleToggle").onchange = e => { S.shuffle = e.target.checked; persist(); refresh(); };
  $("#tabs").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    S.tab = b.dataset.tab;
    document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("active", x === b));
    refresh();
  };
  function refresh() { main.onclick = main.onchange = null; renderFilters(); ({ learn: renderLearn, test: renderTest, practice: renderPractice, read: renderRead, words: renderWords })[S.tab](); }

  const dlg = $("#settingsDlg");
  $("#settingsBtn").onclick = () => { $("#autoplay").checked = S.settings.autoplay; $("#rate").value = S.settings.rate; $("#rateLabel").textContent = S.settings.rate + "×"; loadVoices(); dlg.showModal(); };
  $("#autoplay").onchange = e => { S.settings.autoplay = e.target.checked; persist(); };
  $("#rate").oninput = e => { S.settings.rate = +e.target.value; $("#rateLabel").textContent = S.settings.rate + "×"; persist(); };
  $("#voiceSel").onchange = e => { S.settings.voiceURI = e.target.value; persist(); };
  $("#testVoice").onclick = () => speak("Bonjour ! Je suis ravi de vous aider à apprendre le français.");
  if ("speechSynthesis" in window) { speechSynthesis.onvoiceschanged = loadVoices; loadVoices(); }

  const emptyMsg = () => { main.innerHTML = `<div class="empty"><div style="font-size:3rem">🫥</div><p>No words match these filters.<br>Try another level or status${S.levels.includes("custom") ? "" : ", or add your own words in <b>My Words</b>"}.</p></div>`; };
  const progressHtml = (i, n) => `<div class="progressbar"><div style="width:${n ? (i / n) * 100 : 0}%"></div></div>`;

  // ---------- LEARN (flashcards) ----------
  let L = { deck: [], i: 0, flipped: false };
  function renderLearn(rebuild = true) {
    if (rebuild) { const d = filtered(); L = { deck: S.shuffle ? shuffle(d) : d, i: 0, flipped: false }; }
    if (!L.deck.length) return emptyMsg();
    if (L.i >= L.deck.length) {
      main.innerHTML = `<div class="panel"><div class="empty"><div style="font-size:3rem">🎉</div><h2>Deck finished!</h2><p>${L.deck.length} cards reviewed.</p></div><button class="btn primary" id="again">Start again</button></div>`;
      $("#again").onclick = () => renderLearn(true); return;
    }
    const w = L.deck[L.i];
    main.innerHTML = `<div class="panel">
      ${progressHtml(L.i, L.deck.length)}
      <div class="hint">Card ${L.i + 1} / ${L.deck.length} · click the card or press <kbd>Space</kbd> to flip</div>
      <div class="scene" id="scene"><div class="card3d ${L.flipped ? "flipped" : ""}" id="card3d">
        <div class="face front"><span class="tag">${w.level.toUpperCase()}</span><span class="status-dot">${STATUS_ICON[statusOf(w)]} ${STATUS_LABEL[statusOf(w)]}</span>
          ${w.emoji ? `<div class="emoji">${esc(w.emoji)}</div>` : ""}<div class="word">${esc(w.fr)}</div></div>
        <div class="face back"><span class="tag">English</span>
          <div class="en">${esc(w.en)}</div>${w.ex ? `<div class="ex">${esc(w.ex)}</div><div class="exen">${esc(w.exEn || "")}</div>` : ""}</div>
      </div></div>
      <div class="controls">
        <button class="speak" id="say" title="Play pronunciation">🔊</button>
        <button class="btn" id="prev" ${L.i === 0 ? "disabled" : ""}>←</button>
        <button class="btn" id="flip">Flip</button>
        <button class="btn" id="next">→</button>
      </div>
      <div class="controls" id="rateRow" style="visibility:${L.flipped ? "visible" : "hidden"}">
        <button class="btn bad" data-s="practice">🔴 Needs practice <small>(1)</small></button>
        <button class="btn warn" data-s="learning">🟡 Still learning <small>(2)</small></button>
        <button class="btn good" data-s="memorized">🟢 Memorized <small>(3)</small></button>
      </div></div>`;
    $("#scene").onclick = flipCard;
    $("#flip").onclick = flipCard;
    $("#say").onclick = () => speakWord(w);
    $("#prev").onclick = () => { L.i--; L.flipped = false; renderLearn(false); };
    $("#next").onclick = () => { L.i++; L.flipped = false; renderLearn(false); };
    $("#rateRow").onclick = e => { const b = e.target.closest("button[data-s]"); if (b) rate(b.dataset.s); };
    if (!L.flipped) autoSpeak(w);
  }
  function flipCard() {
    L.flipped = !L.flipped;
    $("#card3d").classList.toggle("flipped", L.flipped);
    $("#rateRow").style.visibility = L.flipped ? "visible" : "hidden";
  }
  function rate(st) { setStatus(L.deck[L.i], st); L.i++; L.flipped = false; renderFilters(); renderLearn(false); }

  document.addEventListener("keydown", e => {
    if (S.tab !== "learn" || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || dlg.open || !L.deck.length || L.i >= L.deck.length) return;
    if (e.code === "Space") { e.preventDefault(); flipCard(); }
    else if (e.key === "ArrowRight") $("#next").click();
    else if (e.key === "ArrowLeft") $("#prev").click();
    else if (L.flipped && "123".includes(e.key) && e.key) rate(["practice", "learning", "memorized"][+e.key - 1]);
  });

  // ---------- TEST (type the French word) ----------
  let T = { deck: [], i: 0, score: 0, answered: false };
  function renderTest(rebuild = true) {
    if (rebuild) { const d = filtered(); T = { deck: S.shuffle ? shuffle(d) : d, i: 0, score: 0, answered: false }; }
    if (!T.deck.length) return emptyMsg();
    if (T.i >= T.deck.length) return finish(T.score, T.deck.length, () => renderTest(true));
    const w = T.deck[T.i];
    main.innerHTML = `<div class="panel">${progressHtml(T.i, T.deck.length)}
      <div class="score">Question ${T.i + 1} / ${T.deck.length} · Score ${T.score}</div>
      <div class="qcard">
        ${w.emoji ? `<div style="font-size:4rem">${esc(w.emoji)}</div>` : ""}
        <div class="hint">Type the French word for…</div>
        <div class="prompt">${esc(w.en)}</div>
        <input type="text" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="en français…" />
        <div class="feedback" id="fb"></div>
        <div class="controls">
          <button class="btn primary" id="check">Check</button>
          <button class="btn" id="giveup">I don't know</button>
        </div>
      </div></div>`;
    const input = $("#ans"); input.focus();
    T.answered = false;
    const go = () => {
      if (T.answered) { T.i++; return renderTest(false); }
      checkTest(w, input.value);
    };
    $("#check").onclick = go;
    $("#giveup").onclick = () => { if (!T.answered) checkTest(w, null); };
    input.onkeydown = e => { if (e.key === "Enter") go(); };
    $("#check").dataset.go = "1";
    T.go = go;
  }
  function checkTest(w, val) {
    T.answered = true;
    const target = norm(w.fr), bare = norm(stripArticle(w.fr));
    const given = val === null ? null : norm(val);
    const ok = given !== null && (given === target || given === bare);
    const accentsOff = ok && val.trim().toLowerCase() !== w.fr.toLowerCase() && val.trim().toLowerCase() !== stripArticle(w.fr).toLowerCase();
    const fb = $("#fb");
    if (ok) { T.score++; if (statusOf(w) === "new" || statusOf(w) === "practice") setStatus(w, "learning"); fb.className = "feedback ok"; fb.innerHTML = `✅ Correct! <b>${esc(w.fr)}</b>${accentsOff ? " <small>(watch the accents / article)</small>" : ""}`; }
    else { setStatus(w, "practice"); fb.className = "feedback no"; fb.innerHTML = `❌ It's <b>${esc(w.fr)}</b>`; }
    speakWord(w);
    $("#check").textContent = "Next →";
    $("#ans").disabled = true;
    if (ok) $("#giveup").outerHTML = `<button class="btn good" id="mem">🟢 Mark memorized</button>`, $("#mem").onclick = () => { setStatus(w, "memorized"); $("#mem").textContent = "Saved ✓"; $("#mem").disabled = true; renderFilters(); };
    else $("#giveup").style.display = "none";
    renderFilters();
    $("#check").focus();
  }
  function finish(score, n, again) {
    main.innerHTML = `<div class="panel"><div class="empty"><div style="font-size:3rem">${score / n > .7 ? "🎉" : "💪"}</div><h2>${score} / ${n} correct</h2><p>Words you missed were moved to <b>Needs practice</b>. Filter by that status to drill them.</p></div><button class="btn primary" id="again">Go again</button></div>`;
    $("#again").onclick = again;
  }

  // ---------- PRACTICE (fill in the blank / multiple choice / listening) ----------
  let P = { mode: "fill", qs: [], i: 0, score: 0 };
  const blankSentence = w => {
    if (!w.ex) return null;
    const core = stripArticle(w.fr);
    const re = new RegExp(`(?<![\\p{L}])${escRe(core)}(?![\\p{L}])`, "iu");
    return re.test(w.ex) ? w.ex.replace(re, "<span class='blank'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>") : null;
  };
  const distractors = (w, key, n = 3) => {
    const pool = shuffle(allWords().filter(x => x.id !== w.id && x[key] !== w[key]));
    return pool.slice(0, n);
  };
  function buildQuestion(w, mode) {
    if (mode === "fill") {
      const sentence = blankSentence(w);
      if (sentence) return { type: "fill", w, sentence, options: shuffle([w, ...distractors(w, "fr")]).map(x => x.fr) , answer: w.fr };
      mode = "choice"; // fall back when the word does not appear verbatim in its example
    }
    if (mode === "listen") return { type: "listen", w, options: shuffle([w, ...distractors(w, "fr")]).map(x => x.fr), answer: w.fr };
    return { type: "choice", w, options: shuffle([w, ...distractors(w, "en")]).map(x => x.en), answer: w.en };
  }
  function renderPractice(rebuild = true) {
    if (rebuild) {
      const d = filtered(); const deck = S.shuffle ? shuffle(d) : d;
      P.qs = deck.map(w => buildQuestion(w, P.mode)); P.i = 0; P.score = 0;
    }
    const sub = `<div class="subtabs">${[["fill", "✏️ Fill in the blank"], ["choice", "🇫🇷→🇬🇧 Meaning"], ["listen", "👂 Listen & pick"]].map(([k, l]) => `<button class="chip ${P.mode === k ? "on" : ""}" data-m="${k}">${l}</button>`).join("")}</div>`;
    if (!P.qs.length) { emptyMsg(); main.insertAdjacentHTML("afterbegin", sub); bindSub(); return; }
    if (P.i >= P.qs.length) { finish(P.score, P.qs.length, () => renderPractice(true)); return; }
    const q = P.qs[P.i], w = q.w;
    let body;
    if (q.type === "fill") body = `<div class="hint">Choose the missing word</div><div class="sentence">${q.sentence}</div><div class="hint">${esc(w.exEn || "")}</div>`;
    else if (q.type === "choice") body = `${w.emoji ? `<div style="font-size:4rem">${esc(w.emoji)}</div>` : ""}<div class="hint">What does this mean?</div><div class="prompt">${esc(w.fr)}</div><button class="speak" id="say">🔊</button>`;
    else body = `<div class="hint">Listen, then pick the word you hear</div><button class="speak" id="say" style="width:80px;height:80px;font-size:2.2rem">🔊</button>`;
    main.innerHTML = `<div class="panel">${sub}${progressHtml(P.i, P.qs.length)}
      <div class="score">Question ${P.i + 1} / ${P.qs.length} · Score ${P.score}</div>
      <div class="qcard">${body}
        <div class="options" id="opts">${q.options.map(o => `<button class="opt" data-o="${esc(o)}">${esc(o)}</button>`).join("")}</div>
        <div class="feedback" id="fb"></div>
        <button class="btn primary" id="next" style="display:none">Next →</button>
      </div></div>`;
    bindSub();
    const say = $("#say"); if (say) say.onclick = () => speakWord(w);
    if (q.type === "listen") autoSpeakForce(w);
    else if (q.type === "choice") autoSpeak(w);
    let done = false;
    $("#opts").onclick = e => {
      const b = e.target.closest(".opt"); if (!b || done) return; done = true;
      const ok = b.dataset.o === q.answer;
      document.querySelectorAll(".opt").forEach(o => { o.disabled = true; if (o.dataset.o === q.answer) o.classList.add("right"); });
      if (!ok) b.classList.add("wrong");
      const fb = $("#fb"); fb.className = "feedback " + (ok ? "ok" : "no");
      fb.innerHTML = ok ? "✅ Correct!" : `❌ Answer: <b>${esc(q.answer)}</b>`;
      if (ok) { P.score++; if (statusOf(w) === "new" || statusOf(w) === "practice") setStatus(w, "learning"); } else setStatus(w, "practice");
      speakWord(w);
      renderFilters(); $("#next").style.display = ""; $("#next").focus();
    };
    $("#next").onclick = () => { P.i++; renderPractice(false); };
  }
  const autoSpeakForce = w => setTimeout(() => speakWord(w), 150);
  function bindSub() { const el = main.querySelector(".subtabs"); if (el) el.onclick = e => { const b = e.target.closest("button[data-m]"); if (b) { P.mode = b.dataset.m; renderPractice(true); } }; }

  // ---------- READ ----------
  let R = { i: 0, showEn: false };
  function renderRead() {
    const lvls = S.levels.filter(l => READINGS[l]);
    const items = lvls.flatMap(l => READINGS[l].map(r => Object.assign({ level: l }, r)));
    if (!items.length) { main.innerHTML = `<div class="empty"><div style="font-size:3rem">📚</div><p>Reading texts are available for A1–B2.<br>Select a level above.</p></div>`; return; }
    if (R.i >= items.length) R.i = 0;
    const r = items[R.i];
    const known = new Map();
    allWords().filter(w => w.level === r.level || w.level === "custom").forEach(w => known.set(norm(stripArticle(w.fr)), w));
    allWords().forEach(w => { if (!known.has(norm(stripArticle(w.fr)))) known.set(norm(stripArticle(w.fr)), Object.assign({ other: true }, w)); });
    const html = r.fr.split(/([\p{L}'’-]+)/u).map(t => {
      if (!/[\p{L}]/u.test(t)) return esc(t);
      const k = known.get(norm(t));
      return `<span class="w ${k && !k.other ? "vocab" : ""}" data-gloss="${esc(k ? k.en : "")}">${esc(t)}</span>`;
    }).join("");
    main.innerHTML = `<div class="panel">
      <div class="reading"><h2>${esc(r.title)} <small class="hint">· ${r.level.toUpperCase()} · text ${R.i + 1}/${items.length}</small></h2>
        <div class="text" id="txt">${html}</div>
        <div class="gloss" id="gloss">Tap any word to hear it. <u>Underlined</u> words are from your list.</div>
        <div class="translation" id="tr" style="display:${R.showEn ? "block" : "none"}">${esc(r.en)}</div></div>
      <div class="controls">
        <button class="btn" id="rprev">←</button>
        <button class="btn primary" id="rplay">🔊 Listen to text</button>
        <button class="btn" id="rtr">${R.showEn ? "Hide" : "Show"} English</button>
        <button class="btn" id="rnext">→</button>
      </div></div>`;
    $("#txt").onclick = e => {
      const s = e.target.closest(".w"); if (!s) return;
      speak(s.textContent);
      $("#gloss").textContent = `${s.textContent} — ${s.dataset.gloss || "(not in your lists)"}`;
    };
    $("#rplay").onclick = () => speak(r.fr);
    $("#rtr").onclick = () => { R.showEn = !R.showEn; renderRead(); };
    $("#rprev").onclick = () => { R.i = (R.i - 1 + items.length) % items.length; renderRead(); };
    $("#rnext").onclick = () => { R.i = (R.i + 1) % items.length; renderRead(); };
  }

  // ---------- MY WORDS ----------
  function renderWords() {
    const list = filtered();
    const counts = { new: 0, learning: 0, practice: 0, memorized: 0 };
    allWords().filter(w => S.levels.includes(w.level)).forEach(w => counts[statusOf(w)]++);
    main.innerHTML = `<div class="manage">
      <div>
        <div class="box"><h3>➕ Add a word</h3>
          <form id="addForm">
            <label>French *</label><input id="fFr" required placeholder="e.g. la boulangerie" />
            <label>English *</label><input id="fEn" required placeholder="bakery" />
            <label>Emoji / image (optional)</label><input id="fEm" placeholder="🥐" maxlength="8" />
            <label>Example sentence (optional)</label><input id="fEx" placeholder="La boulangerie ouvre à sept heures." />
            <label>Example translation (optional)</label><input id="fExEn" placeholder="The bakery opens at seven." />
            <p></p><button class="btn primary" type="submit">Add to my list</button>
          </form></div>
        <div class="box" style="margin-top:16px"><h3>📥 Bulk add</h3>
          <p class="hint">One per line: <code>français ; english ; emoji(optional)</code></p>
          <textarea id="bulk" placeholder="la boulangerie ; bakery ; 🥐&#10;se promener ; to go for a walk"></textarea>
          <p></p><button class="btn" id="bulkBtn">Import</button></div>
      </div>
      <div class="box"><h3>Word list</h3>
        <div class="stat">${Object.entries(counts).map(([k, v]) => `<span class="pill s-${k}">${STATUS_ICON[k]} ${STATUS_LABEL[k]}: ${v}</span>`).join("")}</div>
        <div style="max-height:620px;overflow:auto"><table class="table"><thead><tr><th></th><th>French</th><th>English</th><th>Status</th><th></th></tr></thead><tbody>
          ${list.map(w => `<tr data-id="${esc(w.id)}"><td>${esc(w.emoji || "")}</td><td><button class="speak" style="width:30px;height:30px;font-size:.9rem" data-say="${esc(w.id)}">🔊</button> <b>${esc(w.fr)}</b></td><td>${esc(w.en)}</td>
            <td><select data-st="${esc(w.id)}">${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${statusOf(w) === k ? "selected" : ""}>${l}</option>`).join("")}</select></td>
            <td>${w.level === "custom" ? `<button class="btn" data-del="${esc(w.id)}" title="Delete">🗑</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="hint">No words match the filters.</td></tr>`}
        </tbody></table></div></div></div>`;
    const byId = id => allWords().find(w => w.id === id);
    $("#addForm").onsubmit = e => {
      e.preventDefault();
      S.custom.push({ id: "c-" + Date.now() + Math.random().toString(36).slice(2, 5), fr: $("#fFr").value.trim(), en: $("#fEn").value.trim(), emoji: $("#fEm").value.trim(), ex: $("#fEx").value.trim(), exEn: $("#fExEn").value.trim() });
      if (!S.levels.includes("custom")) S.levels.push("custom");
      persist(); refresh();
    };
    $("#bulkBtn").onclick = () => {
      const lines = $("#bulk").value.split("\n").map(l => l.split(/[;\t]/).map(x => x.trim())).filter(p => p[0] && p[1]);
      lines.forEach((p, i) => S.custom.push({ id: "c-" + Date.now() + "-" + i, fr: p[0], en: p[1], emoji: p[2] || "", ex: "", exEn: "" }));
      if (lines.length && !S.levels.includes("custom")) S.levels.push("custom");
      persist(); refresh();
    };
    main.onclick = e => {
      const say = e.target.closest("[data-say]"); if (say) speakWord(byId(say.dataset.say));
      const del = e.target.closest("[data-del]");
      if (del && confirm("Delete this word?")) { S.custom = S.custom.filter(w => w.id !== del.dataset.del); delete S.progress[del.dataset.del]; persist(); refresh(); }
    };
    main.onchange = e => { const sel = e.target.closest("[data-st]"); if (sel) { setStatus(byId(sel.dataset.st), sel.value); renderFilters(); } };
  }

  refresh();
})();
