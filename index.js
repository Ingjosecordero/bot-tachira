const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const URL_G = "https://script.google.com/macros/s/AKfycbyKLE8Lj_QzI5G8H_H6bCG9t4YZxLpNRGxR2ZaJMNqbh9Gtg7MIsAMnxu7B7Ow7skLSHQ/exec"; 
const bot = new Telegraf("8345495015:AAE3HrmtWlB3EUHPHW-5PJwZ0wgMuUm6uXM");
const app = express();
const userState = {};
const api = axios.create({ timeout: 15000 });

// Ruta para el cron-job (Soluciona el 404)
app.get('/', (req, res) => {
    res.status(200).send('SISTEMA OPERATIVO');
});

const mainButtons = (rango) => {
    if (rango === "SUPERVISOR") {
        return Markup.keyboard([
            ['📦 INV. GENERAL', '📜 HISTORIAL ART.'],
            ['📤 SALIDA ART.', '🔄 TRANSFERIR'],
            ['📝 CREAR REPORTE', '📊 VER SALIDAS'],
            ['📂 REPS POR ZONA', '📥 AGREGAR ART.']
        ]).resize();
    }
    return Markup.keyboard([['📦 INV. GENERAL', '📜 HISTORIAL ART.'], ['📂 REPS POR ZONA']]).resize();
};

bot.start(async (ctx) => {
    try {
        const res = await api.get(URL_G, { params: { op: 'verificar', id: ctx.from.id } });
        if (res.data && res.data.autorizado) {
            // Mensaje de bienvenida solicitado
            return ctx.reply(`SISTEMA DE REGISTRO Y CONTROL\nBienvenido, ${res.data.nombre}`, mainButtons(res.data.rango));
        }
        ctx.reply("🚫 No autorizado.");
    } catch (e) { 
        console.error("Error en Start:", e.message);
        ctx.reply("⏳ Error de conexión con la base de datos."); 
    }
});

// --- EL RESTO DE TUS FUNCIONES (Reportes, Transferencias, etc.) ---
// Asegúrate de pegar aquí las funciones que ya teníamos operativas.

// Manejo de errores para que el bot no se detenga
bot.catch((err) => {
    console.error('Error en Telegraf:', err);
});

// ESCUCHAR EN EL PUERTO CORRECTO (Vital para Render)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
    bot.launch().then(() => console.log('Bot iniciado')).catch(err => console.error('Error al lanzar bot:', err));
});
