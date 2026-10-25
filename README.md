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
