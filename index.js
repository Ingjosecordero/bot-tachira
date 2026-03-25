const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const URL_G = "https://script.google.com/macros/s/AKfycbzjNezVuUpU6rsjsMg6HHoNHbbLtl-e4clL2SV66I0jZwSbq2tS28FMFeJDHbhA75jj4Q/exec"; 
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const app = express();
const userState = {};

const mainButtons = (rango) => {
    if (rango === "SUPERVISOR") {
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
        const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (res.data.autorizado) return ctx.reply(`✅ SISTEMA CONECTADO\nHola ${res.data.nombre}`, mainButtons(res.data.rango));
        ctx.reply("🚫 No autorizado.");
    } catch (e) { ctx.reply("❌ Error de conexión."); }
});

// --- INVENTARIO ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    const res = await axios.get(URL_G, { params: { op: 'consultar_inv' } });
    const zonas = {};
    res.data.forEach(r => {
        if (!zonas[r[1]]) zonas[r[1]] = [];
        zonas[r[1]].push(`• ${r[0]} ➔ \`${r[2]}\``);
    });
    for (const z in zonas) {
        await ctx.replyWithMarkdown(`📍 **ZONA: ${z}**\n` + "—".repeat(15) + "\n" + zonas[z].join('\n'));
    }
});

// --- REPORTES POR ZONA (AGRUPADOS) ---
bot.hears('📂 REPS POR ZONA', async (ctx) => {
    ctx.reply("⏳ Consultando reportes agrupados...");
    try {
        const res = await axios.get(URL_G, { params: { op: 'reps_por_zona' } });
        for (const zona in res.data) {
            let msg = `📍 **ZONA: ${zona}**\n` + "—".repeat(20) + "\n";
            const tickets = res.data[zona];
            for (const tkt in tickets) {
                const info = tickets[tkt];
                msg += `🎫 **TICKET:** \`${tkt}\`\n`;
                msg += `📅 **Fecha:** ${new Date(info.fecha).toLocaleDateString()}\n`;
                msg += `📝 **Nota:** _${info.nota}_\n`;
                msg += `📦 **Materiales:**\n   ${info.arts.join('\n   ')}\n`;
                msg += "—".repeat(10) + "\n";
            }
            await ctx.replyWithMarkdown(msg);
        }
    } catch (e) { ctx.reply("❌ Error al cargar datos."); }
});

// --- HISTORIAL ---
bot.hears('📜 HISTORIAL ART.', (ctx) => {
    userState[ctx.from.id] = { step: 'hist_art' };
    ctx.reply("🔍 Ingrese nombre del artículo:");
});

// --- FLUJO DE ACCIONES ---
bot.hears(['📥 AGREGAR ART.', '📤 SALIDA ART.', '📝 CREAR REPORTE', '🔄 TRANSFERIR'], async (ctx) => {
    const modo = ctx.message.text;
    userState[ctx.from.id] = { modo, items: [], step: 'esperando_zona' };
    const res = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
    const btns = [];
    for (let i = 0; i < res.data.length; i += 2) {
        const fila = [Markup.button.callback(res.data[i], `Z:${res.data[i]}`)];
        if (res.data[i+1]) fila.push(Markup.button.callback(res.data[i+1], `Z:${res.data[i+1]}`));
        btns.push(fila);
    }
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
            return ctx.reply("📝 Nombre de nueva zona:");
        }
        if (state.modo === '🔄 TRANSFERIR' && !state.zona_origen) {
            state.zona_origen = zona;
            return ctx.reply("📍 Seleccione Zona DESTINO:");
        }
        if (state.modo === '🔄 TRANSFERIR') state.zona_destino = zona; else state.zona = zona;
        state.step = 'esperando_art';
        ctx.reply("📝 Nombre del artículo:");
    } else if (data === 'ADD') {
        state.step = 'esperando_art';
        ctx.reply("📝 Siguiente artículo:");
    } else if (data === 'FIN') {
        state.step = 'esperando_nota';
        ctx.reply("📝 Descripción única del reporte:");
    }
    ctx.answerCbQuery();
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;
    const text = ctx.message.text.toUpperCase().trim();

    if (state.step === 'hist_art') {
        const res = await axios.get(URL_G, { params: { op: 'ver_historial', art: text } });
        let m = `📜 **HISTORIAL: ${text}**\n`;
        res.data.forEach(r => m += `• ${new Date(r.fecha).toLocaleDateString()} | ${r.zona} | ${r.cant} ${r.signo}\n`);
        delete userState[ctx.from.id];
        return ctx.replyWithMarkdown(m);
    }
    if (state.step === 'esperando_art') {
        state.tempArt = text; state.step = 'esperando_cant';
        ctx.reply(`🔢 Cantidad para ${text}:`);
    } else if (state.step === 'esperando_cant') {
        state.items.push(`${state.tempArt}:${text}`);
        ctx.reply(`✅ "${state.tempArt}" añadido al reporte.`, Markup.inlineKeyboard([
            [Markup.button.callback('➕ Añadir otro artículo', 'ADD')],
            [Markup.button.callback('💾 Guardar Reporte Final', 'FIN')]
        ]));
    } else if (state.step === 'esperando_nota') {
        ctx.reply("⏳ Procesando reporte único...");
        const res = await axios.post(URL_G, new URLSearchParams({
            op: 'procesar_accion', modo: state.modo, id: ctx.from.id,
            zona: state.zona || '', zona_origen: state.zona_origen || '',
            zona_destino: state.zona_destino || '', articulos: state.items.join(','), nota: text
        }).toString());
        delete userState[ctx.from.id];
        ctx.replyWithMarkdown(`✅ **REPORTE FINALIZADO**\n🎫 Ticket: \`${res.data.ticket}\``);
    }
});

bot.launch();
app.listen(process.env.PORT || 3000);
