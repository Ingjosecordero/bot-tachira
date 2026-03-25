const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const URL_G = "https://script.google.com/macros/s/AKfycbx8BW_loUDwwEFophEMKTg0x1ajfIGGw0eT6Wt-UoPjiL71vNY-kawDwq7DpvqSluLGDQ/exec"; 
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const app = express();
const userState = {};
const api = axios.create({ timeout: 15000 });

// Respuesta para Cron-job.org
app.get('/', (req, res) => res.status(200).send('SISTEMA TACHIRA OPERATIVO'));

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
            return ctx.reply(`✅ SISTEMA CONECTADO\nHola ${res.data.nombre}`, mainButtons(res.data.rango));
        }
        ctx.reply("🚫 No autorizado.");
    } catch (e) { ctx.reply("⏳ Iniciando conexión..."); }
});

// CONSULTA DE REPORTES POR ZONA
bot.hears('📂 REPS POR ZONA', async (ctx) => {
    try {
        const res = await api.get(URL_G, { params: { op: 'ver_zonas' } });
        const btns = [];
        for (let i = 0; i < res.data.length; i += 2) {
            const fila = [Markup.button.callback(res.data[i], `CONSULTA:${res.data[i]}`)];
            if (res.data[i+1]) fila.push(Markup.button.callback(res.data[i+1], `CONSULTA:${res.data[i+1]}`));
            btns.push(fila);
        }
        ctx.reply("📂 Seleccione la zona para consultar:", Markup.inlineKeyboard(btns));
    } catch (e) { ctx.reply("❌ Error al cargar zonas."); }
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith('CONSULTA:')) {
        const zonaSel = data.split(':')[1];
        try {
            const res = await api.get(URL_G, { params: { op: 'reps_por_zona', zona: zonaSel } });
            if (!res.data.orden || res.data.orden.length === 0) return ctx.reply(`No hay reportes en ${zonaSel}.`);
            
            for (const tkt of res.data.orden) {
                const info = res.data.datos[tkt];
                const f = new Date(info.fecha);
                const fechaFmt = `${String(f.getDate()).padStart(2,'0')}/${String(f.getMonth()+1).padStart(2,'0')}/${f.getFullYear()}`;
                
                let msg = `📍 **ZONA:** ${zonaSel}\n`;
                msg += `🎫 **TICKET:** \`${tkt}\`\n`;
                msg += `📅 **FECHA:** ${fechaFmt}\n`;
                msg += `👤 **RESPONSABLE:** ${info.responsable}\n`;
                msg += `📦 **ARTÍCULOS:**\n`;
                info.arts.forEach(art => msg += `  • ${art}\n`);
                msg += `📝 **DETALLES:** _${info.nota}_\n`;
                msg += "—".repeat(18);
                
                await ctx.replyWithMarkdown(msg);
            }
        } catch (e) { ctx.reply("❌ Error en la consulta."); }
        return ctx.answerCbQuery();
    }

    const state = userState[ctx.from.id];
    if (!state) return ctx.answerCbQuery();

    if (data.startsWith('Z:')) {
        state.zona = data.split(':')[1];
        state.step = 'esperando_art';
        ctx.reply(`📦 Zona: ${state.zona}\nEscriba el nombre del artículo:`);
    } else if (data === 'ADD') {
        state.step = 'esperando_art';
        ctx.reply("📝 Siguiente artículo:");
    } else if (data === 'FIN') {
        state.step = 'esperando_nota';
        ctx.reply("📝 Descripción del trabajo:");
    }
    ctx.answerCbQuery();
});

// INVENTARIO GENERAL
bot.hears('📦 INV. GENERAL', async (ctx) => {
    try {
        const res = await api.get(URL_G, { params: { op: 'consultar_inv' } });
        const zon = {};
        res.data.forEach(r => {
            if (!zon[r[1]]) zon[r[1]] = [];
            zon[r[1]].push(`• ${r[0]} ➔ \`${r[2]}\``);
        });
        for (const z in zon) await ctx.replyWithMarkdown(`📍 **ZONA: ${z}**\n` + "—".repeat(15) + "\n" + zon[z].join('\n'));
    } catch (e) { ctx.reply("❌ Error de lectura."); }
});

// ACCIONES
bot.hears(['📥 AGREGAR ART.', '📤 SALIDA ART.', '📝 CREAR REPORTE', '🔄 TRANSFERIR'], async (ctx) => {
    const modo = ctx.message.text;
    userState[ctx.from.id] = { modo, items: [], step: 'esperando_zona' };
    const res = await api.get(URL_G, { params: { op: 'ver_zonas' } });
    const btns = res.data.map(z => [Markup.button.callback(z, `Z:${z}`)]);
    ctx.reply(`📍 [${modo}]\nElija zona:`, Markup.inlineKeyboard(btns));
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;
    const text = ctx.message.text.toUpperCase().trim();

    if (state.step === 'esperando_art') {
        state.tempArt = text; state.step = 'esperando_cant';
        ctx.reply(`🔢 Cantidad para ${text}:`);
    } else if (state.step === 'esperando_cant') {
        state.items.push(`${state.tempArt}:${text}`);
        ctx.reply(`✅ Añadido.`, Markup.inlineKeyboard([[Markup.button.callback('➕ Otro', 'ADD'), Markup.button.callback('💾 Guardar', 'FIN')]]));
    } else if (state.step === 'esperando_nota') {
        ctx.reply("⏳ Guardando...");
        try {
            const res = await api.post(URL_G, new URLSearchParams({
                op: 'procesar_accion', modo: state.modo, id: ctx.from.id,
                zona: state.zona || '', articulos: state.items.join(','), nota: text
            }).toString());
            delete userState[ctx.from.id];
            ctx.reply(`✅ ÉXITO. Ticket: ${res.data.ticket}`);
        } catch (e) { ctx.reply("❌ Error."); }
    }
});

app.listen(process.env.PORT || 3000);
bot.launch();
