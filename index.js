const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const URL_G = "https://script.google.com/macros/s/AKfycbxrX2pcsUoByrIxleZnUEbd2zXq4phygT2PcaYKpQz9Zvl5dE8_9TghOoLj49yVFw5P/exec"; 
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");

const app = express();
const userState = {};

const mainButtons = (rango) => {
    let btns = [['📦 INV. GENERAL', '📜 HISTORIAL ART.'], ['📤 SALIDA ART.', '🔄 TRANSFERIR'], ['📝 CREAR REPORTE', '📊 VER SALIDAS'], ['📂 REPS POR ZONA']];
    if (rango === "SUPERVISOR") btns.splice(1, 0, ['📥 AGREGAR ART.']);
    return Markup.keyboard(btns).resize();
};

bot.start(async (ctx) => {
    try {
        const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (res.data && res.data.autorizado) {
            return ctx.reply(`SISTEMA TACHIRA OPERATIVO\nBienvenido ${res.data.nombre}.`, mainButtons(res.data.rango));
        }
        ctx.reply(`🚫 ID no autorizado: ${ctx.from.id}`);
    } catch (e) { ctx.reply("❌ Error de servidor."); }
});

bot.hears('📦 INV. GENERAL', async (ctx) => {
    ctx.reply("⏳ Consultando...");
    const res = await axios.get(URL_G, { params: { op: 'consultar_inv' } });
    const zonas = {};
    res.data.forEach(r => {
        if (!zonas[r[1]]) zonas[r[1]] = [];
        zonas[r[1]].push(`• ${r[0]} ➔ \`${r[2]}\``);
    });
    for (const z in zonas) {
        await ctx.replyWithMarkdown(`📍 **ZONA: ${z}**\n${zonas[z].join('\n')}`);
    }
});

// FLUJO PARA TODOS LOS BOTONES DE ACCIÓN
bot.hears(['📝 CREAR REPORTE', '📤 SALIDA ART.', '📥 AGREGAR ART.', '🔄 TRANSFERIR'], async (ctx) => {
    const modo = ctx.message.text;
    userState[ctx.from.id] = { modo, items: [], step: 'esperando_zona' };
    const res = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
    const btns = res.data.map(z => [Markup.button.callback(z, `ZSET:${z}`)]);
    ctx.reply(`📍 [${modo}]\nSeleccione Zona:`, Markup.inlineKeyboard(btns));
});

bot.on('callback_query', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;
    const data = ctx.callbackQuery.data;

    if (data.startsWith('ZSET:')) {
        state.zona = data.split(':')[1];
        state.step = 'esperando_articulo';
        ctx.reply(`📍 Zona: ${state.zona}\n📝 Artículo:`);
    } else if (data === 'ADD') {
        state.step = 'esperando_articulo';
        ctx.reply("📝 Siguiente artículo:");
    } else if (data === 'END') {
        state.step = 'esperando_nota';
        ctx.reply("📝 Nota/Detalle del trabajo:");
    }
    ctx.answerCbQuery();
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state || state.step === 'esperando_zona') return;
    const text = ctx.message.text.toUpperCase().trim();

    if (state.step === 'esperando_articulo') {
        state.tempArt = text;
        const check = await axios.get(URL_G, { params: { op: 'check_stock', art: text, zona: state.zona } });
        if (check.data.existe) {
            state.step = 'esperando_cantidad';
            ctx.reply(`🔢 Cantidad (${check.data.cantidad} disponibles):`);
        } else {
            ctx.reply("❌ No existe en esta zona.");
        }
    } 
    else if (state.step === 'esperando_cantidad') {
        state.items.push(`${state.tempArt}:${text}`);
        state.step = 'esperando_decision';
        ctx.reply("✅ Agregado.", Markup.inlineKeyboard([
            [Markup.button.callback('➕ Otro', 'ADD'), Markup.button.callback('💾 Guardar', 'END')]
        ]));
    }
    else if (state.step === 'esperando_nota') {
        await axios.post(URL_G, new URLSearchParams({
            op: 'procesar_accion', modo: state.modo, id: ctx.from.id,
            zona: state.zona, articulos: state.items.join(','), nota: text
        }).toString());
        delete userState[ctx.from.id];
        ctx.reply("✅ REGISTRO COMPLETADO.");
    }
});

bot.launch();
app.listen(process.env.PORT || 3000);
