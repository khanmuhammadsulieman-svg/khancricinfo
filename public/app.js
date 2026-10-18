/**
 * KhanCricinfo - Modern Sports UI Controller with Flag Fixes & Players Directory
 */

const REFRESH_SECONDS = 90;
const CDN_BASE = "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_50";

const INTL_TEAMS = [
  "pakistan", "india", "australia", "england", "south africa",
  "new zealand", "sri lanka", "west indies", "bangladesh",
  "afghanistan", "zimbabwe", "ireland", "scotland", "netherlands",
  "namibia", "nepal", "usa", "united arab emirates", "oman", "canada"
];

const DOMESTIC_PAK_EXCLUSIONS = [
  "pakistan tv", "pakistan television", "pakistan hkg", "pakistan a",
  "pakistan shaheens", "pakistan u19", "pakistan under-19", "pakistan women"
];

const state = {
  currentView: "current", // 'current' | 'series' | 'players'
  rawMatches: [],
  rawSeries: [],
  rawPlayers: [],
  filteredList: [],
  activeFilter: "all",
  searchQuery: "",
  timerCountdown: REFRESH_SECONDS,
  intervalId: null
};

const elements = {
  grid: document.getElementById("matches-grid"),
  pakSection: document.getElementById("pak-spotlight-section"),
  pakGrid: document.getElementById("pak-matches-grid"),
  featuredStrip: document.getElementById("featured-strip"),
  topTicker: document.getElementById("top-ticker"),
  sectionHeading: document.getElementById("section-heading"),
  statusBar: document.getElementById("status-bar"),
  timerDisplay: document.getElementById("auto-refresh-timer"),
  btnRefresh: document.getElementById("btn-manual-refresh"),
  searchInput: document.getElementById("search-input"),
  stageFilterGroup: document.getElementById("stage-filter-group"),
  filterTabs: document.querySelectorAll(".filter-tab"),
  viewTabs: document.querySelectorAll(".view-tab"),
  modal: document.getElementById("detail-modal"),
  modalSeriesTitle: document.getElementById("modal-series-title"),
  modalBody: document.getElementById("modal-body"),
  modalClose: document.getElementById("btn-close-modal")
};

function sanitize(str) {
  if (!str) return "";
  return String(str).replace(/[&<>'"]/g, t => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[t] || t));
}

function formatStartTimePKT(m) {
  const rawDate = m.startTime || m.startDate || m.date;
  if (!rawDate) return null;
  const parsed = new Date(rawDate);
  if (isNaN(parsed.getTime())) return null;

  return parsed.toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }) + " PKT";
}

function buildStatusText(m, stage) {
  const rawText = m.statusText || m.status || "";
  const formattedTime = formatStartTimePKT(m);

  if (rawText.includes("{{") || rawText.toLowerCase().includes("yet to begin") || stage === "upcoming") {
    if (formattedTime) return `Starts ${formattedTime}`;
    return "Upcoming Scheduled Match";
  }
  return rawText || "Match Scheduled";
}

function setStatus(msg, isAlert = false) {
  if (!msg) {
    elements.statusBar.className = "status-bar hidden";
    return;
  }
  elements.statusBar.className = `status-bar ${isAlert ? "alert" : ""}`;
  elements.statusBar.textContent = msg;
}

function detectStage(m) {
  const rawState = (m.state || "").toUpperCase();
  const rawStage = (m.stage || "").toUpperCase();
  const statusTxt = (m.statusText || m.status || "").toLowerCase();

  if (rawState === "PRE" || rawStage === "SCHEDULED" || statusTxt.includes("yet to begin") || statusTxt.includes("starts at") || statusTxt.includes("{{") || statusTxt.includes("upcoming")) {
    return "upcoming";
  }
  if (rawState === "LIVE" || rawStage === "RUNNING" || statusTxt.includes("live") || statusTxt.includes("opt to") || statusTxt.includes("chose to") || statusTxt.includes("trail by") || statusTxt.includes("lead by") || statusTxt.includes("need") || statusTxt.includes("day ")) {
    return "live";
  }
  return "completed";
}

function isInternationalMatch(m, t1Name, t2Name, seriesName) {
  const intlClass = m.internationalClassId || m.generalClassId;
  if (intlClass === 1 || intlClass === 2 || intlClass === 3) return true;

  const sLow = seriesName.toLowerCase();
  const t1Low = t1Name.toLowerCase();
  const t2Low = t2Name.toLowerCase();

  if (sLow.includes("president's trophy") || sLow.includes("quaid-e-azam") || sLow.includes("county") || sLow.includes("sheffield")) return false;
  return (INTL_TEAMS.includes(t1Low) && INTL_TEAMS.includes(t2Low)) || sLow.includes("icc") || sLow.includes("world cup");
}

function isPakistanMensNationalMatch(t1Name, t2Name, seriesName) {
  const t1 = t1Name.trim().toLowerCase();
  const t2 = t2Name.trim().toLowerCase();
  const s = seriesName.toLowerCase();

  if (s.includes("women") || t1.includes("women") || t2.includes("women")) return false;
  if (DOMESTIC_PAK_EXCLUSIONS.includes(t1) || DOMESTIC_PAK_EXCLUSIONS.includes(t2)) return false;

  return t1 === "pakistan" || t2 === "pakistan" || s.includes("pakistan odi") || s.includes("pakistan t20");
}

async function loadLiveMatches() {
  setStatus(null);
  elements.grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading international & live cricket scores...</p></div>';

  try {
    const res = await fetch("/api/live");
    const json = await res.json();
    if (!json.success || !json.data?.matches) throw new Error("Failed to load matches");

    const mapped = json.data.matches.map(m => {
      const t1 = m.teams?.[0] || {};
      const t2 = m.teams?.[1] || {};
      const team1Name = t1.team?.name || t1.team?.longName || "Team 1";
      const team2Name = t2.team?.name || t2.team?.longName || "Team 2";
      const seriesName = m.series?.name || m.series?.longName || "Cricket Series";
      const stage = detectStage(m);

      // Robust Flag URL Resolver (Checks team object image, logo, or constructs Cricinfo CDN URL if team id is present)
      const getTeamFlag = (teamObj) => {
        if (teamObj.team?.imageUrl) {
          return `${CDN_BASE}${teamObj.team.imageUrl}`;
        }
        if (teamObj.team?.logoUrl) {
          return `${CDN_BASE}${teamObj.team.logoUrl}`;
        }
        if (teamObj.team?.id || teamObj.team?.objectId) {
          return `${CDN_BASE}/image/fetch/w_160,c_fill,g_face/${teamObj.team.id || teamObj.team.objectId}`;
        }
        return "";
      };

      return {
        objectId: m.objectId || m.id,
        seriesObjectId: m.series?.objectId || m.series?.id || "",
        title: m.title || "",
        format: (m.format || "MATCH").toUpperCase(),
        stage: stage,
        isInternational: isInternationalMatch(m, team1Name, team2Name, seriesName),
        isPakMens: isPakistanMensNationalMatch(team1Name, team2Name, seriesName),
        team1: team1Name,
        team1Abbr: t1.team?.abbreviation || team1Name.slice(0, 3).toUpperCase(),
        flag1: getTeamFlag(t1),
        team2: team2Name,
        team2Abbr: t2.team?.abbreviation || team2Name.slice(0, 3).toUpperCase(),
        flag2: getTeamFlag(t2),
        score1: t1.score || "",
        score2: t2.score || "",
        status: buildStatusText(m, stage),
        startTimePKT: formatStartTimePKT(m),
        series: seriesName,
        venue: m.ground?.smallName || m.ground?.name || ""
      };
    });

    const stageWeight = { live: 3, upcoming: 2, completed: 1 };
    state.rawMatches = mapped.sort((a, b) => {
      if (a.isPakMens !== b.isPakMens) return a.isPakMens ? -1 : 1;
      if (a.isInternational !== b.isInternational) return a.isInternational ? -1 : 1;
      return (stageWeight[b.stage] || 0) - (stageWeight[a.stage] || 0);
    });

    renderPakistanSpotlight();
    renderTopCarouselAndTicker();
    applyFilters();
  } catch (err) {
    setStatus(err.message, true);
    elements.grid.innerHTML = `<div class="empty-state"><p>${sanitize(err.message)}</p></div>`;
  }
}

async function loadSeries() {
  setStatus(null);
  elements.grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading series & tournaments...</p></div>';

  try {
    const res = await fetch("/api/series");
    const json = await res.json();
    if (!json.success || !json.data) throw new Error("Failed to load series");

    let items = [];
    if (Array.isArray(json.data.series)) items = json.data.series;
    else if (typeof json.data === "object") {
      Object.values(json.data).forEach(val => { if (Array.isArray(val)) items.push(...val); });
    }
    state.rawSeries = items;
    applyFilters();
  } catch (err) {
    setStatus(err.message, true);
    elements.grid.innerHTML = `<div class="empty-state"><p>${sanitize(err.message)}</p></div>`;
  }
}

async function loadPlayers() {
  setStatus(null);
  elements.grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading players directory...</p></div>';

  try {
    const res = await fetch("/api/players");
    const json = await res.json();
    if (!json.success || !json.data) throw new Error("Failed to load players");

    state.rawPlayers = json.data.players || json.data || [];
    applyFilters();
  } catch (err) {
    setStatus(err.message, true);
    elements.grid.innerHTML = `<div class="empty-state"><p>${sanitize(err.message)}</p></div>`;
  }
}

async function fetchPlayerDetail(playerId, playerName) {
  elements.modalSeriesTitle.textContent = playerName;
  elements.modalBody.innerHTML = `
    <div style="text-align:center; padding:30px;">
      <div class="spinner"></div>
      <p style="margin-top:10px; color:#64748b;">Loading player profile...</p>
    </div>
  `;
  elements.modal.classList.remove("hidden");

  try {
    const res = await fetch(`/api/player-info/${playerId}`);
    const json = await res.json();
    const p = json.data || {};

    elements.modalBody.innerHTML = `
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px;">
        <div style="width:60px; height:60px; border-radius:50%; background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size:1.8rem;">👤</div>
        <div>
          <h3 style="font-size:1.2rem; color:#0f172a; margin-bottom:4px;">${sanitize(p.name || playerName)}</h3>
          <p style="font-size:0.85rem; color:#64748b;">${sanitize(p.country || "International Player")}</p>
        </div>
      </div>
      <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px;">
        <div style="background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
          <strong style="font-size:0.75rem; color:#64748b; display:block;">Role</strong>
          <span style="font-size:0.9rem; font-weight:700; color:#0f172a;">${sanitize(p.role || "Batsman / Bowler")}</span>
        </div>
        <div style="background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
          <strong style="font-size:0.75rem; color:#64748b; display:block;">Batting Style</strong>
          <span style="font-size:0.9rem; font-weight:700; color:#0f172a;">${sanitize(p.battingStyle || "N/A")}</span>
        </div>
        <div style="background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
          <strong style="font-size:0.75rem; color:#64748b; display:block;">Bowling Style</strong>
          <span style="font-size:0.9rem; font-weight:700; color:#0f172a;">${sanitize(p.bowlingStyle || "N/A")}</span>
        </div>
        <div style="background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
          <strong style="font-size:0.75rem; color:#64748b; display:block;">Date of Birth</strong>
          <span style="font-size:0.9rem; font-weight:700; color:#0f172a;">${sanitize(p.dateOfBirth ? p.dateOfBirth.split("T")[0] : "N/A")}</span>
        </div>
      </div>
    `;
  } catch (e) {
    elements.modalBody.innerHTML = `<p style="text-align:center; padding:20px; color:#64748b;">Profile stats unavailable right now.</p>`;
  }
}

function renderPakistanSpotlight() {
  const pakMatches = state.rawMatches.filter(m => m.isPakMens);
  if (pakMatches.length === 0) {
    elements.pakGrid.innerHTML = `<div style="grid-column: 1 / -1; background: rgba(255,255,255,0.1); padding: 14px 18px; border-radius: 12px; font-size: 0.88rem;">No live or immediate Pakistan Men's National Team match in the current feed.</div>`;
    return;
  }
  elements.pakGrid.innerHTML = "";
  pakMatches.forEach(m => elements.pakGrid.appendChild(buildMatchCardElement(m)));
}

function renderTopCarouselAndTicker() {
  const intlList = state.rawMatches.filter(m => m.isInternational);
  const featured = (intlList.length >= 4 ? intlList : state.rawMatches).slice(0, 8);

  if (featured.length > 0) {
    elements.topTicker.innerHTML = featured.map((m, idx) => `
      <span class="cb-ticker-item" data-idx="${idx}">
        <strong>${sanitize(m.team1Abbr)} vs ${sanitize(m.team2Abbr)}</strong> • ${m.stage === "live" ? "🔴 Live" : "Result"}
      </span>
    `).join("");
    elements.topTicker.querySelectorAll(".cb-ticker-item").forEach(el => {
      el.addEventListener("click", () => {
        const match = featured[Number(el.getAttribute("data-idx"))];
        if (match) openMatchModal(match);
      });
    });
  }

  elements.featuredStrip.innerHTML = "";
  featured.forEach(m => {
    const mini = document.createElement("div");
    mini.className = "cb-mini-card";
    mini.innerHTML = `
      <div>
        <div class="card-meta">
          <span class="meta-series">${sanitize(m.series)}</span>
          <span class="format-pill">${sanitize(m.format)}</span>
        </div>
        <div class="teams-list" style="padding:10px 12px; margin-bottom:10px;">
          <div class="team-entry">
            <div class="team-info" style="font-size:0.86rem;">
              ${m.flag1 ? `<img class="team-flag" src="${sanitize(m.flag1)}" alt="" onerror="this.style.display='none'">` : ""}
              <span>${sanitize(m.team1Abbr)}</span>
            </div>
            <span class="team-score" style="font-size:0.85rem;">${sanitize(m.score1 || "-")}</span>
          </div>
          <div class="team-entry">
            <div class="team-info" style="font-size:0.86rem;">
              ${m.flag2 ? `<img class="team-flag" src="${sanitize(m.flag2)}" alt="" onerror="this.style.display='none'">` : ""}
              <span>${sanitize(m.team2Abbr)}</span>
            </div>
            <span class="team-score" style="font-size:0.85rem;">${sanitize(m.score2 || "-")}</span>
          </div>
        </div>
      </div>
      <div class="card-status ${m.stage === 'live' ? 'status-live' : 'status-completed'}" style="font-size:0.75rem;">${sanitize(m.status)}</div>
    `;
    mini.addEventListener("click", () => openMatchModal(m));
    elements.featuredStrip.appendChild(mini);
  });
}

function extractInningsList(data) {
  if (!data) return [];
  if (Array.isArray(data.innings)) return data.innings;
  if (Array.isArray(data.content?.innings)) return data.content.innings;
  return [];
}

async function openMatchModal(m) {
  elements.modalSeriesTitle.textContent = `${m.team1} vs ${m.team2} — ${m.series}`;
  elements.modalBody.innerHTML = `
    <div style="margin-bottom: 16px;">
      <p style="font-size:0.84rem; color:#64748b; font-weight:600;">${sanitize(m.title)} ${m.venue ? `• 📍 ${sanitize(m.venue)}` : ""}</p>
      <div style="background:#f8fafc; border:1.5px solid #cbd5e1; padding:14px 16px; border-radius:12px; margin:12px 0;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:1.05rem;">
          <strong>${sanitize(m.team1)}</strong>
          <strong style="color:#047857;">${sanitize(m.score1 || "-")}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:1.05rem;">
          <strong>${sanitize(m.team2)}</strong>
          <strong style="color:#047857;">${sanitize(m.score2 || "-")}</strong>
        </div>
      </div>
      <p class="status-live" style="font-size:0.9rem; font-weight:700;">${sanitize(m.status)}</p>
    </div>
    <div id="scorecard-loader" style="text-align:center; padding:18px; color:#64748b; font-size:0.86rem;">
      <div class="spinner"></div>
      Fetching full scorecard...
    </div>
  `;
  elements.modal.classList.remove("hidden");

  if (!m.objectId) return;

  try {
    const query = m.seriesObjectId ? `?seriesId=${encodeURIComponent(m.seriesObjectId)}` : "";
    const res = await fetch(`/api/scorecard/${m.objectId}${query}`);
    const json = await res.json();
    const loader = document.getElementById("scorecard-loader");
    if (!loader) return;

    const innings = extractInningsList(json.data);
    if (json.success && innings.length > 0) {
      loader.outerHTML = innings.map(inn => {
        const batsmen = inn.inningBatsmen || inn.batsmen || [];
        const batRows = batsmen.map(b => `
          <tr>
            <td><strong>${sanitize(b.player?.name || b.name || "Batter")}</strong></td>
            <td><strong>${b.runs ?? "-"}</strong></td>
            <td>${b.balls ?? "-"}</td>
            <td>${b.fours ?? "-"}</td>
            <td>${b.sixes ?? "-"}</td>
            <td>${b.strikeRate ?? "-"}</td>
          </tr>
        `).join("");

        return `
          <div style="margin-top:18px;">
            <h4 style="background:#0f172a; color:#fff; padding:9px 12px; font-size:0.84rem; border-radius:8px;">
              ${sanitize(inn.team?.name || "Innings")} ${inn.runs ? `— ${inn.runs}/${inn.wickets} (${inn.overs} ov)` : ""}
            </h4>
            <table class="cb-score-table">
              <thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
              <tbody>${batRows || '<tr><td colspan="6">Yet to bat</td></tr>'}</tbody>
            </table>
          </div>
        `;
      }).join("");
    } else {
      loader.innerHTML = "<p>Match scorecard will appear once play begins.</p>";
    }
  } catch (e) {
    const loader = document.getElementById("scorecard-loader");
    if (loader) loader.innerHTML = "<p>Scorecard details unavailable.</p>";
  }
}

function applyFilters() {
  const q = state.searchQuery.trim().toLowerCase();

  if (state.currentView === "players") {
    state.filteredList = state.rawPlayers.filter(p => !q || (p.name && p.name.toLowerCase().includes(q)) || (p.country && p.country.toLowerCase().includes(q)));
    renderPlayerCards();
  } else if (state.currentView === "series") {
    state.filteredList = state.rawSeries.filter(s => !q || (s.name && s.name.toLowerCase().includes(q)));
    renderSeriesCards();
  } else {
    state.filteredList = state.rawMatches.filter(m => {
      let matchStage = true;
      if (state.activeFilter === "international") matchStage = m.isInternational;
      else if (state.activeFilter !== "all") matchStage = m.stage === state.activeFilter;

      const matchQuery = !q || m.team1.toLowerCase().includes(q) || m.team2.toLowerCase().includes(q) || m.series.toLowerCase().includes(q);
      return matchStage && matchQuery;
    });
    renderMatchCards();
  }
}

function buildMatchCardElement(m) {
  const card = document.createElement("article");
  card.className = `match-card card-${m.stage}`;
  const statusClass = m.stage === "live" ? "status-live" : m.stage === "upcoming" ? "status-upcoming" : "status-completed";

  card.innerHTML = `
    <div>
      <div class="card-meta">
        <span class="meta-series">${sanitize(m.series)}</span>
        <div class="meta-badges">
          ${m.isInternational ? '<span class="intl-badge">INTL</span>' : ""}
          ${m.stage === "live" ? '<span class="stage-pill live">● LIVE</span>' : ""}
          <span class="format-pill">${sanitize(m.format)}</span>
        </div>
      </div>
      <div class="teams-list">
        <div class="team-entry">
          <div class="team-info">
            ${m.flag1 ? `<img class="team-flag" src="${sanitize(m.flag1)}" alt="" onerror="this.style.display='none'">` : ""}
            <span>${sanitize(m.team1)}</span>
          </div>
          <span class="team-score">${sanitize(m.score1 || "-")}</span>
        </div>
        <div class="team-entry">
          <div class="team-info">
            ${m.flag2 ? `<img class="team-flag" src="${sanitize(m.flag2)}" alt="" onerror="this.style.display='none'">` : ""}
            <span>${sanitize(m.team2)}</span>
          </div>
          <span class="team-score">${sanitize(m.score2 || "-")}</span>
        </div>
      </div>
    </div>
    <div class="card-footer-row">
      <div class="card-status ${statusClass}">${sanitize(m.status)}</div>
      <span class="card-cta">Scorecard →</span>
    </div>
  `;
  card.addEventListener("click", () => openMatchModal(m));
  return card;
}

function renderMatchCards() {
  if (state.filteredList.length === 0) {
    elements.grid.innerHTML = '<div class="empty-state"><p>No matches found matching your filter.</p></div>';
    return;
  }
  elements.grid.innerHTML = "";
  state.filteredList.forEach(m => elements.grid.appendChild(buildMatchCardElement(m)));
}

function renderSeriesCards() {
  if (state.filteredList.length === 0) {
    elements.grid.innerHTML = '<div class="empty-state"><p>No tournaments found.</p></div>';
    return;
  }
  elements.grid.innerHTML = "";
  state.filteredList.forEach(s => {
    const card = document.createElement("article");
    card.className = "series-card";
    card.innerHTML = `
      <div>
        <div class="card-meta"><span class="meta-series">OFFICIAL TOURNAMENT</span><span class="format-pill">SERIES</span></div>
        <h4>${sanitize(s.name || s.title || "Series")}</h4>
      </div>
      <div class="card-footer-row"><div class="card-status status-completed">📅 ${sanitize(s.startDate || "Scheduled")}</div></div>
    `;
    elements.grid.appendChild(card);
  });
}

function renderPlayerCards() {
  if (state.filteredList.length === 0) {
    elements.grid.innerHTML = '<div class="empty-state"><p>No players found in directory.</p></div>';
    return;
  }
  elements.grid.innerHTML = "";
  state.filteredList.forEach(p => {
    const card = document.createElement("article");
    card.className = "match-card";
    card.style.cursor = "pointer";
    card.innerHTML = `
      <div style="display:flex; align-items:center; gap:14px;">
        <div style="width:45px; height:45px; border-radius:50%; background:#f1f5f9; display:flex; align-items:center; justify-content:center; font-size:1.3rem; border:1px solid #cbd5e1;">👤</div>
        <div>
          <h4 style="font-size:0.98rem; font-weight:800; color:#0f172a; margin-bottom:2px;">${sanitize(p.name || "Player")}</h4>
          <p style="font-size:0.8rem; color:#64748b;">${sanitize(p.country || "International")}</p>
        </div>
      </div>
      <div class="card-footer-row" style="margin-top:12px;">
        <span style="font-size:0.75rem; font-weight:700; color:#047857;">View Profile →</span>
      </div>
    `;
    card.addEventListener("click", () => fetchPlayerDetail(p.objectId || p.id, p.name));
    elements.grid.appendChild(card);
  });
}

function startTimer() {
  if (state.intervalId) clearInterval(state.intervalId);
  state.timerCountdown = REFRESH_SECONDS;
  elements.timerDisplay.textContent = `Auto-refresh: ${state.timerCountdown}s`;

  state.intervalId = setInterval(() => {
    state.timerCountdown--;
    if (state.timerCountdown <= 0) {
      state.timerCountdown = REFRESH_SECONDS;
      refreshView();
    }
    elements.timerDisplay.textContent = `Auto-refresh: ${state.timerCountdown}s`;
  }, 1000);
}

function refreshView() {
  if (state.currentView === "current") loadLiveMatches();
  else if (state.currentView === "series") loadSeries();
  else if (state.currentView === "players") loadPlayers();
}

function initEvents() {
  elements.btnRefresh.addEventListener("click", () => {
    refreshView();
    startTimer();
  });

  elements.searchInput.addEventListener("input", e => {
    state.searchQuery = e.target.value;
    applyFilters();
  });

  elements.viewTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      elements.viewTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      state.currentView = tab.getAttribute("data-view");

      if (state.currentView === "series") {
        elements.stageFilterGroup.classList.add("hidden");
        elements.pakSection.classList.add("hidden");
        elements.sectionHeading.textContent = "SERIES & TOURS ARCHIVE";
        loadSeries();
      } else if (state.currentView === "players") {
        elements.stageFilterGroup.classList.add("hidden");
        elements.pakSection.classList.add("hidden");
        elements.sectionHeading.textContent = "PLAYERS DIRECTORY";
        loadPlayers();
      } else {
        elements.stageFilterGroup.classList.remove("hidden");
        elements.pakSection.classList.remove("hidden");
        elements.sectionHeading.textContent = "INTERNATIONAL & FEATURED CRICKET SCORES";
        loadLiveMatches();
      }
    });
  });

  elements.filterTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      elements.filterTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      state.activeFilter = tab.getAttribute("data-filter");
      applyFilters();
    });
  });

  elements.modalClose.addEventListener("click", () => elements.modal.classList.add("hidden"));
  elements.modal.addEventListener("click", e => {
    if (e.target === elements.modal) elements.modal.classList.add("hidden");
  });
}

initEvents();
loadLiveMatches();
startTimer();
