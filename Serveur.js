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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
