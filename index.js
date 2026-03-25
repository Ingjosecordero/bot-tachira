const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const URL_G = "https://script.google.com/macros/s/AKfycbzsx__bUuIyQwjJCo1LLzFYP7w6WELhrXyZw_Ius2OUB24voHxgMjH8rqM8vkhRMT56IA/exec"; 
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

// --- INVENTARIO (LISTO) ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    const res = await axios.get(URL_G, { params: { op: 'consultar_inv' } });
    let msg = "📦 **INVENTARIO ACTUAL**\n";
    res.data.forEach(r => msg += `• ${r[0]} (${r[1]}) ➔ ${r[2]}\n`);
    ctx.replyWithMarkdown(msg);
});

// --- HISTORIAL ARTICULO ---
bot.hears('📜 HISTORIAL ART.', (ctx) => {
    userState[ctx.from.id] = { step: 'historial_nombre' };
    ctx.reply("🔍 Ingrese el NOMBRE del artículo para ver su historial:");
});

// --- ACCIONES (AGREGAR, SALIDA, REPORTE, TRANSFERIR) ---
bot.hears(['📥 AGREGAR ART.', '📤 SALIDA ART.', '📝 CREAR REPORTE', '🔄 TRANSFERIR'], async (ctx) => {
    const modo = ctx.message.text;
    userState[ctx.from.id] = { modo, items: [], step: 'esperando_zona' };
    const res = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
    const btns = res.data.map(z => [Markup.button.callback(z, `Z:${z}`)]);
    ctx.reply(`📍 [${modo}]\nSeleccione Zona${modo === '🔄 TRANSFERIR' ? ' ORIGEN' : ''}:`, Markup.inlineKeyboard(btns));
});

bot.on('callback_query', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;
    const data = ctx.callbackQuery.data;

    if (data.startsWith('Z:')) {
        const zona = data.split(':')[1];
        if (state.modo === '🔄 TRANSFERIR' && !state.zona_origen) {
            state.zona_origen = zona;
            const res = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
            const btns = res.data.filter(z => z !== zona).map(z => [Markup.button.callback(z, `Z:${z}`)]);
            return ctx.reply("📍 Seleccione Zona DESTINO:", Markup.inlineKeyboard(btns));
        }
        if (state.modo === '🔄 TRANSFERIR') state.zona_destino = zona;
        else state.zona = zona;
        
        state.step = 'esperando_art';
        ctx.reply("📝 Nombre del artículo:");
    } else if (data === 'ADD') {
        state.step = 'esperando_art';
        ctx.reply("📝 Siguiente artículo:");
    } else if (data === 'FIN') {
        state.step = 'esperando_nota';
        ctx.reply("📝 Ingrese Motivo / Nota:");
    }
    ctx.answerCbQuery();
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;
    const text = ctx.message.text.toUpperCase().trim();

    if (state.step === 'historial_nombre') {
        const res = await axios.get(URL_G, { params: { op: 'ver_historial', art: text } });
        if (res.data.msg) return ctx.reply(res.data.msg);
        let m = `📜 **HISTORIAL: ${text}**\n`;
        res.data.forEach(r => m += `• ${new Date(r[0]).toLocaleDateString()} | ${r[3]} | Cant: ${r[5]}\n`);
        delete userState[ctx.from.id];
        return ctx.replyWithMarkdown(m);
    }

    if (state.step === 'esperando_art') {
        state.tempArt = text;
        state.step = 'esperando_cant';
        ctx.reply(`🔢 Cantidad para ${text}:`);
    } else if (state.step === 'esperando_cant') {
        state.items.push(`${state.tempArt}:${text}`);
        ctx.reply("✅ Agregado.", Markup.inlineKeyboard([[Markup.button.callback('➕ Otro', 'ADD'), Markup.button.callback('💾 Finalizar', 'FIN')]]));
    } else if (state.step === 'esperando_nota') {
        await axios.post(URL_G, new URLSearchParams({
            op: 'procesar_accion', modo: state.modo, id: ctx.from.id,
            zona: state.zona || '', zona_origen: state.zona_origen || '', 
            zona_destino: state.zona_destino || '', articulos: state.items.join(','), nota: text
        }).toString());
        delete userState[ctx.from.id];
        ctx.reply("✅ OPERACIÓN COMPLETADA CON ÉXITO.");
    }
});

bot.launch();
app.listen(process.env.PORT || 3000);
