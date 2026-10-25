'use strict';

const WHATSAPP_NUMBER = '5584994551777';
const $ = selector => document.querySelector(selector);
const state = {
  products: [],
  query: '',
  sort: 'featured',
  cart: loadCart(),
  selectedProduct: null
};

function loadCart() {
  try {
    const value = JSON.parse(localStorage.getItem('n10store_cart') || '[]');
    return Array.isArray(value)
      ? value.filter(x => x && typeof x.id === 'string' && Number.isInteger(x.qty) && x.qty > 0 && x.qty <= 99)
      : [];
  } catch {
    return [];
  }
}

function saveCart() {
  try {
    localStorage.setItem('n10store_cart', JSON.stringify(state.cart));
  } catch {
    toast('Não foi possível salvar a sacola.');
  }
}

function money(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function productPrice(product) {
  return Number.isFinite(product.price) && product.price > 0
    ? money(product.price)
    : 'Consulte o preço';
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

function openWhatsApp(message) {
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.location.href = url;
}

function buyProduct(product, qty = 1) {
  if (!product) return;
  const message = [
    'Olá! Vim pelo site da N10STORE e tenho interesse em comprar uma peça.',
    '',
    `Produto: ${product.name}`,
    'Categoria: Roupas',
    `Quantidade: ${qty}`,
    `Preço anunciado: ${productPrice(product)}`,
    '',
    'Pode confirmar o preço, os tamanhos e a disponibilidade desta peça?'
  ].join('\n');

  openWhatsApp(message);
}

function renderProducts() {
  const query = state.query.trim().toLocaleLowerCase('pt-BR');
  let products = state.products.filter(p =>
    `${p.name} ${p.category} ${p.description}`.toLocaleLowerCase('pt-BR').includes(query)
  );

  if (state.sort === 'name') {
    products.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  } else {
    products.sort((a, b) => Number(b.featured) - Number(a.featured));
  }

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
    const card = document.createElement('article');
    card.className = 'product-card';

    const imageLink = document.createElement('a');
    imageLink.className = 'product-image';
    imageLink.href = '#';
    imageLink.setAttribute('aria-label', `Ver detalhes de ${product.name}`);
    imageLink.addEventListener('click', event => {
      event.preventDefault();
      showDetails(product.id);
    });

    const img = document.createElement('img');
    img.src = product.image || '/assets/produtos/logo.png';
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

    const quickView = document.createElement('span');
    quickView.className = 'quick-view';
    quickView.textContent = 'Ver detalhes do produto ↗';
    imageLink.append(img, tag, quickView);

    const info = document.createElement('div');
    info.className = 'product-info';

    const category = document.createElement('div');
    category.className = 'product-category';
    category.textContent = 'Roupas';

    const name = document.createElement('h3');
    name.className = 'product-name';
    name.textContent = product.name;

    const description = document.createElement('p');
    description.className = 'product-description';
    description.textContent = product.description || 'Consulte tamanhos e disponibilidade.';

    const price = document.createElement('p');
    price.className = 'price' + (Number.isFinite(product.price) && product.price > 0 ? '' : ' consult');
    price.textContent = productPrice(product);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'add-button';
    add.textContent = '+ Sacola';
    add.setAttribute('aria-label', `Adicionar ${product.name} à sacola`);
    add.addEventListener('click', () => addToCart(product.id));

    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = 'primary-button';
    buy.textContent = 'Comprar no WhatsApp';
    buy.addEventListener('click', () => buyProduct(product));

    const titleButton = document.createElement('button');
    titleButton.type = 'button';
    titleButton.className = 'title-open';
    titleButton.setAttribute('aria-label', `Ver detalhes de ${product.name}`);
    titleButton.addEventListener('click', () => showDetails(product.id));

    name.style.cursor = 'pointer';
    name.title = 'Toque para ver detalhes';
    name.addEventListener('click', () => showDetails(product.id));

    actions.append(add, buy);
    info.append(category, name, description, price, actions);
    card.append(imageLink, info);
    container.append(card);
  });
}

function showDetails(id) {
  const product = state.products.find(p => p.id === id);
  if (!product) return;
  state.selectedProduct = product;

  $('#detailImage').src = product.image || '/assets/produtos/logo.png';
  $('#detailImage').alt = product.name;
  $('#detailImage').onerror = function () {
    this.onerror = null;
    this.src = '/assets/produtos/logo.png';
    this.style.objectFit = 'contain';
    this.style.padding = '24px';
  };
  $('#detailName').textContent = product.name;
  $('#detailDescription').textContent = product.description || 'Entre em contato para saber mais sobre esta peça.';
  $('#detailPrice').textContent = productPrice(product);

  $('#detailOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#closeDetail').focus();
}

function closeDetails() {
  $('#detailOverlay').hidden = true;
  document.body.style.overflow = '';
  state.selectedProduct = null;
}

function addToCart(id) {
  const product = state.products.find(p => p.id === id);
  if (!product) return;

  const item = state.cart.find(x => x.id === id);
  if (item) {
    if (item.qty >= 99) return toast('Limite de quantidade atingido.');
    item.qty++;
  } else {
    state.cart.push({ id, qty: 1 });
  }

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
    price.textContent = productPrice(product);

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
  closeDetails();
  $('#cartOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#closeCart').focus();
}

function closeCart() {
  $('#cartOverlay').hidden = true;
  document.body.style.overflow = '';
  $('#openCart').focus();
}

function checkoutCart() {
  if (!state.cart.length) return toast('Adicione uma peça à sacola.');
  const name = $('#customerName').value.trim().slice(0, 80);
  const lines = [
    'Olá! Vim pelo site da N10STORE e quero consultar estas peças:',
    '',
    ...(name ? [`Nome: ${name}`, ''] : [])
  ];

  state.cart.forEach(item => {
    const product = state.products.find(p => p.id === item.id);
    if (!product) return;
    lines.push(
      `Produto: ${product.name}`,
      `Categoria: Roupas`,
      `Quantidade: ${item.qty}`,
      `Preço anunciado: ${productPrice(product)}`,
      ''
    );
  });

  lines.push('Pode confirmar os preços, tamanhos e disponibilidade, por favor?');
  openWhatsApp(lines.join('\n'));
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
$('#closeDetail').addEventListener('click', closeDetails);
document.querySelector('[data-close-detail]').addEventListener('click', closeDetails);

$('#detailAdd').addEventListener('click', () => {
  if (!state.selectedProduct) return;
  addToCart(state.selectedProduct.id);
  closeDetails();
});
$('#detailBuy').addEventListener('click', () => {
  if (state.selectedProduct) buyProduct(state.selectedProduct);
});

$('#checkout').addEventListener('click', checkoutCart);
$('#clearCart').addEventListener('click', () => {
  state.cart = [];
  saveCart();
  renderCart();
  toast('Sacola limpa.');
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!$('#detailOverlay').hidden) closeDetails();
    if (!$('#cartOverlay').hidden) closeCart();
  }
});

async function init() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('Falha ao carregar catálogo.');
    const products = await response.json();

    state.products = Array.isArray(products) ? products.filter(p =>
      p && typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      p.category === 'Roupas' &&
      (p.price === null || (Number.isFinite(p.price) && p.price >= 0))
    ) : [];

    renderProducts();
    renderCart();
  } catch {
    $('#products').textContent = 'Não foi possível carregar a coleção. Verifique se o servidor está funcionando.';
  }
}
init();


/* Carrossel de destaques: troca automática a cada 5 segundos */
(() => {
  const carousel = document.querySelector('.hero-carousel');
  if (!carousel || carousel.dataset.ready === 'true') return;
  carousel.dataset.ready = 'true';

  const slides = Array.from(carousel.querySelectorAll('.hero-slide'));
  const dotsBox = carousel.querySelector('.carousel-dots');
  const previous = carousel.querySelector('.carousel-prev');
  const next = carousel.querySelector('.carousel-next');
  if (!slides.length) return;

  let current = Math.max(0, slides.findIndex(s => s.classList.contains('is-active')));
  let timer = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const dots = slides.map((slide, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot' + (index === current ? ' is-active' : '');
    dot.setAttribute('aria-label', `Mostrar foto ${index + 1} de ${slides.length}`);
    dot.setAttribute('aria-current', index === current ? 'true' : 'false');
    dot.addEventListener('click', () => {
      show(index);
      restart();
    });
    dotsBox.append(dot);
    return dot;
  });

  function show(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === current);
      slide.setAttribute('aria-hidden', i === current ? 'false' : 'true');
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === current);
      dot.setAttribute('aria-current', i === current ? 'true' : 'false');
    });
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }
  function start() {
    stop();
    if (!reducedMotion && !document.hidden) {
      timer = window.setInterval(() => show(current + 1), 5000);
    }
  }
  function restart() { start(); }

  previous.addEventListener('click', () => { show(current - 1); restart(); });
  next.addEventListener('click', () => { show(current + 1); restart(); });
  carousel.addEventListener('mouseenter', stop);
  carousel.addEventListener('mouseleave', start);
  carousel.addEventListener('focusin', stop);
  carousel.addEventListener('focusout', start);
  document.addEventListener('visibilitychange', start);

  let touchStartX = 0;
  carousel.addEventListener('touchstart', event => {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });
  carousel.addEventListener('touchend', event => {
    const delta = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) > 45) {
      show(current + (delta < 0 ? 1 : -1));
      restart();
    }
  }, { passive: true });

  show(current);
  start();
})();
