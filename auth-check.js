require("dotenv").config();
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const email = "shaolinmatadordeporco1918@gmail.com";

rl.question("Senha da conta Supabase: ", async (password) => {
  rl.close();

  try {
    const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
    const key = process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.log("Erro: SUPABASE_URL ou SUPABASE_ANON_KEY ausente no .env.");
      return;
    }

    const response = await fetch(
      `${url}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: key,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.access_token && data.user?.email) {
      console.log("AUTH OK: login aceito pelo Supabase.");
      console.log("E-mail:", data.user.email);
    } else {
      console.log("AUTH FALHOU — HTTP:", response.status);
      console.log("Motivo:", data.msg || data.message || data.error_description || data.error || "Erro não identificado");
    }
  } catch (error) {
    console.log("Erro de conexão:", error.message);
  }
});
