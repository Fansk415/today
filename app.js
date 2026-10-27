/* 今日 — 个人日程与期限提醒。纯本地，无网络请求。 */
(function () {
  'use strict';

  /* ============ 工具 ============ */
  const $ = (s, r) => (r || document).querySelector(s);
  const pad = n => String(n).padStart(2, '0');

  function toKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayKey() { return toKey(new Date()); }
  function parseKey(k) {
    const p = k.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function daysUntil(k) {
    const a = parseKey(todayKey()), b = parseKey(k);
    return Math.round((b - a) / 86400000);
  }
  function nowHM() {
    const d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function dowNow() { return new Date().getDay() || 7; }

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const DOW = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const MON = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  /* ============ 数据 ============ */
  const KEY = 'today.v1';

  function blank() {
    return {
      settings: { wakeTime: '07:30', name: '' },
      tasks: [],
      deadlines: [],
      courses: [],
      updatedAt: null
    };
  }

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const o = JSON.parse(raw);
      const b = blank();
      return {
        settings: Object.assign(b.settings, o.settings || {}),
        tasks: Array.isArray(o.tasks) ? o.tasks : [],
        deadlines: Array.isArray(o.deadlines) ? o.deadlines : [],
        courses: Array.isArray(o.courses) ? o.courses : [],
        updatedAt: o.updatedAt || null
      };
    } catch (e) {
      console.error('读取数据失败，使用空数据', e);
      return blank();
    }
  }

  function save() {
    db.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      toast('保存失败：浏览器存储已满或被禁用');
    }
  }

  /* ============ toast ============ */
  const toastBox = $('#toasts');

  function toast(msg, action) {
    const el = document.createElement('div');
    el.className = 'toast';
    const span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        action.run();
        el.remove();
      });
      el.appendChild(btn);
    }
    toastBox.appendChild(el);
    const ttl = action ? 6000 : 2600;
    setTimeout(() => el.remove(), ttl);
  }

  /* ============ 期限等级 ============ */
  function level(d) {
    if (d < 0) return 'over';
    if (d <= 2) return 'hot';
    if (d <= 7) return 'warn';
    return '';
  }
  function dueText(k) {
    const dt = parseKey(k);
    return (dt.getMonth() + 1) + '月' + dt.getDate() + '日 ' + DOW[dt.getDay() || 7];
  }

  /* ============ 渲染：顶部 ============ */
  function renderHead() {
    const now = new Date();
    const dow = now.getDay() || 7;
    $('#head-dow').textContent = DOW[dow];
    $('#head-day').textContent = (now.getMonth() + 1) + '月' + now.getDate();

    const parts = [];
    if (db.settings.wakeTime) parts.push('起床 <strong>' + esc(db.settings.wakeTime) + '</strong>');

    const todays = db.courses.filter(c => c.dow === dow).sort((a, b) => a.start.localeCompare(b.start));
    if (todays.length) parts.push('第一节 <strong>' + esc(todays[0].start) + '</strong>');

    const openTasks = db.tasks.filter(t => t.date === todayKey() && !t.done).length;
    if (openTasks) parts.push('待办 <strong>' + openTasks + '</strong> 件');
    else if (todays.length === 0) parts.push('今天没有课');

    $('#head-sub').innerHTML = parts.map(p => '<span>' + p + '</span>').join('');
  }

  /* ============ 渲染：今日 ============ */
  function bannerHtml() {
    const list = db.deadlines
      .map(d => ({ d, n: daysUntil(d.date) }))
      .sort((a, b) => a.n - b.n);

    if (!list.length) return '';

    // 优先显示最近的一个未过期期限；全部过期则显示逾期最短的
    const pick = list.find(x => x.n >= 0) || list[list.length - 1];
    const lv = level(pick.n);
    const n = pick.n;
    const num = n === 0 ? '!' : Math.abs(n);
    const label = n > 0 ? '天后截止' : (n === 0 ? '今天截止' : '天前已逾期');

    return '<div class="banner" data-lv="' + lv + '">' +
      '<div class="banner-num">' + num + '</div>' +
      '<div class="banner-body">' +
        '<div class="banner-label">' + label + '</div>' +
        '<div class="banner-title">' + esc(pick.d.title) + '</div>' +
      '</div></div>';
  }

  function coursesTodayHtml() {
    const dow = dowNow();
    const list = db.courses.filter(c => c.dow === dow).sort((a, b) => a.start.localeCompare(b.start));
    if (!list.length) return '';

    const now = nowHM();
    const rows = list.map(c => {
      let cls = 'course';
      if (now >= c.start && now < c.end) cls += ' is-now';
      else if (now >= c.end) cls += ' is-past';
      return '<div class="' + cls + '">' +
        '<div class="course-time"><b>' + esc(c.start) + '</b>' + esc(c.end) + '</div>' +
        '<div class="course-body">' +
          '<div class="course-name">' + esc(c.name) + '</div>' +
          (c.place ? '<div class="course-place">' + esc(c.place) + '</div>' : '') +
        '</div></div>';
    }).join('');

    return '<section class="sec">' +
      '<div class="sec-head"><h2 class="sec-title">今天的课</h2>' +
      '<span class="sec-meta">' + list.length + ' 节</span></div>' +
      '<div class="card">' + rows + '</div></section>';
  }

  function tasksTodayHtml() {
    const k = todayKey();
    const list = db.tasks.filter(t => t.date === k);
    list.sort((a, b) => (a.done === b.done ? a.createdAt.localeCompare(b.createdAt) : (a.done ? 1 : -1)));
    const done = list.filter(t => t.done).length;

    let body;
    if (!list.length) {
      body = '<div class="empty">今天还没有安排。<br>下面输入框写一件小事，就够了。</div>';
    } else {
      body = '<div class="card">' + list.map(taskRow).join('') + '</div>';
    }

    return '<section class="sec">' +
      '<div class="sec-head"><h2 class="sec-title">今天要做</h2>' +
      '<span class="sec-meta">' + (list.length ? done + ' / ' + list.length : '') + '</span></div>' +
      body +
      '<div class="quick">' +
        '<input id="quick-task" type="text" placeholder="再加一件…" autocomplete="off" enterkeyhint="done">' +
        '<button type="button" class="btn primary" data-act="quick-add">加</button>' +
      '</div></section>';
  }

  function taskRow(t) {
    return '<div class="row' + (t.done ? ' done' : '') + '" data-id="' + t.id + '">' +
      '<span class="check"><svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.2 4.6 8.8 10 3.2"/></svg></span>' +
      '<div class="row-body"><div class="row-title">' + esc(t.title) + '</div></div>' +
      '<button type="button" class="row-del" data-act="del-task" data-id="' + t.id + '" aria-label="删除">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
      '</button></div>';
  }

  function installHintHtml() {
    // 只有从主屏幕图标进来时 standalone 才为 true；在浏览器里开着就提示去装
    if (window.navigator.standalone === true) return '';
    return '<section class="sec">' +
      '<button type="button" class="install-hint" data-act="go-settings">' +
        '还没装到主屏幕？<b>去设置看 3 步装法，装好后才像 App。</b>' +
      '</button></section>';
  }

  function viewToday() {
    return installHintHtml() + bannerHtml() + tasksTodayHtml() + coursesTodayHtml();
  }

  /* ============ 渲染：全部 ============ */
  function viewAll() {
    const dls = db.deadlines.slice().sort((a, b) => a.date.localeCompare(b.date));
    const open = db.tasks.filter(t => !t.done);

    const groups = {};
    open.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
    const dates = Object.keys(groups).sort();

    let taskHtml = '';
    if (!dates.length) {
      taskHtml = '<div class="empty">没有未完成的事。<b>干净。</b></div>';
    } else {
      dates.forEach(k => {
        const n = daysUntil(k);
        let label;
        if (n < 0) label = DOW[parseKey(k).getDay() || 7] + ' · 逾期 ' + (-n) + ' 天';
        else if (n === 0) label = '今天';
        else if (n === 1) label = '明天';
        else label = (parseKey(k).getMonth() + 1) + '/' + parseKey(k).getDate() + ' · ' + DOW[parseKey(k).getDay() || 7];
        taskHtml += '<div class="mile">' + esc(label) + '</div>' +
          '<div class="card">' + groups[k].map(taskRow).join('') + '</div>';
      });
    }

    return '<section class="sec">' +
        '<div class="sec-head"><h2 class="sec-title">期限</h2>' +
        '<button type="button" class="btn ghost" data-act="add-dl">+ 加期限</button></div>' +
        (dls.length ? '<div class="card">' + dls.map(dlRow).join('') + '</div>'
                    : '<div class="empty">还没有期限。<br>加一个，它就会在首页倒数。</div>') +
      '</section>' +
      '<section class="sec">' +
        '<div class="sec-head"><h2 class="sec-title">待办</h2>' +
        '<span class="sec-meta">' + open.length + ' 件</span></div>' +
        taskHtml +
      '</section>' +
      '<section class="sec">' +
        '<div class="sec-head"><h2 class="sec-title">本周课表</h2>' +
        '<button type="button" class="btn ghost" data-act="add-course">+ 加课</button></div>' +
        weekHtml() +
      '</section>';
  }

  function dlRow(d) {
    const n = daysUntil(d.date);
    const lv = level(n);
    const num = n === 0 ? '今' : Math.abs(n);
    const unit = n > 0 ? '天后' : (n === 0 ? '天' : '天前');
    return '<div class="dl" data-lv="' + lv + '">' +
      '<div class="dl-num"><b>' + num + '</b><span>' + unit + '</span></div>' +
      '<div class="dl-body">' +
        '<div class="dl-title">' + esc(d.title) + '</div>' +
        '<div class="dl-date">' + esc(dueText(d.date)) + '</div>' +
      '</div>' +
      '<button type="button" class="row-del" data-act="del-dl" data-id="' + d.id + '" aria-label="删除">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
      '</button></div>';
  }

  function weekHtml() {
    if (!db.courses.length) {
      return '<div class="empty">还没有课表。<br>加进去之后，每天首页会自动显示当天的课。</div>';
    }
    let out = '';
    for (let i = 1; i <= 7; i++) {
      const list = db.courses.filter(c => c.dow === i).sort((a, b) => a.start.localeCompare(b.start));
      if (!list.length) continue;
      out += '<div class="mile">' + DOW[i] + '</div><div class="card">' + list.map(c =>
        '<div class="course">' +
          '<div class="course-time"><b>' + esc(c.start) + '</b>' + esc(c.end) + '</div>' +
          '<div class="course-body"><div class="course-name">' + esc(c.name) + '</div>' +
            (c.place ? '<div class="course-place">' + esc(c.place) + '</div>' : '') +
          '</div>' +
          '<button type="button" class="row-del" data-act="del-course" data-id="' + c.id + '" aria-label="删除">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button></div>').join('') + '</div>';
    }
    return out;
  }

  /* ============ 渲染：设置 ============ */
  function viewSettings() {
    const total = db.tasks.length;
    const done = db.tasks.filter(t => t.done).length;

    return '<section class="sec">' +
      '<div class="stats">' +
        '<div class="stat"><b>' + db.deadlines.length + '</b><span>期限</span></div>' +
        '<div class="stat"><b>' + (total - done) + '</b><span>未完成</span></div>' +
        '<div class="stat"><b>' + done + '</b><span>已完成</span></div>' +
      '</div>' +
    '</section>' +

    '<section class="sec">' +
      '<div class="sec-head"><h2 class="sec-title">让手机主动提醒你</h2></div>' +
      '<div class="card"><ol class="steps">' +
        '<li><b>装到主屏幕。</b>用 Safari 打开本页面，点底部「分享」→「添加到主屏幕」。以后从桌面图标进，全屏、断网也能开。</li>' +
        '<li><b>期限进日历，到点真的会响。</b>下面「数据」→「导出到苹果日历」，在「文件」里点开生成的 .ics →「添加全部事件」。日历会在截止前 3 天、前 1 天和当天早上 9 点各提醒一次。改过期限后重新导出导入一次，旧的那条在日历里删掉即可。</li>' +
        '<li><b>每天早上推你一下。</b>打开系统「提醒事项」，新建一条「打开今日，看今天要做的事」，设为每天重复、定个时间（比如起床后 5 分钟）。到点它会弹通知，点一下再进本 App 看清单。</li>' +
      '</ol></div>' +
      '<div class="field-hint" style="padding:10px 2px 0">' +
        '这三步都用手机自带功能，不需要服务器和账号。本 App 自己不会弹通知——网页做不到，所以把「响」这件事交给日历和提醒事项。' +
      '</div>' +
    '</section>' +

    '<section class="sec">' +
      '<div class="sec-head"><h2 class="sec-title">作息</h2></div>' +
      '<div class="card">' +
        '<div class="field"><label for="set-wake">起床时间</label>' +
          '<input id="set-wake" type="time" value="' + esc(db.settings.wakeTime) + '">' +
          '<div class="field-hint">只做记录和提示；真正的闹钟请用 iPhone 自带「时钟」。</div>' +
        '</div>' +
      '</div>' +
    '</section>' +

    '<section class="sec">' +
      '<div class="sec-head"><h2 class="sec-title">数据</h2></div>' +
      '<div class="card">' +
        '<button type="button" class="btn block ghost" data-act="export-ics">导出到苹果日历（.ics）</button>' +
        '<button type="button" class="btn block ghost" data-act="export-json">导出备份（.json）</button>' +
        '<button type="button" class="btn block ghost" data-act="import-json">导入备份</button>' +
        '<button type="button" class="btn block ghost danger" data-act="wipe">清空全部数据</button>' +
      '</div>' +
      '<div class="field-hint" style="padding:10px 2px 0">' +
        '数据只存在这台手机的浏览器里，不上传。换手机或清缓存前请先导出备份。' +
      '</div>' +
    '</section>' +

    '<section class="sec">' +
      '<div class="sec-head"><h2 class="sec-title">关于</h2></div>' +
      '<div class="card"><div class="field">' +
        '<div style="font-size:14px;line-height:1.6;color:var(--ink-2)">' +
          '「今日」是一个给自己用的日程与期限提醒工具。' +
          '把手机上的网页「添加到主屏幕」，它就会像 App 一样打开、全屏、离线可用。' +
        '</div>' +
      '</div></div>' +
    '</section>';
  }

  /* ============ 主渲染 ============ */
  let tab = 'today';

  function render() {
    renderHead();
    const main = $('#main');
    if (tab === 'today') main.innerHTML = '<div class="view is-on">' + viewToday() + '</div>';
    else if (tab === 'all') main.innerHTML = '<div class="view is-on">' + viewAll() + '</div>';
    else main.innerHTML = '<div class="view is-on">' + viewSettings() + '</div>';

    document.querySelectorAll('.tab').forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('is-on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    bindSettings();
  }

  /* ============ 弹层 ============ */
  let sheetEl = null, sheetBg = null;

  function openSheet(title, bodyHtml, actionsHtml) {
    closeSheet(true);
    sheetBg = document.createElement('div');
    sheetBg.className = 'sheet-bg';
    sheetBg.addEventListener('click', () => closeSheet());

    sheetEl = document.createElement('div');
    sheetEl.className = 'sheet';
    sheetEl.setAttribute('role', 'dialog');
    sheetEl.setAttribute('aria-modal', 'true');
    sheetEl.innerHTML = '<div class="sheet-handle"></div>' +
      '<div class="sheet-title">' + esc(title) + '</div>' +
      bodyHtml +
      '<div class="sheet-actions">' + actionsHtml + '</div>';

    document.body.appendChild(sheetBg);
    document.body.appendChild(sheetEl);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      sheetBg.classList.add('is-on');
      sheetEl.classList.add('is-on');
    });
  }

  function closeSheet(instant) {
    if (!sheetEl) return;
    const s = sheetEl, b = sheetBg;
    sheetEl = null; sheetBg = null;
    document.body.style.overflow = '';
    b.classList.remove('is-on');
    s.classList.remove('is-on');
    if (instant) { b.remove(); s.remove(); return; }
    setTimeout(() => { b.remove(); s.remove(); }, 240);
  }

  /* ---------- 新增期限 ---------- */
  function sheetAddDeadline() {
    const def = todayKey();
    openSheet('新的期限',
      '<div class="card">' +
        '<div class="field"><label for="dl-title">要准备什么</label>' +
          '<input id="dl-title" type="text" placeholder="例如：iCAN 比赛提交材料" autocomplete="off" maxlength="60">' +
        '</div>' +
        '<div class="field"><label for="dl-date">截止日期</label>' +
          '<input id="dl-date" type="date" value="' + def + '">' +
        '</div>' +
      '</div>',
      '<button type="button" class="btn" data-sheet="cancel">取消</button>' +
      '<button type="button" class="btn primary" data-sheet="ok">加进去</button>'
    );
    const t = $('#dl-title');
    t.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
    setTimeout(() => t.focus(), 60);

    function commit() {
      const title = t.value.trim();
      const date = $('#dl-date').value;
      if (!title) { toast('先写个名字'); return; }
      if (!date) { toast('选个日期'); return; }
      db.deadlines.push({ id: uid(), title: title, date: date, createdAt: new Date().toISOString() });
      save(); closeSheet(); render();
      toast('已加入期限');
    }

    sheetEl.addEventListener('click', e => {
      const b = e.target.closest('[data-sheet]');
      if (!b) return;
      if (b.dataset.sheet === 'ok') commit();
      else closeSheet();
    });
  }

  /* ---------- 新增课程 ---------- */
  function sheetAddCourse() {
    let dow = dowNow();
    openSheet('加一节课',
      '<div class="card">' +
        '<div class="field"><label>星期几</label>' +
          '<div class="dow-pick" id="c-dow">' +
            [1, 2, 3, 4, 5, 6, 7].map(i =>
              '<button type="button" data-dow="' + i + '" aria-label="' + DOW[i] + '" aria-pressed="' + (i === dow) + '">' + DOW[i].slice(1) + '</button>'
            ).join('') +
          '</div>' +
        '</div>' +
        '<div class="field"><label for="c-name">课程名</label>' +
          '<input id="c-name" type="text" placeholder="例如：大学物理实验" autocomplete="off" maxlength="40">' +
        '</div>' +
        '<div class="field"><label>时间</label>' +
          '<div class="grid2">' +
            '<input id="c-start" type="time" value="08:00" aria-label="开始">' +
            '<input id="c-end" type="time" value="09:40" aria-label="结束">' +
          '</div>' +
        '</div>' +
        '<div class="field"><label for="c-place">地点（可空）</label>' +
          '<input id="c-place" type="text" placeholder="例如：实验楼 A302" autocomplete="off" maxlength="40">' +
        '</div>' +
      '</div>',
      '<button type="button" class="btn" data-sheet="cancel">取消</button>' +
      '<button type="button" class="btn primary" data-sheet="ok">加进去</button>'
    );

    $('#c-dow').addEventListener('click', e => {
      const b = e.target.closest('[data-dow]');
      if (!b) return;
      dow = Number(b.dataset.dow);
      $('#c-dow').querySelectorAll('button').forEach(x => {
        x.setAttribute('aria-pressed', String(Number(x.dataset.dow) === dow));
      });
    });
    setTimeout(() => $('#c-name').focus(), 60);

    function commit() {
      const name = $('#c-name').value.trim();
      const start = $('#c-start').value;
      const end = $('#c-end').value;
      const place = $('#c-place').value.trim();
      if (!name) { toast('写下课程名'); return; }
      if (!start || !end) { toast('补上时间'); return; }
      if (end <= start) { toast('结束要晚于开始'); return; }
      db.courses.push({ id: uid(), name: name, dow: dow, start: start, end: end, place: place });
      save(); closeSheet(); render();
      toast('已加入 ' + DOW[dow]);
    }

    sheetEl.addEventListener('click', e => {
      const b = e.target.closest('[data-sheet]');
      if (!b) return;
      if (b.dataset.sheet === 'ok') commit();
      else closeSheet();
    });
  }

  /* ============ 事件 ============ */
  document.querySelector('.tabbar').addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (!b) return;
    tab = b.dataset.tab;
    window.scrollTo(0, 0);
    render();
  });

  $('#main').addEventListener('click', e => {
    const actEl = e.target.closest('[data-act]');
    if (actEl) {
      const act = actEl.dataset.act;
      if (act === 'quick-add') { quickAdd(); return; }
      if (act === 'go-settings') { tab = 'settings'; window.scrollTo(0, 0); render(); return; }
      if (act === 'add-dl') { sheetAddDeadline(); return; }
      if (act === 'add-course') { sheetAddCourse(); return; }
      if (act === 'del-task') { delTask(actEl.dataset.id); return; }
      if (act === 'del-dl') { delDl(actEl.dataset.id); return; }
      if (act === 'del-course') { delCourse(actEl.dataset.id); return; }
      if (act === 'export-ics') { exportICS(); return; }
      if (act === 'export-json') { exportJSON(); return; }
      if (act === 'import-json') { importJSON(); return; }
      if (act === 'wipe') { wipe(); return; }
      return;
    }

    const row = e.target.closest('.row[data-id]');
    if (row) toggleTask(row.dataset.id);
  });

  $('#main').addEventListener('keydown', e => {
    if (e.target.id === 'quick-task' && e.key === 'Enter') {
      e.preventDefault();
      quickAdd();
    }
  });

  /* ---------- 操作 ---------- */
  function quickAdd() {
    const input = $('#quick-task');
    if (!input) return;
    const title = input.value.trim();
    if (!title) return;
    db.tasks.push({
      id: uid(), title: title, date: todayKey(), done: false,
      createdAt: new Date().toISOString()
    });
    save(); render();
    const again = $('#quick-task');
    if (again) again.focus();
  }

  function toggleTask(id) {
    const t = db.tasks.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
    save(); render();
  }

  function delTask(id) {
    const i = db.tasks.findIndex(x => x.id === id);
    if (i < 0) return;
    const backup = db.tasks[i];
    const pos = i;
    db.tasks.splice(i, 1);
    save(); render();
    toast('删了一条', {
      label: '撤销',
      run: () => { db.tasks.splice(pos, 0, backup); save(); render(); }
    });
  }

  function delDl(id) {
    const i = db.deadlines.findIndex(x => x.id === id);
    if (i < 0) return;
    const backup = db.deadlines[i];
    const pos = i;
    db.deadlines.splice(i, 1);
    save(); render();
    toast('删了一个期限', {
      label: '撤销',
      run: () => { db.deadlines.splice(pos, 0, backup); save(); render(); }
    });
  }

  function delCourse(id) {
    const i = db.courses.findIndex(x => x.id === id);
    if (i < 0) return;
    const backup = db.courses[i];
    const pos = i;
    db.courses.splice(i, 1);
    save(); render();
    toast('删了一节课', {
      label: '撤销',
      run: () => { db.courses.splice(pos, 0, backup); save(); render(); }
    });
  }

  /* ---------- 设置页绑定 ---------- */
  function bindSettings() {
    const wake = $('#set-wake');
    if (wake) {
      wake.addEventListener('change', () => {
        db.settings.wakeTime = wake.value;
        save(); renderHead();
        toast('起床时间已设为 ' + wake.value);
      });
    }
  }

  /* ---------- 导出 / 导入 ---------- */
  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function icsDate(k) { return k.replace(/-/g, ''); }
  function stamp() {
    return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
  function icsEsc(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function exportICS() {
    if (!db.deadlines.length) { toast('还没有期限可导出'); return; }
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Today//CN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];

    db.deadlines.forEach(d => {
      const dt = icsDate(d.date);
      L.push('BEGIN:VEVENT');
      L.push('UID:' + d.id + '@today');
      L.push('DTSTAMP:' + stamp());
      L.push('DTSTART;VALUE=DATE:' + dt);
      L.push('DTEND;VALUE=DATE:' + icsDate(nextDay(d.date)));
      L.push('SUMMARY:' + icsEsc(d.title));
      L.push('DESCRIPTION:' + icsEsc('来自「今日」的期限提醒'));
      // 全天事件从截止日 00:00 起算，要落在早上 9 点就得从起点往回补 15 小时
      L.push('BEGIN:VALARM');
      L.push('TRIGGER:-P2DT15H');
      L.push('ACTION:DISPLAY');
      L.push('DESCRIPTION:' + icsEsc('还有 3 天：' + d.title));
      L.push('END:VALARM');
      L.push('BEGIN:VALARM');
      L.push('TRIGGER:-PT15H');
      L.push('ACTION:DISPLAY');
      L.push('DESCRIPTION:' + icsEsc('明天截止：' + d.title));
      L.push('END:VALARM');
      L.push('BEGIN:VALARM');
      L.push('TRIGGER:PT9H');
      L.push('ACTION:DISPLAY');
      L.push('DESCRIPTION:' + icsEsc('今天截止：' + d.title));
      L.push('END:VALARM');
      L.push('END:VEVENT');
    });

    L.push('END:VCALENDAR');
    download('今日期限.ics', L.join('\r\n'), 'text/calendar');
    toast('已生成 .ics，用「文件」打开后选日历导入');
  }

  function nextDay(k) {
    const d = parseKey(k);
    d.setDate(d.getDate() + 1);
    return toKey(d);
  }

  function exportJSON() {
    download('今日备份-' + todayKey() + '.json',
      JSON.stringify(Object.assign({ app: '今日', version: 1, exportedAt: new Date().toISOString() }, db), null, 2),
      'application/json');
    toast('已导出备份');
  }

  function importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const o = JSON.parse(String(r.result));
          if (!o || typeof o !== 'object') throw new Error('格式不对');
          if (!Array.isArray(o.tasks) && !Array.isArray(o.deadlines) && !Array.isArray(o.courses)) {
            throw new Error('文件里没有可识别的数据');
          }
          const snapshot = JSON.parse(JSON.stringify(db));
          db.settings = Object.assign(db.settings, o.settings || {});
          db.tasks = Array.isArray(o.tasks) ? o.tasks : [];
          db.deadlines = Array.isArray(o.deadlines) ? o.deadlines : [];
          db.courses = Array.isArray(o.courses) ? o.courses : [];
          save(); render();
          toast('已导入', {
            label: '撤销',
            run: () => { db = snapshot; save(); render(); }
          });
        } catch (err) {
          toast('导入失败：' + err.message);
        }
      };
      r.readAsText(f);
    });
    input.click();
  }

  function wipe() {
    if (!confirm('清空所有期限、待办和课表？这个操作会立刻生效。')) return;
    const snapshot = JSON.parse(JSON.stringify(db));
    db = blank();
    save(); render();
    toast('已清空', {
      label: '撤销',
      run: () => { db = snapshot; save(); render(); }
    });
  }

  /* ============ 启动 ============ */
  render();

  // 跨过午夜自动刷新"今天"
  let lastDay = todayKey();
  setInterval(() => {
    const k = todayKey();
    if (k !== lastDay) { lastDay = k; render(); }
  }, 30000);

  // 从后台切回时刷新课程高亮
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });

  // Service Worker：离线可用
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();