const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

// NUEVA URL ACTUALIZADA
const URL_G = "https://script.google.com/macros/s/AKfycby2CK3LZ51hmtQC2Pr8Tgzx5Qf2qRy6i8EYVIWE7POwAYJdYm9856EyiqYlvy52arqNqA/exec"; 
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
        if (res.data.autorizado) return ctx.reply(`✅ SISTEMA TACHIRA ACTIVO\nBienvenido ${res.data.nombre}`, mainButtons(res.data.rango));
        ctx.reply(`🚫 ID no autorizado: ${ctx.from.id}`);
    } catch (e) { ctx.reply("❌ Error de conexión con Google."); }
});

// --- INVENTARIO: MENSAJES INDIVIDUALES POR ZONA ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    ctx.reply("⏳ Consultando almacenes...");
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

// --- HISTORIAL CON SIGNOS (+/-) ---
bot.hears('📜 HISTORIAL ART.', (ctx) => {
    userState[ctx.from.id] = { step: 'hist_art' };
    ctx.reply("🔍 Ingrese el NOMBRE del artículo para ver movimientos:");
});

// --- VER SALIDAS (LISTA COMPACTA) ---
bot.hears('📊 VER SALIDAS', async (ctx) => {
    ctx.reply("⏳ Consultando últimas salidas...");
    try {
        const res = await axios.get(URL_G, { params: { op: 'ver_salidas' } });
        if (!res.data || res.data.length === 0) return ctx.reply("No hay salidas recientes.");
        let msg = "📊 **ÚLTIMAS SALIDAS**\n" + "—".repeat(15) + "\n";
        res.data.forEach(r => {
            msg += `• ${new Date(r[0]).toLocaleDateString()} | ${r[3]} | ${r[4]} (${r[5]})\n`;
        });
        ctx.replyWithMarkdown(msg);
    } catch (e) { ctx.reply("❌ Error al cargar historial de salidas."); }
});

// --- REPORTES POR ZONA (MENSAJES POR ZONA) ---
bot.hears('📂 REPS POR ZONA', async (ctx) => {
    ctx.reply("⏳ Consultando últimos reportes por zona...");
    try {
        const res = await axios.get(URL_G, { params: { op: 'reps_por_zona' } });
        for (const zona in res.data) {
            let msg = `📂 **ÚLTIMOS EN ${zona}**\n` + "—".repeat(15) + "\n";
            res.data[zona].forEach(r => {
                msg += `• ${new Date(r[0]).toLocaleDateString()} | ${r[4]} | Cant: ${r[5]}\n`;
            });
            await ctx.replyWithMarkdown(msg);
        }
    } catch (e) { ctx.reply("❌ Error al cargar reportes."); }
});

// --- FLUJO DE ACCIONES (AGREGAR, SALIDA, REPORTE, TRANSFERIR) ---
bot.hears(['📥 AGREGAR ART.', '📤 SALIDA ART.', '📝 CREAR REPORTE', '🔄 TRANSFERIR'], async (ctx) => {
    const modo = ctx.message.text;
    userState[ctx.from.id] = { modo, items: [], step: 'esperando_zona' };
    const res = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
    let btns = res.data.map(z => [Markup.button.callback(z, `Z:${z}`)]);
    if (modo === '📥 AGREGAR ART.') btns.push([Markup.button.callback('➕ NUEVA ZONA', 'Z:NUEVA')]);
    ctx.reply(`📍 [${modo}]\nSeleccione Zona${modo === '🔄 TRANSFERIR' ? ' ORIGEN' : ''}:`, Markup.inlineKeyboard(btns));
});

bot.on('callback_query', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return ctx.answerCbQuery("Sesión expirada.");
    const data = ctx.callbackQuery.data;

    if (data.startsWith('Z:')) {
        const zona = data.split(':')[1];
        if (zona === 'NUEVA') {
            state.step = 'creando_zona';
            return ctx.reply("📝 Escriba el nombre de la NUEVA ZONA:");
        }
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
        if (!res.data || res.data.msg) return ctx.reply(res.data.msg || "Sin datos.");
        let m = `📜 **HISTORIAL: ${text}**\n` + "—".repeat(15) + "\n";
        res.data.forEach(r => m += `• ${new Date(r.fecha).toLocaleDateString()} | ${r.zona} | ${r.cant} ${r.signo}\n`);
        delete userState[ctx.from.id];
        return ctx.replyWithMarkdown(m);
    }
    if (state.step === 'creando_zona') {
        state.zona = text;
        state.step = 'esperando_art';
        return ctx.reply(`✅ Zona "${text}" creada.\n📝 Ingrese el artículo:`);
    }
    if (state.step === 'esperando_art') {
        state.tempArt = text;
        state.step = 'esperando_cant';
        ctx.reply(`🔢 Cantidad para ${text}:`);
    } else if (state.step === 'esperando_cant') {
        state.items.push(`${state.tempArt}:${text}`);
        ctx.reply("✅ Agregado.", Markup.inlineKeyboard([[Markup.button.callback('➕ Otro', 'ADD'), Markup.button.callback('💾 Guardar', 'FIN')]]));
    } else if (state.step === 'esperando_nota') {
        ctx.reply("⏳ Guardando...");
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
