const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();
app.get('/', (req, res) => res.send('SISTEMA ACTIVO'));

// Objeto temporal para guardar los pasos del usuario
const userState = {};

const callApi = async (params = {}, data = null) => {
    try {
        if (data) return (await axios.post(URL_G, data)).data;
        return (await axios.get(URL_G, { params })).data;
    } catch (e) { return null; }
};

const mainButtons = (rango) => {
    let btns = [['📦 INV. GENERAL', '📜 HISTORIAL ART.'], ['📤 SALIDA ART.', '🔄 TRANSFERIR'], ['📝 CREAR REPORTE', '📊 VER SALIDAS'], ['📂 REPS POR ZONA']];
    if (rango === "SUPERVISOR") btns.splice(1, 0, ['📥 AGREGAR ART.']);
    return Markup.keyboard(btns).resize();
};

bot.start(async (ctx) => {
    const res = await callApi({ op: 'verificar', id: ctx.from.id });
    if (!res || !res.autorizado) return ctx.reply(`🚫 Acceso denegado: ${ctx.from.id}`);
    ctx.reply(`CONTROL DE REGISTROS Y REPORTES\nBienvenido ${res.nombre}.`, mainButtons(res.rango));
});

// --- CONSULTAS DIRECTAS ---
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

bot.hears('📊 VER SALIDAS', async (ctx) => {
    const reps = await callApi({ op: 'ver_reps' });
    if (!reps) return ctx.reply("❌ Sin datos.");
    let msg = "📊 **ÚLTIMOS MOVIMIENTOS**\n" + "—".repeat(15) + "\n";
    reps.slice(-8).reverse().forEach(r => {
        msg += `🆔 \`${r[0]}\` | 📍 ${r[2]}\n📦 ${r[3]} : ${r[4]}\n👤 ${r[6]}\n` + "—".repeat(10) + "\n";
    });
    ctx.replyWithMarkdown(msg);
});

// --- LÓGICA DE REGISTRO (CREAR REPORTE / SALIDA) ---
bot.hears(['📝 CREAR REPORTE', '📤 SALIDA ART.'], async (ctx) => {
    userState[ctx.from.id] = { step: 'esperando_articulo', tipo: 'SALIDA' };
    ctx.reply("📝 Ingrese el NOMBRE del artículo:");
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;

    if (state.step === 'esperando_articulo') {
        state.articulo = ctx.message.text.toUpperCase();
        state.step = 'esperando_cantidad';
        ctx.reply(`🔢 Ingrese la CANTIDAD de "${state.articulo}":`);
    } 
    else if (state.step === 'esperando_cantidad') {
        state.cantidad = ctx.message.text;
        state.step = 'esperando_zona';
        const zonas = await callApi({ op: 'ver_zonas' });
        const btns = zonas.map(z => [Markup.button.callback(z, `ZSET:${z}`)]);
        ctx.reply("📍 Seleccione la ZONA:", Markup.inlineKeyboard(btns));
    }
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    if (data.startsWith('ZSET:')) {
        const zona = data.split(':')[1];
        const state = userState[userId];
        if (!state) return ctx.answerCbQuery("Error de sesión.");

        ctx.answerCbQuery();
        ctx.reply(`⏳ Procesando ${state.tipo}...`);

        const res = await callApi({}, {
            op: 'registrar_salida',
            id: userId,
            art: state.articulo,
            cant: state.cantidad,
            zona: zona
        });

        delete userState[userId];
        ctx.reply(res && res.ok ? `✅ Registro exitoso en ${zona}.` : `❌ Error: ${res.msg || "No se pudo registrar"}`);
    }
});

bot.launch();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Online on ${PORT}`));
