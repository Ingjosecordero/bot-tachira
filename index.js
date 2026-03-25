const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();
app.get('/', (req, res) => res.send('SISTEMA TACHIRA OPERATIVO'));

const userState = {};

// Función para enviar reportes finales a Google Sheets
const callApi = async (data) => {
    try {
        const params = new URLSearchParams();
        for (const key in data) { params.append(key, data[key]); }
        const res = await axios.post(URL_G, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 20000 // Aumentado para evitar cortes por lentitud de Google
        });
        return res.data;
    } catch (e) { return { ok: false, msg: "Fallo de conexión" }; }
};

const mainButtons = (rango) => {
    let btns = [['📦 INV. GENERAL', '📜 HISTORIAL ART.'], ['📤 SALIDA ART.', '🔄 TRANSFERIR'], ['📝 CREAR REPORTE', '📊 VER SALIDAS'], ['📂 REPS POR ZONA']];
    if (rango === "SUPERVISOR") btns.splice(1, 0, ['📥 AGREGAR ART.']);
    return Markup.keyboard(btns).resize();
};

bot.start(async (ctx) => {
    try {
        const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (res.data && res.data.autorizado) {
            return ctx.reply(`✅ Acceso Concedido\nBienvenido ${res.data.nombre}.`, mainButtons(res.data.rango));
        }
        ctx.reply(`🚫 ID no autorizado: ${ctx.from.id}`);
    } catch (e) { ctx.reply("❌ Error al conectar con el servidor."); }
});

// --- INVENTARIO: MENSAJES INDEPENDIENTES POR ZONA ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    ctx.reply("⏳ Consultando almacenes...");
    try {
        const res = await axios.get(URL_G, { params: { op: 'consultar_inv' } });
        const zonas = {};
        res.data.forEach(r => {
            const z = r[1].toUpperCase().trim();
            if (!zonas[z]) zonas[z] = [];
            zonas[z].push(`• ${r[0]}  ➔  \`${r[2]}\``);
        });
        for (const z in zonas) {
            await ctx.replyWithMarkdown(`📍 **ZONA: ${z}**\n` + "—".repeat(20) + "\n" + zonas[z].join("\n"));
        }
    } catch (e) { ctx.reply("❌ Error al cargar inventario."); }
});

// --- FLUJO DE REPORTE ---
bot.hears(['📝 CREAR REPORTE', '📤 SALIDA ART.'], async (ctx) => {
    userState[ctx.from.id] = { items: [], step: 'esperando_zona' };
    try {
        const resZonas = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
        const btns = resZonas.data.map(z => [Markup.button.callback(z, `ZSET:${z}`)]);
        ctx.reply("📍 Seleccione la ZONA del trabajo:", Markup.inlineKeyboard(btns));
    } catch (e) { ctx.reply("❌ Error al cargar zonas."); }
});

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const state = userState[userId];
    if (!state) return ctx.answerCbQuery("Sesión expirada.");

    const data = ctx.callbackQuery.data;

    if (data.startsWith('ZSET:')) {
        state.zona = data.split(':')[1];
        state.step = 'esperando_articulo';
        await ctx.answerCbQuery();
        ctx.reply(`📍 Zona: ${state.zona}\n📝 Escriba el NOMBRE del artículo:`);
    } else if (data === 'ADD_MORE') {
        state.step = 'esperando_articulo';
        await ctx.answerCbQuery();
        ctx.reply("📝 Ingrese el nombre del siguiente artículo:");
    } else if (data === 'FINISH') {
        state.step = 'esperando_detalles';
        await ctx.answerCbQuery();
        ctx.reply("📝 Escriba los DETALLES del trabajo realizado (Ej: Mantenimiento o Cliente Nuevo):");
    }
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state || state.step === 'esperando_zona') return;

    const text = ctx.message.text.trim();
    if (text.startsWith('📦') || text.startsWith('📝') || text.startsWith('/')) return;

    if (state.step === 'esperando_articulo') {
        // Limpiamos espacios múltiples para comparación exacta
        state.tempArt = text.replace(/\s+/g, ' ').toUpperCase();
        ctx.reply(`⏳ Validando "${state.tempArt}" en ${state.zona}...`);
        
        try {
            const res = await axios.get(URL_G, { params: { op: 'check_stock', art: state.tempArt, zona: state.zona } });
            if (!res.data || !res.data.existe) {
                return ctx.reply(`❌ El artículo "${state.tempArt}" no se encontró en ${state.zona}.\n\n💡 Sugerencia: Verifique el nombre en 📦 INV. GENERAL.`);
            }
            state.stockDisp = parseFloat(res.data.cantidad);
            state.step = 'esperando_cantidad';
            ctx.reply(`🔢 Cantidad para "${state.tempArt}"\n(Disponible: ${state.stockDisp}):`);
        } catch (e) { ctx.reply("❌ Error al validar artículo."); }
    } 
    else if (state.step === 'esperando_cantidad') {
        const cant = parseFloat(text.replace(',', '.'));
        if (isNaN(cant) || cant <= 0 || cant > state.stockDisp) {
            return ctx.reply(`❌ Cantidad inválida. Debe ser mayor a 0 y menor o igual a ${state.stockDisp}.`);
        }
        state.items.push(`${state.tempArt}:${cant}`);
        state.step = 'esperando_decision';
        ctx.reply(`✅ Agregado: ${state.tempArt} (${cant})\n¿Desea incluir algo más?`, 
            Markup.inlineKeyboard([[
                Markup.button.callback('➕ Agregar Otro', 'ADD_MORE'), 
                Markup.button.callback('💾 Finalizar y Guardar', 'FINISH')
            ]]));
    }
    else if (state.step === 'esperando_detalles') {
        ctx.reply("⏳ Procesando reporte final...");
        const res = await callApi({
            op: 'registrar_salida',
            id: ctx.from.id,
            art: state.items.join(','),
            zona: state.zona,
            detalles: text
        });
        delete userState[ctx.from.id];
        if (res && res.ok) {
            ctx.reply(`✅ REPORTE GUARDADO CON ÉXITO.\n📍 Zona: ${state.zona}\n📝 Detalles: ${text}`);
        } else {
            ctx.reply("❌ Error al guardar en Google Sheets. Reintente el reporte.");
        }
    }
});

bot.launch();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo puerto ${PORT}`));
