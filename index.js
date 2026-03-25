const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();
app.get('/', (req, res) => res.send('ESTADO: BOT TACHIRA EN LINEA'));

const userState = {};

// Función optimizada para Google Sheets
const callApi = async (data) => {
    try {
        const params = new URLSearchParams();
        for (const key in data) { params.append(key, data[key]); }
        const res = await axios.post(URL_G, params.toString(), {
            timeout: 15000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return res.data;
    } catch (e) { 
        console.error("Error API:", e.message);
        return { ok: false, msg: "Fallo de conexión" }; 
    }
};

const mainButtons = (rango) => {
    let btns = [['📦 INV. GENERAL', '📜 HISTORIAL ART.'], ['📤 SALIDA ART.', '🔄 TRANSFERIR'], ['📝 CREAR REPORTE', '📊 VER SALIDAS'], ['📂 REPS POR ZONA']];
    if (rango === "SUPERVISOR") btns.splice(1, 0, ['📥 AGREGAR ART.']);
    return Markup.keyboard(btns).resize();
};

// Comando de inicio directo
bot.start(async (ctx) => {
    try {
        ctx.reply("⏳ Verificando credenciales...");
        const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id }, timeout: 10000 });
        if (res.data && res.data.autorizado) {
            return ctx.reply(`✅ Acceso concedido.\nBienvenido ${res.data.nombre}.`, mainButtons(res.data.rango));
        }
        ctx.reply(`🚫 ID no autorizado: ${ctx.from.id}`);
    } catch (e) {
        ctx.reply("❌ El servidor de Google no responde. Reintente en un momento.");
    }
});

// Consulta de Inventario
bot.hears('📦 INV. GENERAL', async (ctx) => {
    try {
        ctx.reply("⏳ Consultando almacenes...");
        const res = await axios.get(URL_G, { params: { op: 'consultar_inv' }, timeout: 15000 });
        let msg = "🏢 **INVENTARIO GENERAL**\n", zonaActual = "";
        res.data.forEach(r => {
            if (r[1].toUpperCase() !== zonaActual) { 
                zonaActual = r[1].toUpperCase(); 
                msg += `\n📍 **${zonaActual}**\n`; 
            }
            msg += ` • ${r[0]}: \`${r[2]}\`\n`;
        });
        ctx.replyWithMarkdown(msg);
    } catch (e) { ctx.reply("❌ Error al obtener datos."); }
});

// Iniciar Reporte
bot.hears(['📝 CREAR REPORTE', '📤 SALIDA ART.'], async (ctx) => {
    userState[ctx.from.id] = { items: [], step: 'esperando_zona' };
    try {
        const resZonas = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
        const btns = resZonas.data.map(z => [Markup.button.callback(z, `ZSET:${z}`)]);
        ctx.reply("📍 Seleccione la ZONA del trabajo:", Markup.inlineKeyboard(btns));
    } catch (e) { ctx.reply("❌ Error al cargar zonas."); }
});

// Lógica de pasos (callback y texto) omitida por brevedad pero mantenida funcional en su bot...
// [Aquí seguiría el resto de la lógica de callback_query y text que ya afinamos]

bot.launch().then(() => console.log(">>> BOT TACHIRA REINICIADO <<<"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Puerto ${PORT} monitoreando`));
