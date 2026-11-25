/* Match report page: scoreboard, recap, formations, team statistics and player ratings for one fixture.
   Open as match.html?id=<API-Sports fixture id>.
   Data: API-Sports GET /fixtures?id=... (events, lineups, statistics and players come back in that one response).
   Finished matches are cached for 24 hours in localStorage, live matches for one minute. */
(function () {
  'use strict';

  var root = document.getElementById('mr-root');
  if (!root) return;

  var KEY = '26c4d56c5c9b4795471cbca950c0e469';
  var DAY_MS = 24 * 60 * 60 * 1000;
  var LIVE_REFRESH_MS = 60 * 1000;

  var FINISHED = { FT: 1, AET: 1, PEN: 1 };
  var LIVE = { '1H': 1, HT: 1, '2H': 1, ET: 1, BT: 1, P: 1, LIVE: 1, INT: 1 };
  var NOT_STARTED = { NS: 1, TBD: 1 };

  // Where "Back" goes for each league, and which nav tab to highlight.
  var LEAGUE_PAGES = {
    '140': { href: 'la-liga.html', label: 'La Liga' },
    '39': { href: 'premierleague.html', label: 'Premier League' },
    '2': { href: 'champions-league.html', label: 'Champions League' },
    '1': { href: 'international.html?c=world-cup', label: 'International', nav: 'international.html' },
    '5': { href: 'international.html?c=nations-league', label: 'International', nav: 'international.html' }
  };

  // Team statistics shown in the comparison, in order. `key` is API-Sports' "type" value.
  var STAT_ROWS = [
    { key: 'Ball Possession', label: 'Possession' },
    { key: 'expected_goals', label: 'Expected goals (xG)' },
    { key: 'Total Shots', label: 'Shots' },
    { key: 'Shots on Goal', label: 'Shots on target' },
    { key: 'Shots off Goal', label: 'Shots off target' },
    { key: 'Blocked Shots', label: 'Blocked shots' },
    { key: 'Corner Kicks', label: 'Corners' },
    { key: 'Fouls', label: 'Fouls' },
    { key: 'Offsides', label: 'Offsides' },
    { key: 'Yellow Cards', label: 'Yellow cards' },
    { key: 'Red Cards', label: 'Red cards' },
    { key: 'Goalkeeper Saves', label: 'Saves' },
    { key: 'Total passes', label: 'Passes' },
    { key: 'Passes %', label: 'Pass accuracy' }
  ];

  var matchId = (new URLSearchParams(window.location.search).get('id') || '').trim();

  /* ---------- small helpers ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function add(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }

  function num(v) {
    if (v === null || v === undefined) return 0;
    var n = parseFloat(String(v).replace('%', ''));
    return isNaN(n) ? 0 : n;
  }

  function minuteLabel(time) {
    if (!time || time.elapsed === null || time.elapsed === undefined) return '';
    return time.elapsed + (time.extra ? '+' + time.extra : '') + "'";
  }

  function crest(team, cls) {
    var img = el('img', cls);
    img.src = team.logo || '';
    img.alt = team.name + ' crest';
    img.loading = 'lazy';
    return img;
  }

  function surname(name) {
    var parts = String(name || '').trim().split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function showStatus(msg) {
    root.textContent = '';
    root.appendChild(el('p', 'mr-status', msg));
  }

  /* ---------- data ---------- */

  function load(force) {
    var cacheKey = 'mr-fixture-' + matchId;
    if (!force) {
      try {
        var cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached && Date.now() - cached.t < cached.ttl) return Promise.resolve(cached.data);
      } catch (e) { /* storage unavailable: just fetch */ }
    }

    return fetch('https://v3.football.api-sports.io/fixtures?id=' + encodeURIComponent(matchId), {
      headers: { 'x-apisports-key': KEY }
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var errs = json.errors;
        var hasErr = Array.isArray(errs) ? errs.length : errs && Object.keys(errs).length;
        if (hasErr || !json.response) throw new Error('api');
        if (!json.response.length) {
          var nf = new Error('notfound');
          nf.notFound = true;
          throw nf;
        }
        var f = json.response[0];
        var ttl = FINISHED[f.fixture.status.short] ? DAY_MS : LIVE_REFRESH_MS;
        try { localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), ttl: ttl, data: f })); } catch (e) { }
        return f;
      });
  }

  /* ---------- lookups on the response ---------- */

  function teamStat(f, teamId, type) {
    var entry = (f.statistics || []).filter(function (s) { return s.team.id === teamId; })[0];
    if (!entry) return null;
    var hit = (entry.statistics || []).filter(function (s) { return s.type === type; })[0];
    return hit ? hit.value : null;
  }

  function hasStats(f) {
    return (f.statistics || []).some(function (s) { return (s.statistics || []).length; });
  }

  // Team that gets the goal. For own goals the API's team field is ambiguous, so work it out from the lineups:
  // the goal is credited to the side that the scorer does NOT play for.
  function creditedTeamId(f, e) {
    if (!e.team) return null;
    if (e.type !== 'Goal' || e.detail !== 'Own Goal' || !e.player || !e.player.id) return e.team.id;
    var ownTeam = null;
    (f.lineups || []).forEach(function (l) {
      var all = (l.startXI || []).concat(l.substitutes || []);
      if (all.some(function (x) { return x.player.id === e.player.id; })) ownTeam = l.team.id;
    });
    if (ownTeam === null) return e.team.id;
    return ownTeam === f.teams.home.id ? f.teams.away.id : f.teams.home.id;
  }

  // Per-player events: goals, own goals, cards.
  function playerEvents(f) {
    var map = {};
    (f.events || []).forEach(function (e) {
      if (!e.player || !e.player.id) return;
      var m = map[e.player.id] || (map[e.player.id] = { goals: 0, og: 0, yellow: 0, red: 0 });
      if (e.type === 'Goal') {
        if (e.detail === 'Own Goal') m.og++;
        else if (e.detail !== 'Missed Penalty') m.goals++;
      } else if (e.type === 'Card') {
        if (/red/i.test(e.detail)) m.red++;
        else if (/yellow/i.test(e.detail)) m.yellow++;
      }
    });
    return map;
  }

  // Per-player match stats keyed by player id.
  function playerStats(f) {
    var map = {};
    (f.players || []).forEach(function (t) {
      (t.players || []).forEach(function (p) {
        var s = p.statistics && p.statistics[0];
        if (!s) return;
        map[p.player.id] = {
          team: t.team,
          name: p.player.name,
          pos: s.games && s.games.position,
          minutes: (s.games && s.games.minutes) || 0,
          rating: s.games && s.games.rating ? parseFloat(s.games.rating) : NaN,
          goals: (s.goals && s.goals.total) || 0,
          assists: (s.goals && s.goals.assists) || 0,
          shots: (s.shots && s.shots.total) || 0
        };
      });
    });
    return map;
  }

  function topRated(stats) {
    var best = null;
    Object.keys(stats).forEach(function (id) {
      var p = stats[id];
      if (!isNaN(p.rating) && (!best || p.rating > best.rating)) best = p;
    });
    return best;
  }

  /* ---------- header ---------- */

  function statusText(f) {
    var s = f.fixture.status;
    if (FINISHED[s.short]) return s.short === 'FT' ? 'Full time' : s.long;
    if (LIVE[s.short]) return s.short === 'HT' ? 'Half time' : 'Live ' + (s.elapsed || '') + "'";
    if (NOT_STARTED[s.short]) return 'Not started';
    return s.long || s.short;
  }

  function renderHeader(f) {
    var when = new Date(f.fixture.date);
    var box = el('header', 'mr-head');

    var comp = f.league.name + (f.league.round ? ' · ' + f.league.round : '');
    box.appendChild(el('p', 'mr-comp', comp));

    var board = el('div', 'mr-board');
    var home = el('div', 'mr-team mr-team-home');
    add(home, crest(f.teams.home, 'mr-crest'), el('span', 'mr-team-name', f.teams.home.name));
    var away = el('div', 'mr-team mr-team-away');
    add(away, crest(f.teams.away, 'mr-crest'), el('span', 'mr-team-name', f.teams.away.name));

    var mid = el('div', 'mr-mid');
    var played = !NOT_STARTED[f.fixture.status.short] && f.goals.home !== null && f.goals.away !== null;
    mid.appendChild(el('div', 'mr-score', played ? f.goals.home + ' - ' + f.goals.away : 'vs'));
    var st = el('div', 'mr-state' + (LIVE[f.fixture.status.short] ? ' mr-live' : ''), statusText(f));
    mid.appendChild(st);
    var ht = f.score && f.score.halftime;
    if (played && ht && ht.home !== null && ht.away !== null) {
      mid.appendChild(el('div', 'mr-ht', 'Half-time ' + ht.home + ' - ' + ht.away));
    }
    var pens = f.score && f.score.penalty;
    if (f.fixture.status.short === 'PEN' && pens && pens.home !== null && pens.away !== null) {
      mid.appendChild(el('div', 'mr-ht', 'Penalties ' + pens.home + ' - ' + pens.away));
    }
    add(board, home, mid, away);
    box.appendChild(board);

    var meta = [];
    meta.push(when.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
      ', ' + when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    var v = f.fixture.venue;
    if (v && v.name) meta.push(v.name + (v.city ? ', ' + v.city : ''));
    if (f.fixture.referee) meta.push('Referee: ' + f.fixture.referee);
    box.appendChild(el('p', 'mr-meta', meta.join('  ·  ')));

    var jump = el('nav', 'mr-jump');
    jump.setAttribute('aria-label', 'Match sections');
    [['#mr-recap', 'Recap'], ['#mr-formations', 'Formations'], ['#mr-stats', 'Statistics'], ['#mr-players', 'Players']].forEach(function (l) {
      var a = el('a', 'mr-jump-link', l[1]);
      a.href = l[0];
      jump.appendChild(a);
    });
    box.appendChild(jump);
    return box;
  }

  /* ---------- recap ---------- */

  function goalLine(f, team) {
    var goals = (f.events || []).filter(function (e) {
      return e.type === 'Goal' && e.detail !== 'Missed Penalty' && creditedTeamId(f, e) === team.id;
    }).sort(function (a, b) {
      return (a.time.elapsed * 100 + (a.time.extra || 0)) - (b.time.elapsed * 100 + (b.time.extra || 0));
    });
    if (!goals.length) return null;
    return goals.map(function (e) {
      var tag = e.detail === 'Penalty' ? ' (pen)' : e.detail === 'Own Goal' ? ' (og)' : '';
      return (e.player && e.player.name ? e.player.name : 'Unknown') + ' ' + minuteLabel(e.time) + tag;
    }).join(', ');
  }

  // Plain-English summary built only from fields in the response.
  function recapParagraphs(f) {
    var out = [];
    var home = f.teams.home, away = f.teams.away;
    var gh = f.goals.home, ga = f.goals.away;
    var short = f.fixture.status.short;
    var finished = !!FINISHED[short];
    var started = !NOT_STARTED[short] && gh !== null && ga !== null;

    if (!started) {
      out.push(home.name + ' host ' + away.name + ' in ' + f.league.name +
        (f.league.round ? ' (' + f.league.round + ')' : '') + '. The recap, lineups and statistics will appear once the match is under way.');
      return out;
    }

    var venue = f.fixture.venue && f.fixture.venue.name ? ' at ' + f.fixture.venue.name : '';
    var comp = f.league.name + (f.league.round ? ' (' + f.league.round + ')' : '');
    var result;
    if (gh === ga) {
      result = home.name + ' and ' + away.name + (finished ? ' drew ' : ' are level at ') + gh + '-' + ga + venue + ' in ' + comp + '.';
    } else {
      var win = gh > ga ? home : away, lose = gh > ga ? away : home;
      var hi = Math.max(gh, ga), lo = Math.min(gh, ga);
      result = finished
        ? win.name + ' beat ' + lose.name + ' ' + hi + '-' + lo + venue + ' in ' + comp + '.'
        : win.name + ' lead ' + lose.name + ' ' + hi + '-' + lo + venue + ' in ' + comp + '.';
    }
    out.push(result);

    var ht = f.score && f.score.halftime;
    if (ht && ht.home !== null && ht.away !== null) {
      if (ht.home === ht.away) {
        out.push('It was level at half-time, ' + ht.home + '-' + ht.away + '.');
      } else {
        var lead = ht.home > ht.away ? home : away, trail = ht.home > ht.away ? away : home;
        var hl = Math.max(ht.home, ht.away), tl = Math.min(ht.home, ht.away);
        var sentence = lead.name + ' led ' + hl + '-' + tl + ' at half-time';
        if (finished) {
          var ftWinner = gh === ga ? null : (gh > ga ? home : away);
          if (ftWinner && ftWinner.id === trail.id) sentence += ', but ' + trail.name + ' came from behind to win.';
          else if (!ftWinner) sentence += ', but ' + trail.name + ' pulled level to draw.';
          else sentence += ' and went on to win.';
        } else {
          sentence += '.';
        }
        out.push(sentence);
      }
    }

    var hg = goalLine(f, home), ag = goalLine(f, away);
    if (hg || ag) {
      var parts = [];
      if (hg) parts.push(home.name + ': ' + hg);
      if (ag) parts.push(away.name + ': ' + ag);
      out.push('Goals – ' + parts.join('. ') + '.');
    }

    if (hasStats(f)) {
      var ph = num(teamStat(f, home.id, 'Ball Possession')), pa = num(teamStat(f, away.id, 'Ball Possession'));
      var sh = num(teamStat(f, home.id, 'Total Shots')), sa = num(teamStat(f, away.id, 'Total Shots'));
      var oh = num(teamStat(f, home.id, 'Shots on Goal')), oa = num(teamStat(f, away.id, 'Shots on Goal'));
      var bits = [];
      if (ph || pa) {
        var ctl = ph >= pa ? home : away;
        bits.push(ctl.name + ' had ' + Math.max(ph, pa) + '% of the ball');
      }
      if (sh || sa) {
        bits.push(home.name + ' had ' + plural(sh, 'shot') + ' (' + oh + ' on target) to ' + away.name + "'s " + sa + ' (' + oa + ')');
      }
      if (bits.length) out.push(bits.join('; ') + '.');
    }

    var yellow = 0, red = 0;
    (f.events || []).forEach(function (e) {
      if (e.type !== 'Card') return;
      if (/red/i.test(e.detail)) red++;
      else if (/yellow/i.test(e.detail)) yellow++;
    });
    if (yellow || red) out.push('Discipline – ' + plural(yellow, 'yellow card') + ' and ' + plural(red, 'red card') + '.');

    var best = topRated(playerStats(f));
    if (best) out.push(best.name + ' (' + best.team.name + ') was the top-rated player with a ' + best.rating.toFixed(1) + ' rating.');

    return out;
  }

  function renderTimeline(f) {
    var events = (f.events || []).filter(function (e) { return e.type === 'Goal' || e.type === 'Card'; })
      .sort(function (a, b) {
        return (a.time.elapsed * 100 + (a.time.extra || 0)) - (b.time.elapsed * 100 + (b.time.extra || 0));
      });
    if (!events.length) return null;

    var ul = el('ul', 'mr-timeline');
    events.forEach(function (e) {
      var isHome = creditedTeamId(f, e) === f.teams.home.id;
      var li = el('li', 'mr-ev ' + (isHome ? 'mr-ev-home' : 'mr-ev-away'));
      var text = el('span', 'mr-ev-text');

      var icon;
      if (e.type === 'Goal') {
        icon = el('span', 'mr-ico mr-ico-goal', e.detail === 'Missed Penalty' ? '✕' : '⚽');
        icon.title = e.detail;
      } else {
        icon = el('span', 'mr-ico mr-ico-card ' + (/red/i.test(e.detail) ? 'mr-red' : 'mr-yellow'));
        icon.title = e.detail;
      }

      var name = el('span', 'mr-ev-player', e.player && e.player.name ? e.player.name : 'Unknown');
      var extra = '';
      if (e.type === 'Goal') {
        if (e.detail === 'Penalty') extra = 'penalty';
        else if (e.detail === 'Own Goal') extra = 'own goal';
        else if (e.detail === 'Missed Penalty') extra = 'missed penalty';
        else if (e.assist && e.assist.name) extra = 'assist: ' + e.assist.name;
      } else if (e.comments) {
        extra = e.comments;
      }
      if (isHome) add(text, name, extra ? el('span', 'mr-ev-extra', extra) : null, icon);
      else add(text, icon, name, extra ? el('span', 'mr-ev-extra', extra) : null);

      var minute = el('span', 'mr-ev-min', minuteLabel(e.time));
      if (isHome) add(li, text, minute, el('span'));
      else add(li, el('span'), minute, text);
      ul.appendChild(li);
    });
    return ul;
  }

  function renderRecap(f) {
    var sec = el('section', 'mr-section');
    sec.id = 'mr-recap';
    sec.appendChild(el('h2', null, 'Match recap'));
    recapParagraphs(f).forEach(function (p) { sec.appendChild(el('p', 'mr-recap-p', p)); });
    var tl = renderTimeline(f);
    if (tl) {
      sec.appendChild(el('h3', null, 'Goals and cards'));
      sec.appendChild(tl);
    }
    return sec;
  }

  /* ---------- formations ---------- */

  // Returns { rowNumber: [{ p: player, c: column }] }. Uses API-Sports' "row:col" grid when every starter has
  // one, otherwise spreads the starters across rows using the formation string (e.g. 4-3-3).
  function layoutRows(lineup) {
    var xi = (lineup.startXI || []).map(function (x) { return x.player; });
    var rows = {};
    var haveGrid = xi.length && xi.every(function (p) { return p.grid && /^\d+:\d+$/.test(p.grid); });
    if (haveGrid) {
      xi.forEach(function (p) {
        var g = p.grid.split(':');
        (rows[+g[0]] = rows[+g[0]] || []).push({ p: p, c: +g[1] });
      });
      return rows;
    }
    var counts = [1].concat(String(lineup.formation || '').split('-').map(Number).filter(function (n) { return n > 0; }));
    var i = 0;
    counts.forEach(function (n, ri) {
      rows[ri + 1] = [];
      for (var k = 0; k < n && i < xi.length; k++) rows[ri + 1].push({ p: xi[i++], c: k + 1 });
    });
    var last = counts.length;
    while (i < xi.length) {
      (rows[last] = rows[last] || []).push({ p: xi[i], c: rows[last].length + 1 });
      i++;
    }
    return rows;
  }

  function badge(cls, text, title) {
    var b = el('span', 'mr-badge ' + cls, text);
    if (title) b.title = title;
    return b;
  }

  function renderPitch(f, lineup, evMap, pStats) {
    var wrap = el('div', 'mr-lineup');
    var head = el('div', 'mr-lineup-head');
    add(head, crest(lineup.team, 'mr-crest-sm'), el('span', 'mr-lineup-team', lineup.team.name));
    if (lineup.formation) head.appendChild(el('span', 'mr-formation', lineup.formation));
    wrap.appendChild(head);

    var pitch = el('div', 'mr-pitch');
    var rows = layoutRows(lineup);
    var rowKeys = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
    rowKeys.forEach(function (r, ri) {
      // Goalkeeper row sits at the bottom; attackers at the top.
      var y = rowKeys.length > 1 ? 90 - ri * (78 / (rowKeys.length - 1)) : 50;
      var list = rows[r].slice().sort(function (a, b) { return a.c - b.c; });
      list.forEach(function (item, idx) {
        var x = (idx + 1) / (list.length + 1) * 100;
        var p = item.p;
        var node = el('div', 'mr-player');
        node.style.left = x + '%';
        node.style.top = y + '%';

        var dot = el('span', 'mr-dot', p.number !== null && p.number !== undefined ? p.number : '');
        var ev = evMap[p.id];
        if (ev) {
          if (ev.goals) dot.appendChild(badge('mr-b-goal', ev.goals > 1 ? '⚽' + ev.goals : '⚽', 'Goal'));
          if (ev.og) dot.appendChild(badge('mr-b-og', 'OG', 'Own goal'));
          if (ev.red) dot.appendChild(badge('mr-b-red', '', 'Red card'));
          else if (ev.yellow) dot.appendChild(badge('mr-b-yellow', '', 'Yellow card'));
        }
        node.appendChild(dot);
        node.appendChild(el('span', 'mr-pname', surname(p.name)));
        var ps = pStats[p.id];
        if (ps && !isNaN(ps.rating)) node.appendChild(el('span', 'mr-prate', ps.rating.toFixed(1)));
        pitch.appendChild(node);
      });
    });
    wrap.appendChild(pitch);

    if (lineup.coach && lineup.coach.name) wrap.appendChild(el('p', 'mr-coach', 'Manager: ' + lineup.coach.name));

    var subs = lineup.substitutes || [];
    if (subs.length) {
      wrap.appendChild(el('h4', 'mr-bench-title', 'Substitutes'));
      var ul = el('ul', 'mr-bench');
      subs.forEach(function (s) {
        var p = s.player;
        var used = pStats[p.id] && pStats[p.id].minutes > 0;
        var li = el('li', used ? 'mr-used' : '');
        add(li, el('span', 'mr-bench-num', p.number !== null && p.number !== undefined ? p.number : ''),
          el('span', 'mr-bench-name', p.name));
        if (used) li.appendChild(el('span', 'mr-bench-on', 'on · ' + pStats[p.id].minutes + "'"));
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }
    return wrap;
  }

  function renderFormations(f) {
    var sec = el('section', 'mr-section');
    sec.id = 'mr-formations';
    sec.appendChild(el('h2', null, 'Formations'));
    var lineups = f.lineups || [];
    if (!lineups.length) {
      sec.appendChild(el('p', 'mr-empty', 'Lineups are not available for this match yet.'));
      return sec;
    }
    // Home team first.
    lineups = lineups.slice().sort(function (a) { return a.team.id === f.teams.home.id ? -1 : 1; });
    var evMap = playerEvents(f), pStats = playerStats(f);
    var grid = el('div', 'mr-lineups');
    lineups.forEach(function (l) { grid.appendChild(renderPitch(f, l, evMap, pStats)); });
    sec.appendChild(grid);
    return sec;
  }

  /* ---------- statistics ---------- */

  function renderStats(f) {
    var sec = el('section', 'mr-section');
    sec.id = 'mr-stats';
    sec.appendChild(el('h2', null, 'Team statistics'));
    if (!hasStats(f)) {
      sec.appendChild(el('p', 'mr-empty', 'Statistics are not available for this match yet.'));
      return sec;
    }

    var legend = el('div', 'mr-stat-legend');
    add(legend, el('span', 'mr-leg-home', f.teams.home.name), el('span', 'mr-leg-away', f.teams.away.name));
    sec.appendChild(legend);

    var list = el('div', 'mr-stats');
    STAT_ROWS.forEach(function (row) {
      var hv = teamStat(f, f.teams.home.id, row.key), av = teamStat(f, f.teams.away.id, row.key);
      if ((hv === null || hv === undefined) && (av === null || av === undefined)) return;

      var h = num(hv), a = num(av), total = h + a;
      var item = el('div', 'mr-stat');
      var line = el('div', 'mr-stat-line');
      add(line,
        el('span', 'mr-stat-val', hv === null || hv === undefined ? '0' : String(hv)),
        el('span', 'mr-stat-label', row.label),
        el('span', 'mr-stat-val', av === null || av === undefined ? '0' : String(av)));
      item.appendChild(line);

      var bar = el('div', 'mr-bar');
      var left = el('span', 'mr-bar-home'), right = el('span', 'mr-bar-away');
      left.style.width = (total ? h / total * 100 : 50) + '%';
      right.style.width = (total ? a / total * 100 : 50) + '%';
      add(bar, left, right);
      item.appendChild(bar);
      list.appendChild(item);
    });
    sec.appendChild(list);
    return sec;
  }

  /* ---------- players ---------- */

  function renderPlayers(f) {
    var sec = el('section', 'mr-section');
    sec.id = 'mr-players';
    sec.appendChild(el('h2', null, 'Player ratings'));
    var stats = playerStats(f);
    var ids = Object.keys(stats);
    if (!ids.length) {
      sec.appendChild(el('p', 'mr-empty', 'Player statistics are not available for this match yet.'));
      return sec;
    }
    var best = topRated(stats);
    var evMap = playerEvents(f);

    var grid = el('div', 'mr-tables');
    [f.teams.home, f.teams.away].forEach(function (team) {
      var rows = ids.map(function (id) { return { id: id, s: stats[id] }; })
        .filter(function (r) { return r.s.team.id === team.id && (r.s.minutes > 0 || !isNaN(r.s.rating)); })
        .sort(function (a, b) {
          var ra = isNaN(a.s.rating) ? -1 : a.s.rating, rb = isNaN(b.s.rating) ? -1 : b.s.rating;
          return rb - ra;
        });

      var box = el('div', 'mr-table-box');
      var h = el('h3', 'mr-table-title');
      add(h, crest(team, 'mr-crest-sm'), el('span', null, team.name));
      box.appendChild(h);

      var table = el('table', 'mr-table');
      var thead = el('thead');
      var hr = el('tr');
      ['Player', 'Pos', 'Min', 'G', 'A', 'Sh', 'Rating'].forEach(function (t, i) {
        var th = el('th', i === 0 ? 'mr-left' : (i === 1 || i === 2 || i === 5 ? 'mr-opt' : ''), t);
        th.scope = 'col';
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      var tbody = el('tbody');
      rows.forEach(function (r) {
        var s = r.s;
        var isBest = best && best.name === s.name && best.team.id === s.team.id && best.rating === s.rating;
        var tr = el('tr', isBest ? 'mr-best' : '');
        var nameCell = el('td', 'mr-left', s.name);
        var ev = evMap[r.id];
        if (ev && ev.red) nameCell.appendChild(badge('mr-b-red mr-inline', '', 'Red card'));
        else if (ev && ev.yellow) nameCell.appendChild(badge('mr-b-yellow mr-inline', '', 'Yellow card'));
        if (isBest) {
          var star = el('span', 'mr-star', ' ★');
          star.title = 'Top rated';
          star.appendChild(el('span', 'mr-star-txt', ' top rated'));
          nameCell.appendChild(star);
        }
        add(tr, nameCell,
          el('td', 'mr-opt', s.pos || ''),
          el('td', 'mr-opt', s.minutes ? String(s.minutes) : ''),
          el('td', null, s.goals ? String(s.goals) : ''),
          el('td', null, s.assists ? String(s.assists) : ''),
          el('td', 'mr-opt', s.shots ? String(s.shots) : ''),
          el('td', 'mr-rating', isNaN(s.rating) ? '' : s.rating.toFixed(1)));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.appendChild(table);
      grid.appendChild(box);
    });
    sec.appendChild(grid);
    return sec;
  }

  /* ---------- page ---------- */

  function setNav(f) {
    var info = LEAGUE_PAGES[String(f.league.id)];
    var back = document.getElementById('mr-back');
    if (info) {
      back.href = info.href;
      back.textContent = '← ' + info.label;
      var target = info.nav || info.href;
      document.querySelectorAll('.navbar .nav-link').forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('href') === target);
      });
    }
  }

  var refreshTimer = null;

  function render(f) {
    setNav(f);
    document.title = f.teams.home.name + ' ' + (f.goals.home !== null ? f.goals.home : '') +
      (f.goals.home !== null ? '-' : 'vs') + (f.goals.away !== null ? f.goals.away : '') + ' ' +
      f.teams.away.name + ' | Footballrey.com';

    root.textContent = '';
    add(root, renderHeader(f), renderRecap(f), renderFormations(f), renderStats(f), renderPlayers(f));
    root.appendChild(el('p', 'mr-credit', 'Match data from API-Football. Ratings and statistics can be updated after full time.'));

    clearTimeout(refreshTimer);
    if (LIVE[f.fixture.status.short]) {
      refreshTimer = setTimeout(function () {
        load(true).then(render).catch(function () { /* keep showing the last good render */ });
      }, LIVE_REFRESH_MS);
    }
  }

  if (!/^\d+$/.test(matchId)) {
    showStatus('No match selected. Pick a match from a league page.');
    return;
  }

  showStatus('Loading match…');
  load(false).then(render).catch(function (err) {
    showStatus(err && err.notFound
      ? 'Match not found.'
      : 'Could not load this match right now. Please try again later.');
  });
})();
