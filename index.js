const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();
app.get('/', (req, res) => res.send('BOT OPERATIVO'));

const userState = {};

// Función para enviar datos a Google Sheets
const callApi = async (data) => {
    try {
        const params = new URLSearchParams();
        for (const key in data) { params.append(key, data[key]); }
        const res = await axios.post(URL_G, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return res.data;
    } catch (e) { return { ok: false, msg: "Error de red" }; }
};

bot.start(async (ctx) => {
    const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
    if (res.data && res.data.autorizado) {
        const btns = [['📦 INV. GENERAL', '📜 HISTORIAL ART.'], ['📤 SALIDA ART.', '🔄 TRANSFERIR'], ['📝 CREAR REPORTE', '📊 VER SALIDAS'], ['📂 REPS POR ZONA']];
        return ctx.reply(`Bienvenido CORDERO.`, Markup.keyboard(btns).resize());
    }
    ctx.reply("🚫 Acceso denegado.");
});

// --- RESPUESTA A BOTONES DE CONSULTA ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    ctx.reply("⏳ Consultando inventario...");
    const res = await axios.get(URL_G, { params: { op: 'consultar_inv' } });
    let msg = "🏢 **INVENTARIO**\n";
    res.data.forEach(r => { msg += `• ${r[0]} (${r[1]}): ${r[2]}\n`; });
    ctx.replyWithMarkdown(msg);
});

// --- FLUJO DE REPORTE CON VALIDACIÓN Y DETALLES ---
bot.hears(['📝 CREAR REPORTE', '📤 SALIDA ART.'], async (ctx) => {
    userState[ctx.from.id] = { items: [], step: 'esperando_zona' };
    const resZonas = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
    const btns = resZonas.data.map(z => [Markup.button.callback(z, `ZSET:${z}`)]);
    ctx.reply("📍 Seleccione la ZONA donde se realiza el trabajo:", Markup.inlineKeyboard(btns));
});

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const state = userState[userId];
    if (!state) return;

    if (ctx.callbackQuery.data.startsWith('ZSET:')) {
        state.zona = ctx.callbackQuery.data.split(':')[1];
        state.step = 'esperando_articulo';
        ctx.reply(`📍 Zona: ${state.zona}\n📝 Ingrese el NOMBRE del artículo:`);
    } else if (ctx.callbackQuery.data === 'ADD_MORE') {
        state.step = 'esperando_articulo';
        ctx.reply("📝 Ingrese el nombre del siguiente artículo:");
    } else if (ctx.callbackQuery.data === 'FINISH') {
        state.step = 'esperando_detalles';
        ctx.reply("📝 Describa los DETALLES del trabajo realizado:");
    }
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;
    const text = ctx.message.text.toUpperCase();

    if (state.step === 'esperando_articulo') {
        state.tempArt = text;
        ctx.reply(`⏳ Validando "${text}" en ${state.zona}...`);
        const check = await axios.get(URL_G, { params: { op: 'check_stock', art: text, zona: state.zona } });
        
        if (!check.data.existe) return ctx.reply(`❌ El artículo "${text}" no existe en ${state.zona}.`);
        
        state.stockDisp = check.data.cantidad;
        state.step = 'esperando_cantidad';
        ctx.reply(`🔢 Cantidad (Disponible: ${state.stockDisp}):`);
    } 
    else if (state.step === 'esperando_cantidad') {
        const cant = parseFloat(text);
        if (isNaN(cant) || cant > state.stockDisp) return ctx.reply("❌ Cantidad inválida o insuficiente.");
        
        state.items.push(`${state.tempArt}:${cant}`);
        ctx.reply(`✅ Agregado. ¿Desea agregar más?`, Markup.inlineKeyboard([
            [Markup.button.callback('➕ Agregar Otro', 'ADD_MORE'), Markup.button.callback('💾 Finalizar', 'FINISH')]
        ]));
    }
    else if (state.step === 'esperando_detalles') {
        const res = await callApi({
            op: 'registrar_salida',
            id: ctx.from.id,
            art: state.items.join(','),
            zona: state.zona,
            detalles: ctx.message.text
        });
        delete userState[ctx.from.id];
        ctx.reply(res.ok ? "✅ REPORTE GUARDADO CON ÉXITO." : "❌ Error al guardar.");
    }
});

bot.launch();
app.listen(process.env.PORT || 3000);
