/* Results + upcoming fixtures for one league, rendered under a standings table.
   Configure with data-league and data-season on #fx-fixtures.
   Data: API-Sports /fixtures (one request for the whole season, cached 10 minutes). */
(function () {
  var root = document.getElementById('fx-fixtures');
  if (!root) return;
  var LEAGUE = root.getAttribute('data-league');
  var SEASON = root.getAttribute('data-season');
  var KEY = '26c4d56c5c9b4795471cbca950c0e469';
  var CACHE_KEY = 'fx-fixtures-' + LEAGUE + '-' + SEASON;
  var SHOW_ROUND = root.getAttribute('data-show-round') === 'true';
  // Optional: set data-match-page="match.html" to link every match row to its match page.
  var MATCH_PAGE = root.getAttribute('data-match-page');
  var CACHE_MS = 10 * 60 * 1000;
  var PAGE_SIZE = 30;

  var FINISHED = { FT: 1, AET: 1, PEN: 1 };
  // Matches that will not be played (or were decided off the pitch) belong with the results, not the upcoming list.
  var DONE = { FT: 1, AET: 1, PEN: 1, ABD: 1, CANC: 1, AWD: 1, WO: 1 };
  var LIVE = { '1H': 1, HT: 1, '2H': 1, ET: 1, BT: 1, P: 1, LIVE: 1, INT: 1 };

  var statusEl = document.getElementById('fx-fixtures-status');
  var listEl = document.getElementById('fx-fixtures-list');
  var moreBtn = document.getElementById('fx-fixtures-more');
  var tabButtons = root.querySelectorAll('.fx-tab');

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
    var span = el('span', 'fx-team fx-' + side);
    var name = el('span', 'fx-team-name', t.name);
    var img = el('img', 'fx-logo');
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
    var li = el('li', 'fx-match');

    var state;
    if (short === 'FT') state = 'FT';
    else if (DONE[short]) state = short; // AET, PEN, ABD, CANC...
    else if (LIVE[short]) state = short === 'HT' ? 'HT' : (f.fixture.status.elapsed || '') + "'";
    else if (short === 'NS' || short === 'TBD') state = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    else state = short; // PST, CANC, SUSP, ABD...
    li.appendChild(el('span', 'fx-state' + (LIVE[short] ? ' fx-live' : ''), state));

    li.appendChild(team(f.teams.home, 'home'));

    var score = el('span', 'fx-score');
    if ((FINISHED[short] || LIVE[short]) && f.goals.home !== null && f.goals.away !== null) score.textContent = f.goals.home + ' - ' + f.goals.away;
    else score.textContent = 'vs';
    var pens = f.score && f.score.penalty;
    if (short === 'PEN' && pens && pens.home !== null && pens.away !== null) {
      score.appendChild(el('span', 'fx-pens', '(' + pens.home + '-' + pens.away + ')'));
    }
    li.appendChild(score);

    li.appendChild(team(f.teams.away, 'away'));
    if (SHOW_ROUND && f.league.round) li.appendChild(el('span', 'fx-round', f.league.round));

    // Stretched link over the whole row, so the grid layout above is untouched.
    if (MATCH_PAGE) {
      var link = el('a', 'fx-match-link');
      link.href = MATCH_PAGE + '?id=' + encodeURIComponent(f.fixture.id);
      link.setAttribute('aria-label', f.teams.home.name + ' vs ' + f.teams.away.name + ': match report');
      li.classList.add('fx-has-link');
      li.appendChild(link);
    }
    return li;
  }

  function visible() {
    var list;
    if (tab === 'results') {
      list = fixtures.filter(function (f) { return DONE[f.fixture.status.short]; });
      list.sort(function (a, b) { return b.fixture.timestamp - a.fixture.timestamp; });
    } else {
      list = fixtures.filter(function (f) { return !DONE[f.fixture.status.short]; });
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
        listEl.appendChild(el('h3', 'fx-date', d.toLocaleDateString([], dateFmt)));
        ul = el('ul', 'fx-day');
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
      b.classList.toggle('fx-active', on);
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
    // Safeguard: only ever show games from this page's league.
    fixtures = data.filter(function (f) { return String(f.league.id) === String(LEAGUE); });
    var anyUpcoming = fixtures.some(function (f) { return !DONE[f.fixture.status.short]; });
    select(anyUpcoming ? 'upcoming' : 'results'); // nothing left to play: open on Results
  }).catch(function () {
    setStatus('Could not load matches right now. Please try again later.');
  });
})();
