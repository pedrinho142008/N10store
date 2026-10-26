from pathlib import Path
from datetime import datetime
import shutil
import sys

root = Path.home() / "n10store"
api_path = root / "api/index.js"
html_path = root / "public/admin.html"

api = api_path.read_text()
html = html_path.read_text()

def once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        sys.exit(f"ERRO em {label}: encontrei {n} ocorrências. Nenhum arquivo foi alterado.")
    return text.replace(old, new, 1)

# Confirmar os pontos de inserção antes de alterar qualquer arquivo.
required = [
    'function createToken(email) {',
    'function tokenIsValid(token) {',
    'function adminOnly(req, res, next) {',
    'app.post("/api/admin/login", configured, async (req, res) => {',
    'app.post("/api/admin/logout", (req, res) => {',
    '<section class="page" id="page-users">'
]
for marker in required:
    if marker not in api + html:
        sys.exit(f"ERRO: marcador ausente: {marker}")

# 1. Sessão assinada passa a carregar userId e role.
api = once(api, '''function createToken(email) {
  const payload = Buffer.from(JSON.stringify({
    email: String(email).trim().toLowerCase(),
    expires: Date.now() + SESSION_MS
  })).toString("base64url");''', '''function createToken(email, userId = "", role = "") {
  const payload = Buffer.from(JSON.stringify({
    email: String(email).trim().toLowerCase(),
    userId: String(userId || ""),
    role: String(role || ""),
    expires: Date.now() + SESSION_MS
  })).toString("base64url");''', "createToken")

api = once(api, '''    return typeof data.email === "string" &&
      adminEmails().includes(data.email.toLowerCase()) &&
      data.expires > Date.now();''', '''    return typeof data.email === "string" &&
      data.expires > Date.now() &&
      (
        adminEmails().includes(data.email.toLowerCase()) ||
        (data.role === "admin" && typeof data.userId === "string" && data.userId.length > 0)
      );''', "tokenIsValid")

# 2. Consultas autenticadas à API de administração do Supabase.
marker = "function getCookie(req, name) {"
helper = r'''async function getSupabaseAdminUser(userId) {
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

'''
api = once(api, marker, helper + marker, "helper Supabase")

# 3. Autenticação: administrador original ou usuário mapeado no banco.
login_start = 'app.post("/api/admin/login", configured, async (req, res) => {'
login_end = 'app.post("/api/admin/logout", (req, res) => {'
i = api.find(login_start)
j = api.find(login_end, i)
if i < 0 or j < 0:
    sys.exit("ERRO: não encontrei os limites do login. Arquivos não foram alterados.")

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

'''
api = api[:i] + login + api[j:]

# 4. Campo de login aceita username ou e-mail.
html = once(
    html,
    '<label>E-mail<input id="username" name="username" type="email" autocomplete="username" required placeholder="Digite seu e-mail"></label>',
    '<label>Usuário ou e-mail<input id="username" name="username" type="text" autocomplete="username" required placeholder="Digite seu usuário ou e-mail"></label>',
    "campo login HTML"
)

# 5. Criar interface de administração dentro da seção existente.
users_start = '<section class="page" id="page-users">'
users_end = '</section>'
i = html.find(users_start)
j = html.find(users_end, i)
if i < 0 or j < 0:
    sys.exit("ERRO: seção page-users não encontrada.")

old_section = html[i:j + len(users_end)]
new_section = '''<section class="page" id="page-users">
      <div class="eyebrow">ACESSOS</div>
      <h1>Administradores</h1>
      <p class="subtitle">Gerencie quem pode acessar o painel da NT10STORE.</p>
      <div class="card" style="margin-bottom:18px">
        <h2 style="margin-top:0">Adicionar administrador</h2>
        <form id="adminUserForm" class="form-grid">
          <label>Nome completo<input id="adminDisplayName" required minlength="2" maxlength="80" placeholder="Nome do administrador"></label>
          <label>Nome de usuário<input id="adminUsername" required minlength="3" maxlength="30" pattern="[A-Za-z0-9_]{3,30}" placeholder="ex: joao_silva"></label>
          <label>E-mail<input id="adminEmail" required type="email" autocomplete="email" placeholder="usuario@exemplo.com"></label>
          <label>Senha inicial<input id="adminPassword" required type="password" minlength="8" maxlength="72" autocomplete="new-password" placeholder="Mínimo de 8 caracteres"></label>
          <div><button class="primary" id="createAdminButton" type="submit">Criar administrador</button><p id="adminUserError" class="small" style="color:var(--red)"></p></div>
        </form>
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div><h2 style="margin:0">Contas administrativas</h2><p class="muted small">As senhas não são exibidas.</p></div>
          <button class="ghost" id="refreshAdminUsers" type="button">Atualizar lista</button>
        </div>
        <div id="adminUsersList" style="margin-top:16px"><div class="empty">Carregando administradores…</div></div>
        <button class="ghost" id="refreshSession" style="margin-top:15px" type="button">Verificar sessão</button>
      </div>
    </section>'''
html = html[:i] + new_section + html[j + len(users_end):]

# 6. Ligar a aba Usuários ao carregamento da lista.
html = once(
    html,
    '  if(page==="categories")loadCategories();',
    '  if(page==="categories")loadCategories();\n  if(page==="users")loadAdminUsers();',
    "setPage"
)

anchor = '$("refreshSession").onclick=async()=>{if(await checkSession())toast("Sessão administrativa ativa.")};'
js = r'''
async function loadAdminUsers(){
  const box=$("adminUsersList");
  if(!box)return;
  box.innerHTML='<div class="empty">Carregando administradores…</div>';
  try{
    const data=await api("/api/admin/users");
    const users=Array.isArray(data.users)?data.users:[];
    if(!users.length){
      box.innerHTML='<div class="empty">Nenhum administrador adicional cadastrado.</div>';
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
html = once(html, anchor, js + "\n" + anchor, "eventos do formulário")

# Fazer backup e gravar somente após todas as validações de marcadores.
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = root / "backups" / f"admin-corrigido-{stamp}"
backup.mkdir(parents=True, exist_ok=True)
shutil.copy2(api_path, backup / "index.js")
shutil.copy2(html_path, backup / "admin.html")

api_path.write_text(api)
html_path.write_text(html)
print(f"Patch aplicado. Backup: {backup}")
