from pathlib import Path
from datetime import datetime
import shutil
import subprocess
import sys

root = Path.cwd()
admin = root / "public/admin.html"
app = root / "public/js/app.js"
css = root / "public/css/style.css"

a, j, c = admin.read_text(), app.read_text(), css.read_text()

# Validar todos os pontos antes de modificar arquivos.
checks = [
    (a, 'function updatePromotionFields(){'),
    (a, '<label id="pOriginalPriceLabel" hidden>'),
    (j, "    const tag = document.createElement('span');"),
    (j, "    price.textContent = productPrice(product);"),
    (j, "    info.append(category, name, description, price, actions);"),
]
for source, needle in checks:
    if needle not in source:
        sys.exit("ERRO: estrutura diferente da esperada. Nenhum arquivo foi alterado.")

if "n10PromoPreview" in a or "n10-home-promo-badge" in j or "N10_PROMO_STYLES" in c:
    sys.exit("Já existem alterações promocionais. Nenhum arquivo foi alterado.")

# Mini card abaixo do preço original.
old_label = '<label id="pOriginalPriceLabel" hidden>Preço original (R$)<input id="pOriginalPrice" type="number" min="0" step="0.01" placeholder="Opcional"></label>'
new_label = old_label + '''
      <div class="span-2 n10-promo-preview" id="n10PromoPreview" hidden>
        <span class="n10-promo-kicker">PRÉVIA DA PROMOÇÃO</span>
        <div class="n10-promo-values">
          <del id="n10PromoOldPrice"></del>
          <strong id="n10PromoNewPrice"></strong>
          <span id="n10PromoDiscount" class="n10-promo-discount"></span>
        </div>
        <small id="n10PromoHint"></small>
      </div>'''
a = a.replace(old_label, new_label, 1)

# Prévia automática e validação de preço.
start = a.index('function updatePromotionFields(){')
end = a.index('\n\nfunction openProduct(){', start)
func = '''function updatePromotionFields(){
  const editing = !!state.editingId;
  const promotion = editing && $("pPromotion").checked;
  $("pPromotionLabel").hidden = !editing;
  $("pOriginalPriceLabel").hidden = !promotion;

  const preview = $("n10PromoPreview");
  if (!preview) return;
  preview.hidden = !promotion;
  if (!promotion) return;

  const currentText = $("pPrice").value;
  const originalText = $("pOriginalPrice").value;
  const current = Number(currentText);
  const original = Number(originalText);
  const valid = currentText !== "" && originalText !== "" &&
    Number.isFinite(current) && Number.isFinite(original) &&
    original > 0 && current >= 0 && current < original;

  $("n10PromoOldPrice").textContent =
    originalText !== "" && Number.isFinite(original) ? money(original) : "Preço original";
  $("n10PromoNewPrice").textContent =
    currentText !== "" && Number.isFinite(current) ? money(current) : "Preço promocional";

  if (valid) {
    const discount = Math.round((original - current) / original * 100);
    $("n10PromoDiscount").textContent = discount + "% OFF";
    $("n10PromoHint").textContent = "Economia de " + money(original - current);
    preview.classList.remove("is-invalid");
  } else {
    $("n10PromoDiscount").textContent = "—";
    $("n10PromoHint").textContent = "O preço promocional deve ser menor que o original.";
    preview.classList.add("is-invalid");
  }
}

$("pPromotion").addEventListener("change", updatePromotionFields);
$("pPrice").addEventListener("input", updatePromotionFields);
$("pOriginalPrice").addEventListener("input", updatePromotionFields);'''
a = a[:start] + func + a[end:]

# Marca promoção e calcula desconto na vitrine.
tag_old = '''    const tag = document.createElement('span');
    tag.className = 'product-tag';
    tag.textContent = product.featured ? 'Destaque' : (product.brand || 'N10STORE');'''
tag_new = '''    const tag = document.createElement('span');
    tag.className = 'product-tag';

    const promoOld = Number(product.original_price);
    const promoPrice = Number(product.price);
    const promoValid = !!product.promotion &&
      product.original_price !== null && product.original_price !== undefined &&
      product.original_price !== "" &&
      Number.isFinite(promoOld) && Number.isFinite(promoPrice) &&
      promoOld > 0 && promoPrice >= 0 && promoPrice < promoOld;

    if (promoValid) {
      const discount = Math.round((promoOld - promoPrice) / promoOld * 100);
      tag.classList.add('n10-home-promo-badge');
      tag.textContent = `PROMOÇÃO · ${discount}% OFF`;
      card.classList.add('n10-home-promo');
    } else {
      tag.textContent = product.featured ? 'Destaque' : (product.brand || 'N10STORE');
    }'''
j = j.replace(tag_old, tag_new, 1)

# Preço atual + preço antigo riscado dentro do card.
price_old = '''    price.textContent = productPrice(product);

    const actions = document.createElement('div');'''
price_new = '''    price.textContent = productPrice(product);

    let priceContent = price;
    if (promoValid) {
      price.classList.add('n10-promo-current-price');
      const oldPrice = document.createElement('del');
      oldPrice.className = 'n10-promo-old-price';
      oldPrice.textContent = money(promoOld);

      priceContent = document.createElement('div');
      priceContent.className = 'n10-promo-price-wrap';
      priceContent.append(price, oldPrice);
    }

    const actions = document.createElement('div');'''
j = j.replace(price_old, price_new, 1)
j = j.replace(
    '    info.append(category, name, description, price, actions);',
    '    info.append(category, name, description, priceContent, actions);',
    1
)

# Estilos isolados para o painel e para a vitrine.
c += '''

/* N10_PROMO_STYLES */
.n10-promo-preview[hidden] { display: none !important; }
#productModal .n10-promo-preview {
  box-sizing: border-box; padding: 15px; border-radius: 16px;
  border: 1px solid #ead7b4;
  background: linear-gradient(135deg, #fffaf0, #f7edda);
  color: #49351e;
}
.n10-promo-kicker {
  display: block; margin-bottom: 10px; font-size: 10px;
  font-weight: 800; letter-spacing: 1px;
}
.n10-promo-values {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px;
}
.n10-promo-values del, .n10-promo-old-price {
  color: #887d70; font-size: 12px;
}
.n10-promo-values strong {
  color: #8c3f35; font-size: 20px; font-weight: 800;
}
.n10-promo-discount {
  display: inline-block; padding: 5px 9px; border-radius: 20px;
  background: #8c3f35; color: #fff; font-size: 10px; font-weight: 800;
}
.n10-promo-preview small {
  display: block; margin-top: 9px; color: #76634d; font-size: 11px;
}
.n10-promo-preview.is-invalid { border-color: #e7c9c1; background: #fff7f4; }
.product-image .n10-home-promo-badge {
  background: #8c3f35; color: white; font-weight: 800;
  letter-spacing: .3px; box-shadow: 0 3px 12px #0002;
}
.product-card.n10-home-promo { border-color: #dfc29a; }
.n10-promo-price-wrap {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px;
  margin-bottom: 10px;
}
.n10-promo-price-wrap .price,
.n10-promo-price-wrap .n10-promo-current-price {
  margin: 0; color: #8c3f35; font-weight: 800;
}
.n10-promo-price-wrap .n10-promo-old-price { font-size: 11px; }
'''

# Validar JS alterado antes de gravar qualquer arquivo.
result = subprocess.run(
    ["node", "--check"],
    input=j, text=True, capture_output=True
)
if result.returncode:
    print(result.stderr)
    sys.exit("ERRO de sintaxe no JavaScript. Nenhum arquivo foi alterado.")

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
files = [(admin, a), (app, j), (css, c)]
backups = []

for f, _ in files:
    backup = f.with_name(f.name + ".backup-promo-" + stamp)
    shutil.copy2(f, backup)
    backups.append(backup)

try:
    for f, content in files:
        f.write_text(content)
except Exception:
    for (f, _), backup in zip(files, backups):
        shutil.copy2(backup, f)
    raise

print("Promoções aplicadas com sucesso.")
print("Backups criados:")
for backup in backups:
    print(backup)
