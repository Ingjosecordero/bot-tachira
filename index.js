const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();
app.get('/', (req, res) => res.send('SISTEMA MULTI-REPORTE ACTIVO'));

const userState = {};

const callApi = async (data) => {
    try {
        const formData = new URLSearchParams();
        for (const key in data) { formData.append(key, data[key]); }
        const res = await axios.post(URL_G, formData.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return res.data;
    } catch (e) { return { ok: false, msg: e.message }; }
};

const mainButtons = (rango) => {
    let btns = [['📦 INV. GENERAL', '📜 HISTORIAL ART.'], ['📤 SALIDA ART.', '🔄 TRANSFERIR'], ['📝 CREAR REPORTE', '📊 VER SALIDAS'], ['📂 REPS POR ZONA']];
    if (rango === "SUPERVISOR") btns.splice(1, 0, ['📥 AGREGAR ART.']);
    return Markup.keyboard(btns).resize();
};

bot.start(async (ctx) => {
    const res = await callApi({ op: 'verificar', id: ctx.from.id });
    if (!res || !res.autorizado) return ctx.reply(`🚫 Acceso denegado: ${ctx.from.id}`);
    ctx.reply(`CONTROL DE REGISTROS Y REPORTES\nBienvenido ${res.nombre}.`, mainButtons(res.rango));
});

// --- INICIO DE REPORTE MULTIPLE ---
bot.hears(['📝 CREAR REPORTE', '📤 SALIDA ART.'], (ctx) => {
    userState[ctx.from.id] = { items: [], step: 'esperando_articulo' };
    ctx.reply("📝 Ingrese el NOMBRE del primer artículo:");
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;

    if (state.step === 'esperando_articulo') {
        state.tempArt = ctx.message.text.toUpperCase();
        state.step = 'esperando_cantidad';
        ctx.reply(`🔢 Cantidad para "${state.tempArt}":`);
    } 
    else if (state.step === 'esperando_cantidad') {
        const cant = parseFloat(ctx.message.text);
        if (isNaN(cant)) return ctx.reply("❌ Ingrese un número válido.");
        
        // Agregamos al carrito
        state.items.push(`${state.tempArt}:${cant}`);
        state.step = 'esperando_decision';
        
        ctx.reply(`✅ Agregado: ${state.tempArt} (${cant})\n\n¿Desea agregar otro artículo al mismo reporte?`, 
            Markup.inlineKeyboard([
                [Markup.button.callback('➕ Agregar Otro', 'ADD_MORE'), Markup.button.callback('💾 Finalizar y Enviar', 'FINISH')]
            ])
        );
    }
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    const state = userState[userId];

    if (!state) return ctx.answerCbQuery("Sesión expirada.");

    if (data === 'ADD_MORE') {
        state.step = 'esperando_articulo';
        ctx.answerCbQuery();
        ctx.reply("📝 Ingrese el NOMBRE del siguiente artículo:");
    } 
    else if (data === 'FINISH') {
        state.step = 'esperando_zona';
        ctx.answerCbQuery();
        const resZonas = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
        const btns = resZonas.data.map(z => [Markup.button.callback(z, `ZSET:${z}`)]);
        ctx.reply("📍 Seleccione la ZONA final para este reporte:", Markup.inlineKeyboard(btns));
    } 
    else if (data.startsWith('ZSET:')) {
        const zona = data.split(':')[1];
        ctx.answerCbQuery();
        ctx.reply(`⏳ Guardando reporte de ${state.items.length} artículos en ${zona}...`);

        // Enviamos todos los artículos juntos separados por comas (formato que espera su Apps Script)
        const res = await callApi({
            op: 'registrar_salida',
            id: userId,
            art: state.items.join(','), // Envía "FIBRA:100,HERRAJE:2"
            zona: zona
        });

        delete userState[userId];
        if (res && res.ok) {
            ctx.reply(`✅ REPORTE COMPLETO GUARDADO EN ${zona}.`);
        } else {
            ctx.reply(`❌ Error al guardar: ${res.msg || "Verifique permisos en Google"}`);
        }
    }
});

bot.launch();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Puerto ${PORT} OK`));
