const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const URL_G = "https://script.google.com/macros/s/AKfycbyAykHfwTjMIBwfSmN-nCYQf7VGzEzoUKqSzH_wZ2XMI491YyrXOGon4_FXZCRmLJiVJA/exec"; 
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const app = express();
const userState = {};
const api = axios.create({ timeout: 15000 });

// RUTA PARA CRON-JOB
app.get('/', (req, res) => res.status(200).send('OK'));

const mainButtons = (rango) => {
    const r = (rango || "").toUpperCase().trim();
    if (r === "SUPERVISOR") {
        return Markup.keyboard([
            ['📦 INV. GENERAL', '📜 HISTORIAL ART.'],
            ['📤 SALIDA ART.', '🔄 TRANSFERIR'],
            ['📝 CREAR REPORTE', '📊 VER SALIDAS'],
            ['📂 REPS POR ZONA', '📥 AGREGAR ART.']
        ]).resize();
    }
    return Markup.keyboard([['📦 INV. GENERAL', '📜 HISTORIAL ART.'], ['📂 REPS POR ZONA']]).resize();
};

bot.start(async (ctx) => {
    try {
        const res = await api.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (res.data && res.data.autorizado) {
            return ctx.reply(`✅ SISTEMA ACTIVO\nHola ${res.data.nombre}`, mainButtons(res.data.rango));
        }
        ctx.reply("🚫 ID no autorizado.");
    } catch (e) { ctx.reply("⏳ El servidor está iniciando, intenta de nuevo."); }
});

bot.hears('📂 REPS POR ZONA', async (ctx) => {
    try {
        const res = await api.get(URL_G, { params: { op: 'ver_zonas' } });
        const btns = [];
        for (let i = 0; i < res.data.length; i += 2) {
            const fila = [Markup.button.callback(res.data[i], `CONSULTA:${res.data[i]}`)];
            if (res.data[i+1]) fila.push(Markup.button.callback(res.data[i+1], `CONSULTA:${res.data[i+1]}`));
            btns.push(fila);
        }
        ctx.reply("📂 Seleccione zona:", Markup.inlineKeyboard(btns));
    } catch (e) { ctx.reply("❌ Error de conexión."); }
});

bot.hears('📦 INV. GENERAL', async (ctx) => {
    try {
        const res = await api.get(URL_G, { params: { op: 'consultar_inv' } });
        const zonas = {};
        res.data.forEach(r => {
            if (!zonas[r[1]]) zonas[r[1]] = [];
            zonas[r[1]].push(`• ${r[0]} ➔ \`${r[2]}\``);
        });
        for (const z in zonas) await ctx.replyWithMarkdown(`📍 **ZONA: ${z}**\n${zonas[z].join('\n')}`);
    } catch (e) { ctx.reply("❌ Error."); }
});

bot.hears(['📥 AGREGAR ART.', '📤 SALIDA ART.', '📝 CREAR REPORTE', '🔄 TRANSFERIR'], async (ctx) => {
    const modo = ctx.message.text;
    userState[ctx.from.id] = { modo, items: [], step: 'esperando_zona' };
    const res = await api.get(URL_G, { params: { op: 'ver_zonas' } });
    const btns = res.data.map(z => [Markup.button.callback(z, `Z:${z}`)]);
    ctx.reply(`📍 [${modo}]\nElija zona:`, Markup.inlineKeyboard(btns));
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith('CONSULTA:')) {
        const zonaSel = data.split(':')[1];
        const res = await api.get(URL_G, { params: { op: 'reps_por_zona', zona: zonaSel } });
        for (const tkt of res.data.orden) {
            const info = res.data.datos[tkt];
            let msg = `🎫 **TICKET:** \`${tkt}\`\n📝 **Nota:** ${info.nota}\n📦 **Materiales:**\n`;
            info.arts.forEach(art => msg += `  • ${art}\n`);
            await ctx.replyWithMarkdown(msg);
        }
        return ctx.answerCbQuery();
    }
    const state = userState[ctx.from.id];
    if (!state) return ctx.answerCbQuery();
    if (data.startsWith('Z:')) {
        state.zona = data.split(':')[1]; state.step = 'esperando_art';
        ctx.reply("📝 Artículo:");
    } else if (data === 'ADD') {
        state.step = 'esperando_art'; ctx.reply("📝 Siguiente:");
    } else if (data === 'FIN') {
        state.step = 'esperando_nota'; ctx.reply("📝 Nota final:");
    }
    ctx.answerCbQuery();
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;
    const text = ctx.message.text.toUpperCase();
    if (state.step === 'esperando_art') {
        state.tempArt = text; state.step = 'esperando_cant';
        ctx.reply(`🔢 Cantidad para ${text}:`);
    } else if (state.step === 'esperando_cant') {
        state.items.push(`${state.tempArt}:${text}`);
        ctx.reply("✅ Agregado.", Markup.inlineKeyboard([[Markup.button.callback('➕ Otro', 'ADD'), Markup.button.callback('💾 Guardar', 'FIN')]]));
    } else if (state.step === 'esperando_nota') {
        const res = await api.post(URL_G, new URLSearchParams({
            op: 'procesar_accion', modo: state.modo, id: ctx.from.id,
            zona: state.zona || '', articulos: state.items.join(','), nota: text
        }).toString());
        delete userState[ctx.from.id];
        ctx.reply(`✅ ÉXITO. Ticket: ${res.data.ticket}`);
    }
});

app.listen(process.env.PORT || 3000);
bot.launch();
