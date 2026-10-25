#!/data/data/com.termux/files/usr/bin/bash
set -eu

mkdir -p public/assets/produtos public/css public/js data

cat > package.json <<'FIM_PACKAGE'
{
  "name": "n10store",
  "version": "1.0.0",
  "private": true,
  "description": "Loja online N10STORE",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^5.1.0",
    "helmet": "^8.1.0"
  }
}
FIM_PACKAGE

cat > .gitignore <<'FIM_GIT'
node_modules/
.env
FIM_GIT

if [ ! -f .env ]; then
cat > .env <<'FIM_ENV'
WHATSAPP_NUMBER=
PORT=4000
FIM_ENV
fi

cat > data/products.json <<'FIM_PRODUCTS'
[
  {
    "id": "chuteira-01",
    "name": "Chuteira Campo Pro",
    "category": "Chuteiras",
    "price": 189.90,
    "description": "Estilo e desempenho para suas partidas.",
    "image": "/assets/produtos/sem-foto.svg",
    "featured": true
  },
  {
    "id": "tenis-01",
    "name": "Tênis Sport Urban",
    "category": "Tênis",
    "price": 159.90,
    "description": "Conforto e estilo para o dia a dia.",
    "image": "/assets/produtos/sem-foto.svg",
    "featured": true
  },
  {
    "id": "camiseta-01",
    "name": "Camiseta Esportiva",
    "category": "Roupas",
    "price": 69.90,
    "description": "Uma opção versátil para seu visual esportivo.",
    "image": "/assets/produtos/sem-foto.svg",
    "featured": false
  }
]
FIM_PRODUCTS

cat > server.js <<'FIM_SERVER'
const express = require('express');
const helmet = require('helmet');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const ROOT = __dirname;
const PRODUCTS_FILE = path.join(ROOT, 'data', 'products.json');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));

app.get('/api/products', (req, res) => {
  try {
    const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
    res.set('Cache-Control', 'no-store');
    res.json(products);
  } catch (error) {
    console.error('Erro ao carregar catálogo:', error.message);
    res.status(500).json({ error: 'Não foi possível carregar os produtos.' });
  }
});

app.get('/api/config', (req, res) => {
  const number = String(process.env.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  res.json({ whatsappConfigured: number.length >= 12 && number.length <= 13 });
});

app.get('*path', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`N10STORE disponível em http://127.0.0.1:${PORT}`);
});
FIM_SERVER

cat > public/index.html <<'FIM_HTML'
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#171717">
  <meta name="description" content="N10STORE — chuteiras, tênis e roupas esportivas.">
  <title>N10STORE | Moda esportiva</title>
  <link rel="stylesheet" href="/css/style.css">
  <script src="/js/app.js" defer></script>
</head>
<body>
  <header class="top">
    <a class="brand" href="/" aria-label="N10STORE início">
      <img src="/assets/logo.png" alt="N10STORE" onerror="this.style.display='none'">
      <span>N10<span class="gold">STORE</span></span>
    </a>
    <button id="openCart" class="cart-button" type="button">
      Sacola <span id="cartCount">0</span>
    </button>
  </header>

  <main>
    <section class="hero">
      <p class="eyebrow">ESTILO DENTRO E FORA DE CAMPO</p>
      <h1>Seu próximo<br>nível começa aqui.</h1>
      <p>Chuteiras, tênis e roupas para acompanhar seu ritmo.</p>
      <a class="hero-link" href="#catalogo">Explorar produtos ↓</a>
    </section>

    <section id="catalogo" class="catalog">
      <div class="section-heading">
        <div><p class="eyebrow">ESCOLHA SEU ESTILO</p><h2>Nossa coleção</h2></div>
        <span id="productCount" class="muted">Carregando...</span>
      </div>
      <label class="search-label" for="search">Buscar produto</label>
      <input id="search" type="search" maxlength="80" placeholder="Digite o nome do produto...">
      <div id="categories" class="categories">
        <button class="category active" data-category="Todos">Todos</button>
        <button class="category" data-category="Chuteiras">Chuteiras</button>
        <button class="category" data-category="Tênis">Tênis</button>
        <button class="category" data-category="Roupas">Roupas</button>
      </div>
      <div class="sort-row">
        <label for="sort">Ordenar por</label>
        <select id="sort">
          <option value="featured">Destaques</option>
          <option value="price-asc">Menor preço</option>
          <option value="price-desc">Maior preço</option>
          <option value="name">Nome</option>
        </select>
      </div>
      <div id="products" class="products" aria-live="polite">
        <p>Carregando produtos...</p>
      </div>
    </section>
  </main>

  <footer><strong>N10STORE</strong><p>Seu estilo, seu jogo.</p></footer>

  <div id="cartOverlay" class="overlay" hidden>
    <button class="overlay-bg" data-close-cart aria-label="Fechar sacola"></button>
    <section class="cart-panel" role="dialog" aria-modal="true" aria-labelledby="cartTitle">
      <div class="cart-heading"><h2 id="cartTitle">Sua sacola</h2><button id="closeCart" aria-label="Fechar">✕</button></div>
      <div id="cartItems" class="cart-items"></div>
      <div class="cart-bottom">
        <div class="total-row"><span>Total</span><strong id="cartTotal">R$ 0,00</strong></div>
        <label for="customerName">Seu nome</label>
        <input id="customerName" maxlength="80" placeholder="Como podemos te chamar?">
        <button id="checkout" class="primary-button">Finalizar pelo WhatsApp</button>
        <button id="clearCart" class="clear-button">Limpar sacola</button>
        <p class="muted small">O pedido será enviado para confirmação pelo WhatsApp.</p>
      </div>
    </section>
  </div>
  <div id="toast" class="toast" role="status"></div>
</body>
</html>
FIM_HTML

cat > public/css/style.css <<'FIM_CSS'
:root{color-scheme:dark;--bg:#101010;--panel:#191919;--text:#f5f2eb;--muted:#aaa69e;--gold:#d8b66b;--line:#303030}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif}
button,input,select{font:inherit}
button,a{-webkit-tap-highlight-color:transparent}
button{cursor:pointer}
a{color:inherit;text-decoration:none}
.top{height:76px;padding:0 6%;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:#111;position:sticky;top:0;z-index:5}
.brand{display:flex;align-items:center;gap:10px;font-size:1.25rem;font-weight:900;letter-spacing:1px}
.brand img{width:42px;height:42px;object-fit:contain}
.gold{color:var(--gold)}
.cart-button,.category,.sort-row select{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:999px;padding:10px 16px}
#cartCount{color:var(--gold);margin-left:5px}
.hero{padding:88px 8% 100px;background:radial-gradient(ellipse at 80% 20%,#383020 0,transparent 42%),linear-gradient(135deg,#1d1d1b,#101010 70%)}
.eyebrow{color:var(--gold);font-size:.72rem;letter-spacing:2px;font-weight:750}
.hero h1{font-size:clamp(2.6rem,8vw,5.5rem);line-height:1.02;letter-spacing:-2px;margin:18px 0}
.hero>p:not(.eyebrow){color:var(--muted);max-width:420px;line-height:1.7}
.hero-link{display:inline-block;margin-top:18px;padding:14px 20px;background:var(--gold);color:#17140e;border-radius:999px;font-weight:750}
.catalog{padding:64px 6%;max-width:1400px;margin:auto}
.section-heading{display:flex;align-items:end;justify-content:space-between;gap:16px}
h2{margin:8px 0 20px;font-size:clamp(1.6rem,4vw,2.3rem)}
.muted{color:var(--muted);font-size:.85rem}
.search-label,.cart-bottom label{display:block;color:var(--muted);font-size:.85rem;margin:22px 0 8px}
#search,.cart-bottom input{width:100%;padding:14px 16px;border:1px solid var(--line);border-radius:16px;background:var(--panel);color:var(--text);outline:none}
#search:focus,.cart-bottom input:focus{border-color:var(--gold)}
.categories{display:flex;gap:9px;overflow-x:auto;padding:18px 0;scrollbar-width:none}
.category{white-space:nowrap}
.category.active{background:var(--gold);border-color:var(--gold);color:#17140e;font-weight:750}
.sort-row{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin:8px 0 20px;color:var(--muted);font-size:.85rem}
.products{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.product{min-width:0;border:1px solid var(--line);background:var(--panel);border-radius:22px;overflow:hidden;transition:transform .2s,border-color .2s}
.product:hover{transform:translateY(-4px);border-color:#706044}
.product img{display:block;width:100%;aspect-ratio:4/4.3;object-fit:cover;background:#e9e7df}
.product-info{padding:16px}
.product-category{font-size:.7rem;color:var(--gold);text-transform:uppercase;letter-spacing:1px}
.product h3{font-size:1rem;margin:8px 0}
.product-description{font-size:.83rem;color:var(--muted);line-height:1.5;min-height:38px}
.price{font-size:1.25rem;font-weight:800;margin:14px 0}
.primary-button{width:100%;border:0;border-radius:999px;background:var(--gold);color:#17140e;padding:14px;font-weight:800}
.primary-button:disabled{opacity:.5;cursor:not-allowed}
footer{text-align:center;padding:36px 20px;border-top:1px solid var(--line);color:var(--muted)}
footer strong{color:var(--gold);letter-spacing:2px}
.overlay[hidden]{display:none}
.overlay{position:fixed;inset:0;z-index:20;display:flex;justify-content:flex-end}
.overlay-bg{position:absolute;inset:0;border:0;background:#000b;width:100%;height:100%}
.cart-panel{position:relative;width:min(100%,440px);height:100%;overflow:auto;background:var(--bg);padding:24px;display:flex;flex-direction:column}
.cart-heading{display:flex;justify-content:space-between;align-items:center}
.cart-heading h2{margin:0}
.cart-heading button,.qty-button{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:50%;width:36px;height:36px}
.cart-items{flex:1}
.cart-item{display:grid;grid-template-columns:1fr auto;gap:12px;padding:18px 0;border-bottom:1px solid var(--line)}
.cart-item h3{font-size:.95rem;margin:0 0 6px}
.cart-item p{margin:0;color:var(--muted);font-size:.85rem}
.qty{display:flex;align-items:center;gap:10px;margin-top:10px}
.qty-button{width:30px;height:30px}
.remove-item{border:0;background:none;color:var(--muted);padding:8px 0;font-size:.8rem}
.cart-bottom{padding-top:16px}
.total-row{display:flex;justify-content:space-between;font-size:1.1rem;margin:12px 0}
.clear-button{display:block;margin:12px auto;border:0;background:none;color:var(--muted);padding:8px}
.small{font-size:.75rem;text-align:center}
.toast{position:fixed;bottom:22px;left:50%;transform:translate(-50%,20px);opacity:0;pointer-events:none;background:#f5f2eb;color:#171717;padding:12px 18px;border-radius:999px;z-index:40;transition:.2s;font-size:.9rem;max-width:90%;text-align:center}
.toast.show{opacity:1;transform:translate(-50%,0)}
.empty{grid-column:1/-1;text-align:center;padding:45px 15px;color:var(--muted)}
@media(max-width:760px){.products{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.catalog{padding:42px 4%}.product-info{padding:12px}.product h3{font-size:.9rem}.product-description{font-size:.78rem}.hero{padding:70px 6% 80px}.top{padding:0 4%}}
@media(max-width:390px){.products{grid-template-columns:1fr 1fr}.product-info{padding:10px}.price{font-size:1.1rem}}
FIM_CSS

cat > public/js/app.js <<'FIM_JS'
'use strict';
const $ = selector => document.querySelector(selector);
const state = { products: [], category: 'Todos', query: '', sort: 'featured', cart: loadCart(), whatsappConfigured: false };
function loadCart() {
  try {
    const value = JSON.parse(localStorage.getItem('n10store_cart') || '[]');
    return Array.isArray(value) ? value.filter(x => x && typeof x.id === 'string' && Number.isInteger(x.qty) && x.qty > 0 && x.qty <= 99) : [];
  } catch { return []; }
}
function saveCart() {
  try { localStorage.setItem('n10store_cart', JSON.stringify(state.cart)); }
  catch { toast('Não foi possível salvar a sacola neste navegador.'); }
}
function money(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2400);
}
function safeText(value) { return String(value ?? ''); }
function renderProducts() {
  const query = state.query.trim().toLocaleLowerCase('pt-BR');
  let products = state.products.filter(product =>
    (state.category === 'Todos' || product.category === state.category) &&
    `${product.name} ${product.category} ${product.description}`.toLocaleLowerCase('pt-BR').includes(query)
  );
  if (state.sort === 'price-asc') products.sort((a,b) => a.price - b.price);
  if (state.sort === 'price-desc') products.sort((a,b) => b.price - a.price);
  if (state.sort === 'name') products.sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
  if (state.sort === 'featured') products.sort((a,b) => Number(b.featured) - Number(a.featured));
  $('#productCount').textContent = `${products.length} produto${products.length === 1 ? '' : 's'}`;
  const container = $('#products');
  container.replaceChildren();
  if (!products.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nenhum produto encontrado. Tente outra busca.';
    container.append(empty);
    return;
  }
  products.forEach(product => {
    const article = document.createElement('article');
    article.className = 'product';
    const image = document.createElement('img');
    image.src = product.image || '/assets/produtos/sem-foto.svg';
    image.alt = product.name;
    image.loading = 'lazy';
    image.onerror = () => { image.onerror = null; image.src = '/assets/produtos/sem-foto.svg'; };
    const info = document.createElement('div');
    info.className = 'product-info';
    const category = document.createElement('div');
    category.className = 'product-category';
    category.textContent = safeText(product.category);
    const title = document.createElement('h3');
    title.textContent = safeText(product.name);
    const description = document.createElement('p');
    description.className = 'product-description';
    description.textContent = safeText(product.description);
    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = money(product.price);
    const button = document.createElement('button');
    button.className = 'primary-button';
    button.type = 'button';
    button.textContent = 'Adicionar à sacola';
    button.addEventListener('click', () => addToCart(product.id));
    info.append(category, title, description, price, button);
    article.append(image, info);
    container.append(article);
  });
}
function addToCart(id) {
  const product = state.products.find(item => item.id === id);
  if (!product) return;
  const item = state.cart.find(item => item.id === id);
  if (item) {
    if (item.qty >= 99) return toast('Limite de quantidade atingido.');
    item.qty++;
  } else state.cart.push({ id, qty: 1 });
  saveCart();
  renderCart();
  toast('Produto adicionado à sacola!');
}
function renderCart() {
  state.cart = state.cart.filter(item => state.products.some(product => product.id === item.id));
  const container = $('#cartItems');
  container.replaceChildren();
  let total = 0, count = 0;
  state.cart.forEach(item => {
    const product = state.products.find(product => product.id === item.id);
    if (!product) return;
    total += product.price * item.qty;
    count += item.qty;
    const row = document.createElement('div');
    row.className = 'cart-item';
    const details = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = product.name;
    const subtotal = document.createElement('p');
    subtotal.textContent = money(product.price * item.qty);
    const qty = document.createElement('div');
    qty.className = 'qty';
    const minus = document.createElement('button');
    minus.className = 'qty-button';
    minus.textContent = '−';
    minus.setAttribute('aria-label', `Diminuir ${product.name}`);
    minus.addEventListener('click', () => changeQty(item.id, -1));
    const quantity = document.createElement('span');
    quantity.textContent = String(item.qty);
    const plus = document.createElement('button');
    plus.className = 'qty-button';
    plus.textContent = '+';
    plus.setAttribute('aria-label', `Aumentar ${product.name}`);
    plus.addEventListener('click', () => changeQty(item.id, 1));
    qty.append(minus, quantity, plus);
    details.append(title, subtotal, qty);
    const remove = document.createElement('button');
    remove.className = 'remove-item';
    remove.textContent = 'Remover';
    remove.addEventListener('click', () => {
      state.cart = state.cart.filter(entry => entry.id !== item.id);
      saveCart(); renderCart();
    });
    row.append(details, remove);
    container.append(row);
  });
  if (!state.cart.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Sua sacola está vazia.';
    container.append(empty);
  }
  $('#cartCount').textContent = String(count);
  $('#cartTotal').textContent = money(total);
  $('#checkout').disabled = !state.cart.length;
}
function changeQty(id, delta) {
  const item = state.cart.find(entry => entry.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart = state.cart.filter(entry => entry.id !== id);
  if (item.qty > 99) item.qty = 99;
  saveCart(); renderCart();
}
function openCart() {
  $('#cartOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#closeCart').focus();
}
function closeCart() {
  $('#cartOverlay').hidden = true;
  document.body.style.overflow = '';
  $('#openCart').focus();
}
async function checkout() {
  if (!state.cart.length) return toast('Adicione algum produto primeiro.');
  if (!state.whatsappConfigured) return toast('Configure o número do WhatsApp no arquivo .env.');
  const name = $('#customerName').value.trim().slice(0, 80);
  if (!name) { $('#customerName').focus(); return toast('Digite seu nome para continuar.'); }
  const lines = ['Olá! Quero fazer um pedido na N10STORE.', `Nome: ${name}`, '', 'Meu pedido:'];
  let total = 0;
  state.cart.forEach(item => {
    const product = state.products.find(product => product.id === item.id);
    if (!product) return;
    total += product.price * item.qty;
    lines.push(`- ${product.name} | ${item.qty}x ${money(product.price)} = ${money(product.price * item.qty)}`);
  });
  lines.push('', `Total dos produtos: ${money(total)}`, '', 'Podem confirmar a disponibilidade, por favor?');
  try {
    const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, items: state.cart }) });
    if (!response.ok) throw new Error('Não foi possível validar o pedido.');
    const result = await response.json();
    const message = result.message;
    window.location.href = `https://wa.me/${result.number}?text=${encodeURIComponent(message || lines.join('\n'))}`;
  } catch {
    toast('Não foi possível validar o pedido. Confira se o servidor está atualizado.');
  }
}
$('#categories').addEventListener('click', event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  state.category = button.dataset.category;
  document.querySelectorAll('.category').forEach(element => element.classList.toggle('active', element === button));
  renderProducts();
});
$('#search').addEventListener('input', event => {
  state.query = event.target.value.slice(0, 80);
  renderProducts();
});
$('#sort').addEventListener('change', event => {
  state.sort = event.target.value;
  renderProducts();
});
$('#openCart').addEventListener('click', openCart);
$('#closeCart').addEventListener('click', closeCart);
document.querySelector('[data-close-cart]').addEventListener('click', closeCart);
$('#checkout').addEventListener('click', checkout);
$('#clearCart').addEventListener('click', () => {
  state.cart = [];
  saveCart(); renderCart(); toast('Sacola limpa.');
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#cartOverlay').hidden) closeCart();
});
async function init() {
  try {
    const [productsResponse, configResponse] = await Promise.all([fetch('/api/products'), fetch('/api/config')]);
    if (!productsResponse.ok || !configResponse.ok) throw new Error('Falha ao carregar a loja.');
    const products = await productsResponse.json();
    const config = await configResponse.json();
    state.products = Array.isArray(products) ? products.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && Number.isFinite(p.price) && p.price >= 0 && p.price <= 1000000) : [];
    state.whatsappConfigured = config.whatsappConfigured === true;
    renderProducts(); renderCart();
  } catch {
    $('#products').textContent = 'Não foi possível carregar os produtos. Confira se o servidor está funcionando.';
    $('#productCount').textContent = 'Erro';
  }
}
init();
FIM_JS

cat > public/assets/produtos/sem-foto.svg <<'FIM_SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 450">
  <rect width="400" height="450" fill="#e9e7df"/>
  <g fill="none" stroke="#b9a16a" stroke-width="3">
    <rect x="145" y="155" width="110" height="100" rx="14"/>
    <circle cx="180" cy="190" r="10"/>
    <path d="M155 240l35-35 24 23 15-15 18 27"/>
  </g>
  <text x="200" y="295" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#55554f">N10STORE</text>
  <text x="200" y="320" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#77776f">Foto do produto</text>
</svg>
FIM_SVG

cat > README.md <<'FIM_README'
# N10STORE

Loja demonstrativa em Node.js + Express.

## Iniciar
npm install
npm start

Abra http://127.0.0.1:4000

## WhatsApp
Configure WHATSAPP_NUMBER no .env com DDI + DDD + número, apenas dígitos.
Exemplo de formato: 55DDNUMEROAQUI

Antes de publicar, implemente um endpoint POST /api/checkout que valide os
produtos e preços no servidor. O checkout do navegador depende desse endpoint.
FIM_README

echo "Arquivos básicos criados."
