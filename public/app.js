/**
 * KhanCricinfo - Modern Sports UI Controller
 */

const REFRESH_SECONDS = 90;
const CDN_BASE = "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_50";

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

// Clean raw ESPN placeholder variables like {{MATCH_START_HOURS}}
function cleanStatusText(rawText) {
  if (!rawText) return "Scheduled";
  if (rawText.includes("{{")) {
    return "Scheduled • Upcoming Fixture";
  }
  return rawText;
}

function setStatus(msg, isAlert = false) {
  if (!msg) {
    elements.statusBar.className = "status-bar hidden";
    return;
  }
  elements.statusBar.className = `status-bar ${isAlert ? "alert" : ""}`;
  elements.statusBar.textContent = msg;
}

// Classify match into 'live', 'upcoming', or 'completed'
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

async function loadLiveMatches() {
  setStatus(null);
  elements.grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading live cricket scores...</p></div>';

  try {
    const res = await fetch("/api/live");
    const json = await res.json();

    if (!json.success || !json.data?.matches) {
      throw new Error(json.error || "Failed to load matches");
    }

    state.rawMatches = json.data.matches.map(m => {
      const t1 = m.teams?.[0] || {};
      const t2 = m.teams?.[1] || {};

      return {
        objectId: m.objectId,
        title: m.title || "",
        format: (m.format || "MATCH").toUpperCase(),
        stage: detectStage(m),
        team1: t1.team?.name || "Team 1",
        team1Abbr: t1.team?.abbreviation || t1.team?.name || "T1",
        flag1: t1.team?.imageUrl ? `${CDN_BASE}${t1.team.imageUrl}` : "",
        team2: t2.team?.name || "Team 2",
        team2Abbr: t2.team?.abbreviation || t2.team?.name || "T2",
        flag2: t2.team?.imageUrl ? `${CDN_BASE}${t2.team.imageUrl}` : "",
        score1: t1.score || "",
        score2: t2.score || "",
        status: cleanStatusText(m.statusText || m.status),
        series: m.series?.name || "International Cricket",
        venue: m.ground?.smallName || m.ground?.name || ""
      };
    });

    renderTopCarouselAndTicker();
    applyFilters();
  } catch (err) {
    setStatus(err.message, true);
    elements.grid.innerHTML = `<div class="empty-state"><p>${sanitize(err.message)}</p></div>`;
  }
}

function renderTopCarouselAndTicker() {
  const featured = state.rawMatches.slice(0, 8);

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
      <p class="${m.stage === 'live' ? 'status-live' : m.stage === 'upcoming' ? 'status-upcoming' : 'status-completed'}" style="font-size:0.9rem; font-weight:700;">
        ${sanitize(m.status)}
      </p>
    </div>
    <div id="scorecard-loader" style="text-align:center; padding:18px; color:#64748b; font-size:0.86rem;">
      <div class="spinner"></div>
      Fetching detailed scorecard...
    </div>
  `;
  elements.modal.classList.remove("hidden");

  if (!m.objectId) return;

  try {
    const res = await fetch(`/api/scorecard/${m.objectId}`);
    const json = await res.json();
    const loader = document.getElementById("scorecard-loader");
    if (!loader) return;

    const innings = json.data?.innings || json.data?.content?.innings || [];
    if (!json.success || !Array.isArray(innings) || innings.length === 0) {
      loader.innerHTML = "<p>Full batting scorecard is not yet available for this match.</p>";
      return;
    }

    loader.outerHTML = innings.map(inn => {
      const batsmen = inn.inningBatsmen || inn.batsmen || [];
      const rows = batsmen.slice(0, 11).map(b => `
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
        <div style="margin-top:16px;">
          <h4 style="background:#0f172a; color:#fff; padding:8px 12px; font-size:0.84rem; border-radius:8px;">
            ${sanitize(inn.team?.name || "Innings")} ${inn.runs ? `— ${inn.runs}/${inn.wickets} (${inn.overs} ov)` : ""}
          </h4>
          <table class="cb-score-table">
            <thead>
              <tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6">No batting lines recorded</td></tr>'}</tbody>
          </table>
        </div>
      `;
    }).join("");
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
      const matchStage = state.activeFilter === "all" || m.stage === state.activeFilter;
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

function renderMatchCards() {
  if (state.filteredList.length === 0) {
    elements.grid.innerHTML = '<div class="empty-state"><p>No matches found matching your filter.</p></div>';
    return;
  }

  elements.grid.innerHTML = "";
  state.filteredList.forEach(m => {
    const card = document.createElement("article");
    card.className = `match-card card-${m.stage}`;
    const statusClass = m.stage === "live" ? "status-live" : m.stage === "upcoming" ? "status-upcoming" : "status-completed";

    card.innerHTML = `
      <div>
        <div class="card-meta">
          <span class="meta-series" title="${sanitize(m.series)}">${sanitize(m.series)} ${m.title ? `• ${sanitize(m.title)}` : ""}</span>
          <div class="meta-badges">
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
    elements.grid.appendChild(card);
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
        elements.sectionHeading.textContent = "INTERNATIONAL & DOMESTIC SERIES ARCHIVE";
      } else {
        elements.stageFilterGroup.classList.remove("hidden");
        elements.sectionHeading.textContent = "LIVE & RECENT CRICKET SCORES";
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
