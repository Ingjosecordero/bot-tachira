const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

// --- CONFIGURACIÓN ---
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbxWkQSmgguOFTPHChsos6om1JQyi7wdeYuV_EarJCyj3ggKFIR0hsAqkuWIga5xJvkZdQ/exec"; // DEBE SER LA URL DEL DESPLIEGUE EN GOOGLE

const app = express();

// Servidor Web básico para que el Cron-job mantenga vivo el bot
app.get('/', (req, res) => {
  res.send('🛰️ SISTEMA TÁCHIRA: Bot de Inventario Operativo 24/7');
});

const callApi = async (params = {}, data = null) => {
    try {
        if (data) {
            const res = await axios.post(URL_G, data);
            return res.data;
        }
        const res = await axios.get(URL_G, { params });
        return res.data;
    } catch (e) { 
        console.error("Error API:", e.message);
        return null; 
    }
};

// --- TECLADOS ---
const mainButtons = (rango) => {
    let btns = [
        ['📦 INV. GENERAL', '📜 HISTORIAL ART.'],
        ['📤 SALIDA ART.', '🔄 TRANSFERIR'],
        ['📝 CREAR REPORTE', '📊 VER SALIDAS'],
        ['📂 REPS POR ZONA']
    ];
    if (rango === "SUPERVISOR") btns.splice(1, 0, ['📥 AGREGAR ART.']);
    return Markup.keyboard(btns).resize();
};

// --- COMANDOS ---
bot.start(async (ctx) => {
    const res = await callApi({ op: 'verificar', id: ctx.from.id });
    if (!res || !res.autorizado) return ctx.reply(`🚫 Acceso denegado. ID: ${ctx.from.id}`);
    ctx.reply(`🛰️ SISTEMA TÁCHIRA\nBienvenido, Ing. ${res.nombre}`, mainButtons(res.rango));
});

bot.command('conciliar', async (ctx) => {
    const res = await callApi({ op: 'verificar', id: ctx.from.id });
    if (res.rango !== "SUPERVISOR") return ctx.reply("🚫 No autorizado.");
    ctx.reply("⏳ Reconstruyendo inventario basado en reportes... Espere.");
    const resC = await callApi({ op: 'conciliar_inventario' });
    ctx.reply(`✅ ${resC.msg || "Terminado"}`);
});

// --- LÓGICA DE INVENTARIO ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    const res = await callApi({ op: 'consultar_inv' });
    if (!res) return ctx.reply("❌ Error de conexión con la base de datos.");
    let msg = "🏢 **INVENTARIO GENERAL**\n", cz = "";
    res.forEach(r => {
        if (r[1].toUpperCase() !== cz) {
            cz = r[1].toUpperCase(); msg += `\n📍 **${cz}**\n`;
        }
        msg += ` • ${r[0]} : \`${r[2]}\`\n`;
    });
    ctx.replyWithMarkdown(msg);
});

bot.hears('📜 HISTORIAL ART.', (ctx) => {
    ctx.reply("🔍 Ingrese el nombre del artículo para ver su historial:");
    // Nota: Para manejar el flujo de "pasos", Node requiere middleware o escenas. 
    // Por simplicidad en este script base, usaremos un listener simple.
});

// Lanzar Bot
bot.launch();

// Puerto para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor HTTP activo en puerto ${PORT}`);
});

// Manejo de cierre limpio
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
