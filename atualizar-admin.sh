#!/data/data/com.termux/files/usr/bin/bash
set -eu

cd ~/n10store

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/admin-completo-$STAMP"
mkdir -p "$BACKUP"

cp api/index.js "$BACKUP/index.js"
cp public/admin.html "$BACKUP/admin.html"

echo "Backup salvo em: $BACKUP"

cat > "$BACKUP/patch.py" <<'PY'
from pathlib import Path
import sys

root = Path.home() / "n10store"
api = root / "api/index.js"
html = root / "public/admin.html"

a = api.read_text()
h = html.read_text()

def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        sys.exit(f"ERRO: esperado 1 trecho para {label}, encontrado {count}. Originais preservados.")
    return source.replace(old, new, 1)

# Sessão assinada com identidade administrativa.
a = replace_once(
    a,
    '''function createToken(email) {
  const payload = Buffer.from(JSON.stringify({
    email: String(email).trim().toLowerCase(),
    expires: Date.now() + SESSION_MS
  })).toString("base64url");''',
    '''function createToken(email, userId = "", role = "") {
  const payload = Buffer.from(JSON.stringify({
    email: String(email).trim().toLowerCase(),
    userId: String(userId || ""),
    role: String(role || ""),
    expires: Date.now() + SESSION_MS
  })).toString("base64url");''',
    "createToken"
)

a = replace_once(
    a,
    '''    return typeof data.email === "string" &&
      adminEmails().includes(data.email.toLowerCase()) &&
      data.expires > Date.now();''',
    '''    return typeof data.email === "string" &&
      data.expires > Date.now() &&
      (
        adminEmails().includes(data.email.toLowerCase()) ||
        (data.role === "admin" && typeof data.userId === "string" && data.userId.length > 0)
      );''',
    "tokenIsValid"
)

# Função auxiliar para buscar usuários autenticados no Supabase.
marker = '''function getCookie(req, name) {'''
helper = '''async function getSupabaseAdminUser(userId) {
  let base = env("SUPABASE_URL").replace(/\\\\/+$/, "");
  if (!/^https?:\\\\/\\\\//i.test(base)) base = "https://" + base;

  const response = await fetch(
    `${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      headers: {
        apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
        Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`
      }
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return result.user || result;
}

'''
a = replace_once(a, marker, helper + marker, "helper de usuário")

# A autorização verifica a conta no servidor para evitar confiar apenas no cookie.
a = replace_once(
    a,
    '''function adminOnly(req, res, next) {
  if (!tokenIsValid(getCookie(req, COOKIE))) {
    return res.status(401).json({ error: "Sessão inválida. Entre novamente." });
  }

  next();
}''',
    '''async function adminOnly(req, res, next) {
  const token = getCookie(req, COOKIE);
  if (!tokenIsValid(token)) {
    return res.status(401).json({ error: "Sessão inválida. Entre novamente." });
  }

  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[0], "base64url").toString("utf8")
    );

    // O administrador original continua autorizado pela allowlist.
    if (adminEmails().includes(String(payload.email || "").toLowerCase())) {
      return next();
    }

    if (payload.role !== "admin" || !payload.userId) {
      return res.status(403).json({ error: "Acesso administrativo não autorizado." });
    }

    const user = await getSupabaseAdminUser(payload.userId);
    if (
      !user ||
      String(user.email || "").toLowerCase() !== String(payload.email || "").toLowerCase() ||
      user.app_metadata?.role !== "admin"
    ) {
      return res.status(403).json({ error: "Esta conta não possui permissão administrativa." });
    }

    next();
  } catch (error) {
    console.error("Falha ao validar sessão:", error.message);
    return res.status(503).json({ error: "Não foi possível validar a sessão agora." });
  }
}''',
    "adminOnly"
)

# Login aceita e-mail autorizado ou username cadastrado.
start = 'app.post("/api/admin/login", configured, async (req, res) => {'
end = '\\napp.post("/api/admin/logout", (req, res) => {'
i = a.find(start)
j = a.find(end, i)
if i < 0 or j < 0:
    sys.exit("ERRO: endpoint de login não encontrado; originais preservados.")

login = r'''app.post("/api/admin/login", configured, async (req, res) => {
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
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(login)) {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }

      const rows = await supabase(
        "n10_admin_usernames",
        "select=user_id,username&username=eq." + encodeURIComponent(login) + "&limit=1"
      );

      if (!Array.isArray(rows) || !rows.length) {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }

      userId = String(rows[0].user_id || "");
      const user = await getSupabaseAdminUser(userId);

      if (!user || user.app_metadata?.role !== "admin") {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }

      email = String(user.email || "").trim().toLowerCase();
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

// N10_ADMIN_USERS_PATCH_V2
app.get("/api/admin/users", configured, adminOnly, async (req, res) => {
  try {
    const rows = await supabase(
      "n10_admin_usernames",
      "select=id,username,display_name,user_id,created_at&order=created_at.desc"
    );
    return res.json({ users: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    console.error("Falha ao listar administradores:", error.message);
    return res.status(500).json({ error: "Não foi possível listar administradores." });
  }
});

app.post("/api/admin/users", configured, adminOnly, async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const displayName = String(req.body?.display_name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!/^[A-Za-z0-9_]{3,30}$/.test(username))
    return res.status(400).json({ error: "O usuário deve ter 3 a 30 caracteres: letras, números ou _." });
  if (displayName.length < 2 || displayName.length > 80)
    return res.status(400).json({ error: "Informe um nome de 2 a 80 caracteres." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "Informe um e-mail válido." });
  if (password.length < 8 || password.length > 72)
    return res.status(400).json({ error: "A senha deve ter entre 8 e 72 caracteres." });

  let base = env("SUPABASE_URL").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;

  let userId = "";
  try {
    const existing = await supabase(
      "n10_admin_usernames",
      "select=id&username=eq." + encodeURIComponent(username) + "&limit=1"
    );
    if (Array.isArray(existing) && existing.length)
      return res.status(409).json({ error: "Esse nome de usuário já está em uso." });

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

    const result = await response.json().catch(() => ({}));
    const user = result.user || result;
    userId = String(user.id || "");

    if (!response.ok || !userId) {
      const message = String(result.msg || result.message || result.error_description || "");
      if (response.status === 422 || /already|registered|exists/i.test(message))
        return res.status(409).json({ error: "Esse e-mail já possui uma conta." });
      console.error("Falha ao criar conta administrativa:", response.status, message);
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
        return res.status(409).json({ error: "Esse usuário ou e-mail já está cadastrado." });
      throw error;
    }

    return res.status(201).json({
      ok: true,
      user: { username, display_name: displayName, email }
    });
  } catch (error) {
    console.error("Falha ao cadastrar administrador:", error.message);
    return res.status(500).json({ error: "Não foi possível cadastrar o administrador." });
  }
});
'''
a = a[:i] + login + a[j:]

# Login HTML.
h = replace_once(
    h,
    '<label>E-mail<input id="username" name="username" type="email" autocomplete="username" required placeholder="Digite seu e-mail"></label>',
    '<label>Usuário ou e-mail<input id="username" name="username" type="text" autocomplete="username" required placeholder="Digite seu usuário ou e-mail"></label>',
    "campo de login"
)

old_users = '''    <section class="page" id="page-users">
      <div class="eyebrow">ACESSOS</div>
      <h1>Usuários </h1>
      <p class="subtitle">Informações da sessão administrativa e do acesso à loja.</p>
      <div class="card">
        <div class="row"><div class="avatar">N</div><div><strong>Administrador NT10STORE</strong><div class="muted small">Sessão autenticada pela API</div></div><span class="pill" style="margin-left:auto">Sessão ativa</span></div>
        <div class="note" style="margin-top:18px">A listagem e o gerenciamento de contas de clientes exigem uma API específica de usuários. Esta página não inventa uma lista nem expõe senhas ou chaves secretas.</div>
        <button class="ghost" id="refreshSession" style="margin-top:15px">Verificar sessão</button>
      </div>
    </section>'''
new_users = '''    <!-- N10_ADMIN_USERS_PATCH_V2 -->
    <section class="page" id="page-users">
      <div class="eyebrow">ACESSOS</div>
      <h1>Administradores</h1>
      <p class="subtitle">Crie contas autorizadas para gerenciar a NT10STORE.</p>
      <div class="card" style="margin-bottom:18px">
        <h2 style="margin-top:0">Adicionar administrador</h2>
        <form id="adminUserForm" class="form-grid">
          <label>Nome completo<input id="adminDisplayName" required minlength="2" maxlength="80" placeholder="Nome do administrador"></label>
          <label>Nome de usuário<input id="adminUsername" required minlength="3" maxlength="30" pattern="[A-Za-z0-9_]{3,30}" placeholder="ex: joao_silva"></label>
          <label>E-mail<input id="adminEmail" required type="email" autocomplete="email" placeholder="usuario@exemplo.com"></label>
          <label>Senha inicial<input id="adminPassword" required type="password" minlength="8" maxlength="72" autocomplete="new-password" placeholder="Mínimo de 8 caracteres"></label>
          <div class="span-2"><button class="primary" id="createAdminButton" type="submit">＋ Criar administrador</button><p id="adminUserError" class="small" style="color:var(--red)"></p></div>
        </form>
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:center;gap:12px">
          <div><h2 style="margin:0">Contas administrativas</h2><p class="muted small">Senhas nunca são exibidas.</p></div>
          <button class="ghost" id="refreshAdminUsers" type="button">Atualizar lista</button>
        </div>
        <div id="adminUsersList" style="margin-top:16px"><div class="empty">Carregando administradores…</div></div>
        <button class="ghost" id="refreshSession" style="margin-top:15px" type="button">Verificar sessão</button>
      </div>
    </section>'''
h = replace_once(h, old_users, new_users, "aba Usuários")

h = replace_once(
    h,
    '  if(page==="categories")loadCategories();',
    '  if(page==="categories")loadCategories();\n  if(page==="users")loadAdminUsers();',
    "carregamento da aba Usuários"
)

anchor = '$("refreshSession").onclick=async()=>{if(await checkSession())toast("Sessão administrativa ativa.")};'
handlers = r'''
async function loadAdminUsers(){
  const box=$("adminUsersList");
  if(!box)return;
  box.innerHTML='<div class="empty">Carregando administradores…</div>';
  try{
    const data=await api("/api/admin/users");
    const users=Array.isArray(data.users)?data.users:[];
    if(!users.length){
      box.innerHTML='<div class="empty">Nenhum administrador adicional cadastrado ainda.</div>';
      return;
    }
    box.innerHTML=users.map(u=>`
      <div class="row" style="padding:14px 0;border-bottom:1px solid var(--line);gap:12px">
        <div class="avatar">${esc((u.display_name||u.username||"A").slice(0,1).toUpperCase())}</div>
        <div style="min-width:0;flex:1">
          <strong>${esc(u.display_name||u.username)}</strong>
          <div class="muted small">@${esc(u.username)}</div>
        </div>
        <span class="pill">Administrador</span>
      </div>`).join("");
  }catch(error){
    box.innerHTML=`<div class="empty">${esc(error.message||"Falha ao carregar administradores.")}</div>`;
  }
}

$("adminUserForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const button=$("createAdminButton");
  const errorBox=$("adminUserError");
  button.disabled=true;
  errorBox.textContent="";
  try{
    await api("/api/admin/users",{
      method:"POST",
      body:JSON.stringify({
        display_name:$("adminDisplayName").value.trim(),
        username:$("adminUsername").value.trim(),
        email:$("adminEmail").value.trim(),
        password:$("adminPassword").value
      })
    });
    $("adminUserForm").reset();
    toast("Administrador criado com sucesso.");
    await loadAdminUsers();
  }catch(error){
    errorBox.textContent=error.message||"Não foi possível criar a conta.";
  }finally{
    button.disabled=false;
  }
});
$("refreshAdminUsers").onclick=loadAdminUsers;
'''
h = replace_once(h, anchor, handlers + "\n" + anchor, "eventos do formulário")

# Não gravar até todas as substituições serem verificadas.
api.write_text(a)
html.write_text(h)
print("Patch preparado e gravado.")
PY

python "$BACKUP/patch.py"

echo "===== VALIDANDO SINTAXE ====="
node --check api/index.js
if [ -f public/admin.html ]; then
  grep -q "N10_ADMIN_USERS_PATCH_V2" public/admin.html
fi

echo "Atualização aplicada."
echo "Backup para reversão: $BACKUP"
