const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

// CONFIGURACIÓN
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbxWkQSmgguOFTPHChsos6om1JQyi7wdeYuV_EarJCyj3ggKFIR0hsAqkuWIga5xJvkZdQ/exec"; 

const callApi = async (params = {}, data = null) => {
    try {
        if (data) {
            const res = await axios.post(URL_G, data);
            return res.data;
        }
        const res = await axios.get(URL_G, { params });
        return res.data;
    } catch (e) { return null; }
};

// BOTONERA PRINCIPAL
const mainButtons = (rango) => {
    let btns = [
        ['📦 INV. GENERAL', '📜 HISTORIAL ART.'],
        ['📤 SALIDA ART.', '🔄 TRANSFERIR'],
        ['📝 CREAR REPORTE', '📊 VER SALIDAS'],
        ['📂 REPS POR ZONA']
    ];
    if (rango === "SUPERVISOR") btns.splice(1, 0, ['📥 AGREGAR ART.']);
    return Markup.keyboard(btns).resize();
};

bot.start(async (ctx) => {
    const res = await callApi({ op: 'verificar', id: ctx.from.id });
    if (!res || !res.autorizado) return ctx.reply(`🚫 Acceso denegado. ID: ${ctx.from.id}`);
    
    ctx.reply(`🛰️ SISTEMA TÁCHIRA\nBienvenido, Ing. ${res.nombre}`, mainButtons(res.rango));
});

// COMANDO CONCILIAR (Solo para usted)
bot.command('conciliar', async (ctx) => {
    const res = await callApi({ op: 'verificar', id: ctx.from.id });
    if (res.rango !== "SUPERVISOR") return ctx.reply("🚫 No autorizado.");
    
    ctx.reply("⏳ Reconstruyendo inventario basado en reportes... Espere.");
    const resC = await callApi({ op: 'conciliar_inventario' });
    ctx.reply(`✅ ${resC.msg || "Terminado"}`);
});

// CONSULTA GENERAL
bot.hears('📦 INV. GENERAL', async (ctx) => {
    const res = await callApi({ op: 'consultar_inv' });
    if (!res) return ctx.reply("❌ Error de conexión.");
    let msg = "🏢 **INVENTARIO GENERAL**\n", cz = "";
    res.forEach(r => {
        if (r[1].toUpperCase() !== cz) {
            cz = r[1].toUpperCase(); msg += `\n📍 **${cz}**\n`;
        }
        msg += ` • ${r[0]} : \`${r[2]}\`\n`;
    });
    ctx.replyWithMarkdown(msg);
});

// El resto de la lógica de reportes sigue el mismo patrón...
bot.launch();