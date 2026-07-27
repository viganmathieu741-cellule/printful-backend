// server.js — Serveur relais entre ton appli et l'API Printful
// Pourquoi ce serveur : les navigateurs bloquent les appels directs à api.printful.com
// (CORS). Ce petit serveur fait les appels à ta place, côté serveur, où CORS ne s'applique pas.

import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "*",
  })
);

const PRINTFUL_BASE = "https://api.printful.com";
const KEY = process.env.PRINTFUL_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  };
}

app.get("/api/products", async (req, res) => {
  const r = await fetch(`${PRINTFUL_BASE}/store/products`, { headers: authHeaders() });
  res.status(r.status).json(await r.json());
});

app.post("/api/products", async (req, res) => {
  const r = await fetch(`${PRINTFUL_BASE}/store/products`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(req.body),
  });
  res.status(r.status).json(await r.json());
});

app.get("/api/orders", async (req, res) => {
  const r = await fetch(`${PRINTFUL_BASE}/orders`, { headers: authHeaders() });
  res.status(r.status).json(await r.json());
});

app.post("/api/orders", async (req, res) => {
  const r = await fetch(`${PRINTFUL_BASE}/orders`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(req.body),
  });
  res.status(r.status).json(await r.json());
});

app.get("/api/catalog", async (req, res) => {
  const r = await fetch(`${PRINTFUL_BASE}/products`, { headers: authHeaders() });
  res.status(r.status).json(await r.json());
});

app.post("/api/kkiapay/verify", async (req, res) => {
  const { transactionId } = req.body;
  try {
    const r = await fetch(`https://api.kkiapay.me/api/v1/transactions/status`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.KKIAPAY_PUBLIC_KEY,
        "x-private-key": process.env.KKIAPAY_PRIVATE_KEY,
        "x-secret-key": process.env.KKIAPAY_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transactionId }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: "verification-failed" });
  }
});

app.post("/api/kkiapay/webhook", express.json(), async (req, res) => {
  console.log("Webhook Kkiapay reçu:", req.body);
  res.sendStatus(200);
});

app.post("/api/generate-image", async (req, res) => {
  const { prompt } = req.body;
  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        n: 1,
      }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: "image-generation-failed" });
  }
});

app.post("/api/generate-marketing", async (req, res) => {
  const { product, audience } = req.body;
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY manquante sur le serveur" });
  }
  const prompt = `Tu es un stratège en publicité e-commerce spécialisé en print-on-demand (Printful) qui vend au Bénin/Afrique de l'Ouest et à l'international.
Produit à vendre: ${product}
Audience visée: ${audience || "à définir toi-même selon le produit"}

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour, avec cette structure exacte:
{
  "avatar_client": "paragraphe décrivant le client idéal: frustrations, désirs, habitudes",
  "proposition_valeur": "une phrase forte",
  "angles": ["angle 1", "angle 2", "angle 3"],
  "hooks": ["hook court 1", "hook court 2", "hook court 3", "hook court 4", "hook court 5"],
  "publicites": [
    {"titre": "titre pub 1", "texte": "texte publicitaire court prêt pour Meta Ads", "cta": "call to action"},
    {"titre": "titre pub 2", "texte": "texte publicitaire court", "cta": "call to action"}
  ],
  "fiche_produit": "description produit prête pour la boutique, orientée conversion"
}`;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) {
      return res.status(500).json({ error: "gemini-api-error", details: data });
    }
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    const clean = text.replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(clean);
      res.status(200).json(parsed);
    } catch (parseErr) {
      res.status(500).json({ error: "json-parse-failed", raw: text });
    }
  } catch (e) {
    res.status(500).json({ error: "marketing-generation-failed", message: e.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Serveur relais Printful actif sur le port ${port}`));
