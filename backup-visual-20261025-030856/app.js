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
