const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const PRODUCTS_FILE = path.join(ROOT, "data", "products.json");

app.disable("x-powered-by");
app.use(express.json({ limit: "30kb" }));

app.get("/api/products", (req, res) => {
  try {
    const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8"));
    res.set("Cache-Control", "no-store");
    res.json(Array.isArray(products) ? products : []);
  } catch (error) {
    console.error("Erro ao carregar catálogo:", error.message);
    res.status(500).json({ error: "Não foi possível carregar os produtos." });
  }
});

app.use(express.static(PUBLIC, {
  extensions: ["html"],
  maxAge: "1h"
}));

app.get("*path", (req, res) => {
  res.sendFile(path.join(PUBLIC, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`N10STORE disponível em http://127.0.0.1:${PORT}`);
});
