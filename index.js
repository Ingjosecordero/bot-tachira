const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const URL_G = "https://script.google.com/macros/s/AKfycbyKLE8Lj_QzI5G8H_H6bCG9t4YZxLpNRGxR2ZaJMNqbh9Gtg7MIsAMnxu7B7Ow7skLSHQ/exec"; 
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const app = express();
const userState = {};
const api = axios.create({ timeout: 15000 });

app.get('/', (req, res) => res.status(200).send('OK'));

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
        const res = await api.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (res.data && res.data.autorizado) {
            return ctx.reply(`SISTEMA DE REGISTRO Y CONTROL\nBienvenido, ${res.data.nombre}`, mainButtons(res.data.rango));
        }
        ctx.reply("🚫 No autorizado.");
    } catch (e) { ctx.reply("⏳ Error de conexión. Reintente."); }
});

bot.hears('📦 INV. GENERAL', async (ctx) => {
    ctx.reply("⏳ Consultando inventario...");
    try {
        const res = await api.get(URL_G, { params: { op: 'consultar_inv' } });
        const zon = {};
        res.data.forEach(r => {
            if (!zon[r[1]]) zon[r[1]] = [];
            zon[r[1]].push(`• ${r[0]} ➔ \`${r[2]}\``);
        });
        for (const z in zon) await ctx.replyWithMarkdown(`📍 **ZONA: ${z}**\n` + "—".repeat(15) + "\n" + zon[z].join('\n'));
    } catch (e) { ctx.reply("❌ Error."); }
});

bot.hears('📂 REPS POR ZONA', async (ctx) => {
    try {
        const res = await api.get(URL_G, { params: { op: 'ver_zonas' } });
        const btns = res.data.map(z => [Markup.button.callback(z, `CONSULTA:${z}`)]);
        ctx.reply("📂 Seleccione zona para reportes:", Markup.inlineKeyboard(btns));
    } catch (e) { ctx.reply("❌ Error al cargar zonas."); }
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const state = userState[ctx.from.id];

    if (data.startsWith('CONSULTA:')) {
        const zonaSel = data.split(':')[1];
        try {
            const res = await api.get(URL_G, { params: { op: 'reps_por_zona', zona: zonaSel } });
            if (!res.data.orden || res.data.orden.length === 0) return ctx.reply(`No hay reportes en ${zonaSel}.`);
            for (const tkt of res.data.orden) {
                const info = res.data.datos[tkt];
                const f = new Date(info.fecha);
                const fFmt = `${String(f.getDate()).padStart(2,'0')}/${String(f.getMonth()+1).padStart(2,'0')}/${f.getFullYear()}`;
                let msg = `📍 **ZONA:** ${zonaSel}\n🎫 **TICKET:** \`${tkt}\`\n📅 **FECHA:** ${fFmt}\n👤 **RESP:** ${info.responsable}\n📦 **ARTÍCULOS:**\n`;
                info.arts.forEach(art => msg += `  • ${art}\n`);
                msg += `📝 **DETALLES:** _${info.nota}_\n` + "—".repeat(15);
                await ctx.replyWithMarkdown(msg);
            }
        } catch (e) { ctx.reply("❌ Error en la consulta."); }
        return ctx.answerCbQuery();
    }

    if (!state) return ctx.answerCbQuery();

    if (data.startsWith('Z:')) {
        const zona = data.split(':')[1];
        if (zona === 'NUEVA') { state.step = 'creando_zona'; return ctx.reply("📝 Nombre de la nueva zona:"); }
        if (state.modo === '🔄 TRANSFERIR' && !state.zona_origen) { 
            state.zona_origen = zona; 
        } else if (state.modo === '🔄 TRANSFERIR' && state.step === 'esperando_destino') {
            state.zona_destino = zona; state.step = 'esperando_nota';
            return ctx.reply("📝 Detalles de transferencia:");
        } else { state.zona = zona; }
        state.step = 'esperando_art';
        ctx.reply(`📦 Zona: ${zona}\nEscriba el artículo:`);
    } else if (data === 'ADD') {
        state.step = 'esperando_art'; ctx.reply("📝 Siguiente:");
    } else if (data === 'FIN') {
        if (state.modo === '🔄 TRANSFERIR') {
            state.step = 'esperando_destino';
            const res = await api.get(URL_G, { params: { op: 'ver_zonas' } });
            const btns = res.data.filter(z => z !== state.zona_origen).map(z => [Markup.button.callback(z, `Z:${z}`)]);
            return ctx.reply("📍 Zona DESTINO:", Markup.inlineKeyboard(btns));
        }
        state.step = 'esperando_nota'; ctx.reply("📝 Nota final:");
    }
    ctx.answerCbQuery();
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;
    const text = ctx.message.text.toUpperCase().trim();

    if (state.step === 'creando_zona') { state.zona = text; state.step = 'esperando_art'; return ctx.reply(`✅ Zona "${text}" lista.\n📝 Artículo:`); }

    if (state.step === 'esperando_art') {
        state.tempArt = text; state.step = 'esperando_cant';
        ctx.reply(`🔢 Cantidad para ${text}:`);
    } else if (state.step === 'esperando_cant') {
        const cant = parseFloat(text);
        if (state.modo !== '📥 AGREGAR ART.') {
            const zonaVal = state.zona_origen || state.zona;
            const check = await api.get(URL_G, { params: { op: 'validar_stock', art: state.tempArt, zona: zonaVal, cant: cant } });
            if (!check.data.existe) { state.step = 'esperando_art'; return ctx.reply(`⚠️ No existe "${state.tempArt}" en ${zonaVal}. Reintente:`); }
            if (!check.data.suficiente) { state.step = 'esperando_art'; return ctx.reply(`⚠️ Insuficiente en ${zonaVal} (Hay ${check.data.stock}). Reintente:`); }
        }
        state.items.push(`${state.tempArt}:${cant}`);
        ctx.reply(`✅ Añadido.`, Markup.inlineKeyboard([[Markup.button.callback('➕ Otro', 'ADD'), Markup.button.callback('💾 Guardar', 'FIN')]]));
    } else if (state.step === 'esperando_nota') {
        const res = await api.post(URL_G, new URLSearchParams({
            op: 'procesar_accion', modo: state.modo, id: ctx.from.id,
            zona: state.zona || '', zona_origen: state.zona_origen || '',
            zona_destino: state.zona_destino || '', articulos: state.items.join(','), nota: text
        }).toString());
        delete userState[ctx.from.id];
        ctx.reply(`✅ ÉXITO. Ticket: ${res.data.ticket}`);
    }
});

app.listen(process.env.PORT || 3000);
bot.launch();
