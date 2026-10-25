const express = require("express");

const app = express();
app.disable("x-powered-by");

app.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");

  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!base || !key) {
    return res.status(503).json({
      error: "A configuração do Supabase está incompleta."
    });
  }

  try {
    const url = new URL(`${base}/rest/v1/n10_products`);
    url.searchParams.set("select", "*");
    url.searchParams.set("active", "eq.true");
    url.searchParams.set("order", "created_at.desc");

    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });

    if (!response.ok) {
      console.error("Erro ao buscar catálogo:", response.status);
      return res.status(502).json({
        error: "Não foi possível carregar o catálogo."
      });
    }

    const products = await response.json();

    res.json(products.map((p) => ({
      ...p,
      images: Array.isArray(p.images) ? p.images : [],
      sizes: Array.isArray(p.sizes) ? p.sizes : []
    })));
  } catch (error) {
    console.error("Erro no catálogo:", error.message);
    res.status(500).json({
      error: "Erro interno ao carregar os produtos."
    });
  }
});

module.exports = app;
