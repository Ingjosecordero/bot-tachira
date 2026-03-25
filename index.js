const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

// --- CONFIGURACIÓN ---
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
// REEMPLACE CON SU URL DE GOOGLE APPS SCRIPT:
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();

// Servidor para Cron-job
app.get('/', (req, res) => res.send('SISTEMA ACTIVO'));

const callApi = async (params = {}, data = null) => {
    try {
        if (data) return (await axios.post(URL_G, data)).data;
        const res = await axios.get(URL_G, { params });
        return res.data;
    } catch (e) { return null; }
};

// --- TECLADO PRINCIPAL ---
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

// --- MANEJO DE MENSAJES ---

bot.start(async (ctx) => {
    const res = await callApi({ op: 'verificar', id: ctx.from.id });
    if (!res || !res.autorizado) return ctx.reply(`🚫 Acceso denegado: ${ctx.from.id}`);
    
    // MENSAJE DE BIENVENIDA MODIFICADO
    ctx.reply(`CONTROL DE REGISTROS Y REPORTES\nBienvenido ${res.nombre}.`, mainButtons(res.rango));
});

// 1. INVENTARIO GENERAL
bot.hears('📦 INV. GENERAL', async (ctx) => {
    const res = await callApi({ op: 'consultar_inv' });
    if (!res) return ctx.reply("❌ Error de conexión.");
    let msg = "🏢 **INVENTARIO GENERAL**\n", cz = "";
    res.forEach(r => {
        if (r[1].toUpperCase() !== cz) { cz = r[1].toUpperCase(); msg += `\n📍 **${cz}**\n`; }
        msg += ` • ${r[0]} : \`${r[2]}\`\n`;
    });
    ctx.replyWithMarkdown(msg);
});

// 2. VER SALIDAS (HISTORIAL RECIENTE)
bot.hears('📊 VER SALIDAS', async (ctx) => {
    const reps = await callApi({ op: 'ver_reps' });
    if (!reps) return ctx.reply("❌ Sin datos.");
    let msg = "📊 **ÚLTIMOS MOVIMIENTOS**\n" + "—".repeat(15) + "\n";
    // Tomamos los últimos 8 registros
    reps.slice(-8).reverse().forEach(r => {
        msg += `🆔 \`${r[0]}\` | 📍 ${r[2]}\n📦 ${r[3]} : ${r[4]}\n👤 ${r[6]}\n` + "—".repeat(10) + "\n";
    });
    ctx.replyWithMarkdown(msg);
});

// 3. REPORTE POR ZONA
bot.hears('📂 REPS POR ZONA', async (ctx) => {
    const zonas = await callApi({ op: 'ver_zonas' });
    if (!zonas) return ctx.reply("❌ Error al cargar zonas.");
    const btns = zonas.map(z => [Markup.button.callback(z, `ZREP:${z}`)]);
    ctx.reply("📍 Seleccione zona para ver reportes:", Markup.inlineKeyboard(btns));
});

// 4. HISTORIAL ARTÍCULO
bot.hears('📜 HISTORIAL ART.', (ctx) => {
    ctx.reply("🔍 Escriba el nombre exacto del artículo para ver su historial de movimientos:");
});

// 5. ACCIONES DE REGISTRO
bot.hears(['📤 SALIDA ART.', '🔄 TRANSFERIR', '📝 CREAR REPORTE', '📥 AGREGAR ART.'], (ctx) => {
    ctx.reply("⚠️ El módulo de registro está siendo sincronizado. Use /conciliar para actualizar el stock desde la hoja de Google.");
});

// MANEJO DE CALLBACKS (ZONAS)
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith('ZREP:')) {
        const zona = data.split(':')[1];
        const reps = await callApi({ op: 'ver_reps', zona: zona });
        if (!reps || reps.length === 0) return ctx.reply(`❌ Sin reportes en ${zona}.`);
        
        let msg = `📂 **REPORTES EN ${zona}**\n` + "—".repeat(15) + "\n";
        reps.slice(-3).forEach(r => {
            msg += `📅 ${String(r[1]).slice(0,10)} | 👤 ${r[6]}\n📦 ${r[3]}: ${r[4]}\n` + "—".repeat(10) + "\n";
        });
        ctx.replyWithMarkdown(msg);
    }
});

// LANZAMIENTO
bot.launch().then(() => console.log("Bot en línea"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Puerto ${PORT} activo`));

// CIERRE LIMPIO
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
