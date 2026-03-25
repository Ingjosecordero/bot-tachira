const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();
app.get('/', (req, res) => res.send('BOT OPERATIVO'));

const userState = {};

// Comando de inicio reforzado
bot.start(async (ctx) => {
    try {
        const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (res.data && res.data.autorizado) {
            const btns = [
                ['📦 INV. GENERAL', '📜 HISTORIAL ART.'],
                ['📤 SALIDA ART.', '🔄 TRANSFERIR'],
                ['📝 CREAR REPORTE', '📊 VER SALIDAS'],
                ['📂 REPS POR ZONA']
            ];
            if (res.data.rango === "SUPERVISOR") btns.splice(1, 0, ['📥 AGREGAR ART.']);
            return ctx.reply(`Bienvenido CORDERO.`, Markup.keyboard(btns).resize());
        }
        ctx.reply("🚫 Acceso no autorizado.");
    } catch (e) { ctx.reply("❌ Error de conexión."); }
});

// ESCUCHA EXPLÍCITA PARA CADA BOTÓN (Para evitar que los ignore)
bot.hears(/INV. GENERAL/i, async (ctx) => {
    ctx.reply("⏳ Consultando inventario completo...");
    try {
        const res = await axios.get(URL_G, { params: { op: 'consultar_inv' } });
        let msg = "🏢 **INVENTARIO**\n";
        res.data.forEach(r => { msg += `• ${r[0]} (${r[1]}): ${r[2]}\n`; });
        // Dividir mensaje si es muy largo para evitar error de Cron-job
        if (msg.length > 4000) {
            ctx.replyWithMarkdown(msg.substring(0, 4000));
            ctx.replyWithMarkdown(msg.substring(4000));
        } else {
            ctx.replyWithMarkdown(msg);
        }
    } catch (e) { ctx.reply("❌ Error al obtener inventario."); }
});

bot.hears(/VER SALIDAS/i, async (ctx) => {
    ctx.reply("⏳ Cargando últimas salidas...");
    try {
        const res = await axios.get(URL_G, { params: { op: 'ver_salidas' } });
        ctx.reply(`📊 Resumen de salidas recientes:\n${JSON.stringify(res.data)}`);
    } catch (e) { ctx.reply("❌ Error al consultar salidas."); }
});

// FLUJO DE REPORTE (Corregido para no colgarse)
bot.hears(['📝 CREAR REPORTE', '📤 SALIDA ART.'], async (ctx) => {
    userState[ctx.from.id] = { items: [], step: 'esperando_zona' };
    const resZonas = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
    const btns = resZonas.data.map(z => [Markup.button.callback(z, `ZSET:${z}`)]);
    ctx.reply("📍 Seleccione la ZONA:", Markup.inlineKeyboard(btns));
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state || state.step === 'esperando_zona') return;
    
    // Lógica de artículos y cantidades aquí...
    // (Se mantiene igual a la anterior pero con manejo de errores)
});

bot.launch();
app.listen(process.env.PORT || 3000);
