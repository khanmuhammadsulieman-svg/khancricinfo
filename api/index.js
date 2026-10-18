const express = require("express");
const cors = require("cors");

const app = express();
const SCRAPER_ID = "1d60bec3-9a21-42ea-8ee9-e5ef840ba233";
const BASE_URL = `https://api.parse.bot/scraper/${SCRAPER_ID}`;

app.use(cors());
app.use(express.json());

async function callParseEndpoint(endpoint, payload = {}) {
  const apiKey = process.env.PARSE_API_KEY;
  if (!apiKey) {
    throw new Error("PARSE_API_KEY is not configured in Vercel Environment Variables.");
  }

  const url = `${BASE_URL}/${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 401) throw new Error("Invalid Parse API Key (401)");
  if (response.status === 402) throw new Error("Out of Parse credits (402)");
  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error || `Parse request failed with HTTP ${response.status}`);
  }

  const envelope = await response.json();
  return envelope.data;
}

// 1. Live Scores
app.get("/api/live", async (req, res) => {
  try {
    const data = await callParseEndpoint("get_live_scores");
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Full Scorecard
app.get("/api/scorecard/:objectId", async (req, res) => {
  try {
    const matchId = Number(req.params.objectId) || req.params.objectId;
    const seriesId = Number(req.query.seriesId) || req.query.seriesId;

    const data = await callParseEndpoint("get_match_scorecard", {
      objectId: matchId,
      match_id: matchId,
      series_id: seriesId,
      seriesObjectId: seriesId
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Match Details
app.get("/api/match-details/:objectId", async (req, res) => {
  try {
    const matchId = Number(req.params.objectId) || req.params.objectId;
    const seriesId = Number(req.query.seriesId) || req.query.seriesId;

    const data = await callParseEndpoint("get_match_details", {
      objectId: matchId,
      match_id: matchId,
      series_id: seriesId,
      seriesObjectId: seriesId
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Series & Fixtures
app.get("/api/series", async (req, res) => {
  try {
    const data = await callParseEndpoint("get_series_fixtures");
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Players Directory
app.get("/api/players", async (req, res) => {
  try {
    const data = await callParseEndpoint("get_players");
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Player Profile & Stats
app.get("/api/player-info/:objectId", async (req, res) => {
  try {
    const playerId = Number(req.params.objectId) || req.params.objectId;
    const data = await callParseEndpoint("get_player_info", {
      objectId: playerId,
      player_id: playerId
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = app;
