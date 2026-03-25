const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();
app.get('/', (req, res) => res.send('BOT TACHIRA ONLINE'));

const userState = {};

const callApi = async (data) => {
    try {
        const params = new URLSearchParams();
        for (const key in data) { params.append(key, data[key]); }
        const res = await axios.post(URL_G, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000
        });
        return res.data;
    } catch (e) { return { ok: false, msg: "Error de red" }; }
};

const mainButtons = (rango) => {
    let btns = [['📦 INV. GENERAL', '📜 HISTORIAL ART.'], ['📤 SALIDA ART.', '🔄 TRANSFERIR'], ['📝 CREAR REPORTE', '📊 VER SALIDAS'], ['📂 REPS POR ZONA']];
    if (rango === "SUPERVISOR") btns.splice(1, 0, ['📥 AGREGAR ART.']);
    return Markup.keyboard(btns).resize();
};

bot.start(async (ctx) => {
    const res = await axios.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
    if (res.data && res.data.autorizado) {
        return ctx.reply(`CONTROL DE REGISTROS\nBienvenido ${res.data.nombre}.`, mainButtons(res.data.rango));
    }
    ctx.reply("🚫 Acceso denegado.");
});

// --- INVENTARIO ESTÉTICO POR MENSAJES ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    ctx.reply("⏳ Consultando inventario por zonas...");
    try {
        const res = await axios.get(URL_G, { params: { op: 'consultar_inv' } });
        const zonas = {};
        res.data.forEach(r => {
            const zonaNombre = r[1].toUpperCase().trim();
            if (!zonas[zonaNombre]) zonas[zonaNombre] = [];
            zonas[zonaNombre].push(`• ${r[0]}  ➔  \`${r[2]}\``);
        });

        for (const zona in zonas) {
            let msg = `📍 **ZONA: ${zona}**\n` + "—".repeat(15) + "\n";
            msg += zonas[zona].join("\n");
            await ctx.replyWithMarkdown(msg);
        }
    } catch (e) { ctx.reply("❌ Error al cargar inventario."); }
});

bot.hears(['📝 CREAR REPORTE', '📤 SALIDA ART.'], async (ctx) => {
    userState[ctx.from.id] = { items: [], step: 'esperando_zona' };
    const resZonas = await axios.get(URL_G, { params: { op: 'ver_zonas' } });
    const btns = resZonas.data.map(z => [Markup.button.callback(z, `ZSET:${z}`)]);
    ctx.reply("📍 Seleccione la ZONA:", Markup.inlineKeyboard(btns));
});

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const state = userState[userId];
    if (!state) return;

    if (ctx.callbackQuery.data.startsWith('ZSET:')) {
        state.zona = ctx.callbackQuery.data.split(':')[1];
        state.step = 'esperando_articulo';
        await ctx.answerCbQuery();
        ctx.reply(`📍 Zona: ${state.zona}\n📝 Ingrese NOMBRE del artículo:`);
    } else if (ctx.callbackQuery.data === 'ADD_MORE') {
        state.step = 'esperando_articulo';
        await ctx.answerCbQuery();
        ctx.reply("📝 Ingrese nombre del siguiente artículo:");
    } else if (ctx.callbackQuery.data === 'FINISH') {
        state.step = 'esperando_detalles';
        await ctx.answerCbQuery();
        ctx.reply("📝 Escriba los DETALLES del trabajo:");
    }
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state || state.step === 'esperando_zona') return;
    const text = ctx.message.text.trim();

    if (state.step === 'esperando_articulo') {
        state.tempArt = text.toUpperCase();
        ctx.reply(`⏳ Validando stock en ${state.zona}...`);
        
        // Enviamos el nombre trim para evitar fallos por espacios
        const check = await axios.get(URL_G, { params: { op: 'check_stock', art: state.tempArt, zona: state.zona } });
        
        if (!check.data || !check.data.existe) {
            return ctx.reply(`❌ El artículo "${state.tempArt}" no se encontró en ${state.zona}.\n\n💡 Verifique que el nombre sea igual al del Inventario General.`);
        }
        
        state.stockDisp = parseFloat(check.data.cantidad);
        state.step = 'esperando_cantidad';
        ctx.reply(`🔢 Cantidad para "${state.tempArt}"\n(Disponible: ${state.stockDisp}):`);
    } 
    else if (state.step === 'esperando_cantidad') {
        const cant = parseFloat(text.replace(',', '.')); // Soporta comas decimales
        if (isNaN(cant) || cant <= 0) return ctx.reply("❌ Ingrese un número válido.");
        if (cant > state.stockDisp) return ctx.reply(`❌ No hay suficiente. Stock: ${state.stockDisp}`);
        
        state.items.push(`${state.tempArt}:${cant}`);
        state.step = 'esperando_decision';
        ctx.reply(`✅ Agregado: ${state.tempArt} (${cant})\n¿Algo más?`, 
            Markup.inlineKeyboard([[
                Markup.button.callback('➕ Agregar Otro', 'ADD_MORE'), 
                Markup.button.callback('💾 Finalizar', 'FINISH')
            ]]));
    }
    else if (state.step === 'esperando_detalles') {
        ctx.reply("⏳ Guardando reporte...");
        const res = await callApi({
            op: 'registrar_salida',
            id: ctx.from.id,
            art: state.items.join(','),
            zona: state.zona,
            detalles: text
        });
        delete userState[ctx.from.id];
        ctx.reply(res && res.ok ? "✅ REPORTE GUARDADO CON ÉXITO." : "❌ Error al guardar.");
    }
});

bot.launch();
app.listen(process.env.PORT || 3000);
