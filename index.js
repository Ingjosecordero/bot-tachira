const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

// URL DE GOOGLE APPS SCRIPT
const URL_G = "https://script.google.com/macros/s/AKfycbwNahi_N9T5q3wCFlVTh1Ai7yv-JMPsRHZNsIn-aOEZA3KPYrWmPiPNVzK-ehJHsu7Ptg/exec"; 
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const app = express();
const userState = {};

// --- LÓGICA DE BOTONES SEGÚN RANGO ---
const mainButtons = (rango) => {
    if (rango === "SUPERVISOR") {
        return Markup.keyboard([
            ['📦 INV. GENERAL', '📜 HISTORIAL ART.'],
            ['📤 SALIDA ART.', '🔄 TRANSFERIR'],
            ['📝 CREAR REPORTE', '📊 VER SALIDAS'],
            ['📂 REPS POR ZONA', '📥 AGREGAR ART.']
        ]).resize();
    } else {
        // Rango TÉCNICO o cualquier otro
        return Markup.keyboard([
            ['📦 INV. GENERAL', '📜 HISTORIAL ART.'],
            ['📂 REPS POR ZONA']
        ]).resize();
    }
};

bot.start(async (ctx) => {
    try {
        const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (res.data.autorizado) {
            return ctx.reply(`✅ SISTEMA TACHIRA\nBienvenido ${res.data.nombre}\nRango: ${res.data.rango}`, mainButtons(res.data.rango));
        }
        ctx.reply(`🚫 ID NO AUTORIZADO: ${ctx.from.id}`);
    } catch (e) { ctx.reply("❌ Error de comunicación con el servidor."); }
});

// --- INVENTARIO (MENSAJES POR ZONA) ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    ctx.reply("⏳ Cargando inventario...");
    try {
        const res = await axios.get(URL_G, { params: { op: 'consultar_inv' } });
        const zonas = {};
        res.data.forEach(r => {
            if (!zonas[r[1]]) zonas[r[1]] = [];
            zonas[r[1]].push(`• ${r[0]} ➔ \`${r[2]}\``);
        });
        for (const z in zonas) {
            await ctx.replyWithMarkdown(`📍 **ZONA: ${z}**\n` + "—".repeat(15) + "\n" + zonas[z].join('\n'));
        }
    } catch (e) { ctx.reply("❌ Error al leer inventario."); }
});

// --- HISTORIAL ---
bot.hears('📜 HISTORIAL ART.', (ctx) => {
    userState[ctx.from.id] = { step: 'hist_art' };
    ctx.reply("🔍 Ingrese el NOMBRE del artículo:");
});

// --- VER SALIDAS (SOLO SUPERVISOR) ---
bot.hears('📊 VER SALIDAS', async (ctx) => {
    try {
        const res = await axios.get(URL_G, { params: { op: 'ver_salidas' } });
        if (!res.data.length) return ctx.reply("No hay registros recientes.");
        let msg = "📊 **ÚLTIMAS SALIDAS**\n" + "—".repeat(15) + "\n";
        res.data.forEach(r => msg += `• ${new Date(r[0]).toLocaleDateString()} | ${r[3]} | ${r[4]} (${r[5]})\n`);
        ctx.replyWithMarkdown(msg);
    } catch (e) { ctx.reply("❌ Error al cargar registros."); }
});

// --- REPORTE POR ZONAS ---
bot.hears('📂 REPS POR ZONA', async (ctx) => {
    ctx.reply("⏳ Generando reportes...");
    try {
        const res = await axios.get(URL_G, { params: { op: 'reps_por_zona' } });
        for (const zona in res.data) {
            let msg = `📍 **ZONA: ${zona}**\n` + "—".repeat(20) + "\n";
            res.data[zona].forEach(r => {
                msg += `🎫 **TICKET:** \`${r.ticket}\`\n📅 **Fecha:** ${new Date(r.fecha).toLocaleDateString()}\n📦 **Art:** ${r.art} (${r.cant})\n📝 **Nota:** _${r.nota}_\n` + "—".repeat(10) + "\n";
            });
            await ctx.replyWithMarkdown(msg);
        }
    } catch (e) { ctx.reply("❌ Error."); }
});

// --- FLUJO DE ACCIONES (SOLO SUPERVISOR TIENE ESTOS BOTONES) ---
bot.hears(['📥 AGREGAR ART.', '📤 SALIDA ART.', '📝 CREAR REPORTE', '🔄 TRANSFERIR'], async (ctx) => {
    const modo = ctx.message.text;
    userState[ctx.from.id] = { modo, items: [], step: 'esperando_zona' };
    try {
        const res = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
        // Zonas organizadas en 2 columnas
        const btns = [];
        for (let i = 0; i < res.data.length; i += 2) {
            const fila = [Markup.button.callback(res.data[i], `Z:${res.data[i]}`)];
            if (res.data[i + 1]) fila.push(Markup.button.callback(res.data[i + 1], `Z:${res.data[i + 1]}`));
            btns.push(fila);
        }
        if (modo === '📥 AGREGAR ART.') btns.push([Markup.button.callback('➕ NUEVA ZONA', 'Z:NUEVA')]);
        ctx.reply(`📍 [${modo}]\nSeleccione Zona:`, Markup.inlineKeyboard(btns));
    } catch (e) { ctx.reply("❌ Error al cargar zonas."); }
});

bot.on('callback_query', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return ctx.answerCbQuery("Expirado.");
    const data = ctx.callbackQuery.data;

    if (data.startsWith('Z:')) {
        const zona = data.split(':')[1];
        if (zona === 'NUEVA') {
            state.step = 'creando_zona';
            return ctx.reply("📝 Nombre de la NUEVA ZONA:");
        }
        if (state.modo === '🔄 TRANSFERIR' && !state.zona_origen) {
            state.zona_origen = zona;
            ctx.reply("📍 Seleccione Zona DESTINO:"); 
            return ctx.answerCbQuery();
        }
        if (state.modo === '🔄 TRANSFERIR') state.zona_destino = zona; else state.zona = zona;
        state.step = 'esperando_art';
        ctx.reply("📝 Nombre del artículo:");
    } else if (data === 'ADD') {
        state.step = 'esperando_art';
        ctx.reply("📝 Siguiente artículo:");
    } else if (data === 'FIN') {
        state.step = 'esperando_nota';
        ctx.reply("📝 Motivo / Descripción:");
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
        res.data.forEach(r => m += `• ${new Date(r.fecha).toLocaleDateString()} | ${r.zona} | ${r.cant} ${r.signo}\n`);
        delete userState[ctx.from.id];
        return ctx.replyWithMarkdown(m);
    }
    if (state.step === 'creando_zona') {
        state.zona = text; state.step = 'esperando_art';
        return ctx.reply(`✅ Zona "${text}" lista.\n📝 Artículo:`);
    }
    if (state.step === 'esperando_art') {
        state.tempArt = text; state.step = 'esperando_cant';
        ctx.reply(`🔢 Cantidad para ${text}:`);
    } else if (state.step === 'esperando_cant') {
        state.items.push(`${state.tempArt}:${text}`);
        ctx.reply("✅ Agregado.", Markup.inlineKeyboard([[Markup.button.callback('➕ Otro', 'ADD'), Markup.button.callback('💾 Guardar', 'FIN')]]));
    } else if (state.step === 'esperando_nota') {
        ctx.reply("⏳ Generando ticket...");
        await axios.post(URL_G, new URLSearchParams({
            op: 'procesar_accion', modo: state.modo, id: ctx.from.id,
            zona: state.zona || '', zona_origen: state.zona_origen || '',
            zona_destino: state.zona_destino || '', articulos: state.items.join(','), nota: text
        }).toString());
        delete userState[ctx.from.id];
        ctx.reply("✅ REGISTRO EXITOSO.");
    }
});

bot.launch();
app.listen(process.env.PORT || 3000);
