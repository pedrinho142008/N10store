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



app.post('/api/checkout', (req, res) => {
  try {
    const number = String(process.env.WHATSAPP_NUMBER || '').replace(/\D/g, '');
    if (number.length < 12 || number.length > 13) {
      return res.status(503).json({ error: 'Configure WHATSAPP_NUMBER no arquivo .env.' });
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
    const items = req.body?.items;
    if (!name || !Array.isArray(items) || items.length < 1 || items.length > 50) {
      return res.status(400).json({ error: 'Dados do pedido inválidos.' });
    }

    const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
    const lines = [
      'Olá! Vim pelo site da N10STORE.',
      `Nome: ${name}`,
      '',
      'Quero consultar estas peças:'
    ];

    for (const item of items) {
      if (!item || typeof item.id !== 'string' ||
          !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99) {
        return res.status(400).json({ error: 'Item inválido.' });
      }

      const product = products.find(p => p.id === item.id && p.category === 'Roupas');
      if (!product) return res.status(400).json({ error: 'Peça não encontrada.' });

      lines.push(`- ${product.name} — quantidade: ${item.qty}`);
    }

    lines.push('', 'Podem informar os preços, tamanhos e disponibilidade?');
    return res.json({ number, message: lines.join('\n') });
  } catch (error) {
    console.error('Erro no checkout:', error.message);
    return res.status(500).json({ error: 'Não foi possível preparar o pedido.' });
  }
});

app.get('*path', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`N10STORE disponível em http://127.0.0.1:${PORT}`);
});
