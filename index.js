const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();
app.get('/', (req, res) => res.send('ESTADO: EN LINEA'));

const userState = {};

const callApi = async (data) => {
    try {
        const params = new URLSearchParams();
        for (const key in data) { params.append(key, data[key]); }
        const res = await axios.post(URL_G, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000
        });
        return res.data;
    } catch (e) { return { ok: false, msg: "Fallo de red" }; }
};

bot.start(async (ctx) => {
    try {
        const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (res.data && res.data.autorizado) {
            const btns = [['📦 INV. GENERAL', '📜 HISTORIAL ART.'], ['📤 SALIDA ART.', '🔄 TRANSFERIR'], ['📝 CREAR REPORTE', '📊 VER SALIDAS'], ['📂 REPS POR ZONA']];
            return ctx.reply(`✅ Acceso Concedido\nBienvenido ${res.data.nombre}.`, Markup.keyboard(btns).resize());
        }
        ctx.reply(`🚫 ID no autorizado: ${ctx.from.id}`);
    } catch (e) { ctx.reply("❌ Error al conectar con el servidor."); }
});

bot.hears('📦 INV. GENERAL', async (ctx) => {
    ctx.reply("⏳ Consultando almacenes...");
    try {
        const res = await axios.get(URL_G, { params: { op: 'consultar_inv' } });
        const zonas = {};
        res.data.forEach(r => {
            const z = r[1].toUpperCase().trim();
            if (!zonas[z]) zonas[z] = [];
            zonas[z].push(`• ${r[0]}  ➔  \`${r[2]}\``);
        });
        for (const z in zonas) {
            await ctx.replyWithMarkdown(`📍 **ZONA: ${z}**\n` + "—".repeat(15) + "\n" + zonas[z].join("\n"));
        }
    } catch (e) { ctx.reply("❌ Error al cargar inventario."); }
});

bot.hears(['📝 CREAR REPORTE', '📤 SALIDA ART.'], async (ctx) => {
    userState[ctx.from.id] = { items: [], step: 'esperando_zona' };
    try {
        const resZonas = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
        const btns = resZonas.data.map(z => [Markup.button.callback(z, `ZSET:${z}`)]);
        ctx.reply("📍 Seleccione la ZONA:", Markup.inlineKeyboard(btns));
    } catch (e) { ctx.reply("❌ Error al cargar zonas."); }
});

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const state = userState[userId];
    if (!state) return ctx.answerCbQuery("Sesión expirada.");

    if (ctx.callbackQuery.data.startsWith('ZSET:')) {
        state.zona = ctx.callbackQuery.data.split(':')[1];
        state.step = 'esperando_articulo';
        await ctx.answerCbQuery();
        ctx.reply(`📍 Zona: ${state.zona}\n📝 Escriba el nombre del artículo:`);
    } else if (ctx.callbackQuery.data === 'ADD_MORE') {
        state.step = 'esperando_articulo';
        await ctx.answerCbQuery();
        ctx.reply("📝 Ingrese el siguiente artículo:");
    } else if (ctx.callbackQuery.data === 'FINISH') {
        state.step = 'esperando_detalles';
        await ctx.answerCbQuery();
        ctx.reply("📝 Describa el trabajo realizado:");
    }
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state || state.step === 'esperando_zona') return;
    const text = ctx.message.text.trim();
    if (text.startsWith('📦') || text.startsWith('📝') || text.startsWith('/')) return;

    if (state.step === 'esperando_articulo') {
        state.tempArt = text.toUpperCase();
        ctx.reply(`⏳ Validando "${state.tempArt}"...`);
        const res = await axios.get(URL_G, { params: { op: 'check_stock', art: state.tempArt, zona: state.zona } });
        if (!res.data || !res.data.existe) {
            return ctx.reply(`❌ El artículo "${state.tempArt}" no existe en ${state.zona}. Revise el nombre en el Inventario General.`);
        }
        state.stockDisp = parseFloat(res.data.cantidad);
        state.step = 'esperando_cantidad';
        ctx.reply(`🔢 Cantidad para "${state.tempArt}"\n(Disponible: ${state.stockDisp}):`);
    } 
    else if (state.step === 'esperando_cantidad') {
        const cant = parseFloat(text.replace(',', '.'));
        if (isNaN(cant) || cant <= 0 || cant > state.stockDisp) {
            return ctx.reply(`❌ Cantidad inválida. Stock disponible: ${state.stockDisp}`);
        }
        state.items.push(`${state.tempArt}:${cant}`);
        state.step = 'esperando_decision';
        ctx.reply(`✅ Agregado. ¿Desea incluir algo más?`, Markup.inlineKeyboard([
            [Markup.button.callback('➕ Otro Artículo', 'ADD_MORE'), Markup.button.callback('💾 Finalizar', 'FINISH')]
        ]));
    }
    else if (state.step === 'esperando_detalles') {
        ctx.reply("⏳ Guardando reporte...");
        const res = await callApi({ op: 'registrar_salida', id: ctx.from.id, art: state.items.join(','), zona: state.zona, detalles: text });
        delete userState[ctx.from.id];
        ctx.reply(res && res.ok ? "✅ REPORTE GUARDADO CON ÉXITO." : "❌ Error al guardar.");
    }
});

bot.launch();
app.listen(process.env.PORT || 3000);
