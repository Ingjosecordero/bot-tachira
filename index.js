const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();
app.get('/', (req, res) => res.send('SISTEMA TACHIRA ACTIVO'));

const userState = {};

// Función de comunicación mejorada para evitar errores de caracteres
const callApi = async (data) => {
    try {
        const formData = new URLSearchParams();
        for (const key in data) { formData.append(key, data[key]); }
        const res = await axios.post(URL_G, formData.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return res.data;
    } catch (e) { return { ok: false, msg: "Error de conexión" }; }
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

// --- INICIO DE REPORTE: PRIMERO LA ZONA ---
bot.hears(['📝 CREAR REPORTE', '📤 SALIDA ART.'], async (ctx) => {
    userState[ctx.from.id] = { items: [], step: 'esperando_zona' };
    const resZonas = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
    const btns = resZonas.data.map(z => [Markup.button.callback(z, `ZSET:${z}`)]);
    ctx.reply("📍 Seleccione la ZONA donde se realiza el trabajo:", Markup.inlineKeyboard(btns));
});

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const state = userState[userId];
    const data = ctx.callbackQuery.data;
    if (!state) return ctx.answerCbQuery("Sesión expirada.");

    // 1. SETEAR ZONA
    if (data.startsWith('ZSET:')) {
        state.zona = data.split(':')[1];
        state.step = 'esperando_articulo';
        ctx.answerCbQuery();
        ctx.reply(`📍 Zona: ${state.zona}\n📝 Ingrese el NOMBRE del artículo:`);
    }
    // 2. DECISIONES
    else if (data === 'ADD_MORE') {
        state.step = 'esperando_articulo';
        ctx.answerCbQuery();
        ctx.reply("📝 Ingrese el NOMBRE del siguiente artículo:");
    } 
    else if (data === 'FINISH_ITEMS') {
        state.step = 'esperando_detalles';
        ctx.answerCbQuery();
        ctx.reply("📝 Describa los DETALLES del trabajo realizado:");
    }
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;

    // VALIDACIÓN DE ARTÍCULO Y STOCK
    if (state.step === 'esperando_articulo') {
        state.tempArt = ctx.message.text.toUpperCase();
        ctx.reply(`⏳ Validando "${state.tempArt}" en ${state.zona}...`);
        
        const check = await axios.get(URL_G, { params: { op: 'check_stock', art: state.tempArt, zona: state.zona } });
        
        if (!check.data || !check.data.existe) {
            return ctx.reply(`❌ El artículo "${state.tempArt}" no existe en el inventario de ${state.zona}. Intente con otro.`);
        }
        
        state.stockDisponible = check.data.cantidad;
        state.step = 'esperando_cantidad';
        ctx.reply(`🔢 Cantidad para "${state.tempArt}" (Disponible: ${state.stockDisponible}):`);
    } 
    
    else if (state.step === 'esperando_cantidad') {
        const cant = parseFloat(ctx.message.text);
        if (isNaN(cant) || cant <= 0) return ctx.reply("❌ Ingrese un número válido.");
        if (cant > state.stockDisponible) return ctx.reply(`❌ No hay stock suficiente. Máximo: ${state.stockDisponible}`);
        
        state.items.push(`${state.tempArt}:${cant}`);
        state.step = 'esperando_decision';
        ctx.reply(`✅ Agregado: ${state.tempArt} (${cant})\n¿Desea agregar más?`, 
            Markup.inlineKeyboard([[Markup.button.callback('➕ Agregar Otro', 'ADD_MORE'), Markup.button.callback('📝 Detallar y Guardar', 'FINISH_ITEMS')]]));
    }

    // CAPTURA DE DETALLES Y GUARDADO FINAL
    else if (state.step === 'esperando_detalles') {
        const detalles = ctx.message.text;
        ctx.reply("⏳ Guardando reporte completo...");
        
        const res = await callApi({
            op: 'registrar_salida',
            id: ctx.from.id,
            art: state.items.join(','),
            zona: state.zona,
            detalles: detalles
        });

        delete userState[ctx.from.id];
        if (res && res.ok) {
            ctx.reply(`✅ REPORTE EXITOSO EN ${state.zona}.\n📝 Detalles: ${detalles}`);
        } else {
            ctx.reply("❌ Error al guardar en Google Sheets. Verifique la conexión.");
        }
    }
});

bot.launch();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Bot Operativo"));
