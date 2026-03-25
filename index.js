const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const URL_G = "https://script.google.com/macros/s/AKfycbyAykHfwTjMIBwfSmN-nCYQf7VGzEzoUKqSzH_wZ2XMI491YyrXOGon4_FXZCRmLJiVJA/exec"; 
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
    // Menú para técnicos o rangos no definidos
    return Markup.keyboard([
        ['📦 INV. GENERAL', '📜 HISTORIAL ART.'],
        ['📂 REPS POR ZONA']
    ]).resize();
};

bot.start(async (ctx) => {
    ctx.reply("⏳ Verificando credenciales...");
    try {
        const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (res.data && res.data.autorizado) {
            return ctx.reply(`✅ ACCESO CONCEDIDO\nHola ${res.data.nombre}\nNivel: ${res.data.rango}`, mainButtons(res.data.rango));
        }
        ctx.reply(`🚫 ID ${ctx.from.id} no registrado en el sistema.`);
    } catch (e) {
        console.error(e);
        ctx.reply("❌ Error de conexión con la base de datos de Google.");
    }
});

// --- REPORTES POR ZONA ---
bot.hears('📂 REPS POR ZONA', async (ctx) => {
    ctx.reply("📂 Seleccione la zona para consultar:");
    try {
        const res = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
        const btns = [];
        for (let i = 0; i < res.data.length; i += 2) {
            const fila = [Markup.button.callback(res.data[i], `CONSULTA:${res.data[i]}`)];
            if (res.data[i+1]) fila.push(Markup.button.callback(res.data[i+1], `CONSULTA:${res.data[i+1]}`));
            btns.push(fila);
        }
        ctx.reply("Zonas disponibles:", Markup.inlineKeyboard(btns));
    } catch (e) { ctx.reply("❌ No se pudieron cargar las zonas."); }
});

// --- INVENTARIO ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    ctx.reply("⏳ Consultando...");
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
    ctx.reply(`📍 [${modo}]\nElija zona:`, Markup.inlineKeyboard(btns));
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith('CONSULTA:')) {
        const zonaSel = data.split(':')[1];
        const res = await axios.get(URL_G, { params: { op: 'reps_por_zona', zona: zonaSel } });
        if (!res.data.orden.length) return ctx.reply("No hay reportes recientes.");
        for (const tkt of res.data.orden) {
            const info = res.data.datos[tkt];
            let msg = `🎫 **TICKET:** \`${tkt}\`\n📅 **Fecha:** ${new Date(info.fecha).toLocaleDateString()}\n📝 **Nota:** _${info.nota}_\n📦 **Materiales:**\n`;
            info.arts.forEach(art => msg += `  • ${art}\n`);
            await ctx.replyWithMarkdown(msg + "—".repeat(15));
        }
        return ctx.answerCbQuery();
    }

    const state = userState[ctx.from.id];
    if (!state) return ctx.answerCbQuery();

    if (data.startsWith('Z:')) {
        const zona = data.split(':')[1];
        if (zona === 'NUEVA') {
            state.step = 'creando_zona';
            return ctx.reply("Escriba el nombre:");
        }
        if (state.modo === '🔄 TRANSFERIR' && !state.zona_origen) {
            state.zona_origen = zona;
            return ctx.reply("📍 Seleccione DESTINO:");
        }
        state.zona = zona; state.zona_destino = zona;
        state.step = 'esperando_art';
        ctx.reply("📝 Artículo:");
    } else if (data === 'ADD') {
        state.step = 'esperando_art';
        ctx.reply("📝 Siguiente artículo:");
    } else if (data === 'FIN') {
        state.step = 'esperando_nota';
        ctx.reply("📝 Descripción del reporte:");
    }
    ctx.answerCbQuery();
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
        ctx.reply("✅ Agregado.", Markup.inlineKeyboard([[Markup.button.callback('➕ Otro', 'ADD'), Markup.button.callback('💾 Guardar', 'FIN')]]));
    } else if (state.step === 'esperando_nota') {
        ctx.reply("⏳ Guardando...");
        const res = await axios.post(URL_G, new URLSearchParams({
            op: 'procesar_accion', modo: state.modo, id: ctx.from.id,
            zona: state.zona || '', zona_origen: state.zona_origen || '',
            zona_destino: state.zona_destino || '', articulos: state.items.join(','), nota: text
        }).toString());
        delete userState[ctx.from.id];
        ctx.replyWithMarkdown(`✅ **ÉXITO**\n🎫 Ticket: \`${res.data.ticket}\``);
    }
});

bot.launch();
app.listen(process.env.PORT || 3000);
