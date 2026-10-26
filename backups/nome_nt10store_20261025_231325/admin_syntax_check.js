
(() => {
"use strict";
const $ = id => document.getElementById(id);
const state = { products: [], categories: [], brands: [], editingId: null, wait: [], activePage: "overview" };
const WAIT_KEY = "n10store_admin_waitlist_v1";
const money = value => Number.isFinite(Number(value)) && value !== null && value !== ""
  ? Number(value).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "Preço não informado";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const slug = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
function toast(message){
  const el=$("toast"); el.textContent=message; el.style.display="block";
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.style.display="none",2800);
}
async function api(url, options={}){
  const response=await fetch(url,{
    credentials:"same-origin",
    ...options,
    headers:{"Content-Type":"application/json",...(options.headers||{})}
  });
  const raw=await response.text();
  let data=null;
  try{data=raw?JSON.parse(raw):null}catch{data=raw}
  if(response.status===401){
    if(url.includes("/api/admin/login")){
      throw new Error(data?.error || "Usuário ou senha incorretos.");
    }
    $("app").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
    throw new Error("Sua sessão expirou. Entre novamente.");
  }
  if(!response.ok)throw new Error(data?.error||data?.message||`Erro HTTP ${response.status}`);
  return data;
}
function setPage(page){
  state.activePage=page;
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));
  $("sidebar").classList.remove("open");
  const titles={overview:"Visão geral",products:"Produtos",categories:"Categorias",waitlist:"Fila de espera",users:"Usuários"};
  $("topSubtitle").textContent=titles[page]||"Painel administrativo";
  if(page==="products")renderProducts();
  if(page==="categories")loadCategories();
  if(page==="waitlist")renderWait();
}
function readWait(){
  try{const data=JSON.parse(localStorage.getItem(WAIT_KEY)||"[]");return Array.isArray(data)?data:[]}catch{return []}
}
function saveWait(){localStorage.setItem(WAIT_KEY,JSON.stringify(state.wait))}
function productName(id){return state.products.find(p=>String(p.id)===String(id))?.name||"Produto não informado"}
function isAvailable(p){return p.active!==false && Number(p.stock??0)>0}
function productImage(p){return p.image||p.images?.[0]||""}
function renderRecent(){
  const el=$("recentProducts");
  if(!state.products.length){el.innerHTML='<div class="empty">Nenhum produto cadastrado ainda.</div>';return}
  el.innerHTML=state.products.slice(0,5).map(p=>`
    <div class="product-row">
      ${productImage(p)?`<img src="${esc(productImage(p))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:'<div class="product-thumb"></div>'}
      <div class="product-info"><strong>${esc(p.name)}</strong><p>${esc(p.category||"Sem categoria")}</p></div>
      <div class="product-price">${money(p.price)}</div>
      <button class="ghost" data-edit="${esc(p.id)}">Editar</button>
    </div>`).join("");
  el.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editProduct(b.dataset.edit));
}
function renderOverview(){
  state.wait=readWait();
  $("statProducts").textContent=state.products.length;
  $("statWaiting").textContent=state.wait.filter(x=>x.status==="Aguardando").length;
  $("statCustomers").textContent=state.wait.length;
  const activeValue=state.wait.filter(x=>x.status!=="Atendido").reduce((sum,x)=>sum+Number(x.orderValue||0),0);
  $("statOrders").textContent=money(activeValue);
  renderRecent();
}
function renderProducts(){
  const query=$("productSearch").value.trim().toLocaleLowerCase("pt-BR");
  const filter=$("productFilter").value;
  const brandFilter=$("productBrandFilter").value;
  const list=state.products.filter(p=>{
    const matches=[p.name,p.category,p.brand,p.description].join(" ").toLocaleLowerCase("pt-BR").includes(query);
    const matchesBrand=brandFilter==="all"||String(p.brand||"")===brandFilter;
    if(filter==="available")return matches&&matchesBrand&&isAvailable(p);
    if(filter==="unavailable")return matches&&matchesBrand&&!isAvailable(p);
    if(filter==="promotion")return matches&&matchesBrand&&p.promotion===true;
    return matches&&matchesBrand;
  });
  $("productCount").textContent=`${list.length} produto(s)`;
  const grid=$("productGrid");
  if(!list.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="empty-icon"></div>Nenhum produto encontrado.</div>';return}
  grid.innerHTML=list.map(p=>{
    const available=isAvailable(p), image=productImage(p);
    return `<article class="card product-card">
      ${image?`<img class="photo" src="${esc(image)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none'">`:'<div class="photo" style="display:grid;place-items:center;font-size:35px"></div>'}
      <div class="product-body">
        <div class="row"><span class="pill ${available?"":"off"}">${available?"Disponível":"Indisponível"}</span>${p.promotion?'<span class="pill promo">Promoção</span>':""}</div>
        <h3>${esc(p.name)}</h3><p class="muted small">${esc(p.category||"Sem categoria")}${p.brand?" · "+esc(p.brand):""}</p>
        <div class="price-line"><strong>${money(p.price)}</strong>${p.original_price?`<del class="muted small">${money(p.original_price)}</del>`:""}</div>
        <p class="muted small">Estoque: ${Number(p.stock||0)}</p>
        <div class="actions"><button class="secondary" data-edit="${esc(p.id)}">Editar</button><button class="ghost" data-stock="${esc(p.id)}">${available?"Indisponibilizar":"Disponibilizar"}</button></div>
      </div></article>`;
  }).join("");
  grid.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editProduct(b.dataset.edit));
  grid.querySelectorAll("[data-stock]").forEach(b=>b.onclick=()=>toggleAvailability(b.dataset.stock));
}

function fillBrandSelects(){
  const productSelect=$("pBrand");
  const filterSelect=$("productBrandFilter");
  if(productSelect){
    const selected=productSelect.value;
    productSelect.innerHTML='<option value="">Sem marca</option>'+
      state.brands.filter(b=>b.active!==false).map(b=>
        `<option value="${esc(b.name)}">${esc(b.name)}</option>`
      ).join("");
    productSelect.value=selected;
  }
  if(filterSelect){
    const selected=filterSelect.value||"all";
    filterSelect.innerHTML='<option value="all">Todas as marcas</option>'+
      state.brands.map(b=>
        `<option value="${esc(b.name)}">${esc(b.name)}${b.active===false?" (oculta)":""}</option>`
      ).join("");
    filterSelect.value=[...filterSelect.options].some(o=>o.value===selected)?selected:"all";
  }
}

async function loadBrands(){
  try{
    const data=await api("/api/admin/brands");
    state.brands=Array.isArray(data)?data:[];
    renderBrands();
    fillBrandSelects();
  }catch(e){
    const el=$("brandList");
    if(el)el.innerHTML=`<div class="empty">${esc(e.message)}</div>`;
  }
}

function renderBrands(){
  const el=$("brandList");
  if(!el)return;
  if(!state.brands.length){
    el.innerHTML='<div class="empty">Nenhuma marca cadastrada. Adicione a primeira acima.</div>';
    return;
  }
  el.innerHTML=state.brands.map(b=>{
    const count=state.products.filter(p=>String(p.brand||"")===String(b.name)).length;
    return `<div class="category-row">
      <div class="category-symbol">◇</div>
      <div class="category-name"><strong>${esc(b.name)}</strong>
        <span>${count} produto(s) · ${b.active===false?"Oculta":"Ativa"}</span>
      </div>
      <button class="secondary" data-brand-rename="${esc(b.id)}">Renomear</button>
      <button class="ghost" data-brand-toggle="${esc(b.id)}">${b.active===false?"Ativar":"Ocultar"}</button>
      <button class="danger" data-brand-delete="${esc(b.id)}">Excluir</button>
    </div>`;
  }).join("");

  el.querySelectorAll("[data-brand-rename]").forEach(btn=>{
    btn.onclick=async()=>{
      const b=state.brands.find(x=>String(x.id)===btn.dataset.brandRename);
      if(!b)return;
      const name=prompt("Novo nome da marca:",b.name);
      if(name===null)return;
      const clean=name.trim();
      if(!clean)return toast("Informe o nome da marca.");
      try{
        await api("/api/admin/brands",{method:"POST",body:JSON.stringify({...b,name:clean})});
        // Atualiza a marca dos produtos que usavam o nome anterior.
        for(const product of state.products){
          if(String(product.brand||"")===String(b.name)){
            await api("/api/admin/products",{method:"POST",body:JSON.stringify({...product,brand:clean})});
          }
        }
        await loadProducts();await loadBrands();
        toast("Marca renomeada.");
      }catch(e){toast(e.message)}
    };
  });

  el.querySelectorAll("[data-brand-toggle]").forEach(btn=>{
    btn.onclick=async()=>{
      const b=state.brands.find(x=>String(x.id)===btn.dataset.brandToggle);
      if(!b)return;
      try{
        await api("/api/admin/brands",{method:"POST",body:JSON.stringify({...b,active:b.active===false})});
        await loadBrands();toast("Marca atualizada.");
      }catch(e){toast(e.message)}
    };
  });

  el.querySelectorAll("[data-brand-delete]").forEach(btn=>{
    btn.onclick=async()=>{
      const b=state.brands.find(x=>String(x.id)===btn.dataset.brandDelete);
      if(!b)return;
      if(state.products.some(p=>String(p.brand||"")===String(b.name))){
        return toast("Associe outra marca ou remova a marca dos produtos antes de excluir.");
      }
      if(!confirm(`Excluir a marca "${b.name}"?`))return;
      try{
        await api("/api/admin/brands/"+encodeURIComponent(b.id),{method:"DELETE"});
        await loadBrands();toast("Marca excluída.");
      }catch(e){toast(e.message)}
    };
  });
}

async function addBrand(e){
  e.preventDefault();
  const name=$("brandName").value.trim();
  if(!name)return;
  try{
    const id=slug(name);
    if(state.brands.some(b=>String(b.name).toLocaleLowerCase("pt-BR")===name.toLocaleLowerCase("pt-BR"))){
      return toast("Essa marca já está cadastrada.");
    }
    await api("/api/admin/brands",{method:"POST",body:JSON.stringify({
      id,name,active:true,sort_order:state.brands.length
    })});
    $("brandForm").reset();
    await loadBrands();
    toast("Marca cadastrada.");
  }catch(e){toast(e.message)}
}

async function loadProducts(){
  try{
    const data=await api("/api/admin/products");
    state.products=Array.isArray(data)?data:(data?.products||[]);
    renderProducts();renderOverview();fillCustomerProducts();
  }catch(e){toast(e.message);$("productGrid").innerHTML=`<div class="empty" style="grid-column:1/-1">${esc(e.message)}</div>`}
}

function populateProductCategories(currentValue=""){
  const select=$("pCategory");
  const current=String(currentValue||"").trim();
  const cats=(state.categories||[]).filter(c=>c.active!==false);
  const values=cats.map(c=>String(c.name||"").trim()).filter(Boolean);
  if(current&&!values.some(v=>v.toLowerCase()===current.toLowerCase()))values.push(current);
  select.innerHTML='<option value="">Selecione uma categoria</option>'+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  select.value=values.find(v=>v.toLowerCase()===current.toLowerCase())||"";
}
function previewProductFiles(inputId,previewId){
  const input=$(inputId),preview=$(previewId);
  if(!input||!preview)return;
  preview.replaceChildren();
  const files=Array.from(input.files||[]);
  if(!files.length){preview.innerHTML='<span class="preview-note">Nenhuma nova imagem selecionada.</span>';return}
  files.forEach(file=>{
    if(!file.type.startsWith("image/"))return;
    const img=document.createElement("img");
    img.alt=file.name;
    img.src=URL.createObjectURL(file);
    preview.appendChild(img);
  });
}
async function uploadProductImage(file){
  if(!file)return null;
  const allowed=["image/jpeg","image/png","image/webp","image/gif","image/avif"];
  if(!allowed.includes(file.type))throw new Error("Formato não permitido: "+file.name);
  if(file.size>5*1024*1024)throw new Error("A imagem "+file.name+" ultrapassa 5 MB.");
  const data=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("Não foi possível ler "+file.name));
    reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");
    reader.readAsDataURL(file);
  });
  const result=await api("/api/admin/upload-image",{method:"POST",body:JSON.stringify({filename:file.name,contentType:file.type,data})});
  if(!result.image)throw new Error("O servidor não retornou a URL da imagem.");
  return result.image;
}

function openProduct(){
  state.editingId=null;$("productForm").reset();$("pStock").value="1";$("pActive").checked=true;
  $("pImage").value="";$("pImages").value="";
  populateProductCategories("");
  previewProductFiles("pImageFile","pImagePreview");
  previewProductFiles("pImagesFiles","pImagesPreview");
  $("productModalTitle").textContent="Adicionar produto";$("productFormMessage").textContent="";
  $("productModal").classList.add("open");
}
function editProduct(id){
  const p=state.products.find(x=>String(x.id)===String(id));if(!p)return;
  state.editingId=p.id;
  $("productForm").reset();
  $("pName").value=p.name||"";populateProductCategories(p.category||"");
  $("pPrice").value=p.price??"";$("pOriginalPrice").value=p.original_price??"";
  $("pStock").value=p.stock??0;$("pImage").value=p.image||"";
  $("pBrand").value=p.brand||"";
  $("pImages").value=Array.isArray(p.images)?p.images.join("\n"):"";
  $("pDescription").value=p.description||"";
  $("pSizes").value=Array.isArray(p.sizes)?p.sizes.join(", "):"";
  $("pPromotion").checked=!!p.promotion;$("pFeatured").checked=!!p.featured;$("pActive").checked=p.active!==false;
  previewProductFiles("pImageFile","pImagePreview");
  previewProductFiles("pImagesFiles","pImagesPreview");
  $("productModalTitle").textContent="Editar produto";
  $("productFormMessage").textContent="";
  $("productModal").classList.add("open");
}
async function saveProduct(e){
  e.preventDefault();
  const button=$("saveProduct");button.disabled=true;
  $("productFormMessage").textContent="Preparando imagens e salvando produto…";
  try{
    const name=$("pName").value.trim();
    const category=$("pCategory").value.trim();
    const price=$("pPrice").value===""?null:Number($("pPrice").value);
    const original=$("pOriginalPrice").value===""?null:Number($("pOriginalPrice").value);
    const stock=Number($("pStock").value);
    if(!name)throw new Error("Informe o nome do produto.");
    if(!category)throw new Error("Selecione uma categoria cadastrada.");
    if(price!==null&&(!Number.isFinite(price)||price<0))throw new Error("Preço inválido.");
    if(original!==null&&(!Number.isFinite(original)||original<0))throw new Error("Preço original inválido.");
    if(!Number.isInteger(stock)||stock<0)throw new Error("O estoque deve ser um inteiro igual ou maior que zero.");

    const existing=state.products.find(p=>String(p.id)===String(state.editingId));
    let image=existing?.image||$("pImage").value.trim();
    let images=Array.isArray(existing?.images)?[...existing.images]:$("pImages").value.split("\n").map(x=>x.trim()).filter(Boolean);
    const mainFile=$("pImageFile").files?.[0];
    const extraFiles=Array.from($("pImagesFiles").files||[]);
    if(mainFile){
      $("productFormMessage").textContent="Enviando imagem principal…";
      image=await uploadProductImage(mainFile);
    }
    for(let i=0;i<extraFiles.length;i++){
      $("productFormMessage").textContent=`Enviando foto adicional ${i+1} de ${extraFiles.length}…`;
      images.push(await uploadProductImage(extraFiles[i]));
    }
    images=[...new Set(images.filter(Boolean))];
    if(!image&&images.length)image=images[0];

    const id=state.editingId||slug(name)+"-"+Date.now().toString(36);
    const body={
      id,name,category,brand:$("pBrand").value,price,original_price:original,
      stock,image,images,
      sizes:$("pSizes").value.split(",").map(x=>x.trim()).filter(Boolean),
      description:$("pDescription").value.trim(),
      promotion:$("pPromotion").checked,
      featured:$("pFeatured").checked,
      active:$("pActive").checked
    };
    $("productFormMessage").textContent="Salvando produto…";
    await api("/api/admin/products",{method:"POST",body:JSON.stringify(body)});
    $("productModal").classList.remove("open");toast("Produto salvo com sucesso.");
    await loadProducts();
  }catch(err){$("productFormMessage").textContent=err.message;toast(err.message)}
  finally{button.disabled=false}
}
async function toggleAvailability(id){
  const p=state.products.find(x=>String(x.id)===String(id));if(!p)return;
  try{
    await api("/api/admin/products",{method:"POST",body:JSON.stringify({...p,active:!isAvailable(p),stock:Number(p.stock||0)})});
    toast("Disponibilidade atualizada.");await loadProducts();
  }catch(e){toast(e.message)}
}
async function loadCategories(){
  try{
    state.categories=await api("/api/admin/catalogs");
    if(!Array.isArray(state.categories))state.categories=[];
    renderCategories();
  }catch(e){
    $("categoryList").innerHTML=`<div class="empty">${esc(e.message)}<br><span class="small">Confira se a API de catálogos está disponível.</span></div>`;
  }
}
function renderCategories(){
  const el=$("categoryList");
  if(!state.categories.length){el.innerHTML='<div class="empty">Nenhuma categoria cadastrada.<br>Adicione sua primeira categoria acima.</div>';return}
  el.innerHTML=state.categories.map(c=>{
    const count=state.products.filter(p=>String(p.category||"").toLowerCase()===String(c.name||"").toLowerCase()).length;
    return `<div class="category-row"><div class="category-symbol">◇</div><div class="category-name"><strong>${esc(c.name)}</strong><span>${count} produto(s) vinculado(s) · ${c.active===false?"Oculta":"Ativa"}</span></div><button class="secondary" data-rename="${esc(c.id)}">Renomear</button><button class="ghost" data-cat-toggle="${esc(c.id)}">${c.active===false?"Ativar":"Ocultar"}</button></div>`;
  }).join("");
  el.querySelectorAll("[data-rename]").forEach(b=>b.onclick=()=>renameCategory(b.dataset.rename));
  el.querySelectorAll("[data-cat-toggle]").forEach(b=>b.onclick=()=>toggleCategory(b.dataset.catToggle));
}
async function addCategory(e){
  e.preventDefault();const name=$("categoryName").value.trim();if(!name)return;
  try{
    const id=slug(name);
    await api("/api/admin/catalogs",{method:"POST",body:JSON.stringify({id,name,slug:id,active:true,sort_order:state.categories.length})});
    $("categoryForm").reset();toast("Categoria adicionada.");await loadCategories();
  }catch(err){toast(err.message)}
}
async function renameCategory(id){
  const c=state.categories.find(x=>String(x.id)===String(id));if(!c)return;
  const name=prompt("Novo nome da categoria:",c.name);if(name===null)return;
  const clean=name.trim();if(!clean)return toast("Informe um nome.");
  try{
    await api("/api/admin/catalogs",{method:"POST",body:JSON.stringify({...c,name:clean,slug:slug(clean)})});
    // Atualiza também a categoria dos produtos associados por nome.
    const linked=state.products.filter(p=>(p.category||"").toLowerCase()===c.name.toLowerCase());
    for(const p of linked)await api("/api/admin/products",{method:"POST",body:JSON.stringify({...p,category:clean})});
    toast("Categoria renomeada.");await loadProducts();await loadCategories();
  }catch(e){toast(e.message)}
}
async function toggleCategory(id){
  const c=state.categories.find(x=>String(x.id)===String(id));if(!c)return;
  try{
    await api("/api/admin/catalogs",{method:"POST",body:JSON.stringify({...c,active:c.active===false})});
    await loadCategories();toast("Categoria atualizada.");
  }catch(e){toast(e.message)}
}
function fillCustomerProducts(){
  const select=$("cProduct"),old=select.value;
  select.innerHTML='<option value="">Selecione um produto (opcional)</option>'+state.products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  select.value=old;
}
function openCustomer(){
  $("customerForm").reset();fillCustomerProducts();$("customerModal").classList.add("open");
}
function renderWait(){
  state.wait=readWait();
  const all=state.wait;
  $("waitTotal").textContent=all.length;
  $("waitPending").textContent=all.filter(x=>x.status==="Aguardando").length;
  $("waitNotified").textContent=all.filter(x=>x.status==="Cliente avisado").length;
  $("waitDone").textContent=all.filter(x=>x.status==="Atendido").length;
  $("statWaiting").textContent=all.filter(x=>x.status==="Aguardando").length;
  $("statCustomers").textContent=all.length;
  const query=$("waitSearch").value.trim().toLocaleLowerCase("pt-BR");
  const list=all.filter(x=>(x.name+" "+x.phone+" "+productName(x.productId)).toLocaleLowerCase("pt-BR").includes(query));
  const el=$("waitList");
  if(!list.length){
    el.innerHTML=`<div class="empty"><div class="empty-icon"></div>${all.length?"Nenhum cliente encontrado.":"A fila de espera está vazia."}<br><button class="primary" id="addFirstCustomer" style="margin-top:15px">Adicionar ${all.length?"cliente":"primeiro cliente"}</button></div>`;
    $("addFirstCustomer").onclick=openCustomer;return;
  }
  el.innerHTML='<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Produto</th><th>Contato</th><th>Status</th><th>Ação</th></tr></thead><tbody>'+list.map(x=>`<tr><td><strong>${esc(x.name)}</strong><div class="muted small">${esc(x.notes||"")}</div></td><td>${esc(productName(x.productId))}</td><td>${esc(x.phone||"—")}</td><td><select class="status-select" data-status="${esc(x.id)}"><option ${x.status==="Aguardando"?"selected":""}>Aguardando</option><option ${x.status==="Cliente avisado"?"selected":""}>Cliente avisado</option><option ${x.status==="Atendido"?"selected":""}>Atendido</option></select></td><td><button class="danger" data-remove="${esc(x.id)}">Excluir</button></td></tr>`).join("")+'</tbody></table></div>';
  el.querySelectorAll("[data-status]").forEach(s=>s.onchange=()=>{const x=state.wait.find(a=>a.id===s.dataset.status);if(x){x.status=s.value;saveWait();renderWait();renderOverview();toast("Status atualizado.")}});
  el.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{if(!confirm("Excluir este registro da fila?"))return;state.wait=state.wait.filter(x=>x.id!==b.dataset.remove);saveWait();renderWait();renderOverview();toast("Registro excluído.")});
}
function saveCustomer(e){
  e.preventDefault();
  const name=$("cName").value.trim();if(!name)return;
  state.wait=readWait();
  state.wait.unshift({
    id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),
    name,phone:$("cPhone").value.trim(),productId:$("cProduct").value,
    notes:$("cNotes").value.trim(),status:$("cStatus").value,
    createdAt:new Date().toISOString()
  });
  saveWait();$("customerModal").classList.remove("open");
  renderWait();renderOverview();toast("Cliente adicionado à fila ");
}
async function checkSession(){
  try{
    const data=await api("/api/admin/status");
    if(data?.authenticated){
      $("loginScreen").classList.add("hidden");$("app").classList.remove("hidden");
      await loadProducts();await loadCategories();await loadBrands();renderWait();renderOverview();return true;
    }
  }catch(e){}
  $("app").classList.add("hidden");$("loginScreen").classList.remove("hidden");return false;
}
$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();$("loginButton").disabled=true;$("loginError").textContent="";
  try{
    await api("/api/admin/login",{method:"POST",body:JSON.stringify({
      username:$("username").value.trim(),password:$("password").value
    })});
    $("password").value="";
    await checkSession();
    if(!$("app").classList.contains("hidden"))toast("Bem-vindo ao painel N10STORE ");
  }catch(err){$("loginError").textContent=err.message}
  finally{$("loginButton").disabled=false}
});
$("logoutButton").onclick=async()=>{
  try{await api("/api/admin/logout",{method:"POST",body:"{}"})}catch(e){}
  $("app").classList.add("hidden");$("loginScreen").classList.remove("hidden");toast("Sessão encerrada.");
};
document.querySelectorAll(".nav button").forEach(b=>b.onclick=()=>setPage(b.dataset.page));
document.querySelectorAll("[data-goto]").forEach(b=>b.onclick=()=>setPage(b.dataset.goto));
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).classList.remove("open"));
$("menuButton").onclick=(event)=>{
  event.stopPropagation();
  $("sidebar").classList.toggle("open");
};

document.addEventListener("click",(event)=>{
  const sidebar=$("sidebar");
  const button=$("menuButton");

  if(!sidebar || !button || !sidebar.classList.contains("open")) return;
  if(sidebar.contains(event.target) || button.contains(event.target)) return;

  sidebar.classList.remove("open");
});
$("newProduct").onclick=$("newProductTop").onclick=openProduct;
$("productForm").addEventListener("submit",saveProduct);

$("pImageFile").addEventListener("change",()=>previewProductFiles("pImageFile","pImagePreview"));
$("pImagesFiles").addEventListener("change",()=>previewProductFiles("pImagesFiles","pImagesPreview"));

$("categoryForm").addEventListener("submit",addCategory);
$("brandForm").addEventListener("submit",addBrand);
$("productBrandFilter").addEventListener("change",renderProducts);
$("addCustomer").onclick=openCustomer;
$("customerForm").addEventListener("submit",saveCustomer);
$("productSearch").addEventListener("input",renderProducts);
$("productFilter").addEventListener("change",renderProducts);
$("waitSearch").addEventListener("input",renderWait);
$("refreshSession").onclick=async()=>{if(await checkSession())toast("Sessão administrativa ativa.")};
$("addFirstCustomer").onclick=openCustomer;
checkSession();
})();
