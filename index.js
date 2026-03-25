const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

// CONFIGURACIÓN PRINCIPAL
const URL_G = "https://script.google.com/macros/s/AKfycbyAykHfwTjMIBwfSmN-nCYQf7VGzEzoUKqSzH_wZ2XMI491YyrXOGon4_FXZCRmLJiVJA/exec"; 
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const app = express();
const userState = {};

// Instancia de Axios con Timeout de 15 segundos para evitar bloqueos
const api = axios.create({ timeout: 15000 });

// LÓGICA DE MENÚ SEGÚN RANGO
const mainButtons = (rango) => {
    const r = (rango || "").toUpperCase().trim();
    if (r === "SUPERVISOR") {
        return Markup.keyboard([
            ['📦 INV. GENERAL', '📜 HISTORIAL ART.'],
            ['📤 SALIDA ART.', '🔄 TRANSFERIR'],
            ['📝 CREAR REPORTE', '📊 VER SALIDAS'],
            ['📂 REPS POR ZONA', '📥 AGREGAR ART.']
        ]).resize();
    }
    return Markup.keyboard([
        ['📦 INV. GENERAL', '📜 HISTORIAL ART.'],
        ['📂 REPS POR ZONA']
    ]).resize();
};

// --- RUTA PARA CRON-JOB (SOLUCIONA EL ERROR 404 Y 503) ---
app.get('/', (req, res) => {
    res.status(200).send('SISTEMA TACHIRA OPERATIVO - CRON OK');
});

// --- COMANDO START ---
bot.start(async (ctx) => {
    ctx.reply("⏳ Verificando acceso...");
    try {
        const res = await api.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (res.data && res.data.autorizado) {
            return ctx.reply(`✅ ACCESO CONCEDIDO\nHola ${res.data.nombre}\nNivel: ${res.data.rango}`, mainButtons(res.data.rango));
        }
        ctx.reply(`🚫 ID ${ctx.from.id} no registrado.`);
    } catch (e) {
        ctx.reply("⚠️ El servidor está despertando. Por favor, intenta de nuevo en 10 segundos.");
    }
});

// --- CONSULTA DE ZONAS ---
const obtenerZonas = async () => {
    try {
        const res = await api.get(URL_G, { params: { op: 'ver_zonas' } });
        return (res.data && res.data.length > 0) ? res.data : null;
    } catch (e) { return null; }
};

// --- REPORTES POR ZONA (CON FILTRO Y ESTÉTICA) ---
bot.hears('📂 REPS POR ZONA', async (ctx) => {
    ctx.reply("⏳ Cargando zonas...");
    const zonas = await obtenerZonas();
    if (!zonas) return ctx.reply("❌ Error al conectar con la base de datos.");
    
    const btns = [];
    for (let i = 0; i < zonas.length; i += 2) {
        const fila = [Markup.button.callback(zonas[i], `CONSULTA:${zonas[i]}`)];
        if (zonas[i+1]) fila.push(Markup.button.callback(zonas[i+1], `CONSULTA:${zonas[i+1]}`));
        btns.push(fila);
    }
    ctx.reply("📂 Seleccione zona para ver los últimos 3 reportes:", Markup.inlineKeyboard(btns));
});

// --- INVENTARIO GENERAL ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    ctx.reply("⏳ Consultando almacenes...");
    try {
        const res = await api.get(URL_G, { params: { op: 'consultar_inv' } });
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

// --- FLUJO DE ACCIONES (SOLO SUPERVISOR) ---
bot.hears(['📥 AGREGAR ART.', '📤 SALIDA ART.', '📝 CREAR REPORTE', '🔄 TRANSFERIR'], async (ctx) => {
    const modo = ctx.message.text;
    userState[ctx.from.id] = { modo, items: [], step: 'esperando_zona' };
    
    const zonas = await obtenerZonas();
    if (!zonas) return ctx.reply("❌ Error al cargar zonas.");

    const btns = [];
    for (let i = 0; i < zonas.length; i += 2) {
        const fila = [Markup.button.callback(zonas[i], `Z:${zonas[i]}`)];
        if (zonas[i+1]) fila.push(Markup.button.callback(zonas[i+1], `Z:${zonas[i+1]}`));
        btns.push(fila);
    }
    if (modo === '📥 AGREGAR ART.') btns.push([Markup.button.callback('➕ NUEVA ZONA', 'Z:NUEVA')]);
    ctx.reply(`📍 [${modo}]\nSeleccione la zona de trabajo:`, Markup.inlineKeyboard(btns));
});

// --- MANEJO DE CALLBACKS ---
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const state = userState[ctx.from.id];

    if (data.startsWith('CONSULTA:')) {
        const zonaSel = data.split(':')[1];
        try {
            const res = await api.get(URL_G, { params: { op: 'reps_por_zona', zona: zonaSel } });
            if (!res.data.orden || res.data.orden.length === 0) return ctx.reply("No hay reportes recientes en esta zona.");
            
            for (const tkt of res.data.orden) {
                const info = res.data.datos[tkt];
                let msg = `🎫 **TICKET:** \`${tkt}\`\n📅 **Fecha:** ${new Date(info.fecha).toLocaleDateString()}\n📝 **Descripción:** _${info.nota}_\n📦 **Materiales:**\n`;
                info.arts.forEach(art => msg += `  • ${art}\n`);
                await ctx.replyWithMarkdown(msg + "—".repeat(15));
            }
        } catch (e) { ctx.reply("❌ Error en la consulta."); }
        return ctx.answerCbQuery();
    }

    if (!state) return ctx.answerCbQuery("Sesión expirada.");

    if (data.startsWith('Z:')) {
        const zona = data.split(':')[1];
        if (zona === 'NUEVA') {
            state.step = 'creando_zona';
            return ctx.reply("📝 Nombre de la nueva zona:");
        }
        if (state.modo === '🔄 TRANSFERIR' && !state.zona_origen) {
            state.zona_origen = zona;
            return ctx.reply("📍 Seleccione zona DESTINO:");
        }
        state.zona = zona; state.zona_destino = zona;
        state.step = 'esperando_art';
        ctx.reply(`📦 Zona: ${zona}\nEscriba el nombre del artículo:`);
    } else if (data === 'ADD') {
        state.step = 'esperando_art';
        ctx.reply("📝 Siguiente artículo:");
    } else if (data === 'FIN') {
        state.step = 'esperando_nota';
        ctx.reply("📝 Descripción del trabajo:");
    }
    ctx.answerCbQuery();
});

// --- MANEJO DE TEXTO ---
bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
    if (!state) return;
    const text = ctx.message.text.toUpperCase().trim();

    if (state.step === 'esperando_art') {
        state.tempArt = text; state.step = 'esperando_cant';
        ctx.reply(`🔢 Cantidad para ${text}:`);
    } else if (state.step === 'esperando_cant') {
        state.items.push(`${state.tempArt}:${text}`);
        ctx.reply(`✅ "${state.tempArt}" añadido.`, Markup.inlineKeyboard([
            [Markup.button.callback('➕ Añadir otro', 'ADD')],
            [Markup.button.callback('💾 Guardar Reporte Final', 'FIN')]
        ]));
    } else if (state.step === 'esperando_nota') {
        ctx.reply("⏳ Guardando reporte agrupado...");
        try {
            const res = await api.post(URL_G, new URLSearchParams({
                op: 'procesar_accion', modo: state.modo, id: ctx.from.id,
                zona: state.zona || '', zona_origen: state.zona_origen || '',
                zona_destino: state.zona_destino || '', articulos: state.items.join(','), nota: text
            }).toString());
            delete userState[ctx.from.id];
            ctx.replyWithMarkdown(`✅ **REGISTRO EXITOSO**\n🎫 Ticket: \`${res.data.ticket}\``);
        } catch (e) { ctx.reply("❌ Error al guardar datos."); }
    }
});

// LANZAMIENTO
const PORT = process.env.PORT || 3000;
bot.launch().then(() => console.log("Bot en línea"));
app.listen(PORT, () => console.log(`Servidor Express en puerto ${PORT}`));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
