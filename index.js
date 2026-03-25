const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();
app.get('/', (req, res) => res.send('BOT TACHIRA OPERATIVO'));

const userState = {};

const callApi = async (data) => {
    try {
        const formData = new URLSearchParams();
        for (const key in data) { formData.append(key, data[key]); }
        const res = await axios.post(URL_G, formData.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return res.data;
    } catch (e) { return { ok: false, msg: "Error de conexión con la base de datos" }; }
};

const mainButtons = (rango) => {
    let btns = [['📦 INV. GENERAL', '📜 HISTORIAL ART.'], ['📤 SALIDA ART.', '🔄 TRANSFERIR'], ['📝 CREAR REPORTE', '📊 VER SALIDAS'], ['📂 REPS POR ZONA']];
    if (rango === "SUPERVISOR") btns.splice(1, 0, ['📥 AGREGAR ART.']);
    return Markup.keyboard(btns).resize();
};

bot.start(async (ctx) => {
    const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
    if (!res.data || !res.data.autorizado) return ctx.reply(`🚫 Acceso denegado: ${ctx.from.id}`);
    ctx.reply(`CONTROL DE REGISTROS Y REPORTES\nBienvenido ${res.data.nombre}.`, mainButtons(res.data.rango));
});

// --- INICIO DE REPORTE ---
bot.hears(['📝 CREAR REPORTE', '📤 SALIDA ART.'], async (ctx) => {
    userState[ctx.from.id] = { items: [], step: 'esperando_zona' };
    const resZonas = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
    const btns = resZonas.data.map(z => [Markup.button.callback(z, `ZSET:${z}`)]);
    ctx.reply("📍 Seleccione la ZONA del trabajo:", Markup.inlineKeyboard(btns));
});

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const state = userState[userId];
    const data = ctx.callbackQuery.data;
    if (!state) return ctx.answerCbQuery("Sesión expirada.");

    if (data.startsWith('ZSET:')) {
        state.zona = data.split(':')[1];
        state.step = 'esperando_articulo';
        ctx.answerCbQuery();
        ctx.reply(`📍 Zona: ${state.zona}\n📝 Ingrese el NOMBRE del artículo:`);
    } else if (data === 'ADD_MORE') {
        state.step = 'esperando_articulo';
        ctx.answerCbQuery();
        ctx.reply("📝 Ingrese el NOMBRE del siguiente artículo:");
    } else if (data === 'FINISH_ITEMS') {
        state.step = 'esperando_detalles';
        ctx.answerCbQuery();
        ctx.reply("📝 Describa brevemente el trabajo realizado:");
    }
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;

    // Filtro para ignorar clics accidentales en el menú principal
    const text = ctx.message.text.trim();
    if (text.startsWith('📦') || text.startsWith('📜') || text.startsWith('📝') || text.startsWith('/')) return;

    if (state.step === 'esperando_articulo') {
        state.tempArt = text.toUpperCase();
        ctx.reply(`⏳ Verificando "${state.tempArt}" en ${state.zona}...`);
        
        const check = await axios.get(URL_G, { params: { op: 'check_stock', art: state.tempArt, zona: state.zona } });
        
        if (!check.data || !check.data.existe) {
            return ctx.reply(`❌ "${state.tempArt}" NO existe en ${state.zona}. Verifique el nombre o consulte el inventario.`);
        }
        
        state.stockDisponible = check.data.cantidad;
        state.step = 'esperando_cantidad';
        ctx.reply(`🔢 Cantidad para "${state.tempArt}" (Disponible: ${state.stockDisponible}):`);
    } 
    else if (state.step === 'esperando_cantidad') {
        const cant = parseFloat(text);
        if (isNaN(cant) || cant <= 0) return ctx.reply("❌ Ingrese un número válido.");
        if (cant > state.stockDisponible) return ctx.reply(`❌ Stock insuficiente. Máximo: ${state.stockDisponible}`);
        
        state.items.push(`${state.tempArt}:${cant}`);
        state.step = 'esperando_decision';
        ctx.reply(`✅ Agregado: ${state.tempArt} (${cant})\n¿Desea agregar más materiales?`, 
            Markup.inlineKeyboard([[Markup.button.callback('➕ Otro Artículo', 'ADD_MORE'), Markup.button.callback('📝 Finalizar', 'FINISH_ITEMS')]]));
    }
    else if (state.step === 'esperando_detalles') {
        const detalles = text;
        ctx.reply("⏳ Guardando reporte final...");
        
        const res = await callApi({
            op: 'registrar_salida',
            id: ctx.from.id,
            art: state.items.join(','),
            zona: state.zona,
            detalles: detalles
        });

        delete userState[ctx.from.id];
        if (res && res.ok) {
            ctx.reply(`✅ REPORTE GUARDADO.\n📍 Zona: ${state.zona}\n📝 Descripción: ${detalles}`);
        } else {
            ctx.reply("❌ No se pudo guardar. Intente de nuevo.");
        }
    }
});

bot.launch();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor iniciado"));
