const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, ".env"),
  override: true
});

const app = require("./api/index");
const PORT = Number(process.env.PORT) || 4000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NT10STORE disponível em http://127.0.0.1:${PORT}`);
  console.log(`Painel administrativo: http://127.0.0.1:${PORT}/admin`);
});
