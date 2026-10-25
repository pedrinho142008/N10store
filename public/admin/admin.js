const $ = (s) => document.querySelector(s);
const money = (n) => Number(n || 0).toLocaleString("pt-BR", {
  style: "currency", currency: "BRL"
});
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const dateFmt = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

let products = [];
let sales = [];

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    location.href = "/admin";
    throw new Error("Sessão encerrada.");
  }

  if (!response.ok) throw new Error(data.error || "Erro na requisição.");
  return data;
}

function toast(message) {
  $("#toast").textContent = message;
  setTimeout(() => $("#toast").textContent = "", 3500);
}

function showTab(id) {
  document.querySelectorAll(".tab").forEach((section) => {
    section.classList.toggle("hidden", section.id !== id);
  });

  document.querySelectorAll(".nav[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === id);
  });

  if (id === "dashboard") loadSummary();
  if (id === "products") loadProducts();
  if (id === "sales") loadSales();
}

document.querySelectorAll(".nav[data-tab]").forEach((button) => {
  button.addEventListener("click", () => showTab(button.dataset.tab));
});

$("#logout").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } finally {
    location.href = "/admin";
  }
});

$("#refresh").addEventListener("click", loadSummary);

async function loadSummary() {
  try {
    const data = await api("/api/admin/summary");

    $("#revenue").textContent = money(data.revenue);
    $("#salesCount").textContent = data.salesCount;
    $("#monthRevenue").textContent = money(data.monthRevenue);
    $("#monthSales").textContent = data.monthSales + " vendas";
    $("#previousMonthSales").textContent = data.previousMonthSales + " vendas";
    $("#lowStock").textContent = data.lowStock;

    const difference = data.monthRevenue - data.previousMonthRevenue;
    $("#monthCompare").textContent =
      (difference >= 0 ? "▲ " : "▼ ") +
      money(Math.abs(difference)) + " vs. mês anterior";

    $("#bestSellers").innerHTML = data.bestSellers.length
      ? data.bestSellers.map((product, index) =>
          `<div class="seller"><span>${index + 1}. ${esc(product.name)}</span><b>${product.qty} un.</b></div>`
        ).join("")
      : "Ainda não existem vendas registradas.";

    $("#reportSummary").textContent =
      `Total: ${money(data.revenue)}. Este mês: ${money(data.monthRevenue)} em ${data.monthSales} vendas. Mês anterior: ${money(data.previousMonthRevenue)} em ${data.previousMonthSales} vendas.`;
  } catch (error) {
    toast(error.message);
  }
}

async function loadProducts() {
  try {
    products = await api("/api/admin/products");
    renderProducts();
  } catch (error) {
    toast(error.message);
  }
}

function renderProducts() {
  const query = ($("#productSearch").value || "").toLowerCase();
  const filtered = products.filter((p) =>
    `${p.id} ${p.name} ${p.category}`.toLowerCase().includes(query)
  );

  $("#productRows").innerHTML = filtered.map((p) => `
    <tr>
      <td><b>${esc(p.name)}</b><br><small>${esc(p.id)}</small></td>
      <td>${esc(p.category)}</td>
      <td>${p.price == null ? "Consultar" : money(p.price)}</td>
      <td>${Number(p.stock || 0)}</td>
      <td>${p.active ? "Ativo" : "Oculto"}</td>
      <td>
        <button class="action" data-edit="${esc(p.id)}">Editar</button>
        <button class="action" data-delete="${esc(p.id)}">Excluir</button>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="6">Nenhum produto encontrado.</td></tr>';

  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.onclick = () => editProduct(button.dataset.edit);
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.onclick = () => deleteProduct(button.dataset.delete);
  });
}

$("#productSearch").addEventListener("input", renderProducts);

$("#newProduct").onclick = () => {
  const form = $("#productForm");
  form.reset();
  form.elements.id.disabled = false;
  form.elements.category.value = "Roupas";
  form.elements.active.checked = true;
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
};

$("#cancelProduct").onclick = () => $("#productForm").classList.add("hidden");

function editProduct(id) {
  const product = products.find((p) => p.id === id);
  if (!product) return;

  const form = $("#productForm");
  form.classList.remove("hidden");

  [
    "id", "name", "category", "price", "original_price",
    "stock", "image", "description"
  ].forEach((key) => {
    form.elements[key].value = product[key] ?? "";
  });

  form.elements.images.value = (product.images || []).join("\n");
  form.elements.sizes.value = (product.sizes || []).join(", ");

  ["promotion", "featured", "active"].forEach((key) => {
    form.elements[key].checked = Boolean(product[key]);
  });

  form.elements.id.disabled = true;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#productForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = new FormData(form);

  const product = {
    id: String(data.get("id") || "").trim(),
    name: String(data.get("name") || "").trim(),
    category: data.get("category"),
    price: data.get("price") === "" ? null : Number(data.get("price")),
    original_price: data.get("original_price") === "" ? null : Number(data.get("original_price")),
    stock: Number(data.get("stock") || 0),
    image: data.get("image"),
    images: String(data.get("images") || "").split("\n").map((x) => x.trim()).filter(Boolean),
    sizes: String(data.get("sizes") || "").split(",").map((x) => x.trim()).filter(Boolean),
    description: data.get("description"),
    promotion: form.elements.promotion.checked,
    featured: form.elements.featured.checked,
    active: form.elements.active.checked
  };

  try {
    await api("/api/admin/products", {
      method: "POST",
      body: JSON.stringify(product)
    });

    $("#productMessage").textContent = "Produto salvo com sucesso.";
    form.classList.add("hidden");
    form.elements.id.disabled = false;
    await loadProducts();
    toast("Produto salvo.");
  } catch (error) {
    $("#productMessage").textContent = error.message;
  }
});

async function deleteProduct(id) {
  if (!confirm(`Excluir o produto ${id}?`)) return;

  try {
    await api("/api/admin/products/" + encodeURIComponent(id), {
      method: "DELETE"
    });
    await loadProducts();
    toast("Produto excluído.");
  } catch (error) {
    toast(error.message);
  }
}

async function loadSales() {
  try {
    sales = await api("/api/admin/sales");

    $("#saleRows").innerHTML = sales.map((sale) => `
      <tr>
        <td>${dateFmt(sale.created_at)}</td>
        <td>${esc(sale.customer || "—")}</td>
        <td>${esc(sale.payment_method)}</td>
        <td>${(sale.items || []).reduce((n, item) => n + Number(item.qty || 1), 0)} un.</td>
        <td>${money(sale.total)}</td>
      </tr>
    `).join("") || '<tr><td colspan="5">Nenhuma venda registrada.</td></tr>';
  } catch (error) {
    toast(error.message);
  }
}

$("#saleForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = new FormData(form);
  let items;

  try {
    items = JSON.parse(data.get("items"));
  } catch {
    $("#saleMessage").textContent = "O campo de itens precisa conter JSON válido.";
    return;
  }

  try {
    await api("/api/admin/sales", {
      method: "POST",
      body: JSON.stringify({
        customer: data.get("customer"),
        payment_method: data.get("payment_method"),
        items,
        total: Number(data.get("total")),
        notes: data.get("notes")
      })
    });

    $("#saleMessage").textContent = "Venda registrada.";
    form.reset();
    await loadSales();
    await loadSummary();
    toast("Venda registrada.");
  } catch (error) {
    $("#saleMessage").textContent = error.message;
  }
});

$("#exportSales").onclick = async () => {
  try {
    const rows = await api("/api/admin/sales");
    const quote = (value) => '"' + String(value ?? "").replace(/"/g, '""') + '"';

    const csv = [
      ["Data", "Cliente", "Pagamento", "Total", "Itens", "Observações"],
      ...rows.map((s) => [
        s.created_at, s.customer, s.payment_method,
        s.total, JSON.stringify(s.items), s.notes
      ])
    ].map((row) => row.map(quote).join(";")).join("\r\n");

    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = "n10store-vendas.csv";
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast(error.message);
  }
};

(async () => {
  try {
    const status = await api("/api/admin/status");
    if (!status.authenticated) {
      location.href = "/admin";
      return;
    }
    await loadSummary();
  } catch {
    location.href = "/admin";
  }
})();
