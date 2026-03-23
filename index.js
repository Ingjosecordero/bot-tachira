const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

// --- CONFIGURACIÓN ---
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
// REEMPLACE LA SIGUIENTE LÍNEA CON SU URL DE GOOGLE ACTUALIZADA:
const URL_G = "https://script.google.com/macros/s/SU_ID_AQUI/exec"; 

const app = express();

// Servidor Web para el Cron-job (Mantiene el bot despierto)
app.get('/', (req, res) => {
  res.send('🛰️ SISTEMA TÁCHIRA OPERATIVO - MIKROTIK & FIBRA');
});

// Función para comunicar con Google Sheets
const callApi = async (params = {}, data = null) => {
    try {
        if (data) {
            const res = await axios.post(URL_G, data);
            return res.data;
        }
        const res = await axios.get(URL_G, { params });
        return res.data;
    } catch (e) { 
        console.error("Error en API Google:", e.message);
        return null; 
    }
};

// --- TECLADO PRINCIPAL ---
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

// --- COMANDOS Y ACCIONES ---
bot.start(async (ctx) => {
    const res = await callApi({ op: 'verificar', id: ctx.from.id });
    if (!res || !res.autorizado) {
        return ctx.reply(`🚫 Acceso denegado. Informe su ID al Ing. Cordero: ${ctx.from.id}`);
    }
    ctx.reply(`🛰️ SISTEMA TÁCHIRA\nIng. ${res.nombre} en línea.`, mainButtons(res.rango));
});

bot.command('conciliar', async (ctx) => {
    const user = await callApi({ op: 'verificar', id: ctx.from.id });
    if (user.rango !== "SUPERVISOR") return ctx.reply("🚫 Solo personal de Supervisión.");
    
    ctx.reply("⚠️ Iniciando conciliación maestra... Reconstruyendo inventario desde reportes.");
    const res = await callApi({ op: 'conciliar_inventario' });
    ctx.reply(`✅ ${res.msg || "Proceso terminado"}`);
});

bot.hears('📦 INV. GENERAL', async (ctx) => {
    const res = await callApi({ op: 'consultar_inv' });
    if (!res) return ctx.reply("❌ No se pudo conectar con el inventario.");
    
    let msg = "🏢 **INVENTARIO GENERAL**\n", currentZone = "";
    res.forEach(r => {
        if (r[1].toUpperCase() !== currentZone) {
            currentZone = r[1].toUpperCase();
            msg += `\n📍 **${currentZone}**\n`;
        }
        msg += ` • ${r[0]} : \`${r[2]}\`\n`;
    });
    ctx.replyWithMarkdown(msg);
});

// Historial rápido (Muestra últimos 10 movimientos generales)
bot.hears('📊 VER SALIDAS', async (ctx) => {
    const reps = await callApi({ op: 'ver_reps' });
    if (!reps) return ctx.reply("❌ Sin reportes.");
    
    let msg = "📊 **ÚLTIMOS MOVIMIENTOS**\n" + "—".repeat(15) + "\n";
    reps.slice(-8).reverse().forEach(r => {
        msg += `🆔 \`${r[0]}\` | 📍 ${r[2]}\n📦 ${r[3]} : ${r[4]}\n👤 ${r[6]}\n` + "—".repeat(10) + "\n";
    });
    ctx.replyWithMarkdown(msg);
});

// Iniciar Bot
bot.launch().then(() => console.log("Bot iniciado en Telegram"));

// Puerto para Render (Imprescindible para el Cron-job)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de monitoreo activo en puerto ${PORT}`);
});

// Cierre seguro
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
                                
