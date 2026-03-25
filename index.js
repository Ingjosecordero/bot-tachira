const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

// --- CONFIGURACIÓN ---
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const URL_G = "https://script.google.com/macros/s/AKfycbwS7AWtfS0LPt-lYN1U2mUvTiq_Z1_H1z1HUfbNGcxnIwRceFWyT76B8IozpJc2d8sbwQ/exec"; 

const app = express();
app.get('/', (req, res) => res.send('CONTROL DE REGISTROS ACTIVO'));

// Memoria de pasos
const userState = {};

// Función de comunicación robusta con Google
const callApi = async (params = {}, data = null) => {
    try {
        if (data) {
            // Convertimos los datos a formato x-www-form-urlencoded para Google Apps Script
            const formData = new URLSearchParams();
            for (const key in data) { formData.append(key, data[key]); }
            
            const response = await axios.post(URL_G, formData.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            return response.data;
        }
        const res = await axios.get(URL_G, { params });
        return res.data;
    } catch (e) { 
        console.error("Error en API:", e.message);
        return null; 
    }
};

// Botones principales
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

// --- INICIO ---
bot.start(async (ctx) => {
    const res = await callApi({ op: 'verificar', id: ctx.from.id });
    if (!res || !res.autorizado) return ctx.reply(`🚫 Acceso denegado: ${ctx.from.id}`);
    ctx.reply(`CONTROL DE REGISTROS Y REPORTES\nBienvenido ${res.nombre}.`, mainButtons(res.rango));
});

// --- CONSULTAS ---
bot.hears('📦 INV. GENERAL', async (ctx) => {
    const res = await callApi({ op: 'consultar_inv' });
    if (!res) return ctx.reply("❌ Error al obtener inventario.");
    let msg = "🏢 **INVENTARIO GENERAL**\n", cz = "";
    res.forEach(r => {
        if (r[1].toUpperCase() !== cz) { cz = r[1].toUpperCase(); msg += `\n📍 **${cz}**\n`; }
        msg += ` • ${r[0]} : \`${r[2]}\`\n`;
    });
    ctx.replyWithMarkdown(msg);
});

bot.hears('📊 VER SALIDAS', async (ctx) => {
    const reps = await callApi({ op: 'ver_reps' });
    if (!reps) return ctx.reply("❌ Sin datos de reportes.");
    let msg = "📊 **ÚLTIMOS MOVIMIENTOS**\n" + "—".repeat(15) + "\n";
    reps.slice(-8).reverse().forEach(r => {
        msg += `🆔 \`${r[0]}\` | 📍 ${r[2]}\n📦 ${r[3]} : ${r[4]}\n👤 ${r[6]}\n` + "—".repeat(10) + "\n";
    });
    ctx.replyWithMarkdown(msg);
});

// --- FLUJOS DE REGISTRO ---
bot.hears(['📤 SALIDA ART.', '📝 CREAR REPORTE', '📥 AGREGAR ART.', '🔄 TRANSFERIR'], (ctx) => {
    const opTxt = ctx.message.text;
    const operacion = opTxt.includes('SALIDA') || opTxt.includes('REPORTE') ? 'SALIDA' : 
                      opTxt.includes('AGREGAR') ? 'ENTRADA' : 'TRANSFERENCIA';
    
    userState[ctx.from.id] = { step: 'esperando_articulo', tipo: operacion };
    ctx.reply(`📝 [${operacion}] Ingrese el NOMBRE del artículo:`);
});

bot.on('text', async (ctx) => {
    const state = userState[ctx.from.id];
