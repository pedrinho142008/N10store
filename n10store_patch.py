from pathlib import Path
from datetime import datetime
import shutil
import re
import sys

admin = Path("public/admin.html")
api = Path("api/index.js")
html = admin.read_text()
js = api.read_text()

replacements = [
    (
        'app.use(express.json({ limit: "1mb" }));',
        'app.use(express.json({ limit: "8mb" }));',
        "limite JSON da API",
    ),
    (
        '<label>Categoria<input id="pCategory" maxlength="100" placeholder="Ex.: Roupas"></label>',
        '<label>Categoria<select id="pCategory" required><option value="">Selecione uma categoria</option></select></label>',
        "seletor de categoria",
    ),
    (
        '<label class="span-2">Imagem principal (caminho ou URL)<input id="pImage" placeholder="/assets/produtos/foto.jpg"></label>',
        '<label class="span-2">Imagem principal<input id="pImageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"><small>Escolha uma imagem na galeria do celular. Até 5 MB.</small><div id="pImagePreview" class="image-upload-preview"></div><input id="pImage" type="hidden"></label>',
        "seletor da imagem principal",
    ),
    (
        '<label class="span-2">Outras imagens (uma URL por linha)<textarea id="pImages" placeholder="/assets/produtos/foto2.jpg"></textarea></label>',
        '<label class="span-2">Fotos adicionais<input id="pImagesFiles" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple><small>Você pode selecionar várias fotos, até 5 MB cada.</small><div id="pImagesPreview" class="image-upload-preview"></div><textarea id="pImages" hidden></textarea></label>',
        "seletor de fotos adicionais",
    ),
]

for old, new, label in replacements:
    count = html.count(old) if label != "limite JSON da API" else js.count(old)
    if count != 1:
        print(f"ERRO: trecho de '{label}' encontrado {count} vez(es).")
        print("Nenhuma alteração foi aplicada.")
        sys.exit(1)

start = js.find('app.get("/api/admin/products"')
if start < 0 or 'app.post("/api/admin/products"' not in js:
    print("ERRO: não encontrei o ponto seguro para inserir a rota de upload.")
    sys.exit(1)

if 'app.post("/api/admin/upload-image"' in js:
    print("ERRO: a rota de upload já existe; não vou duplicá-la.")
    sys.exit(1)

if 'async function saveProduct(e)' not in html or 'function openProduct()' not in html:
    print("ERRO: não encontrei as funções do formulário.")
    sys.exit(1)

# Preparar tudo em memória antes de criar backups ou gravar.
new_html = html
new_js = js
for old, new, label in replacements:
    if label == "limite JSON da API":
        new_js = new_js.replace(old, new, 1)
    else:
        new_html = new_html.replace(old, new, 1)

css_marker = '</style>'
css = """
.image-upload-preview{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
.image-upload-preview img{width:88px;height:88px;object-fit:cover;border-radius:12px;border:1px solid var(--border,#e6ddd5)}
.image-upload-preview .preview-note{font-size:12px;color:var(--muted,#81766d)}
"""
if css_marker not in new_html:
    print("ERRO: não encontrei o fechamento do CSS.")
    sys.exit(1)
new_html = new_html.replace(css_marker, css + "\n" + css_marker, 1)

helpers = r'''
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
'''

new_marker = 'function openProduct(){'
if new_html.count(new_marker) != 1:
    print("ERRO: ponto de inserção das funções do formulário não é único.")
    sys.exit(1)
new_html = new_html.replace(new_marker, helpers + "\n" + new_marker, 1)

new_open = r'''function openProduct(){
  state.editingId=null;$("productForm").reset();$("pStock").value="1";$("pActive").checked=true;
  $("pImage").value="";$("pImages").value="";
  populateProductCategories("");
  previewProductFiles("pImageFile","pImagePreview");
  previewProductFiles("pImagesFiles","pImagesPreview");
  $("productModalTitle").textContent="Adicionar produto";$("productFormMessage").textContent="";
  $("productModal").classList.add("open");
}'''
new_edit = r'''function editProduct(id){
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
}'''
new_save = r'''async function saveProduct(e){
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
}'''

def replace_function(source, start_marker, next_marker, replacement, label):
    start = source.find(start_marker)
    end = source.find(next_marker, start + len(start_marker))
    if start < 0 or end < 0:
        print(f"ERRO: não consegui delimitar a função {label}.")
        sys.exit(1)
    return source[:start] + replacement + "\n" + source[end:]

new_html = replace_function(new_html, "function openProduct(){", "function editProduct(id){", new_open, "openProduct")
new_html = replace_function(new_html, "function editProduct(id){", "async function saveProduct(e){", new_edit, "editProduct")
new_html = replace_function(new_html, "async function saveProduct(e){", "async function toggleAvailability(id){", new_save, "saveProduct")

listeners = r'''
$("pImageFile").addEventListener("change",()=>previewProductFiles("pImageFile","pImagePreview"));
$("pImagesFiles").addEventListener("change",()=>previewProductFiles("pImagesFiles","pImagesPreview"));
'''
listener_marker = '$("productForm").addEventListener("submit",saveProduct);'
if new_html.count(listener_marker) != 1:
    print("ERRO: não encontrei o registro do formulário.")
    sys.exit(1)
new_html = new_html.replace(listener_marker, listener_marker + "\n" + listeners, 1)

upload_route = r'''
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

'''
new_js = new_js.replace('app.get("/api/admin/products"', upload_route + 'app.get("/api/admin/products"', 1)

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup_admin = admin.with_name(admin.name + ".backup-upload-" + stamp)
backup_api = api.with_name(api.name + ".backup-upload-" + stamp)
shutil.copy2(admin, backup_admin)
shutil.copy2(api, backup_api)
admin.write_text(new_html)
api.write_text(new_js)
print("Patch aplicado.")
print("Backups:", backup_admin, backup_api)
