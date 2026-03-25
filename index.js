const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const URL_G = "https://script.google.com/macros/s/AKfycbzIturX-xzGwvYLAmLRmPiw11jqaQ7LMNOOzBygSzYyoFwsCIb8ajweiJizUCB7aIe4yA/exec"; 
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const app = express();
const userState = {};

const mainButtons = (rango) => {
    let btns = [['📦 INV. GENERAL', '📜 HISTORIAL ART.'], ['📤 SALIDA ART.', '🔄 TRANSFERIR'], ['📝 CREAR REPORTE', '📊 VER SALIDAS'], ['📂 REPS POR ZONA']];
    if (rango === "SUPERVISOR") btns.splice(1, 0, ['📥 AGREGAR ART.']);
    return Markup.keyboard(btns).resize();
};

bot.start(async (ctx) => {
    const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
    if (res.data.autorizado) ctx.reply(`BIENVENIDO ${res.data.nombre}`, mainButtons(res.data.rango));
});

// --- INVENTARIO (MENSAJES POR ZONA) ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    ctx.reply("⏳ Cargando inventario por almacenes...");
    const res = await axios.get(URL_G, { params: { op: 'consultar_inv' } });
    const zonas = {};
    res.data.forEach(r => {
        if (!zonas[r[1]]) zonas[r[1]] = [];
        zonas[r[1]].push(`• ${r[0]} ➔ \`${r[2]}\``);
    });
    for (const z in zonas) {
        let msg = `📍 **ZONA: ${z}**\n` + "—".repeat(15) + "\n" + zonas[z].join('\n');
        await ctx.replyWithMarkdown(msg);
    }
});

// --- HISTORIAL CON SIGNOS (+/-) ---
bot.hears('📜 HISTORIAL ART.', (ctx) => {
    userState[ctx.from.id] = { step: 'hist_art' };
    ctx.reply("🔍 Ingrese el NOMBRE del artículo:");
});

bot.hears(['📥 AGREGAR ART.', '📤 SALIDA ART.', '📝 CREAR REPORTE', '🔄 TRANSFERIR'], async (ctx) => {
    const modo = ctx.message.text;
    userState[ctx.from.id] = { modo, items: [], step: 'esperando_zona' };
    const res = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
    let btns = res.data.map(z => [Markup.button.callback(z, `Z:${z}`)]);
    if (modo === '📥 AGREGAR ART.') btns.push([Markup.button.callback('➕ NUEVA ZONA', 'Z:NUEVA')]);
    ctx.reply(`📍 [${modo}]\nSeleccione Zona:`, Markup.inlineKeyboard(btns));
});

bot.on('callback_query', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;
    const data = ctx.callbackQuery.data;

    if (data.startsWith('Z:')) {
        const zona = data.split(':')[1];
        if (zona === 'NUEVA') {
            state.step = 'creando_zona';
            return ctx.reply("📝 Escriba el nombre de la NUEVA ZONA:");
        }
        state.zona = zona;
        state.step = 'esperando_art';
        ctx.reply(`📍 Zona: ${state.zona}\n📝 Nombre del artículo:`);
    } else if (data === 'FIN') {
        state.step = 'esperando_nota';
        ctx.reply("📝 Motivo / Nota:");
    }
    ctx.answerCbQuery();
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;
    const text = ctx.message.text.toUpperCase().trim();

    if (state.step === 'hist_art') {
        const res = await axios.get(URL_G, { params: { op: 'ver_historial', art: text } });
        if (res.data.msg) return ctx.reply(res.data.msg);
        let m = `📜 **HISTORIAL: ${text}**\n` + "—".repeat(15) + "\n";
        res.data.forEach(r => m += `• ${new Date(r.fecha).toLocaleDateString()} | ${r.zona} | Cant: ${r.cant} ${r.signo}\n`);
        delete userState[ctx.from.id];
        return ctx.replyWithMarkdown(m);
    }
    if (state.step === 'creando_zona') {
        state.zona = text;
        state.step = 'esperando_art';
        return ctx.reply(`✅ Zona "${text}" seleccionada.\n📝 Artículo:`);
    }
    if (state.step === 'esperando_art') {
        state.tempArt = text;
        state.step = 'esperando_cant';
        ctx.reply(`🔢 Cantidad para ${text}:`);
    } else if (state.step === 'esperando_cant') {
        state.items.push(`${state.tempArt}:${text}`);
        ctx.reply("✅ Agregado.", Markup.inlineKeyboard([[Markup.button.callback('➕ Otro', 'Z:' + state.zona), Markup.button.callback('💾 Guardar', 'FIN')]]));
    } else if (state.step === 'esperando_nota') {
        await axios.post(URL_G, new URLSearchParams({
            op: 'procesar_accion', modo: state.modo, id: ctx.from.id,
            zona: state.zona, articulos: state.items.join(','), nota: text
        }).toString());
        delete userState[ctx.from.id];
        ctx.reply("✅ OPERACIÓN COMPLETADA.");
    }
});

bot.launch();
app.listen(process.env.PORT || 3000);
