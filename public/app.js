/**
 * KhanCricinfo - Frontend Controller
 */

const REFRESH_SECONDS = 90;

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
  statusBar: document.getElementById("status-bar"),
  timerDisplay: document.getElementById("auto-refresh-timer"),
  btnRefresh: document.getElementById("btn-manual-refresh"),
  searchInput: document.getElementById("search-input"),
  stageFilterGroup: document.getElementById("stage-filter-group"),
  filterTabs: document.querySelectorAll(".filter-tab"),
  viewTabs: document.querySelectorAll(".view-tab"),
  modal: document.getElementById("detail-modal"),
  modalBody: document.getElementById("modal-body"),
  modalClose: document.getElementById("btn-close-modal")
};

function sanitize(str) {
  if (!str) return "";
  return String(str).replace(/[&<>'"]/g, t => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[t] || t));
}

function setStatus(msg, isAlert = false) {
  if (!msg) {
    elements.statusBar.className = "status-bar hidden";
    return;
  }
  elements.statusBar.className = `status-bar ${isAlert ? "alert" : ""}`;
  elements.statusBar.textContent = msg;
}

async function loadLiveMatches() {
  setStatus(null);
  elements.grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Fetching matches from KhanCricinfo server...</p></div>';

  try {
    const res = await fetch("/api/live");
    const json = await res.json();

    if (!json.success || !json.data?.matches) {
      throw new Error(json.error || "Failed to load matches");
    }

    state.rawMatches = json.data.matches.map(m => ({
      objectId: m.objectId,
      format: (m.format || "Cricket").toUpperCase(),
      stage: (m.state === "LIVE") ? "live" : "completed",
      team1: m.teams?.[0]?.team?.name || "Team 1",
      team2: m.teams?.[1]?.team?.name || "Team 2",
      score1: m.teams?.[0]?.score || "-",
      score2: m.teams?.[1]?.score || "-",
      status: m.statusText || m.status || "In progress",
      series: m.series?.name || ""
    }));

    applyFilters();
  } catch (err) {
    setStatus(err.message, true);
    elements.grid.innerHTML = `<div class="empty-state"><p>${sanitize(err.message)}</p></div>`;
  }
}

async function loadSeries() {
  setStatus(null);
  elements.grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Fetching series list...</p></div>';

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
  elements.modalBody.innerHTML = `
    <h3>${sanitize(m.team1)} vs ${sanitize(m.team2)}</h3>
    <p style="color:var(--text-dim);font-size:0.85rem;margin:6px 0 16px;">${sanitize(m.series)} (${sanitize(m.format)})</p>
    <div style="background:#0f172a;padding:12px;border-radius:6px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span>${sanitize(m.team1)}</span><strong>${sanitize(m.score1)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span>${sanitize(m.team2)}</span><strong>${sanitize(m.score2)}</strong>
      </div>
    </div>
    <p style="font-size:0.85rem;"><strong>Status:</strong> ${sanitize(m.status)}</p>
  `;
  elements.modal.classList.remove("hidden");
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
      const matchQuery = !q || m.team1.toLowerCase().includes(q) || m.team2.toLowerCase().includes(q) || m.series.toLowerCase().includes(q);
      return matchStage && matchQuery;
    });
    renderMatchCards();
  }
}

function renderMatchCards() {
  if (state.filteredList.length === 0) {
    elements.grid.innerHTML = '<div class="empty-state"><p>No matches found.</p></div>';
    return;
  }

  elements.grid.innerHTML = "";
  state.filteredList.forEach(m => {
    const card = document.createElement("article");
    card.className = "match-card";
    card.innerHTML = `
      <div>
        <div class="card-header">
          <span class="match-format">${sanitize(m.format)}</span>
          <span class="status-badge ${m.stage === 'live' ? 'badge-live' : 'badge-completed'}">${m.stage.toUpperCase()}</span>
        </div>
        <div class="teams-list">
          <div class="team-entry"><span>${sanitize(m.team1)}</span><span class="team-score">${sanitize(m.score1)}</span></div>
          <div class="team-entry"><span>${sanitize(m.team2)}</span><span class="team-score">${sanitize(m.score2)}</span></div>
        </div>
      </div>
      <footer class="card-footer">${sanitize(m.status)}</footer>
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
      <h4>${sanitize(s.name || s.title || "Series")}</h4>
      <p style="font-size:0.8rem;color:var(--text-dim);margin-top:6px;">${sanitize(s.startDate || "Scheduled")}</p>
    `;
    elements.grid.appendChild(card);
  });
}

function startTimer() {
  if (state.intervalId) clearInterval(state.intervalId);
  state.timerCountdown = REFRESH_SECONDS;
  elements.timerDisplay.textContent = `Refreshing in: ${state.timerCountdown}s`;

  state.intervalId = setInterval(() => {
    state.timerCountdown--;
    if (state.timerCountdown <= 0) {
      state.timerCountdown = REFRESH_SECONDS;
      refreshView();
    }
    elements.timerDisplay.textContent = `Refreshing in: ${state.timerCountdown}s`;
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
      } else {
        elements.stageFilterGroup.classList.remove("hidden");
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
