/**
 * KhanCricinfo - Modern Sports UI Controller
 */

const REFRESH_SECONDS = 90;
const CDN_BASE = "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_50";

// Full Member International Teams for Priority Sorting
const INTL_TEAMS = [
  "pakistan", "india", "australia", "england", "south africa",
  "new zealand", "sri lanka", "west indies", "bangladesh",
  "afghanistan", "zimbabwe", "ireland", "scotland", "netherlands",
  "namibia", "nepal", "usa", "united arab emirates", "oman", "canada"
];

// Domestic Pakistan teams to exclude from the National Men's Spotlight
const DOMESTIC_PAK_EXCLUSIONS = [
  "pakistan tv", "pakistan television", "pakistan hkg", "pakistan a",
  "pakistan shaheens", "pakistan u19", "pakistan under-19", "pakistan women"
];

const state = {
  currentView: "current",
  rawMatches: [],
  rawSeries: [],
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

// Format ISO timestamp into readable Pakistan Standard Time (PKT)
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

// Resolve clean status text with real start time if template placeholders appear
function buildStatusText(m, stage) {
  const rawText = m.statusText || m.status || "";
  const formattedTime = formatStartTimePKT(m);

  if (rawText.includes("{{") || rawText.toLowerCase().includes("yet to begin") || stage === "upcoming") {
    if (formattedTime) {
      return `Starts ${formattedTime}`;
    }
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

  if (
    rawState === "PRE" ||
    rawStage === "SCHEDULED" ||
    statusTxt.includes("yet to begin") ||
    statusTxt.includes("starts at") ||
    statusTxt.includes("starts in") ||
    statusTxt.includes("{{") ||
    statusTxt.includes("upcoming")
  ) {
    return "upcoming";
  }

  if (
    rawState === "LIVE" ||
    rawStage === "RUNNING" ||
    statusTxt.includes("live") ||
    statusTxt.includes("opt to") ||
    statusTxt.includes("chose to") ||
    statusTxt.includes("trail by") ||
    statusTxt.includes("lead by") ||
    statusTxt.includes("need") ||
    statusTxt.includes("day ") ||
    statusTxt.includes("innings break") ||
    statusTxt.includes("drinks") ||
    statusTxt.includes("stumps")
  ) {
    return "live";
  }

  return "completed";
}

// Identify whether a match is International vs Domestic
function isInternationalMatch(m, t1Name, t2Name, seriesName) {
  const intlClass = m.internationalClassId || m.generalClassId;
  if (intlClass === 1 || intlClass === 2 || intlClass === 3) return true;

  const sLow = seriesName.toLowerCase();
  const t1Low = t1Name.toLowerCase();
  const t2Low = t2Name.toLowerCase();

  // Exclude domestic trophies explicitly
  if (
    sLow.includes("president's trophy") ||
    sLow.includes("quaid-e-azam") ||
    sLow.includes("county") ||
    sLow.includes("sheffield") ||
    sLow.includes("spring challenge") ||
    sLow.includes("hkpl") ||
    sLow.includes("grade-i")
  ) {
    return false;
  }

  const bothIntlTeams = INTL_TEAMS.includes(t1Low) && INTL_TEAMS.includes(t2Low);
  const hasIntlKeyword = sLow.includes("icc") || sLow.includes("world cup") || sLow.includes("tri-series") || sLow.includes("tour of");

  return bothIntlTeams || hasIntlKeyword;
}

// Identify strictly Pakistan Men's National Team matches
function isPakistanMensNationalMatch(t1Name, t2Name, seriesName) {
  const t1 = t1Name.trim().toLowerCase();
  const t2 = t2Name.trim().toLowerCase();
  const s = seriesName.toLowerCase();

  if (s.includes("women") || t1.includes("women") || t2.includes("women")) return false;
  if (DOMESTIC_PAK_EXCLUSIONS.includes(t1) || DOMESTIC_PAK_EXCLUSIONS.includes(t2)) return false;

  return t1 === "pakistan" || t2 === "pakistan" || s.includes("pakistan odi") || s.includes("pakistan t20") || s.includes("pakistan test");
}

async function loadLiveMatches() {
  setStatus(null);
  elements.grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading international & live cricket scores...</p></div>';

  try {
    const res = await fetch("/api/live");
    const json = await res.json();

    if (!json.success || !json.data?.matches) {
      throw new Error(json.error || "Failed to load matches");
    }

    const mapped = json.data.matches.map(m => {
      const t1 = m.teams?.[0] || {};
      const t2 = m.teams?.[1] || {};
      const team1Name = t1.team?.name || t1.team?.longName || "Team 1";
      const team2Name = t2.team?.name || t2.team?.longName || "Team 2";
      const seriesName = m.series?.name || m.series?.longName || "Cricket Series";
      const stage = detectStage(m);
      const isIntl = isInternationalMatch(m, team1Name, team2Name, seriesName);
      const isPakMens = isPakistanMensNationalMatch(team1Name, team2Name, seriesName);

      return {
        objectId: m.objectId || m.id,
        seriesObjectId: m.series?.objectId || m.series?.id || "",
        title: m.title || "",
        format: (m.format || "MATCH").toUpperCase(),
        stage: stage,
        isInternational: isIntl,
        isPakMens: isPakMens,
        team1: team1Name,
        team1Abbr: t1.team?.abbreviation || team1Name.slice(0, 3).toUpperCase(),
        flag1: t1.team?.imageUrl ? `${CDN_BASE}${t1.team.imageUrl}` : "",
        team2: team2Name,
        team2Abbr: t2.team?.abbreviation || team2Name.slice(0, 3).toUpperCase(),
        flag2: t2.team?.imageUrl ? `${CDN_BASE}${t2.team.imageUrl}` : "",
        score1: t1.score || (t1.scoreInfo ? `${t1.scoreInfo}` : ""),
        score2: t2.score || (t2.scoreInfo ? `${t2.scoreInfo}` : ""),
        status: buildStatusText(m, stage),
        startTimePKT: formatStartTimePKT(m),
        series: seriesName,
        venue: m.ground?.smallName || m.ground?.name || ""
      };
    });

    // Priority Sort:
    // 1. Pakistan Men's National Matches
    // 2. International Live -> International Upcoming -> International Completed
    // 3. Domestic Live -> Domestic Upcoming -> Domestic Completed
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

// Render Dedicated Pakistan Men's Cricket Center
function renderPakistanSpotlight() {
  const pakMatches = state.rawMatches.filter(m => m.isPakMens);

  if (pakMatches.length === 0) {
    elements.pakGrid.innerHTML = `
      <div style="grid-column: 1 / -1; background: rgba(255,255,255,0.1); padding: 14px 18px; border-radius: 12px; font-size: 0.88rem;">
        No live or immediate Pakistan Men's National Team match in the current feed. Check the <strong>Series & Tours</strong> tab for upcoming Pakistan series!
      </div>
    `;
    return;
  }

  elements.pakGrid.innerHTML = "";
  pakMatches.forEach(m => {
    const card = buildMatchCardElement(m);
    elements.pakGrid.appendChild(card);
  });
}

// Top Carousel & Ticker prioritizes International matches
function renderTopCarouselAndTicker() {
  const intlList = state.rawMatches.filter(m => m.isInternational);
  const featured = (intlList.length >= 4 ? intlList : state.rawMatches).slice(0, 8);

  if (featured.length > 0) {
    elements.topTicker.innerHTML = featured.map((m, idx) => `
      <span class="cb-ticker-item" data-idx="${idx}">
        <strong>${sanitize(m.team1Abbr)} vs ${sanitize(m.team2Abbr)}</strong> • ${m.stage === "live" ? "🔴 Live" : m.stage === "upcoming" ? "⏳ Upcoming" : "Result"}
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
    const statusClass = m.stage === "live" ? "status-live" : m.stage === "upcoming" ? "status-upcoming" : "status-completed";

    mini.innerHTML = `
      <div>
        <div class="card-meta">
          <span class="meta-series">${sanitize(m.series)}</span>
          <span class="format-pill">${sanitize(m.format)}</span>
        </div>
        <div class="teams-list" style="padding:10px 12px; margin-bottom:10px;">
          <div class="team-entry">
            <span class="team-info" style="font-size:0.86rem;">${sanitize(m.team1Abbr)}</span>
            <span class="team-score" style="font-size:0.85rem;">${sanitize(m.score1 || "-")}</span>
          </div>
          <div class="team-entry">
            <span class="team-info" style="font-size:0.86rem;">${sanitize(m.team2Abbr)}</span>
            <span class="team-score" style="font-size:0.85rem;">${sanitize(m.score2 || "-")}</span>
          </div>
        </div>
      </div>
      <div class="card-status ${statusClass}" style="font-size:0.75rem;">${sanitize(m.status)}</div>
    `;
    mini.addEventListener("click", () => openMatchModal(m));
    elements.featuredStrip.appendChild(mini);
  });
}

async function loadSeries() {
  setStatus(null);
  elements.grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading series & tournaments...</p></div>';

  try {
    const res = await fetch("/api/series");
    const json = await res.json();

    if (!json.success || !json.data) {
      throw new Error(json.error || "Failed to load series");
    }

    let items = [];
    if (Array.isArray(json.data.series)) {
      items = json.data.series;
    } else if (typeof json.data === "object") {
      Object.values(json.data).forEach(val => {
        if (Array.isArray(val)) items.push(...val);
      });
    }

    state.rawSeries = items;
    applyFilters();
  } catch (err) {
    setStatus(err.message, true);
    elements.grid.innerHTML = `<div class="empty-state"><p>${sanitize(err.message)}</p></div>`;
  }
}

// Extract innings array regardless of ESPN nesting depth
function extractInningsList(data) {
  if (!data) return [];
  if (Array.isArray(data.innings)) return data.innings;
  if (Array.isArray(data.content?.innings)) return data.content.innings;
  if (Array.isArray(data.scorecard?.innings)) return data.scorecard.innings;
  if (Array.isArray(data.data?.innings)) return data.data.innings;
  return [];
}

// Open Match Modal & Fetch Full Scorecard + Fallback Match Details
async function openMatchModal(m) {
  elements.modalSeriesTitle.textContent = `${m.team1} vs ${m.team2} — ${m.series}`;
  elements.modalBody.innerHTML = `
    <div style="margin-bottom: 16px;">
      <p style="font-size:0.84rem; color:#64748b; font-weight:600;">
        ${sanitize(m.title)} ${m.venue ? `• 📍 ${sanitize(m.venue)}` : ""}
        ${m.startTimePKT ? `• 🕒 ${sanitize(m.startTimePKT)}` : ""}
      </p>
      <div style="background:#f8fafc; border:1.5px solid #cbd5e1; padding:14px 16px; border-radius:12px; margin:12px 0;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:1.05rem; color:#0f172a;">
          <strong>${sanitize(m.team1)}</strong>
          <strong style="color:#047857;">${sanitize(m.score1 || "-")}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:1.05rem; color:#0f172a;">
          <strong>${sanitize(m.team2)}</strong>
          <strong style="color:#047857;">${sanitize(m.score2 || "-")}</strong>
        </div>
      </div>
      <p class="${m.stage === 'live' ? 'status-live' : m.stage === 'upcoming' ? 'status-upcoming' : 'status-completed'}" style="font-size:0.9rem; font-weight:700;">
        ${sanitize(m.status)}
      </p>
    </div>
    <div id="scorecard-loader" style="text-align:center; padding:18px; color:#64748b; font-size:0.86rem;">
      <div class="spinner"></div>
      Fetching full batting & bowling scorecard...
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

    // If innings exist, render full Batting & Bowling tables
    if (json.success && innings.length > 0) {
      loader.outerHTML = innings.map(inn => {
        const batsmen = inn.inningBatsmen || inn.batsmen || [];
        const bowlers = inn.inningBowlers || inn.bowlers || [];

        const batRows = batsmen.map(b => `
          <tr>
            <td>
              <strong>${sanitize(b.player?.name || b.player?.longName || b.name || "Batter")}</strong>
              ${b.dismissalText?.short ? `<div style="font-size:0.73rem;color:#64748b;">${sanitize(b.dismissalText.short)}</div>` : ""}
            </td>
            <td><strong>${b.runs ?? "-"}</strong></td>
            <td>${b.balls ?? "-"}</td>
            <td>${b.fours ?? "-"}</td>
            <td>${b.sixes ?? "-"}</td>
            <td>${b.strikeRate ?? b.sr ?? "-"}</td>
          </tr>
        `).join("");

        const bowlRows = bowlers.map(bw => `
          <tr>
            <td><strong>${sanitize(bw.player?.name || bw.player?.longName || bw.name || "Bowler")}</strong></td>
            <td>${bw.overs ?? "-"}</td>
            <td>${bw.maidens ?? "-"}</td>
            <td>${bw.conceded ?? bw.runs ?? "-"}</td>
            <td><strong>${bw.wickets ?? "-"}</strong></td>
            <td>${bw.economy ?? "-"}</td>
          </tr>
        `).join("");

        return `
          <div style="margin-top:18px;">
            <h4 style="background:#0f172a; color:#fff; padding:9px 12px; font-size:0.85rem; border-radius:8px; display:flex; justify-content:space-between;">
              <span>${sanitize(inn.team?.name || inn.teamName || "Innings")}</span>
              <span>${inn.runs !== undefined ? `${inn.runs}/${inn.wickets ?? 0} (${inn.overs ?? 0} ov)` : ""}</span>
            </h4>
            <table class="cb-score-table">
              <thead>
                <tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr>
              </thead>
              <tbody>${batRows || '<tr><td colspan="6">Yet to bat</td></tr>'}</tbody>
            </table>
            ${bowlRows ? `
              <table class="cb-score-table" style="margin-top:10px;">
                <thead>
                  <tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>ECON</th></tr>
                </thead>
                <tbody>${bowlRows}</tbody>
              </table>
            ` : ""}
          </div>
        `;
      }).join("");
      return;
    }

    // Fallback for Upcoming Matches: Fetch Match Details / Squads
    const detailRes = await fetch(`/api/match-details/${m.objectId}${query}`);
    const detailJson = await detailRes.json();

    if (detailJson.success && detailJson.data) {
      const d = detailJson.data.match || detailJson.data;
      loader.outerHTML = `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; font-size:0.85rem; color:#334155;">
          <h4 style="margin-bottom:8px; color:#0f172a;">Match Information</h4>
          <p style="margin-bottom:4px;"><strong>Series:</strong> ${sanitize(m.series)}</p>
          <p style="margin-bottom:4px;"><strong>Format:</strong> ${sanitize(m.format)}</p>
          ${m.venue ? `<p style="margin-bottom:4px;"><strong>Venue:</strong> ${sanitize(m.venue)}</p>` : ""}
          ${m.startTimePKT ? `<p style="margin-bottom:4px;"><strong>Start Time (PKT):</strong> ${sanitize(m.startTimePKT)}</p>` : ""}
          ${d.toss ? `<p><strong>Toss:</strong> ${sanitize(d.toss)}</p>` : ""}
        </div>
      `;
    } else {
      loader.innerHTML = "<p>Match has not started yet. Full batting & bowling scorecard will appear once play begins.</p>";
    }
  } catch (e) {
    const loader = document.getElementById("scorecard-loader");
    if (loader) loader.innerHTML = "<p>Scorecard details unavailable right now.</p>";
  }
}

function applyFilters() {
  const q = state.searchQuery.trim().toLowerCase();

  if (state.currentView === "series") {
    state.filteredList = state.rawSeries.filter(s =>
      !q || (s.name && s.name.toLowerCase().includes(q))
    );
    renderSeriesCards();
  } else {
    state.filteredList = state.rawMatches.filter(m => {
      let matchStage = true;
      if (state.activeFilter === "international") {
        matchStage = m.isInternational;
      } else if (state.activeFilter !== "all") {
        matchStage = m.stage === state.activeFilter;
      }

      const matchQuery = !q ||
        m.team1.toLowerCase().includes(q) ||
        m.team2.toLowerCase().includes(q) ||
        m.series.toLowerCase().includes(q) ||
        m.venue.toLowerCase().includes(q);
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
        <span class="meta-series" title="${sanitize(m.series)}">${sanitize(m.series)} ${m.title ? `• ${sanitize(m.title)}` : ""}</span>
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
  state.filteredList.forEach(m => {
    elements.grid.appendChild(buildMatchCardElement(m));
  });
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
        <div class="card-meta">
          <span class="meta-series">OFFICIAL TOURNAMENT</span>
          <span class="format-pill">SERIES</span>
        </div>
        <h4>${sanitize(s.name || s.title || "Series")}</h4>
      </div>
      <div class="card-footer-row">
        <div class="card-status status-completed">📅 ${sanitize(s.startDate || "Scheduled Season")}</div>
      </div>
    `;
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
        elements.sectionHeading.textContent = "INTERNATIONAL & DOMESTIC SERIES ARCHIVE";
      } else {
        elements.stageFilterGroup.classList.remove("hidden");
        elements.pakSection.classList.remove("hidden");
        elements.sectionHeading.textContent = "INTERNATIONAL & FEATURED CRICKET SCORES";
      }

      refreshView();
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
