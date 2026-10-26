const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const COOKIE = "n10_admin_session";
const SESSION_MS = 8 * 60 * 60 * 1000;

const env = (key) => (process.env[key] || "").trim();

// Catálogo público da vitrine
app.get("/api/products", async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    const configured = env("SUPABASE_URL") &&
      env("SUPABASE_SERVICE_ROLE_KEY");

    if (configured) {
      const data = await supabase(
        "n10_products",
        "select=*&active=eq.true&order=promotion.desc,featured.desc,created_at.desc"
      );

      return res.json(Array.isArray(data) ? data : []);
    }

    const file = path.join(ROOT, "data", "products.json");
    const products = JSON.parse(fs.readFileSync(file, "utf8"));

    return res.json(Array.isArray(products) ? products : []);
  } catch (error) {
    console.error("Erro ao carregar catálogo:", error.message);
    return res.status(500).json({
      error: "Não foi possível carregar o catálogo."
    });
  }
});


function adminEmails() {
  return env("ADMIN_EMAILS").split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

function missingConfig() {
  return [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "ADMIN_EMAILS",
    "SESSION_SECRET"
  ].filter((key) => !env(key));
}

function sign(payload) {
  return crypto
    .createHmac("sha256", env("SESSION_SECRET"))
    .update(payload)
    .digest("base64url");
}

function createToken(email, userId = "", role = "") {
  const payload = Buffer.from(JSON.stringify({
    email: String(email).trim().toLowerCase(),
    userId: String(userId || ""),
    role: String(role || ""),
    expires: Date.now() + SESSION_MS
  })).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

function tokenIsValid(token) {
  if (!token || !env("SESSION_SECRET")) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const expected = Buffer.from(sign(parts[0]));
  const received = Buffer.from(parts[1]);

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) return false;

  try {
    const data = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8")
    );

    return typeof data.email === "string" &&
      data.expires > Date.now() &&
      (
        adminEmails().includes(data.email.toLowerCase()) ||
        (data.role === "admin" && typeof data.userId === "string" && data.userId.length > 0)
      );
  } catch {
    return false;
  }
}

async function getSupabaseAdminUser(userId) {
  let base = env("SUPABASE_URL").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;

  const response = await fetch(
    `${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      headers: {
        apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
        Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`
      }
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return data.user || data;
}

function getCookie(req, name) {
  const cookies = (req.headers.cookie || "").split(";");

  for (const cookie of cookies) {
    const index = cookie.indexOf("=");
    if (index < 0) continue;

    if (cookie.slice(0, index).trim() === name) {
      return decodeURIComponent(cookie.slice(index + 1).trim());
    }
  }

  return "";
}

async function adminOnly(req, res, next) {
  const token = getCookie(req, COOKIE);

  if (!tokenIsValid(token)) {
    return res.status(401).json({
      error: "Sessão inválida. Entre novamente."
    });
  }

  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[0], "base64url").toString("utf8")
    );

    // O administrador principal continua autorizado pela allowlist.
    if (adminEmails().includes(String(payload.email || "").toLowerCase())) {
      return next();
    }

    if (payload.role !== "admin" || !payload.userId) {
      return res.status(403).json({
        error: "Acesso administrativo não autorizado."
      });
    }

    const user = await getSupabaseAdminUser(payload.userId);

    if (
      !user ||
      String(user.email || "").toLowerCase() !== String(payload.email || "").toLowerCase() ||
      user.app_metadata?.role !== "admin"
    ) {
      return res.status(403).json({
        error: "Esta conta não possui permissão administrativa."
      });
    }

    return next();
  } catch (error) {
    console.error("Falha ao validar sessão administrativa:", error.message);
    return res.status(503).json({
      error: "Não foi possível validar a sessão agora."
    });
  }
}

function configured(req, res, next) {
  const missing = missingConfig();

  if (missing.length) {
    return res.status(503).json({
      error: "O administrador precisa configurar as variáveis de ambiente.",
      missing
    });
  }

  next();
}

async function supabase(table, query = "", options = {}) {
  let base = env("SUPABASE_URL").replace(/\/+$/, "");
  if (base && !/^https?:\/\//i.test(base)) {
    base = "https://" + base;
  }
  const url = `${base}/rest/v1/${table}${query ? "?" + query : ""}`;

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body === undefined
      ? undefined
      : JSON.stringify(options.body)
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    console.error("Supabase:", response.status, data);
    throw new Error(
      data && data.message
        ? data.message
        : "Erro ao acessar o banco de dados."
    );
  }

  return data;
}

app.get("/api/admin/status", (req, res) => {
  res.json({
    configured: missingConfig().length === 0,
    authenticated: tokenIsValid(getCookie(req, COOKIE))
  });
});

app.post("/api/admin/login", configured, async (req, res) => {
  const login = String(req.body?.username || req.body?.email || "").trim();
  const password = String(req.body?.password || "");

  if (!login || !password) {
    return res.status(401).json({ error: "Usuário ou senha incorretos." });
  }

  try {
    let base = env("SUPABASE_URL").replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(base)) base = "https://" + base;

    let email = login.toLowerCase();
    let userId = "";
    let role = "";

    if (!adminEmails().includes(email)) {
      if (!/^[A-Za-z0-9_]{3,30}$/.test(login)) {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }

      const rows = await supabase(
        "n10_admin_usernames",
        "select=user_id,username&username=eq." + encodeURIComponent(login) + "&limit=1"
      );

      if (!Array.isArray(rows) || rows.length !== 1) {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }

      userId = String(rows[0].user_id || "");
      const adminUser = await getSupabaseAdminUser(userId);

      if (!adminUser || adminUser.app_metadata?.role !== "admin") {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }

      email = String(adminUser.email || "").trim().toLowerCase();
      role = "admin";
    }

    const response = await fetch(
      `${base}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: env("SUPABASE_ANON_KEY"),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      }
    );

    const result = await response.json().catch(() => ({}));
    const verifiedEmail = String(result?.user?.email || "").trim().toLowerCase();
    const verifiedId = String(result?.user?.id || "");

    const loginChecks = {
      supabaseStatus: response.status,
      hasAccessToken: Boolean(result?.access_token),
      emailMatches: verifiedEmail === email,
      userIdMatches: !userId || verifiedId === userId,
      emailAuthorized: Boolean(userId) || adminEmails().includes(verifiedEmail)
    };
    console.log("[LOGIN DEBUG]", JSON.stringify(loginChecks));

    if (
      !response.ok ||
      !result?.access_token ||
      verifiedEmail !== email ||
      (userId && verifiedId !== userId) ||
      (!userId && !adminEmails().includes(verifiedEmail))
    ) {
      return res.status(401).json({ error: "Usuário ou senha incorretos." });
    }

    const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${encodeURIComponent(createToken(verifiedEmail, userId || verifiedId, role))}; HttpOnly${secureCookie}; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error("Falha na autenticação administrativa:", error.message);
    return res.status(502).json({
      error: "Não foi possível validar o acesso agora. Tente novamente."
    });
  }
});

app.get("/api/admin/users", configured, adminOnly, async (req, res) => {
  try {
    const users = await supabase(
      "n10_admin_usernames",
      "select=id,username,display_name,created_at&order=created_at.desc"
    );
    res.json({ users: Array.isArray(users) ? users : [] });
  } catch (error) {
    console.error("Falha ao listar administradores:", error.message);
    res.status(500).json({ error: "Não foi possível listar administradores." });
  }
});

app.post("/api/admin/users", configured, adminOnly, async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const displayName = String(req.body?.display_name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!/^[A-Za-z0-9_]{3,30}$/.test(username))
    return res.status(400).json({ error: "Usuário: use 3 a 30 letras, números ou _." });
  if (displayName.length < 2 || displayName.length > 80)
    return res.status(400).json({ error: "Informe um nome entre 2 e 80 caracteres." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "Informe um e-mail válido." });
  if (password.length < 8 || password.length > 72)
    return res.status(400).json({ error: "A senha deve ter entre 8 e 72 caracteres." });

  let base = env("SUPABASE_URL").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  let userId = "";

  try {
    const duplicate = await supabase(
      "n10_admin_usernames",
      "select=id&username=eq." + encodeURIComponent(username) + "&limit=1"
    );
    if (Array.isArray(duplicate) && duplicate.length)
      return res.status(409).json({ error: "Esse usuário já existe." });

    const response = await fetch(`${base}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
        Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: displayName },
        app_metadata: { role: "admin" }
      })
    });

    const data = await response.json().catch(() => ({}));
    const user = data.user || data;
    userId = String(user.id || "");

    if (!response.ok || !userId) {
      const msg = String(data.msg || data.message || data.error_description || "");
      if (response.status === 422 || /already|registered|exists/i.test(msg))
        return res.status(409).json({ error: "Esse e-mail já está cadastrado." });
      console.error("Supabase criação de administrador:", response.status, msg);
      return res.status(502).json({ error: "O Supabase não conseguiu criar a conta." });
    }

    try {
      await supabase("n10_admin_usernames", "", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: { user_id: userId, username, display_name: displayName }
      });
    } catch (error) {
      await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: {
          apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
          Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`
        }
      }).catch(() => {});
      if (/duplicate|unique|already exists/i.test(error.message))
        return res.status(409).json({ error: "Usuário ou e-mail já cadastrado." });
      throw error;
    }

    res.status(201).json({ ok: true, user: { username, display_name: displayName } });
  } catch (error) {
    console.error("Falha ao cadastrar administrador:", error.message);
    res.status(500).json({ error: "Não foi possível cadastrar o administrador." });
  }
});

app.post("/api/admin/logout", (req, res) => {
  const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; HttpOnly${secureCookie}; SameSite=Lax; Path=/; Max-Age=0`
  );

  res.json({ ok: true });
});

/* PRODUTOS */


/* UPLOAD PRIVADO AO PAINEL ADMINISTRATIVO */
app.post("/api/admin/upload-image", configured, adminOnly, async (req, res) => {
  try {
    const { filename, contentType, data } = req.body || {};
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
    if (!allowed.has(contentType) || typeof data !== "string" || !data) {
      return res.status(400).json({ error: "Arquivo de imagem inválido." });
    }
    const bytes = Buffer.from(data, "base64");
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "A imagem deve ter até 5 MB." });
    }
    const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" })[contentType];
    const safeName = String(filename || "imagem").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const objectPath = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeName.replace(/\.[^.]*$/, "")}.${ext}`;
    const base = env("SUPABASE_URL").replace(/\/+$/, "");
    const response = await fetch(`${base}/storage/v1/object/n10-product-images/${objectPath}`, {
      method: "POST",
      headers: {
        apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
        Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": contentType,
        "x-upsert": "false"
      },
      body: bytes
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Falha no upload Supabase Storage:", response.status, detail);
      return res.status(502).json({ error: "O Supabase recusou o upload. Confira o bucket e as configurações." });
    }
    res.json({ image: `${base}/storage/v1/object/public/n10-product-images/${objectPath}` });
  } catch (error) {
    console.error("Erro no upload de imagem:", error);
    res.status(500).json({ error: "Não foi possível enviar a imagem." });
  }
});

app.get("/api/admin/products", configured, adminOnly, async (req, res) => {
  try {
    const data = await supabase(
      "n10_products",
      "select=*&order=created_at.desc"
    );

    res.set("Cache-Control", "no-store").json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/products", configured, adminOnly, async (req, res) => {
  try {
    const p = req.body || {};

    if (!String(p.id || "").trim() || !String(p.name || "").trim()) {
      return res.status(400).json({
        error: "O ID e o nome do produto são obrigatórios."
      });
    }

    const price = p.price === "" || p.price == null ? null : Number(p.price);
    const originalPrice = p.original_price === "" ||
      p.original_price == null ? null : Number(p.original_price);
    const stock = Number(p.stock ?? 0);

    if (
      (price !== null && (!Number.isFinite(price) || price < 0)) ||
      (originalPrice !== null &&
        (!Number.isFinite(originalPrice) || originalPrice < 0)) ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      return res.status(400).json({
        error: "Confira os preços e a quantidade em estoque."
      });
    }

    const product = {
      id: String(p.id).trim(),
      name: String(p.name).trim(),
      category: String(p.category || "Roupas"),
      brand: String(p.brand || "").trim().slice(0, 100),
      price,
      original_price: originalPrice,
      promotion: Boolean(p.promotion),
      description: String(p.description || ""),
      image: String(p.image || ""),
      images: Array.isArray(p.images) ? p.images : [],
      sizes: Array.isArray(p.sizes) ? p.sizes : [],
      stock,
      featured: Boolean(p.featured),
      active: p.active !== false,
      updated_at: new Date().toISOString()
    };

    const data = await supabase(
      "n10_products",
      "on_conflict=id",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation"
        },
        body: product
      }
    );

    res.json(data?.[0] || product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete(
  "/api/admin/products/:id",
  configured,
  adminOnly,
  async (req, res) => {
    try {
      await supabase(
        "n10_products",
        `id=eq.${encodeURIComponent(req.params.id)}`,
        { method: "DELETE" }
      );

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/* VENDAS */

app.get("/api/admin/sales", configured, adminOnly, async (req, res) => {
  try {
    const data = await supabase(
      "n10_sales",
      "select=*&order=created_at.desc&limit=500"
    );

    res.set("Cache-Control", "no-store").json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/sales", configured, adminOnly, async (req, res) => {
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const total = Number(body.total);

    if (
      !items.length ||
      !Number.isFinite(total) ||
      total < 0 ||
      items.some((item) =>
        !item.id ||
        !Number.isInteger(Number(item.qty)) ||
        Number(item.qty) < 1 ||
        !Number.isFinite(Number(item.price)) ||
        Number(item.price) < 0
      )
    ) {
      return res.status(400).json({
        error: "Confira os itens, quantidades, preços e total."
      });
    }

    const products = await supabase(
      "n10_products",
      "select=id,name,stock"
    );

    const byId = new Map((products || []).map((p) => [p.id, p]));
    const required = new Map();

    for (const item of items) {
      const product = byId.get(String(item.id));

      if (!product) {
        return res.status(400).json({
          error: `Produto não encontrado: ${item.id}`
        });
      }

      const qty = Number(item.qty);
      required.set(
        product.id,
        (required.get(product.id) || 0) + qty
      );
    }

    for (const [id, qty] of required) {
      if (Number(byId.get(id).stock || 0) < qty) {
        return res.status(409).json({
          error: `Estoque insuficiente para ${byId.get(id).name}.`
        });
      }
    }

    const saleItems = items.map((item) => ({
      id: String(item.id),
      name: String(item.name || byId.get(String(item.id)).name),
      size: String(item.size || ""),
      qty: Number(item.qty),
      price: Number(item.price)
    }));

    const sale = {
      customer: String(body.customer || ""),
      payment_method: String(body.payment_method || "Outro"),
      items: saleItems,
      total,
      notes: String(body.notes || "")
    };

    const saved = await supabase("n10_sales", "select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: sale
    });

    /*
     * Nota: esta versão salva a venda e depois atualiza o estoque.
     * Para atomicidade completa, use uma função RPC/transação no Supabase.
     */
    try {
      for (const [id, qty] of required) {
        const product = byId.get(id);

        await supabase(
          "n10_products",
          `id=eq.${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: {
              stock: Number(product.stock || 0) - qty,
              updated_at: new Date().toISOString()
            }
          }
        );
      }
    } catch (stockError) {
      console.error("Venda salva, mas houve falha no estoque:", stockError);
      return res.status(500).json({
        error: "A venda foi salva, mas houve falha ao atualizar o estoque. Confira o histórico antes de tentar novamente."
      });
    }

    res.status(201).json(saved?.[0] || sale);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* DASHBOARD */

app.get("/api/admin/summary", configured, adminOnly, async (req, res) => {
  try {
    const [sales, products] = await Promise.all([
      supabase(
        "n10_sales",
        "select=id,total,items,created_at&order=created_at.desc&limit=5000"
      ),
      supabase("n10_products", "select=id,name,stock,active")
    ]);

    const all = sales || [];
    const now = new Date();
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const current = all.filter((s) => new Date(s.created_at) >= currentStart);
    const previous = all.filter((s) => {
      const date = new Date(s.created_at);
      return date >= previousStart && date < currentStart;
    });

    const sum = (list) => list.reduce((acc, s) => acc + Number(s.total || 0), 0);
    const popular = {};

    for (const sale of all) {
      for (const item of (sale.items || [])) {
        const id = String(item.id || item.name || "Produto");

        if (!popular[id]) {
          popular[id] = {
            id,
            name: item.name || id,
            qty: 0
          };
        }

        popular[id].qty += Number(item.qty || 1);
      }
    }

    res.set("Cache-Control", "no-store").json({
      revenue: sum(all),
      salesCount: all.length,
      monthRevenue: sum(current),
      monthSales: current.length,
      previousMonthRevenue: sum(previous),
      previousMonthSales: previous.length,
      lowStock: (products || []).filter(
        (p) => p.active && Number(p.stock) <= 3
      ).length,
      productCount: (products || []).length,
      bestSellers: Object.values(popular)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


/* NT10STORE: CATALOGS AND ANALYTICS */

// Registra uma visita sem confiar em dados enviados pelo navegador.
app.post("/api/events", async (req, res) => {
  try {
    const type = String(req.body?.event_type || "page_view");
    const allowed = new Set(["page_view", "product_view", "catalog_view"]);
    if (!allowed.has(type)) {
      return res.status(400).json({ error: "Evento inválido." });
    }

    const cleanId = (value, max = 100) =>
      typeof value === "string" ? value.trim().slice(0, max) : null;

    const event = {
      event_type: type,
      product_id: cleanId(req.body?.product_id),
      visitor_id: cleanId(req.body?.visitor_id, 100),
      session_id: cleanId(req.body?.session_id, 100),
      page_path: cleanId(req.body?.page_path, 300)
    };

    await supabase("n10_events", "", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: event
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("Erro ao registrar evento:", error.message);
    res.status(500).json({ error: "Não foi possível registrar a visita." });
  }
});

// Catálogos ativos exibidos na loja.
app.get("/api/catalogs", async (req, res) => {
  try {
    const rows = await supabase(
      "n10_catalogs",
      "select=id,name,slug,description,active,sort_order&active=eq.true&order=sort_order.asc,name.asc"
    );
    res.set("Cache-Control", "no-store").json(rows || []);
  } catch (error) {
    console.error("Erro ao carregar catálogos:", error.message);
    res.status(500).json({ error: "Não foi possível carregar os catálogos." });
  }
});

// Criação/edição de catálogos, apenas para administrador autenticado.
app.get("/api/admin/catalogs", configured, adminOnly, async (req, res) => {
  try {
    const rows = await supabase(
      "n10_catalogs",
      "select=*&order=sort_order.asc,name.asc"
    );
    res.set("Cache-Control", "no-store").json(rows || []);
  } catch (error) {
    res.status(500).json({ error: "Não foi possível carregar os catálogos." });
  }
});

app.post("/api/admin/catalogs", configured, adminOnly, async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim().slice(0, 100);
    const slug = String(body.slug || name)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "").slice(0, 100);
    const id = String(body.id || slug).trim().slice(0, 100);

    if (!name || !slug || !id) {
      return res.status(400).json({ error: "Informe o nome do catálogo." });
    }

    const row = {
      id,
      name,
      slug,
      description: String(body.description || "").trim().slice(0, 500),
      active: body.active !== false,
      sort_order: Number.isInteger(Number(body.sort_order))
        ? Number(body.sort_order) : 0,
      updated_at: new Date().toISOString()
    };

    const saved = await supabase("n10_catalogs", "on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: row
    });

    res.json(saved?.[0] || row);
  } catch (error) {
    console.error("Erro ao salvar catálogo:", error.message);
    res.status(500).json({ error: "Não foi possível salvar o catálogo." });
  }
});

app.delete(
  "/api/admin/catalogs/:id",
  configured,
  adminOnly,
  async (req, res) => {
    try {
      const id = encodeURIComponent(req.params.id);
      await supabase("n10_product_catalogs", `catalog_id=eq.${id}`, {
        method: "DELETE"
      });
      await supabase("n10_catalogs", `id=eq.${id}`, {
        method: "DELETE"
      });
      res.json({ ok: true });
    } catch (error) {
      console.error("Erro ao excluir catálogo:", error.message);
      res.status(500).json({ error: "Não foi possível excluir o catálogo." });
    }
  }
);


// Marcas da NT10STORE.
app.get("/api/brands", async (req, res) => {
  try {
    const rows = await supabase(
      "n10_brands",
      "select=id,name,active,sort_order&active=eq.true&order=sort_order.asc,name.asc"
    );
    res.set("Cache-Control", "no-store").json(rows || []);
  } catch (error) {
    console.error("Erro ao carregar marcas:", error.message);
    res.status(500).json({ error: "Não foi possível carregar as marcas." });
  }
});

app.get("/api/admin/brands", configured, adminOnly, async (req, res) => {
  try {
    const rows = await supabase(
      "n10_brands",
      "select=*&order=sort_order.asc,name.asc"
    );
    res.set("Cache-Control", "no-store").json(rows || []);
  } catch (error) {
    res.status(500).json({ error: "Não foi possível carregar as marcas." });
  }
});

app.post("/api/admin/brands", configured, adminOnly, async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim().slice(0, 100);
    const id = String(body.id || name.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")).trim().slice(0, 100);

    if (!name || !id) {
      return res.status(400).json({ error: "Informe o nome da marca." });
    }

    const row = {
      id,
      name,
      active: body.active !== false,
      sort_order: Number.isInteger(Number(body.sort_order))
        ? Number(body.sort_order) : 0
    };

    const saved = await supabase("n10_brands", "on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: row
    });

    res.json(saved?.[0] || row);
  } catch (error) {
    console.error("Erro ao salvar marca:", error.message);
    res.status(500).json({
      error: "Não foi possível salvar a marca. Verifique se ela já existe."
    });
  }
});

app.delete("/api/admin/brands/:id", configured, adminOnly, async (req, res) => {
  try {
    const id = encodeURIComponent(req.params.id);
    await supabase("n10_brands", `id=eq.${id}`, { method: "DELETE" });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Não foi possível excluir a marca." });
  }
});

// Visão geral baseada apenas nos eventos realmente registrados.
app.get("/api/admin/analytics", configured, adminOnly, async (req, res) => {
  try {
    const rows = await supabase(
      "n10_events",
      "select=id,event_type,product_id,created_at,visitor_id,session_id,page_path&order=created_at.desc&limit=5000"
    );
    const events = Array.isArray(rows) ? rows : [];
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const uniqueVisitors = new Set(events.map(e => e.visitor_id).filter(Boolean));
    const uniqueSessions = new Set(events.map(e => e.session_id).filter(Boolean));

    res.set("Cache-Control", "no-store").json({
      totalViews: events.filter(e => e.event_type === "page_view").length,
      productViews: events.filter(e => e.event_type === "product_view").length,
      catalogViews: events.filter(e => e.event_type === "catalog_view").length,
      uniqueVisitors: uniqueVisitors.size,
      uniqueSessions: uniqueSessions.size,
      todayViews: events.filter(e =>
        e.event_type === "page_view" && new Date(e.created_at) >= startToday
      ).length,
      monthViews: events.filter(e =>
        e.event_type === "page_view" && new Date(e.created_at) >= startMonth
      ).length,
      recent: events.slice(0, 20).map(e => ({
        event_type: e.event_type,
        product_id: e.product_id,
        page_path: e.page_path,
        created_at: e.created_at
      }))
    });
  } catch (error) {
    console.error("Erro nas estatísticas:", error.message);
    res.status(500).json({ error: "Não foi possível carregar as estatísticas." });
  }
});


app.get("/admin.html", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC, "admin.html"));
});

app.get("/admin", (req, res) => {
  res.redirect(302, "/admin.html");
});

app.get("/admin/", (req, res) => {
  res.redirect(302, "/admin.html");
});

app.get("/admin/painel", (req, res) => {
  if (!tokenIsValid(getCookie(req, COOKIE))) {
    return res.redirect(302, "/admin");
  }
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC, "admin", "index.html"));
});

app.use(express.static(PUBLIC));

module.exports = app;
