"use strict";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let products = [];
let categories = [];
let analytics = null;
let noticeTimer = null;

const WAITLIST_KEY = "n10_waitlist_v1";
const TAB_TITLES = {
  overview: "Visão geral",
  products: "Produtos",
  categories: "Categorias",
  waitlist: "Fila de espera",
  users: "Usuários"
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Não informado";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("pt-BR") : "—";
}

function formatDate(value) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" :
    date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function slugify(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function showNotice(message, type = "success") {
  const element = $("#notice");
  if (!element) return;
  element.textContent = message;
  element.className = `notice notice-${type}`;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => element.classList.add("hidden"), 5000);
}

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers
  });

  let data = {};
  try { data = await response.json(); } catch (_) {}

  if (response.status === 401) {
    location.href = "/admin";
    throw new Error("Sessão expirada. Entre novamente.");
  }
  if (!response.ok) {
    throw new Error(data.error || data.message || `Erro HTTP ${response.status}`);
  }
  return data;
}

function runSafely(task) {
  Promise.resolve().then(task).catch(error => {
    console.error(error);
    showNotice(error.message || "Não foi possível concluir a operação.", "error");
  });
}

function switchTab(tab) {
  if (!TAB_TITLES[tab]) return;
  $$(".nav-item[data-tab]").forEach(button =>
    button.classList.toggle("active", button.dataset.tab === tab));
  $$(".tab-panel").forEach(panel =>
    panel.classList.toggle("active", panel.id === `tab-${tab}`));
  $("#pageTitle").textContent = TAB_TITLES[tab];
  $("#sidebar").classList.remove("sidebar-open");
  $("#mobileOverlay").classList.remove("visible");

  if (tab === "overview") runSafely(loadOverview);
  if (tab === "products") runSafely(loadProducts);
  if (tab === "categories") runSafely(loadCategories);
  if (tab === "waitlist") renderWaitlist();
}

function imageSource(path) {
  const value = String(path || "").trim();
  if (!value) return "";
  if (/^(javascript|data):/i.test(value)) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value;
  return "";
}

function productImage(product) {
  const source = imageSource(product.image);
  if (source) return `<img src="${escapeHTML(source)}" alt="${escapeHTML(product.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><div class="image-placeholder" style="display:none">N10</div>`;
  return `<div class="image-placeholder">N10</div>`;
}

function stockOf(product) {
  const value = Number(product.stock);
  return Number.isFinite(value) ? value : 0;
}

function isActive(product) {
  return product.active !== false && product.active !== "false";
}

function productCard(product) {
  const id = escapeHTML(product.id);
  const active = isActive(product);
  const stock = stockOf(product);
  const category = product.category || "Sem categoria";
  const price = product.price === null || product.price === undefined || product.price === ""
    ? "Preço não informado" : money(product.price);

  return `<article class="product-card">
    <div class="product-image">${productImage(product)}
      <span class="image-status ${active ? "is-active" : "is-inactive"}">${active ? "Disponível" : "Indisponível"}</span>
      ${product.promotion ? '<span class="promotion-tag">Promoção</span>' : ""}
    </div>
    <div class="product-card-body">
      <span class="product-category">${escapeHTML(category)}</span>
      <h3>${escapeHTML(product.name || "Produto sem nome")}</h3>
      <div class="product-price">${escapeHTML(price)}</div>
      ${product.original_price ? `<div class="old-price">${escapeHTML(money(product.original_price))}</div>` : ""}
      <div class="product-meta"><span>Estoque</span><strong class="${stock <= 3 ? "stock-low" : ""}">${formatNumber(stock)} un.</strong></div>
      <div class="product-card-actions">
        <button class="button button-gold button-small" data-edit-product="${id}">Editar</button>
        <button class="button button-outline button-small" data-toggle-product="${id}" data-active="${active ? "1" : "0"}">${active ? "Desativar" : "Ativar"}</button>
        <button class="button button-danger button-small" data-delete-product="${id}">Excluir</button>
      </div>
    </div>
  </article>`;
}

async function loadProducts() {
  const grid = $("#productGrid");
  grid.innerHTML = '<div class="empty-state">Carregando produtos...</div>';
  const result = await api("/api/admin/products");
  products = Array.isArray(result) ? result :
    (Array.isArray(result.products) ? result.products : []);
  renderProducts();
  renderRecentProducts();
  updateProductStats();
}

function renderProducts() {
  const query = ($("#productSearch").value || "").trim().toLowerCase();
  const filter = $("#productFilter").value;
  const filtered = products.filter(product => {
    const matches = `${product.name || ""} ${product.category || ""} ${product.id || ""}`.toLowerCase().includes(query);
    const active = isActive(product);
    const stock = stockOf(product);
    return matches &&
      (filter === "all" ||
       (filter === "active" && active) ||
       (filter === "inactive" && !active) ||
       (filter === "low" && stock <= 3));
  });

  $("#productGrid").innerHTML = filtered.length
    ? filtered.map(productCard).join("")
    : '<div class="empty-state">Nenhum produto encontrado.</div>';
}

function renderRecentProducts() {
  const recent = products.slice(0, 4);
  $("#recentProducts").innerHTML = recent.length ? recent.map(product => `
    <div class="recent-product">
      <div class="recent-product-image">${productImage(product)}</div>
      <div class="recent-product-info"><strong>${escapeHTML(product.name || "Produto")}</strong>
        <span>${escapeHTML(product.category || "Sem categoria")}</span></div>
      <strong>${escapeHTML(product.price == null ? "—" : money(product.price))}</strong>
    </div>`).join("") : '<div class="empty-state">Nenhum produto cadastrado.</div>';
}

function updateProductStats() {
  $("#productCount").textContent = formatNumber(products.length);
  $("#lowStock").textContent = formatNumber(products.filter(p => stockOf(p) <= 3).length);
}

function setProductEditor(open) {
  $("#productEditor").classList.toggle("hidden", !open);
  if (open) $("#productEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetProductForm() {
  $("#productForm").reset();
  $("#productId").value = "";
  $("#productStock").value = "0";
  $("#productActive").checked = true;
  $("#productFormTitle").textContent = "Novo produto";
  $("#saveProductBtn").textContent = "Salvar produto";
}

function editProduct(id) {
  const product = products.find(item => String(item.id) === String(id));
  if (!product) return showNotice("Produto não encontrado.", "error");

  $("#productId").value = product.id ?? "";
  $("#productName").value = product.name || "";
  $("#productCategory").value = product.category || "";
  $("#productPrice").value = product.price ?? "";
  $("#productOriginalPrice").value = product.original_price ?? "";
  $("#productStock").value = stockOf(product);
  $("#productImage").value = product.image || "";
  $("#productImages").value = Array.isArray(product.images) ? product.images.join("\n") : "";
  $("#productSizes").value = Array.isArray(product.sizes) ? product.sizes.join(", ") : (product.sizes || "");
  $("#productDescription").value = product.description || "";
  $("#productPromotion").checked = Boolean(product.promotion);
  $("#productFeatured").checked = Boolean(product.featured);
  $("#productActive").checked = isActive(product);
  $("#productFormTitle").textContent = "Editar produto";
  $("#saveProductBtn").textContent = "Salvar alterações";
  setProductEditor(true);
}

async function saveProduct(event) {
  event.preventDefault();
  const id = $("#productId").value.trim();
  const priceValue = $("#productPrice").value.trim();
  const originalValue = $("#productOriginalPrice").value.trim();
  const stockValue = $("#productStock").value.trim();

  const payload = {
    name: $("#productName").value.trim(),
    category: $("#productCategory").value.trim(),
    price: priceValue === "" ? null : Number(priceValue),
    original_price: originalValue === "" ? null : Number(originalValue),
    stock: stockValue === "" ? 0 : Number(stockValue),
    image: $("#productImage").value.trim(),
    images: $("#productImages").value.split("\n").map(v => v.trim()).filter(Boolean),
    sizes: $("#productSizes").value.split(",").map(v => v.trim()).filter(Boolean),
    description: $("#productDescription").value.trim(),
    promotion: $("#productPromotion").checked,
    featured: $("#productFeatured").checked,
    active: $("#productActive").checked
  };

  if (!payload.name) return showNotice("Informe o nome do produto.", "error");
  if (payload.price !== null && (!Number.isFinite(payload.price) || payload.price < 0))
    return showNotice("Informe um preço válido.", "error");
  if (payload.original_price !== null && (!Number.isFinite(payload.original_price) || payload.original_price < 0))
    return showNotice("Informe um preço original válido.", "error");
  if (!Number.isInteger(payload.stock) || payload.stock < 0)
    return showNotice("O estoque precisa ser um número inteiro igual ou maior que zero.", "error");
  if (id) payload.id = id;

  $("#saveProductBtn").disabled = true;
  try {
    await api("/api/admin/products", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setProductEditor(false);
    resetProductForm();
    await loadProducts();
    await loadCategories().catch(() => {});
    showNotice("Produto salvo com sucesso.");
  } finally {
    $("#saveProductBtn").disabled = false;
  }
}

async function toggleProduct(id, currentlyActive) {
  const product = products.find(item => String(item.id) === String(id));
  if (!product) return showNotice("Produto não encontrado.", "error");
  const payload = {
    ...product,
    id: product.id,
    active: !currentlyActive,
    stock: stockOf(product)
  };
  await api("/api/admin/products", { method: "POST", body: JSON.stringify(payload) });
  await loadProducts();
  showNotice(currentlyActive ? "Produto desativado." : "Produto ativado.");
}

async function deleteProduct(id) {
  const product = products.find(item => String(item.id) === String(id));
  if (!product) return;
  if (!confirm(`Excluir o produto "${product.name}"? Esta ação não pode ser desfeita.`)) return;
  await api(`/api/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadProducts();
  showNotice("Produto excluído.");
}

async function loadCategories() {
  const result = await api("/api/admin/catalogs");
  categories = Array.isArray(result) ? result :
    (Array.isArray(result.catalogs) ? result.catalogs : []);
  renderCategories();
  $("#categoryCount").textContent = formatNumber(categories.length);
  $("#categoryOptions").innerHTML = categories.map(category =>
    `<option value="${escapeHTML(category.name || "")}"></option>`).join("");
}

function renderCategories() {
  const sorted = [...categories].sort((a, b) =>
    Number(a.sort_order || 0) - Number(b.sort_order || 0));
  $("#categoryGrid").innerHTML = sorted.length ? sorted.map(category => `
    <article class="category-card">
      <div class="category-symbol">▦</div>
      <div class="category-info"><h3>${escapeHTML(category.name || "Sem nome")}</h3>
        <p>${escapeHTML(category.description || "Sem descrição")}</p>
        <span class="status-tag ${category.active === false ? "status-inactive" : "status-active"}">${category.active === false ? "Inativa" : "Ativa"}</span>
        <small>Ordem: ${escapeHTML(category.sort_order ?? 0)}</small>
      </div>
      <div class="category-actions">
        <button class="button button-outline button-small" data-edit-category="${escapeHTML(category.id)}">Editar</button>
        <button class="button button-danger button-small" data-delete-category="${escapeHTML(category.id)}">Excluir</button>
      </div>
    </article>`).join("") :
    '<div class="empty-state">Nenhuma categoria cadastrada. Crie uma para organizar os produtos.</div>';
  $("#categoryCount").textContent = formatNumber(categories.length);
  $("#categoryOptions").innerHTML = categories.map(category =>
    `<option value="${escapeHTML(category.name || "")}"></option>`).join("");
}

function resetCategoryForm() {
  $("#categoryForm").reset();
  $("#categoryId").value = "";
  $("#categoryOrder").value = "0";
  $("#categoryActive").checked = true;
  $("#categoryFormTitle").textContent = "Nova categoria";
}

function setCategoryEditor(open) {
  $("#categoryEditor").classList.toggle("hidden", !open);
  if (open) $("#categoryEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function editCategory(id) {
  const category = categories.find(item => String(item.id) === String(id));
  if (!category) return showNotice("Categoria não encontrada.", "error");
  $("#categoryId").value = category.id ?? "";
  $("#categoryName").value = category.name || "";
  $("#categoryDescription").value = category.description || "";
  $("#categoryOrder").value = category.sort_order ?? 0;
  $("#categoryActive").checked = category.active !== false;
  $("#categoryFormTitle").textContent = "Editar categoria";
  setCategoryEditor(true);
}

async function saveCategory(event) {
  event.preventDefault();
  const id = $("#categoryId").value.trim();
  const name = $("#categoryName").value.trim();
  const sortOrder = Number($("#categoryOrder").value || 0);
  if (!name) return showNotice("Informe o nome da categoria.", "error");
  if (!Number.isFinite(sortOrder)) return showNotice("Ordem de exibição inválida.", "error");

  const oldCategory = categories.find(item => String(item.id) === String(id));
  const payload = {
    name,
    slug: slugify(name),
    description: $("#categoryDescription").value.trim(),
    active: $("#categoryActive").checked,
    sort_order: sortOrder
  };
  if (id) payload.id = id;

  $("#saveCategoryBtn").disabled = true;
  try {
    await api("/api/admin/catalogs", { method: "POST", body: JSON.stringify(payload) });

    let renameWarnings = 0;
    if (oldCategory && oldCategory.name !== name) {
      const linked = products.filter(product => product.category === oldCategory.name);
      for (const product of linked) {
        try {
          await api("/api/admin/products", {
            method: "POST",
            body: JSON.stringify({ ...product, category: name })
          });
        } catch (error) {
          renameWarnings++;
          console.error("Falha ao atualizar categoria do produto", product.id, error);
        }
      }
    }

    setCategoryEditor(false);
    resetCategoryForm();
    await loadCategories();
    await loadProducts();
    showNotice(renameWarnings
      ? `Categoria salva, mas ${renameWarnings} produto(s) precisam ser conferidos.`
      : "Categoria salva com sucesso.", renameWarnings ? "error" : "success");
  } finally {
    $("#saveCategoryBtn").disabled = false;
  }
}

async function deleteCategory(id) {
  const category = categories.find(item => String(item.id) === String(id));
  if (!category) return;
  if (!confirm(`Excluir a categoria "${category.name}"? Os produtos podem continuar com esse texto no campo de categoria.`)) return;
  await api(`/api/admin/catalogs/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadCategories();
  showNotice("Categoria excluída.");
}

function readWaitlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WAITLIST_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeWaitlist(items) {
  localStorage.setItem(WAITLIST_KEY, JSON.stringify(items));
}

function resetWaitlistForm() {
  $("#waitlistForm").reset();
  $("#waitlistId").value = "";
  $("#waitlistStatus").value = "Aguardando";
  $("#waitlistFormTitle").textContent = "Adicionar cliente";
}

function setWaitlistEditor(open) {
  $("#waitlistEditor").classList.toggle("hidden", !open);
  if (open) $("#waitlistEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function editWaitlist(id) {
  const item = readWaitlist().find(row => row.id === id);
  if (!item) return;
  $("#waitlistId").value = item.id;
  $("#waitlistName").value = item.name || "";
  $("#waitlistPhone").value = item.phone || "";
  $("#waitlistInterest").value = item.interest || "";
  $("#waitlistStatus").value = item.status || "Aguardando";
  $("#waitlistFormTitle").textContent = "Editar cliente";
  setWaitlistEditor(true);
}

function saveWaitlist(event) {
  event.preventDefault();
  const items = readWaitlist();
  const id = $("#waitlistId").value || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const old = items.find(item => item.id === id);
  const item = {
    id,
    name: $("#waitlistName").value.trim(),
    phone: $("#waitlistPhone").value.trim(),
    interest: $("#waitlistInterest").value.trim(),
    status: $("#waitlistStatus").value,
    createdAt: old?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!item.name) return showNotice("Informe o nome do cliente.", "error");
  const index = items.findIndex(row => row.id === id);
  if (index >= 0) items[index] = item;
  else items.unshift(item);
  writeWaitlist(items);
  setWaitlistEditor(false);
  resetWaitlistForm();
  renderWaitlist();
  showNotice("Cliente salvo nesta sessão do dispositivo.");
}

function renderWaitlist() {
  const items = readWaitlist();
  $("#waitCount").textContent = items.filter(item => item.status === "Aguardando").length;
  $("#notifiedCount").textContent = items.filter(item => item.status === "Cliente avisado").length;
  $("#servedCount").textContent = items.filter(item => item.status === "Atendido").length;

  const query = ($("#waitlistSearch")?.value || "").trim().toLowerCase();
  const filter = $("#waitlistFilter")?.value || "all";
  const filtered = items.filter(item => {
    const matches = `${item.name || ""} ${item.phone || ""} ${item.interest || ""}`.toLowerCase().includes(query);
    return matches && (filter === "all" || item.status === filter);
  });

  $("#waitlistList").innerHTML = filtered.length ? filtered.map(item => `
    <article class="waitlist-card">
      <div class="waitlist-avatar">${escapeHTML((item.name || "?").trim().charAt(0).toUpperCase())}</div>
      <div class="waitlist-info">
        <h3>${escapeHTML(item.name)}</h3>
        <p>${escapeHTML(item.phone || "Sem telefone")} · ${escapeHTML(item.interest || "Sem produto informado")}</p>
        <small>Cadastrado em ${escapeHTML(formatDate(item.createdAt))}</small>
      </div>
      <div class="waitlist-controls">
        <span class="status-tag ${item.status === "Atendido" ? "status-active" : item.status === "Cliente avisado" ? "status-notified" : "status-waiting"}">${escapeHTML(item.status)}</span>
        <select data-wait-status="${escapeHTML(item.id)}" aria-label="Alterar status de ${escapeHTML(item.name)}">
          ${["Aguardando", "Cliente avisado", "Atendido"].map(status =>
            `<option value="${status}" ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <div class="inline-actions">
          <button class="button button-outline button-small" data-edit-wait="${escapeHTML(item.id)}">Editar</button>
          <button class="button button-danger button-small" data-delete-wait="${escapeHTML(item.id)}">Excluir</button>
        </div>
      </div>
    </article>`).join("") :
    '<div class="empty-state">Nenhum cliente na fila com esses filtros.</div>';
}

function updateWaitlistStatus(id, status) {
  const items = readWaitlist();
  const item = items.find(row => row.id === id);
  if (!item) return;
  item.status = status;
  item.updatedAt = new Date().toISOString();
  writeWaitlist(items);
  renderWaitlist();
}

function deleteWaitlist(id) {
  const items = readWaitlist();
  const item = items.find(row => row.id === id);
  if (!item || !confirm(`Remover "${item.name}" da fila de espera?`)) return;
  writeWaitlist(items.filter(row => row.id !== id));
  renderWaitlist();
  showNotice("Cliente removido da fila.");
}

async function loadOverview() {
  const results = await Promise.allSettled([
    api("/api/admin/analytics"),
    api("/api/admin/products"),
    api("/api/admin/catalogs")
  ]);

  if (results[0].status === "fulfilled") {
    analytics = results[0].value;
    const data = analytics || {};
    $("#totalViews").textContent = formatNumber(data.totalViews);
    $("#productViews").textContent = formatNumber(data.productViews);
    $("#uniqueVisitors").textContent = formatNumber(data.uniqueVisitors);
    $("#todayViews").textContent = formatNumber(data.todayViews);
    $("#monthViews").textContent = formatNumber(data.monthViews);
    renderActivity(Array.isArray(data.recent) ? data.recent : []);
  } else {
    ["#totalViews", "#productViews", "#uniqueVisitors", "#todayViews", "#monthViews"]
      .forEach(selector => $(selector).textContent = "—");
    $("#recentActivity").innerHTML = '<div class="empty-state">Estatísticas indisponíveis. Confira a API de eventos.</div>';
  }

  if (results[1].status === "fulfilled") {
    const data = results[1].value;
    products = Array.isArray(data) ? data : (Array.isArray(data.products) ? data.products : []);
    updateProductStats();
    renderRecentProducts();
  } else {
    $("#productCount").textContent = "—";
    $("#lowStock").textContent = "—";
    $("#recentProducts").innerHTML = '<div class="empty-state">Não foi possível carregar os produtos.</div>';
  }

  if (results[2].status === "fulfilled") {
    const data = results[2].value;
    categories = Array.isArray(data) ? data : (Array.isArray(data.catalogs) ? data.catalogs : []);
    $("#categoryCount").textContent = formatNumber(categories.length);
  } else {
    $("#categoryCount").textContent = "—";
  }
}

function renderActivity(events) {
  $("#recentActivity").innerHTML = events.length ? events.slice(0, 12).map(event => `
    <div class="activity-row">
      <span class="activity-icon">◉</span>
      <div><strong>${escapeHTML(event.event_type || "Evento")}</strong>
        <small>${escapeHTML(event.page_path || event.product_id || "Página não informada")}</small></div>
      <time>${escapeHTML(formatDate(event.created_at))}</time>
    </div>`).join("") : '<div class="empty-state">Ainda não há eventos recentes disponíveis.</div>';
}

async function logout() {
  try {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
  } catch (error) {
    console.error(error);
  }
  location.href = "/admin";
}

function bindEvents() {
  $$(".nav-item[data-tab]").forEach(button =>
    button.addEventListener("click", () => switchTab(button.dataset.tab)));

  $$("[data-go]").forEach(button =>
    button.addEventListener("click", () => switchTab(button.dataset.go)));

  $("#refreshBtn").addEventListener("click", () => {
    const active = $(".tab-panel.active")?.id.replace("tab-", "") || "overview";
    if (active === "overview") runSafely(loadOverview);
    if (active === "products") runSafely(loadProducts);
    if (active === "categories") runSafely(loadCategories);
    if (active === "waitlist") renderWaitlist();
    showNotice("Atualização solicitada.");
  });

  $("#menuToggle").addEventListener("click", () => {
    $("#sidebar").classList.toggle("sidebar-open");
    $("#mobileOverlay").classList.toggle("visible");
  });
  $("#mobileOverlay").addEventListener("click", () => {
    $("#sidebar").classList.remove("sidebar-open");
    $("#mobileOverlay").classList.remove("visible");
  });

  document.addEventListener("click", (event) => {
    const sidebar = $("#sidebar");
    const toggle = $("#menuToggle");
    const overlay = $("#mobileOverlay");

    if (!sidebar || !toggle || !overlay) return;
    if (!sidebar.classList.contains("sidebar-open")) return;
    if (event.target.closest("#sidebar") || event.target.closest("#menuToggle")) return;

    sidebar.classList.remove("sidebar-open");
    overlay.classList.remove("visible");
  });

  $("#logoutBtn").addEventListener("click", logout);
  $("#userLogoutBtn").addEventListener("click", logout);

  $("#newProductBtn").addEventListener("click", () => {
    resetProductForm();
    setProductEditor(true);
  });
  $("#closeProductEditor").addEventListener("click", () => setProductEditor(false));
  $("#cancelProductBtn").addEventListener("click", () => {
    setProductEditor(false);
    resetProductForm();
  });
  $("#productForm").addEventListener("submit", event => runSafely(() => saveProduct(event)));
  $("#productSearch").addEventListener("input", renderProducts);
  $("#productFilter").addEventListener("change", renderProducts);

  $("#productGrid").addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-product]");
    const toggle = event.target.closest("[data-toggle-product]");
    const remove = event.target.closest("[data-delete-product]");
    if (edit) editProduct(edit.dataset.editProduct);
    if (toggle) runSafely(() => toggleProduct(toggle.dataset.toggleProduct, toggle.dataset.active === "1"));
    if (remove) runSafely(() => deleteProduct(remove.dataset.deleteProduct));
  });

  $("#newCategoryBtn").addEventListener("click", () => {
    resetCategoryForm();
    setCategoryEditor(true);
  });
  $("#closeCategoryEditor").addEventListener("click", () => setCategoryEditor(false));
  $("#cancelCategoryBtn").addEventListener("click", () => {
    setCategoryEditor(false);
    resetCategoryForm();
  });
  $("#categoryForm").addEventListener("submit", event => runSafely(() => saveCategory(event)));
  $("#categoryGrid").addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-category]");
    const remove = event.target.closest("[data-delete-category]");
    if (edit) editCategory(edit.dataset.editCategory);
    if (remove) runSafely(() => deleteCategory(remove.dataset.deleteCategory));
  });

  $("#newWaitlistBtn").addEventListener("click", () => {
    resetWaitlistForm();
    setWaitlistEditor(true);
  });
  $("#closeWaitlistEditor").addEventListener("click", () => setWaitlistEditor(false));
  $("#cancelWaitlistBtn").addEventListener("click", () => {
    setWaitlistEditor(false);
    resetWaitlistForm();
  });
  $("#waitlistForm").addEventListener("submit", saveWaitlist);
  $("#waitlistSearch").addEventListener("input", renderWaitlist);
  $("#waitlistFilter").addEventListener("change", renderWaitlist);
  $("#waitlistList").addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-wait]");
    const remove = event.target.closest("[data-delete-wait]");
    if (edit) editWaitlist(edit.dataset.editWait);
    if (remove) deleteWaitlist(remove.dataset.deleteWait);
  });
  $("#waitlistList").addEventListener("change", event => {
    const select = event.target.closest("[data-wait-status]");
    if (select) updateWaitlistStatus(select.dataset.waitStatus, select.value);
  });
}

async function init() {
  bindEvents();
  renderWaitlist();

  try {
    const status = await api("/api/admin/status");
    if (!status.configured || !status.authenticated) {
      location.href = "/admin";
      return;
    }
  } catch (error) {
    console.error(error);
    return;
  }

  runSafely(loadOverview);
}

document.addEventListener("DOMContentLoaded", init);
