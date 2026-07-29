// server.js — Serveur relais entre ton appli et les API (Printful, Kkiapay, OpenAI, Groq)

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
const HARDCODED_STORE_ID = "18530151"; // ID de ta boutique PrintPilot

function authHeaders() {
  const apiKey = process.env.PRINTFUL_API_KEY;
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function storeHeaders() {
  return {
    ...authHeaders(),
    "X-PF-Store-Id": process.env.PRINTFUL_STORE_ID || HARDCODED_STORE_ID,
  };
}

// Liste tes boutiques Printful
app.get("/api/stores", async (req, res) => {
  if (!process.env.PRINTFUL_API_KEY) {
    return res.status(500).json({ error: "PRINTFUL_API_KEY manquante sur le serveur" });
  }
  try {
    const r = await fetch(`${PRINTFUL_BASE}/stores`, { headers: authHeaders() });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: "stores-fetch-failed", details: e.message });
  }
});

// Récupération des produits de la boutique
app.get("/api/products", async (req, res) => {
  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Erreur — vérifie que PRINTFUL_API_KEY est configurée sur ton serveur relais." });
  }
  try {
    const r = await fetch(`${PRINTFUL_BASE}/store/products`, { headers: storeHeaders() });
    const data = await r.json();
    const productsArray = Array.isArray(data) ? data : (data.result || []);
    res.status(200).json(productsArray);
  } catch (e) {
    res.status(500).json({ error: "products-fetch-failed", details: e.message });
  }
});

// Création / envoi d'un produit synchronisé
app.post("/api/products", async (req, res) => {
  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Erreur — vérifie que PRINTFUL_API_KEY est configurée sur ton serveur relais." });
  }
  try {
    const r = await fetch(`${PRINTFUL_BASE}/store/products`, {
      method: "POST",
      headers: storeHeaders(),
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: "product-creation-failed", details: e.message });
  }
});

app.get("/api/orders", async (req, res) => {
  if (!process.env.PRINTFUL_API_KEY) {
    return res.status(500).json({ error: "Erreur — vérifie que PRINTFUL_API_KEY est configurée sur ton serveur relais." });
  }
  const r = await fetch(`${PRINTFUL_BASE}/orders`, { headers: storeHeaders() });
  res.status(r.status).json(await r.json());
});

app.post("/api/orders", async (req, res) => {
  if (!process.env.PRINTFUL_API_KEY) {
    return res.status(500).json({ error: "Erreur — vérifie que PRINTFUL_API_KEY est configurée sur ton serveur relais." });
  }
  const r = await fetch(`${PRINTFUL_BASE}/orders`, {
    method: "POST",
    headers: storeHeaders(),
    body: JSON.stringify(req.body),
  });
  res.status(r.status).json(await r.json());
});

// Catalogue général Printful (n'a pas besoin du store_id)
app.get("/api/catalog", async (req, res) => {
  if (!process.env.PRINTFUL_API_KEY) {
    return res.status(500).json({ error: "Erreur — vérifie que PRINTFUL_API_KEY est configurée sur ton serveur relais." });
  }
  try {
    const r = await fetch(`${PRINTFUL_BASE}/products`, { headers: authHeaders() });
    const data = await r.json();
    const catalogArray = Array.isArray(data) ? data : (data.result || []);
    res.status(200).json(catalogArray);
  } catch (e) {
    res.status(500).json({ error: "catalog-fetch-failed" });
  }
});

// Détail d'un produit du catalogue (récupère ses variantes: tailles/couleurs)
app.get("/api/catalog/:id", async (req, res) => {
  if (!process.env.PRINTFUL_API_KEY) {
    return res.status(500).json({ error: "Erreur — vérifie que PRINTFUL_API_KEY est configurée sur ton serveur relais." });
  }
  try {
    const r = await fetch(`${PRINTFUL_BASE}/products/${req.params.id}`, { headers: authHeaders() });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: "catalog-variant-fetch-failed" });
  }
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

    // Si le paiement est confirmé, on déclenche la commande Printful automatiquement
    if (data && data.status === "SUCCESS") {
      await createPrintfulOrderFromTransaction(data);
    }
  } catch (e) {
    res.status(500).json({ error: "verification-failed" });
  }
});

// Crée une vraie commande Printful (fabrication + expédition) à partir des infos de la transaction Kkiapay
async function createPrintfulOrderFromTransaction(transactionData) {
  try {
    let custom = {};
    try {
      custom = JSON.parse(transactionData.data || "{}");
    } catch (e) {
      custom = {};
    }
    if (!custom.printfulVariantId || !custom.recipient) {
      console.log("Commande auto ignorée — infos produit/adresse manquantes dans la transaction Kkiapay.");
      return;
    }
    const orderPayload = {
      recipient: {
        name: custom.recipient.name,
        address1: custom.recipient.address1,
        city: custom.recipient.city,
        country_code: custom.recipient.country_code || "BJ",
        zip: custom.recipient.zip || "00000",
        phone: custom.recipient.phone || "",
      },
      items: [
        {
          variant_id: custom.printfulVariantId,
          quantity: 1,
          retail_price: custom.retailPrice || "0.00",
        },
      ],
      confirm: true, // true = commande envoyée directement en fabrication chez Printful
    };
    const r = await fetch(`${PRINTFUL_BASE}/orders`, {
      method: "POST",
      headers: storeHeaders(),
      body: JSON.stringify(orderPayload),
    });
    const result = await r.json();
    console.log("Commande Printful créée automatiquement:", r.status, JSON.stringify(result));
  } catch (e) {
    console.log("Erreur création commande Printful automatique:", e.message);
  }
}

app.post("/api/kkiapay/webhook", express.json(), async (req, res) => {
  console.log("Webhook Kkiapay reçu:", req.body);
  try {
    if (req.body && (req.body.status === "SUCCESS" || req.body.event === "transaction.success")) {
      await createPrintfulOrderFromTransaction(req.body);
    }
  } catch (e) {
    console.log("Erreur webhook:", e.message);
  }
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

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY manquante sur le serveur" });
  }

  const systemPrompt = "Tu es un stratège en publicité e-commerce spécialisé en print-on-demand (Printful) qui vend au Bénin/Afrique de l'Ouest et à l'international. Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour, avec la structure exacte demandée.";

  const userPrompt = `Produit à vendre: ${product}
Audience visée: ${audience || "à définir toi-même selon le produit"}

Structure JSON attendue:
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
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(500).json({ error: "groq-api-error", details: data });
    }

    const text = (data.choices?.[0]?.message?.content || "").trim();
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Serveur relais actif sur le port ${port}`));
