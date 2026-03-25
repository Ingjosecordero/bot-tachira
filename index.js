const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();
app.get('/', (req, res) => res.send('SISTEMA OPERATIVO'));

const userState = {};

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
    try {
        const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (!res.data || !res.data.autorizado) return ctx.reply(`🚫 Acceso denegado: ${ctx.from.id}`);
        ctx.reply(`CONTROL DE REGISTROS Y REPORTES\nBienvenido ${res.data.nombre}.`, mainButtons(res.data.rango));
    } catch (e) { ctx.reply("❌ Error al conectar con Google."); }
});

// --- INVENTARIO POR MENSAJES INDEPENDIENTES ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    ctx.reply("⏳ Consultando inventario por zonas...");
    try {
        const res = await axios.get(URL_G, { params: { op: 'consultar_inv' } });
        const inventario = res.data;
        
        // Agrupamos por zona
        const zonas = {};
        inventario.forEach(r => {
            const zona = r[1].toUpperCase();
            if (!zonas[zona]) zonas[zona] = [];
            zonas[zona].push(`• ${r[0]}  ➔  \`${r[2]}\``);
        });

        // Enviamos un mensaje por cada zona
        for (const zona in zonas) {
            let msg = `📍 **ZONA: ${zona}**\n` + "—".repeat(15) + "\n";
            msg += zonas[zona].join("\n");
            await ctx.replyWithMarkdown(msg);
        }
    } catch (e) { ctx.reply("❌ Error al cargar inventario."); }
});

// --- FLUJO DE REPORTE ---
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
    } 
    else if (data === 'ADD_MORE') {
        state.step = 'esperando_articulo';
        ctx.answerCbQuery();
        ctx.reply("📝 Ingrese el NOMBRE del siguiente artículo:");
    } 
    else if (data === 'FINISH_ITEMS') {
        state.step = 'esperando_detalles';
        ctx.answerCbQuery();
        ctx.reply("📝 Escriba los DETALLES del reporte (Qué se hizo):");
    }
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;
    const text = ctx.message.text.toUpperCase();

    // Validar que no sea un botón del menú
    if (text.includes('INV.') || text.includes('REPORTE')) return;

    if (state.step === 'esperando_articulo') {
        state.tempArt = text;
        ctx.reply(`⏳ Validando stock de "${text}" en ${state.zona}...`);
        const check = await axios.get(URL_G, { params: { op: 'check_stock', art: text, zona: state.zona } });
        
        if (!check.data || !check.data.existe) {
            return ctx.reply(`❌ "${text}" no existe en ${state.zona}. Verifique el nombre.`);
        }
        
        state.stockDisp = check.data.cantidad;
        state.step = 'esperando_cantidad';
        ctx.reply(`🔢 Cantidad (Disponible: ${state.stockDisp}):`);
    } 
    else if (state.step === 'esperando_cantidad') {
        const cant = parseFloat(text);
        if (isNaN(cant) || cant <= 0 || cant > state.stockDisp) {
            return ctx.reply(`❌ Cantidad inválida. Máximo disponible: ${state.stockDisp}`);
        }
        state.items.push(`${state.tempArt}:${cant}`);
        state.step = 'esperando_decision';
        ctx.reply(`✅ Agregado: ${state.tempArt} (${cant})\n¿Desea agregar más?`, 
            Markup.inlineKeyboard([[
                Markup.button.callback('➕ Agregar Otro', 'ADD_MORE'), 
                Markup.button.callback('📝 Detallar y Guardar', 'FINISH_ITEMS')
            ]]));
    }
    else if (state.step === 'esperando_detalles') {
        const detalles = ctx.message.text;
        ctx.reply("⏳ Procesando reporte final...");
        const res = await callApi({
            op: 'registrar_salida',
            id: ctx.from.id,
            art: state.items.join(','),
            zona: state.zona,
            detalles: detalles
        });
        delete userState[ctx.from.id];
        ctx.reply(res && res.ok ? `✅ REPORTE GUARDADO.\n📍 ${state.zona}\n📝 ${detalles}` : "❌ Error al guardar.");
    }
});

bot.launch();
app.listen(process.env.PORT || 3000);
