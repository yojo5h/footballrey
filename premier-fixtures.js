/* Premier League results + upcoming fixtures, rendered under the standings table.
   Data: API-Sports /fixtures (one request for the whole season, cached 10 minutes). */
(function () {
  var LEAGUE = 39;
  var SEASON = 2026;
  var KEY = '26c4d56c5c9b4795471cbca950c0e469';
  var CACHE_KEY = 'pl-fixtures-' + SEASON;
  var CACHE_MS = 10 * 60 * 1000;
  var PAGE_SIZE = 30;

  var FINISHED = { FT: 1, AET: 1, PEN: 1 };
  var LIVE = { '1H': 1, HT: 1, '2H': 1, ET: 1, BT: 1, P: 1, LIVE: 1, INT: 1 };

  var root = document.getElementById('pl-fixtures');
  if (!root) return;
  var statusEl = document.getElementById('pl-fixtures-status');
  var listEl = document.getElementById('pl-fixtures-list');
  var moreBtn = document.getElementById('pl-fixtures-more');
  var tabButtons = root.querySelectorAll('.pl-tab');

  var fixtures = [];
  var tab = 'upcoming';
  var shown = PAGE_SIZE;

  function setStatus(msg) {
    statusEl.textContent = msg;
    statusEl.hidden = !msg;
  }

  function load() {
    try {
      var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.t < CACHE_MS) return Promise.resolve(cached.data);
    } catch (e) { /* storage unavailable: just fetch */ }

    return fetch('https://v3.football.api-sports.io/fixtures?league=' + LEAGUE + '&season=' + SEASON, {
      headers: { 'x-apisports-key': KEY }
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var errs = json.errors;
        var hasErr = Array.isArray(errs) ? errs.length : errs && Object.keys(errs).length;
        if (hasErr || !json.response) throw new Error('API error');
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: json.response })); } catch (e) { }
        return json.response;
      });
  }

  function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function team(t, side) {
    var span = el('span', 'pl-team pl-' + side);
    var name = el('span', 'pl-team-name', t.name);
    var img = el('img', 'pl-logo');
    img.src = t.logo;
    img.alt = '';
    img.loading = 'lazy';
    if (side === 'home') { span.appendChild(name); span.appendChild(img); }
    else { span.appendChild(img); span.appendChild(name); }
    return span;
  }

  function row(f) {
    var short = f.fixture.status.short;
    var when = new Date(f.fixture.date);
    var li = el('li', 'pl-match');

    var state;
    if (FINISHED[short]) state = 'FT';
    else if (LIVE[short]) state = short === 'HT' ? 'HT' : (f.fixture.status.elapsed || '') + "'";
    else if (short === 'NS' || short === 'TBD') state = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    else state = short; // PST, CANC, SUSP, ABD...
    li.appendChild(el('span', 'pl-state' + (LIVE[short] ? ' pl-live' : ''), state));

    li.appendChild(team(f.teams.home, 'home'));

    var score = el('span', 'pl-score');
    if (FINISHED[short] || LIVE[short]) score.textContent = f.goals.home + ' - ' + f.goals.away;
    else score.textContent = 'vs';
    li.appendChild(score);

    li.appendChild(team(f.teams.away, 'away'));
    return li;
  }

  function visible() {
    var list;
    if (tab === 'results') {
      list = fixtures.filter(function (f) { return FINISHED[f.fixture.status.short]; });
      list.sort(function (a, b) { return b.fixture.timestamp - a.fixture.timestamp; });
    } else {
      list = fixtures.filter(function (f) { return !FINISHED[f.fixture.status.short]; });
      list.sort(function (a, b) { return a.fixture.timestamp - b.fixture.timestamp; });
    }
    return list;
  }

  function render() {
    var list = visible();
    listEl.textContent = '';
    if (!list.length) {
      setStatus(tab === 'results' ? 'No results yet.' : 'No upcoming fixtures.');
      moreBtn.hidden = true;
      return;
    }
    setStatus('');

    var slice = list.slice(0, shown);
    var lastDay = null, ul = null;
    var dateFmt = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    slice.forEach(function (f) {
      var d = new Date(f.fixture.date);
      var k = dayKey(d);
      if (k !== lastDay) {
        listEl.appendChild(el('h3', 'pl-date', d.toLocaleDateString([], dateFmt)));
        ul = el('ul', 'pl-day');
        listEl.appendChild(ul);
        lastDay = k;
      }
      ul.appendChild(row(f));
    });
    moreBtn.hidden = slice.length >= list.length;
  }

  function select(name) {
    tab = name;
    shown = PAGE_SIZE;
    tabButtons.forEach(function (b) {
      var on = b.getAttribute('data-tab') === name;
      b.classList.toggle('pl-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    render();
  }

  tabButtons.forEach(function (b) {
    b.addEventListener('click', function () { select(b.getAttribute('data-tab')); });
  });
  moreBtn.addEventListener('click', function () { shown += PAGE_SIZE; render(); });

  setStatus('Loading matches…');
  load().then(function (data) {
    fixtures = data;
    select('upcoming');
  }).catch(function () {
    setStatus('Could not load matches right now. Please try again later.');
  });
})();
