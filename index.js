const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const URL_G = "https://script.google.com/macros/s/AKfycbyKLE8Lj_QzI5G8H_H6bCG9t4YZxLpNRGxR2ZaJMNqbh9Gtg7MIsAMnxu7B7Ow7skLSHQ/exec"; 
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const app = express();
const userState = {};
const api = axios.create({ timeout: 15000 });

app.get('/', (req, res) => res.status(200).send('SISTEMA OPERATIVO'));

const mainButtons = (rango) => {
    const buttons = [
        ['📦 INV. GENERAL', '📜 HISTORIAL ART.'],
        ['📤 SALIDA ART.', '🔄 TRANSFERIR'],
        ['📝 CREAR REPORTE', '📊 VER SALIDAS'],
        ['📂 REPS POR ZONA', '📥 AGREGAR ART.']
    ];
    // Si no es supervisor, limitamos botones por seguridad
    return Markup.keyboard(rango === "SUPERVISOR" ? buttons : [['📦 INV. GENERAL', '📂 REPS POR ZONA']]).resize();
};

// --- COMANDO START ---
bot.start(async (ctx) => {
    try {
        const res = await api.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (res.data && res.data.autorizado) {
            return ctx.reply(`SISTEMA DE REGISTRO Y CONTROL\nBienvenido, ${res.data.nombre}`, mainButtons(res.data.rango));
        }
        ctx.reply("🚫 No autorizado.");
    } catch (e) { ctx.reply("⏳ Error de conexión."); }
});

// --- MANEJO DE TEXTO (BOTONES PRINCIPALES) ---
bot.on('text', async (ctx) => {
    const text = ctx.message.text.toUpperCase().trim();
    const userId = ctx.from.id;
    const state = userState[userId];

    // 1. SI HAY UN FLUJO ACTIVO (Esperando cantidad, nota, etc.)
    if (state && state.step) {
        if (state.step === 'creando_zona') {
            state.zona = text; state.step = 'esperando_art';
            return ctx.reply(`✅ Zona "${text}" lista.\n📝 Escriba el nombre del artículo:`);
        }
        if (state.step === 'esperando_art') {
            state.tempArt = text; state.step = 'esperando_cant';
            return ctx.reply(`🔢 Cantidad para ${text}:`);
        }
        if (state.step === 'esperando_cant') {
            const cant = parseFloat(text);
            if (isNaN(cant)) return ctx.reply("❌ Por favor, ingrese un número válido.");
            
            if (state.modo !== '📥 AGREGAR ART.') {
                const zonaVal = state.zona_origen || state.zona;
                const check = await api.get(URL_G, { params: { op: 'validar_stock', art: state.tempArt, zona: zonaVal, cant: cant } });
                if (!check.data.existe) { state.step = 'esperando_art'; return ctx.reply(`⚠️ No existe "${state.tempArt}" en ${zonaVal}. Intente otro:`); }
                if (!check.data.suficiente) { state.step = 'esperando_art'; return ctx.reply(`⚠️ Insuficiente en ${zonaVal} (Hay ${check.data.stock}). Intente otro:`); }
            }
            state.items.push(`${state.tempArt}:${cant}`);
            return ctx.reply(`✅ "${state.tempArt}" añadido.`, Markup.inlineKeyboard([[Markup.button.callback('➕ Otro', 'ADD'), Markup.button.callback('💾 Continuar', 'FIN')]]));
        }
        if (state.step === 'esperando_nota') {
            ctx.reply("⏳ Guardando en base de datos...");
            try {
                const res = await api.post(URL_G, new URLSearchParams({
                    op: 'procesar_accion', modo: state.modo, id: userId,
                    zona: state.zona || '', zona_origen: state.zona_origen || '',
                    zona_destino: state.zona_destino || '', articulos: state.items.join(','), nota: text
                }).toString());
                delete userState[userId];
                return ctx.reply(`✅ REGISTRO EXITOSO.\nTicket: ${res.data.ticket}`);
            } catch (e) { return ctx.reply("❌ Error al guardar."); }
        }
        return;
    }

    // 2. DETECCIÓN DE BOTONES DEL MENÚ
    if (text === '📦 INV. GENERAL') {
        const res = await api.get(URL_G, { params: { op: 'consultar_inv' } });
        const zon = {};
        res.data.forEach(r => { if (!zon[r[1]]) zon[r[1]] = []; zon[r[1]].push(`• ${r[0]} ➔ \`${r[2]}\``); });
        for (const z in zon) await ctx.replyWithMarkdown(`📍 **ZONA: ${z}**\n${zon[z].join('\n')}`);
    } 
    else if (text === '📂 REPS POR ZONA') {
        const res = await api.get(URL_G, { params: { op: 'ver_zonas' } });
        const btns = res.data.map(z => [Markup.button.callback(z, `CONSULTA:${z}`)]);
        ctx.reply("📂 Seleccione zona:", Markup.inlineKeyboard(btns));
    }
    else if (['📥 AGREGAR ART.', '📤 SALIDA ART.', '📝 CREAR REPORTE', '🔄 TRANSFERIR'].includes(text)) {
        userState[userId] = { modo: text, items: [], step: 'esperando_zona' };
        const res = await api.get(URL_G, { params: { op: 'ver_zonas' } });
        const btns = res.data.map(z => [Markup.button.callback(z, `Z:${z}`)]);
        if (text === '📥 AGREGAR ART.') btns.push([Markup.button.callback('➕ NUEVA ZONA', 'Z:NUEVA')]);
        ctx.reply(text === '🔄 TRANSFERIR' ? "📍 Zona ORIGEN:" : "📍 Seleccione zona:", Markup.inlineKeyboard(btns));
    }
});

// --- CALLBACK QUERIES (BOTONES INTERNOS) ---
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    const state = userState[userId];

    if (data.startsWith('CONSULTA:')) {
        const zonaSel = data.split(':')[1];
        const res = await api.get(URL_G, { params: { op: 'reps_por_zona', zona: zonaSel } });
        if (!res.data.orden || res.data.orden.length === 0) return ctx.reply("Sin reportes recientes.");
        for (const tkt of res.data.orden) {
            const info = res.data.datos[tkt];
            let msg = `📍 **ZONA:** ${zonaSel}\n🎫 **TICKET:** \`${tkt}\`\n👤 **RESP:** ${info.responsable}\n📦 **ARTÍCULOS:**\n`;
            info.arts.forEach(art => msg += `  • ${art}\n`);
            msg += `📝 **NOTA:** _${info.nota}_`;
            await ctx.replyWithMarkdown(msg);
        }
    } 
    else if (state && data.startsWith('Z:')) {
        const zona = data.split(':')[1];
        if (zona === 'NUEVA') { state.step = 'creando_zona'; ctx.reply("📝 Nombre de nueva zona:"); }
        else {
            if (state.modo === '🔄 TRANSFERIR' && !state.zona_origen) state.zona_origen = zona;
            else if (state.modo === '🔄 TRANSFERIR' && state.step === 'esperando_destino') {
                state.zona_destino = zona; state.step = 'esperando_nota';
                return ctx.reply("📝 Detalles de transferencia:");
            } else state.zona = zona;
            state.step = 'esperando_art';
            ctx.reply(`📦 Seleccionado: ${zona}\nEscriba el nombre del artículo:`);
        }
    } 
    else if (state && data === 'ADD') { state.step = 'esperando_art'; ctx.reply("📝 Siguiente artículo:"); }
    else if (state && data === 'FIN') {
        if (state.modo === '🔄 TRANSFERIR') {
            state.step = 'esperando_destino';
            const res = await api.get(URL_G, { params: { op: 'ver_zonas' } });
            const btns = res.data.filter(z => z !== state.zona_origen).map(z => [Markup.button.callback(z, `Z:${z}`)]);
            return ctx.reply("📍 Seleccione zona DESTINO:", Markup.inlineKeyboard(btns));
        }
        state.step = 'esperando_nota'; ctx.reply("📝 Nota final:");
    }
    ctx.answerCbQuery();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Puerto ${PORT}`);
    bot.launch();
});
