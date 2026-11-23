// ===== 가계부 =====
// 저장: localStorage 'myplan-ledger-v1' (cloud.js가 기록방과 함께 클라우드에 저장)
// 주 단위(일요일 시작, 주간 계획과 같음)로 보고, 분야마다 '한 주 예산'을 정할 수 있음
(() => {
  'use strict';
  const KEY = 'myplan-ledger-v1';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
  // 알림 (되돌리기 버튼 선택). script.js의 #toast 칸을 같이 씀
  let sayTimer;
  function say(t, label, fn) {
    const el = $('toast'); if (!el) return;
    el.textContent = t;
    if (label) { const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-action'; b.textContent = label; b.addEventListener('click', () => { el.classList.remove('show'); fn(); }); el.append(' ', b); }
    el.classList.toggle('has-action', !!label);
    el.classList.add('show');
    clearTimeout(sayTimer); sayTimer = setTimeout(() => el.classList.remove('show', 'has-action'), label ? 5000 : 2500);
  }
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const weekOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - x.getDay()); return keyOf(x); };
  const shiftWeek = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + 7 * n); return keyOf(d); };
  const today = () => keyOf(new Date());
  const THIS = weekOf(new Date());
  const COLORS = ['#2340E8', '#F06A2C', '#10A37F', '#E5487D', '#7A4FE0', '#F2B705', '#0EA5C6', '#6B7280'];
  const DEFAULT_CATS = [
    ['식비', '🍚'], ['카페·간식', '☕'], ['교통', '🚌'], ['쇼핑', '🛍️'],
    ['생활', '🏠'], ['문화·여가', '🎬'], ['교육', '📚'], ['기타', '✦'],
  ].map(([name, icon], i) => ({ id: 'c' + i, name, icon, color: COLORS[i % COLORS.length], budget: null, period: 'week' }));

  /* ---------- 데이터 ---------- */
  function blank() { return { version: 1, total: { budget: null, period: 'month' }, categories: DEFAULT_CATS.map((c) => ({ ...c })), entries: [] }; }
  function validate(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const cats = (Array.isArray(raw.categories) ? raw.categories : []).filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string').slice(0, 40)
      .map((c, i) => ({ id: c.id, name: c.name.slice(0, 20), icon: typeof c.icon === 'string' ? c.icon.slice(0, 4) : '', color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : COLORS[i % COLORS.length], budget: Number.isFinite(c.budget) && c.budget >= 0 ? Math.round(c.budget) : null, period: c.period === 'month' ? 'month' : 'week' }));
    const entries = (Array.isArray(raw.entries) ? raw.entries : []).filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number.isFinite(e.amount) && e.amount > 0).slice(0, 20000)
      .map((e) => ({ id: typeof e.id === 'string' ? e.id : uid(), date: e.date, type: e.type === 'in' ? 'in' : 'out', cat: typeof e.cat === 'string' ? e.cat : '', amount: Math.round(e.amount), memo: typeof e.memo === 'string' ? e.memo.slice(0, 60) : '' }));
    const t = raw.total && typeof raw.total === 'object' ? raw.total : {};
    const total = { budget: Number.isFinite(t.budget) && t.budget >= 0 ? Math.round(t.budget) : null, period: t.period === 'week' ? 'week' : 'month' };
    return { version: 1, total, categories: cats.length ? cats : blank().categories, entries };
  }
  let data;
  try { data = validate(JSON.parse(localStorage.getItem(KEY) || 'null')) || blank(); } catch { data = blank(); }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} };
  if (!localStorage.getItem(KEY)) persist();
  const catOf = (id) => data.categories.find((c) => c.id === id);
  // 편집칸에서 '전체 예산' 줄도 분야처럼 다룸 (budget·period 모양이 같음)
  const editTarget = (id) => (id === '__total' ? data.total : catOf(id));

  /* ---------- 상태 ---------- */
  let wk = THIS, type = 'out', cat = data.categories[0]?.id || '', editId = null, budgetMode = false, undo = null;

  function weekLabel(k) {
    const s = dateOf(k), e = dateOf(k), w = dateOf(k);
    e.setDate(s.getDate() + 6); w.setDate(s.getDate() + 3);
    return { title: `${w.getFullYear() !== new Date().getFullYear() ? w.getFullYear() + '년 ' : ''}${w.getMonth() + 1}월 ${Math.ceil(w.getDate() / 7)}주차`, range: `${s.getMonth() + 1}.${s.getDate()} ~ ${e.getMonth() + 1}.${e.getDate()}`, start: keyOf(s), end: keyOf(e), month: w.getMonth(), year: w.getFullYear() };
  }
  const inWeek = (e) => weekOf(dateOf(e.date)) === wk;
  /* ---------- 달 예산 → 주 예산 ----------
     달로 정한 예산은 그 달 날짜 수로 나눠 하루치를 구하고, 그 주에 들어 있는 날만큼 더함.
     (예: 11월 30만원 → 하루 1만원 → 11월 안의 7일짜리 주는 7만원. 10/26~11/1처럼 두 달에 걸친 주는 각 달 몫을 합침) */
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  function weekBudget(c, k) {
    if (c.budget == null) return null;
    if (c.period !== 'month') return c.budget;
    const s = dateOf(k); let sum = 0;
    for (let i = 0; i < 7; i++) { const d = new Date(s); d.setDate(s.getDate() + i); sum += c.budget / daysIn(d.getFullYear(), d.getMonth()); }
    return Math.round(sum);
  }
  const splitHint = (c) => (c.period === 'month' && c.budget ? `→ 이번 주 ${won(weekBudget(c, wk))}` : '');
  // 대략 한 주 몫 (편집칸 안내용): 30일 기준
  const approxWeek = (n) => Math.round((n * 7) / 30 / 100) * 100;

  /* ---------- 그리기 ---------- */
  // keepEditor: 예산 편집칸에 입력 중일 때는 편집칸은 그대로 두고 나머지만 다시 그림
  function render(keepEditor) {
    const wl = weekLabel(wk);
    $('lg-week-title').textContent = wl.title;
    $('lg-week-range').textContent = wl.range;
    $('lg-week-today').hidden = wk === THIS;
    $('lg-week-badge').hidden = wk !== THIS;
    $('lg-sheet-range').textContent = `${wl.title} · ${wl.range}`;

    const list = data.entries.filter(inWeek);
    const out = list.filter((e) => e.type === 'out'), inc = list.filter((e) => e.type === 'in');
    const spent = out.reduce((s, e) => s + e.amount, 0), income = inc.reduce((s, e) => s + e.amount, 0);
    const budgets = data.categories.filter((c) => c.budget != null);
    const catWeekSum = budgets.reduce((s, c) => s + weekBudget(c, wk), 0);
    // 전체 예산을 정했으면 그게 기준 (모든 지출과 비교), 아니면 분야 예산 합계
    const hasTotal = data.total.budget != null;
    const budgetSum = hasTotal ? weekBudget(data.total, wk) : catWeekSum;
    // 이번 달(이 주의 수요일이 속한 달) 기준: 달 예산으로 정한 분야만
    const ym = `${wl.year}-${pad(wl.month + 1)}`;
    const monthCats = data.categories.filter((c) => c.budget != null && c.period === 'month');
    const totalMonth = hasTotal && data.total.period === 'month';
    const monthBudget = totalMonth ? data.total.budget : monthCats.reduce((s, c) => s + c.budget, 0);
    const monthSpentOf = (cid) => data.entries.filter((e) => e.type === 'out' && e.cat === cid && e.date.slice(0, 7) === ym).reduce((t, e) => t + e.amount, 0);
    const monthAll = data.entries.filter((e) => e.type === 'out' && e.date.slice(0, 7) === ym).reduce((t, e) => t + e.amount, 0);
    const monthUsed = totalMonth ? monthAll : monthCats.reduce((s, c) => s + monthSpentOf(c.id), 0);
    // 전체 예산이면 모든 지출, 아니면 예산 있는 분야에서 쓴 돈만 예산과 비교
    const spentBudgeted = hasTotal ? spent : out.filter((e) => catOf(e.cat)?.budget != null).reduce((s, e) => s + e.amount, 0);
    const left = budgetSum - spentBudgeted;
    const monthOut = data.entries.filter((e) => e.type === 'out' && e.date.slice(0, 7) === `${wl.year}-${pad(wl.month + 1)}`).reduce((s, e) => s + e.amount, 0);

    $('lg-summary').innerHTML = `
      <div class="lg-stat"><span>이번 주 지출</span><b>${won(spent)}</b></div>
      <div class="lg-stat"><span>${hasTotal ? '전체 한 주 예산' : '한 주 예산'}</span><b>${budgetSum ? won(budgetSum) : '<em>미정</em>'}</b></div>
      <div class="lg-stat ${budgetSum ? (left < 0 ? 'over' : 'ok') : ''}"><span>${left < 0 ? '예산 초과' : '남은 예산'}</span><b>${budgetSum ? won(Math.abs(left)) : '—'}</b></div>
      ${income ? `<div class="lg-stat in"><span>이번 주 수입</span><b>+${won(income)}</b></div>` : ''}
      ${monthBudget ? `<div class="lg-month-bar ${monthUsed > monthBudget ? 'over' : ''}"><span>${wl.month + 1}월 ${totalMonth ? '전체 ' : ''}예산 <b>${won(monthUsed)}</b> / ${won(monthBudget)} 사용</span><span class="lg-bar" aria-hidden="true"><span style="width:${Math.min(100, Math.round((monthUsed / Math.max(1, monthBudget)) * 100))}%"></span></span><em>${monthUsed > monthBudget ? `${won(monthUsed - monthBudget)} 초과` : `${won(monthBudget - monthUsed)} 남음`}</em></div>` : ''}
      <p class="lg-month">${wl.month + 1}월 전체 지출 <b>${won(monthOut)}</b></p>`;

    // 분야별 예산
    if (keepEditor) { /* 편집칸 유지 */ }
    else if (budgetMode) {
      $('lg-cats').innerHTML = `<p class="lg-edit-help">전체·분야마다 <b>주</b> 또는 <b>달</b>을 골라 예산을 넣으세요. 달로 넣으면 그 달 날짜 수에 맞춰 주마다 알아서 나눠요. 모두 비워 둬도 돼요.</p>
        <div class="lg-edit-row lg-total-row" data-cid="__total">
          <span class="lg-total-ico" aria-hidden="true">₩</span>
          <b class="lg-total-name">전체 예산 <small>모든 지출 합계</small></b>
          <span class="lg-budget-cell">
            <span class="lg-period" role="group" aria-label="전체 예산 단위"><button type="button" data-period="week" aria-pressed="${data.total.period === 'week'}">주</button><button type="button" data-period="month" aria-pressed="${data.total.period === 'month'}">달</button></span>
            <span class="lg-budget-wrap"><input class="lg-budget-in" inputmode="numeric" value="${data.total.budget != null ? data.total.budget.toLocaleString('ko-KR') : ''}" placeholder="없음" aria-label="전체 ${data.total.period === 'month' ? '한 달' : '한 주'} 예산"><span>원</span></span>
            <small class="lg-split">${splitHint(data.total)}</small>
          </span><span></span>
        </div>
        <p class="lg-total-warn" id="lg-total-warn"></p>
        <div class="lg-edit-head"><span></span><span>분야</span><span>예산</span><span></span></div>` +
        data.categories.map((c) => `<div class="lg-edit-row" data-cid="${esc(c.id)}">
          <input class="lg-icon-in" value="${esc(c.icon)}" maxlength="4" aria-label="${esc(c.name)} 아이콘">
          <input class="lg-name-in" value="${esc(c.name)}" maxlength="20" aria-label="분야 이름">
          <span class="lg-budget-cell">
            <span class="lg-period" role="group" aria-label="${esc(c.name)} 예산 단위"><button type="button" data-period="week" aria-pressed="${c.period !== 'month'}">주</button><button type="button" data-period="month" aria-pressed="${c.period === 'month'}">달</button></span>
            <span class="lg-budget-wrap"><input class="lg-budget-in" inputmode="numeric" value="${c.budget != null ? c.budget.toLocaleString('ko-KR') : ''}" placeholder="없음" aria-label="${esc(c.name)} ${c.period === 'month' ? '한 달' : '한 주'} 예산"><span>원</span></span>
            <small class="lg-split">${splitHint(c)}</small>
          </span>
          <button type="button" class="lg-cat-del" aria-label="${esc(c.name)} 분야 삭제" title="분야 삭제">×</button></div>`).join('') +
        `<button type="button" class="btn small" id="lg-cat-add">＋ 분야 추가</button>`;
    } else {
      const byCat = data.categories.map((c) => ({ c, s: out.filter((e) => e.cat === c.id).reduce((t, e) => t + e.amount, 0) }));
      const other = out.filter((e) => !catOf(e.cat)).reduce((t, e) => t + e.amount, 0);
      const rows = byCat.filter(({ c, s }) => c.budget != null || s > 0);
      $('lg-cats').innerHTML = (rows.length ? rows.map(({ c, s }) => {
        const wb = weekBudget(c, wk), has = wb != null, r = has && wb > 0 ? s / wb : (has && s > 0 ? 2 : 0);
        const lv = !has ? 'none' : r >= 1 ? (s > wb ? 'over' : 'full') : r >= 0.8 ? 'warn' : 'ok';
        const mNote = c.period === 'month' && has ? `<small class="lg-mnote">${wl.month + 1}월 ${won(monthSpentOf(c.id))} / ${won(c.budget)}</small>` : '';
        const note = (!has ? '예산 없음' : s > wb ? `${won(s - wb)} 초과` : `${won(wb - s)} 남음`) + mNote;
        return `<div class="lg-cat lv-${lv}">
          <span class="lg-cat-name"><i style="background:${c.color}">${esc(c.icon)}</i>${esc(c.name)}</span>
          <span class="lg-bar" aria-hidden="true"><span style="width:${Math.min(100, Math.round(r * 100))}%;${lv === 'ok' || lv === 'none' ? `background:${c.color}` : ''}"></span></span>
          <span class="lg-cat-num"><b>${won(s)}</b>${has ? ` / ${won(wb)}` : ''}${c.period === 'month' && has ? '<small class="lg-per">달 예산</small>' : ''}</span>
          <span class="lg-cat-note">${note}</span></div>`;
      }).join('') : '<p class="lg-empty">아직 이번 주 지출이 없어요. [예산·분야 편집]에서 분야별로 한 주나 한 달 예산을 정해 보세요.</p>') +
        (other ? `<p class="lg-empty">분야가 지워진 지출 ${won(other)}</p>` : '');
    }
    $('lg-budget-toggle').textContent = budgetMode ? '편집 끝내기' : '예산·분야 편집';
    $('lg-budget-toggle').classList.toggle('primary', budgetMode);

    // 분야 고르기
    $('lg-cat-pick').hidden = type === 'in';
    if (!catOf(cat)) cat = data.categories[0]?.id || '';
    $('lg-cat-pick').innerHTML = data.categories.map((c) => `<button type="button" class="lg-chip" data-cat="${esc(c.id)}" aria-pressed="${c.id === cat}" style="--c:${c.color}">${esc(c.icon)} ${esc(c.name)}</button>`).join('');
    document.querySelectorAll('[data-lg-type]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lgType === type)));
    $('lg-form').classList.toggle('income', type === 'in');

    // 내역 (날짜별)
    const days = {};
    for (const e of list) (days[e.date] ||= []).push(e);
    const dks = Object.keys(days).sort().reverse();
    $('lg-list').innerHTML = dks.length ? dks.map((d) => {
      const dt = dateOf(d), arr = days[d];
      const dayOut = arr.filter((e) => e.type === 'out').reduce((s, e) => s + e.amount, 0);
      return `<li class="lg-day"><div class="lg-day-head"><b>${dt.getMonth() + 1}.${dt.getDate()} (${DOW[dt.getDay()]})${d === today() ? ' <em>오늘</em>' : ''}</b><span>${dayOut ? '-' + won(dayOut) : ''}</span></div>
        <ul>${arr.map((e) => {
          const c = catOf(e.cat);
          return `<li class="lg-row${e.type === 'in' ? ' in' : ''}${e.id === editId ? ' editing' : ''}" data-eid="${esc(e.id)}">
            <button type="button" class="lg-row-main" aria-label="${esc(e.memo || (c ? c.name : '수입'))} ${won(e.amount)} 수정">
              <span class="lg-tag" style="--c:${e.type === 'in' ? '#10A37F' : c?.color || '#9DA1B8'}">${e.type === 'in' ? '💰 수입' : c ? `${esc(c.icon)} ${esc(c.name)}` : '분야 없음'}</span>
              <span class="lg-memo">${esc(e.memo)}</span>
              <span class="lg-amt">${e.type === 'in' ? '+' : '-'}${won(e.amount)}</span>
            </button>
            <button type="button" class="lg-del" aria-label="삭제" title="삭제">×</button></li>`;
        }).join('')}</ul></li>`;
    }).join('') : '<li class="lg-empty">이 주에 적은 내역이 없어요.</li>';

    // 폼 상태
    $('lg-submit').textContent = editId ? '수정하기' : '적기';
    $('lg-cancel').hidden = !editId;
  }

  /* ---------- 폼 ---------- */
  const amountIn = $('lg-amount');
  const parseAmt = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;
  amountIn.addEventListener('input', () => {
    const n = parseAmt(amountIn.value);
    amountIn.value = n ? n.toLocaleString('ko-KR') : '';
  });
  function defaultDate() {
    const wl = weekLabel(wk), t = today();
    return t >= wl.start && t <= wl.end ? t : wl.start;
  }
  function resetForm() {
    editId = null; amountIn.value = ''; $('lg-memo').value = ''; $('lg-date').value = defaultDate();
  }
  document.querySelectorAll('[data-lg-type]').forEach((b) => b.addEventListener('click', () => { type = b.dataset.lgType; render(); }));
  $('lg-cat-pick').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; render(); });
  $('lg-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmt(amountIn.value);
    if (!amount) { amountIn.focus(); return say('금액을 입력하세요.'); }
    if (amount > 100000000) return say('금액이 너무 커요.');
    const date = $('lg-date').value || defaultDate();
    const rec = { date, type, cat: type === 'in' ? '' : cat, amount, memo: $('lg-memo').value.trim().slice(0, 60) };
    if (editId) { const x = data.entries.find((v) => v.id === editId); if (x) Object.assign(x, rec); }
    else data.entries.push({ id: uid(), ...rec });
    const wasEdit = !!editId;
    persist();
    const target = weekOf(dateOf(date));
    if (target !== wk) { wk = target; say(`${weekLabel(wk).title}로 이동했어요.`); }
    else say(wasEdit ? '수정했어요.' : type === 'in' ? `수입 ${won(amount)} 적었어요.` : `${catOf(cat)?.name || ''} ${won(amount)} 적었어요.`);
    resetForm(); render();
    if (!wasEdit) amountIn.focus();
  });
  $('lg-cancel').addEventListener('click', () => { resetForm(); render(); });
  $('lg-memo').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('lg-form').requestSubmit(); } });

  /* ---------- 내역 ---------- */
  $('lg-list').addEventListener('click', (e) => {
    const row = e.target.closest('.lg-row'); if (!row) return;
    const x = data.entries.find((v) => v.id === row.dataset.eid); if (!x) return;
    if (e.target.closest('.lg-del')) {
      const before = data.entries.slice();
      data.entries = data.entries.filter((v) => v !== x);
      if (editId === x.id) resetForm();
      persist(); render();
      undo = before;
      say(`${won(x.amount)} 내역을 지웠어요.`, '되돌리기', () => { if (!undo) return; data.entries = undo; undo = null; persist(); render(); });
      return;
    }
    // 눌러서 수정
    editId = x.id; type = x.type; if (x.cat) cat = x.cat;
    amountIn.value = x.amount.toLocaleString('ko-KR'); $('lg-memo').value = x.memo; $('lg-date').value = x.date;
    render();
    $('lg-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    amountIn.focus();
  });

  /* ---------- 예산·분야 편집 ---------- */
  $('lg-budget-toggle').addEventListener('click', () => { budgetMode = !budgetMode; render(); if (budgetMode) { totalWarn(); document.querySelector('.lg-budget-in')?.focus(); } });
  $('lg-cats').addEventListener('input', (e) => {
    const row = e.target.closest('.lg-edit-row'); if (!row) return;
    const c = editTarget(row.dataset.cid); if (!c) return;
    if (e.target.classList.contains('lg-budget-in')) {
      const n = parseAmt(e.target.value);
      e.target.value = e.target.value.trim() === '' ? '' : n.toLocaleString('ko-KR');
      c.budget = e.target.value === '' ? null : n;
      row.querySelector('.lg-split').textContent = splitHint(c);
    } else if (e.target.classList.contains('lg-name-in')) { if (e.target.value.trim()) c.name = e.target.value.trim(); }
    else if (e.target.classList.contains('lg-icon-in')) c.icon = e.target.value.trim();
    persist();
    render(true);
    totalWarn();
  });
  // 분야 예산 합계가 전체 예산보다 많으면 알려 줌 (이번 주 기준)
  function totalWarn() {
    const el = $('lg-total-warn'); if (!el) return;
    if (data.total.budget == null) { el.textContent = ''; return; }
    const tw = weekBudget(data.total, wk), cw = data.categories.reduce((s, c) => s + (c.budget != null ? weekBudget(c, wk) : 0), 0);
    el.textContent = cw > tw ? `분야별 예산 합계(이번 주 ${won(cw)})가 전체 예산(이번 주 ${won(tw)})보다 ${won(cw - tw)} 많아요.` : '';
  }
  $('lg-cats').addEventListener('click', (e) => {
    const pb = e.target.closest('[data-period]');
    if (pb) {
      const row = pb.closest('.lg-edit-row'), c = editTarget(row.dataset.cid), cid = row.dataset.cid; if (!c) return;
      const next = pb.dataset.period; if (c.period === next) return;
      // 단위를 바꾸면 금액도 대략 맞춰 줌 (주 7만원 ↔ 달 30만원)
      if (c.budget != null) c.budget = next === 'month' ? Math.round((c.budget * 30) / 7 / 1000) * 1000 : approxWeek(c.budget);
      c.period = next; persist(); render(); totalWarn();
      document.querySelector(`.lg-edit-row[data-cid="${CSS.escape(cid)}"] .lg-budget-in`)?.focus();
      return;
    }
    if (e.target.closest('#lg-cat-add')) {
      const c = { id: 'c' + uid(), name: '새 분야', icon: '•', color: COLORS[data.categories.length % COLORS.length], budget: null, period: 'week' };
      data.categories.push(c); persist(); render();
      const inp = document.querySelector(`.lg-edit-row[data-cid="${c.id}"] .lg-name-in`); inp?.focus(); inp?.select();
      return;
    }
    const del = e.target.closest('.lg-cat-del'); if (!del) return;
    const c = catOf(del.closest('.lg-edit-row').dataset.cid); if (!c) return;
    if (data.categories.length <= 1) return say('분야는 하나 이상 있어야 해요.');
    const used = data.entries.filter((v) => v.cat === c.id).length;
    if (!confirm(`'${c.name}' 분야를 지울까요?${used ? `\n이 분야로 적은 내역 ${used}개는 남고 '분야 없음'으로 보여요.` : ''}`)) return;
    data.categories = data.categories.filter((x) => x !== c); persist(); render();
  });

  /* ---------- 주 넘기기 ---------- */
  const go = (k) => { wk = k; if (editId) resetForm(); else $('lg-date').value = defaultDate(); render(); };
  $('lg-week-prev').addEventListener('click', () => go(shiftWeek(wk, -1)));
  $('lg-week-next').addEventListener('click', () => go(shiftWeek(wk, 1)));
  $('lg-week-today').addEventListener('click', () => go(THIS));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('panel-ledger').hidden) render(); });

  window.myPlanLedger = {
    getData: () => data,
    clearWeek() {
      const n = data.entries.filter(inWeek).length;
      data.entries = data.entries.filter((e) => !inWeek(e)); persist(); resetForm(); render();
      return n;
    },
  };
  resetForm();
  render();
})();
