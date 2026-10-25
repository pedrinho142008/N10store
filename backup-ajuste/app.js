'use strict';
const $ = selector => document.querySelector(selector);
const state = { products: [], query: '', sort: 'featured', cart: loadCart(), whatsappConfigured: false };

function loadCart() {
  try {
    const value = JSON.parse(localStorage.getItem('n10store_cart') || '[]');
    return Array.isArray(value) ? value.filter(x => x && typeof x.id === 'string' && Number.isInteger(x.qty) && x.qty > 0 && x.qty <= 99) : [];
  } catch { return []; }
}
function saveCart() {
  try { localStorage.setItem('n10store_cart', JSON.stringify(state.cart)); }
  catch { toast('Não foi possível salvar a sacola.'); }
}
function money(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}
function renderProducts() {
  const query = state.query.trim().toLocaleLowerCase('pt-BR');
  let products = state.products.filter(p =>
    `${p.name} ${p.category} ${p.description}`.toLocaleLowerCase('pt-BR').includes(query)
  );
  if (state.sort === 'name') products.sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
  else products.sort((a,b) => Number(b.featured) - Number(a.featured));

  $('#productCount').textContent = `(${products.length})`;
  const container = $('#products');
  container.replaceChildren();

  if (!products.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nenhuma peça encontrada. Tente outro termo.';
    container.append(empty);
    return;
  }

  products.forEach(product => {
    const article = document.createElement('article');
    article.className = 'product';

    const imageLink = document.createElement('a');
    imageLink.className = 'product-image';
    imageLink.href = '#sobre';
    imageLink.setAttribute('aria-label', `Informações sobre ${product.name}`);

    const img = document.createElement('img');
    img.src = product.image;
    img.alt = product.name;
    img.loading = 'lazy';
    img.onerror = () => {
      img.onerror = null;
      img.src = '/assets/produtos/logo.png';
      img.style.objectFit = 'contain';
      img.style.padding = '20px';
    };

    const tag = document.createElement('span');
    tag.className = 'product-tag';
    tag.textContent = product.featured ? 'Destaque' : 'N10 / Roupas';
    imageLink.append(img, tag);

    const info = document.createElement('div');
    info.className = 'product-info';

    const category = document.createElement('div');
    category.className = 'product-category';
    category.textContent = 'Roupas';

    const title = document.createElement('h3');
    title.textContent = product.name;

    const description = document.createElement('p');
    description.className = 'product-description';
    description.textContent = product.description || 'Consulte tamanhos e disponibilidade.';

    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = Number.isFinite(product.price) && product.price > 0
      ? money(product.price) : 'Consulte o preço';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary-button';
    button.textContent = 'Adicionar à sacola +';
    button.addEventListener('click', () => addToCart(product.id));

    info.append(category, title, description, price, button);
    article.append(imageLink, info);
    container.append(article);
  });
}
function addToCart(id) {
  const product = state.products.find(p => p.id === id);
  if (!product) return;
  const item = state.cart.find(x => x.id === id);
  if (item) {
    if (item.qty >= 99) return toast('Limite de quantidade atingido.');
    item.qty++;
  } else state.cart.push({ id, qty: 1 });
  saveCart();
  renderCart();
  toast('Peça adicionada à sacola.');
}
function renderCart() {
  state.cart = state.cart.filter(item => state.products.some(p => p.id === item.id));
  const container = $('#cartItems');
  container.replaceChildren();
  let count = 0;

  state.cart.forEach(item => {
    const product = state.products.find(p => p.id === item.id);
    if (!product) return;
    count += item.qty;

    const row = document.createElement('div');
    row.className = 'cart-item';

    const details = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = product.name;
    const price = document.createElement('p');
    price.textContent = Number.isFinite(product.price) && product.price > 0
      ? money(product.price) : 'Preço a consultar';

    const qty = document.createElement('div');
    qty.className = 'qty';
    const minus = document.createElement('button');
    minus.className = 'qty-button';
    minus.textContent = '−';
    minus.setAttribute('aria-label', `Diminuir ${product.name}`);
    minus.addEventListener('click', () => changeQty(item.id, -1));
    const number = document.createElement('span');
    number.textContent = String(item.qty);
    const plus = document.createElement('button');
    plus.className = 'qty-button';
    plus.textContent = '+';
    plus.setAttribute('aria-label', `Aumentar ${product.name}`);
    plus.addEventListener('click', () => changeQty(item.id, 1));
    qty.append(minus, number, plus);
    details.append(title, price, qty);

    const remove = document.createElement('button');
    remove.className = 'remove-item';
    remove.textContent = 'Remover';
    remove.addEventListener('click', () => {
      state.cart = state.cart.filter(x => x.id !== item.id);
      saveCart();
      renderCart();
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
  $('#checkout').disabled = !state.cart.length;
}
function changeQty(id, delta) {
  const item = state.cart.find(x => x.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart = state.cart.filter(x => x.id !== id);
  if (item.qty > 99) item.qty = 99;
  saveCart();
  renderCart();
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
  if (!state.cart.length) return toast('Adicione uma peça à sacola.');
  if (!state.whatsappConfigured) return toast('Configure o WhatsApp no arquivo .env.');
  const name = $('#customerName').value.trim().slice(0, 80);
  if (!name) {
    $('#customerName').focus();
    return toast('Digite seu nome para continuar.');
  }

  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, items: state.cart })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Falha ao preparar o pedido.');
    window.location.href = `https://wa.me/${result.number}?text=${encodeURIComponent(result.message)}`;
  } catch (error) {
    toast(error.message || 'Não foi possível preparar o pedido.');
  }
}

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
  saveCart();
  renderCart();
  toast('Sacola limpa.');
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#cartOverlay').hidden) closeCart();
});

async function init() {
  try {
    const [productsResponse, configResponse] = await Promise.all([
      fetch('/api/products'), fetch('/api/config')
    ]);
    if (!productsResponse.ok || !configResponse.ok) throw new Error();
    const products = await productsResponse.json();
    const config = await configResponse.json();
    state.products = Array.isArray(products) ? products.filter(p =>
      p && typeof p.id === 'string' && typeof p.name === 'string' &&
      p.category === 'Roupas' && (p.price === null || (Number.isFinite(p.price) && p.price >= 0))
    ) : [];
    state.whatsappConfigured = config.whatsappConfigured === true;
    renderProducts();
    renderCart();
  } catch {
    $('#products').textContent = 'Não foi possível carregar a coleção. Verifique o servidor.';
    $('#productCount').textContent = '';
  }
}
init();
