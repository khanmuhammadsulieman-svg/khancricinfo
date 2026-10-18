require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PARSE_KEY = process.env.PARSE_API_KEY;
const SCRAPER_ID = "82e4a3f6-6de0-450e-8c69-03a686593066";
const BASE_URL = `https://api.parse.bot/scraper/${SCRAPER_ID}`;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Generic caller to Parse API
async function callParseEndpoint(endpoint, payload = {}) {
  if (!process.env.PARSE_API_KEY) {
    throw new Error("PARSE_API_KEY is not configured in Vercel Environment Variables.");
  }

  const url = `${BASE_URL}/${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-Key": process.env.PARSE_API_KEY,
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

// 2. Match Details & Squads
app.get("/api/match-details/:objectId", async (req, res) => {
  try {
    const data = await callParseEndpoint("get_match_details", {
      objectId: req.params.objectId
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Full Scorecard
app.get("/api/scorecard/:objectId", async (req, res) => {
  try {
    const data = await callParseEndpoint("get_match_scorecard", {
      objectId: req.params.objectId
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

// Fallback to index.html for root path
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Local development listener
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

// Export app for Vercel Serverless Function
module.exports = app;
