// server.js — Serveur relais entre ton appli et l'API Printful
// Pourquoi ce serveur : les navigateurs bloquent les appels directs à api.printful.com
// (CORS). Ce petit serveur fait les appels à ta place, côté serveur, où CORS ne s'applique pas.
//
// DÉPLOIEMENT (gratuit) :
// 1. Crée un compte sur https://render.com (ou https://railway.app)
// 2. Mets ce dossier dans un repo GitHub
// 3. Nouveau "Web Service" -> connecte le repo -> Build: npm install -> Start: node server.js
// 4. Ajoute la variable d'environnement PRINTFUL_API_KEY (ta clé, trouvée dans
//    Printful -> Paramètres -> API)
//    Ajoute aussi KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY (Kkiapay -> Paramètres -> API)
//    Ajoute aussi OPENAI_API_KEY si tu veux la génération de designs par IA (facultatif)
// 5. Ajoute aussi ALLOWED_ORIGIN = l'URL de ton appli (pour restreindre qui peut appeler ce serveur)
// 6. Une fois déployé, remplace les URLs dans PrintPilot.jsx par l'URL de ce serveur
//    (ex: https://ton-serveur.onrender.com/api/products)

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

// Lister les produits de la boutique
app.get("/api/products", async (req, res) => {
  const r = await fetch(`${PRINTFUL_BASE}/store/products`, { headers: authHeaders() });
  res.status(r.status).json(await r.json());
});

// Créer un produit dans la boutique (design + variantes)
app.post("/api/products", async (req, res) => {
  const r = await fetch(`${PRINTFUL_BASE}/store/products`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(req.body),
  });
  res.status(r.status).json(await r.json());
});

// Lister les commandes
app.get("/api/orders", async (req, res) => {
  const r = await fetch(`${PRINTFUL_BASE}/orders`, { headers: authHeaders() });
  res.status(r.status).json(await r.json());
});

// Créer une commande (quand un client paie sur ta boutique, tu appelles ça
// pour déclencher la fabrication + expédition chez Printful)
app.post("/api/orders", async (req, res) => {
  const r = await fetch(`${PRINTFUL_BASE}/orders`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(req.body),
  });
  res.status(r.status).json(await r.json());
});

// Catalogue Printful (types de produits imprimables : t-shirts, mugs, posters...)
app.get("/api/catalog", async (req, res) => {
  const r = await fetch(`${PRINTFUL_BASE}/products`, { headers: authHeaders() });
  res.status(r.status).json(await r.json());
});

// --- Kkiapay ---
// Vérifie une transaction Kkiapay côté serveur (jamais faire confiance au navigateur seul)
// Doc: https://docs.kkiapay.me
app.post("/api/kkiapay/verify", async (req, res) => {
  const { transactionId } = req.body;
  try {
    const r = await fetch(`https://api.kkiapay.me/api/v1/transactions/status`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.KKIAPAY_PUBLIC_KEY,
        "x-private-key": process.env.KKIAPAY_PRIVATE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transactionId }),
    });
    const data = await r.json();
    // data.status === "SUCCESS" si le paiement est confirmé
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: "verification-failed" });
  }
});

// Webhook Kkiapay (à configurer dans le dashboard Kkiapay) — c'est la vraie source de vérité,
// plus fiable que la confirmation côté navigateur.
app.post("/api/kkiapay/webhook", express.json(), async (req, res) => {
  console.log("Webhook Kkiapay reçu:", req.body);
  // TODO: si le statut est SUCCESS, déclencher la création de la commande Printful
  // via la logique de la route /api/orders ci-dessus.
  res.sendStatus(200);
});

// --- Génération d'images IA (designs produits) ---
// Nécessite une clé API OpenAI (variable d'environnement OPENAI_API_KEY)
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

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Serveur relais Printful actif sur le port ${port}`));
