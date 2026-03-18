import express from "express";
import cors from "cors";
import { config, validateConfig } from "./config.js";
import { runAgentLoop } from "./agent/loop.js";
import { memoryDb } from "./db/index.js";
import { sendText, sendPresence } from "./whatsapp.js";
import { processFollowups } from "./agent/followup_engine.js";

// Estructuras de datos para el encolamiento (Debounce)
const messageQueues: Record<string, string[]> = {};
const messageTimeouts: Record<string, NodeJS.Timeout> = {};
const masterSwitch = { isOn: true };

// Guarda en memoria los usuarios en los que el bot debe pausarse (ej. porque un humano interviene)
const pausedUsers: { [jid: string]: boolean } = {};

// Diccionario para rate-limit de alertas al grupo cuando el cliente está en espera
const lastAlertTimes: Record<string, number> = {}; // false/true si un asesor está hablando con un cliente

async function main() {
    console.log("[App] Iniciando OpenGravity con Evolution API...");

    try {
        validateConfig();
        console.log("[App] Configuración validada.");
        
        // Inicializar base de datos con timeout para evitar cuelgues infinitos
        console.log("[App] Intentando conectar a PostgreSQL en:", config.PGHOST);
        const dbInitTimeout = setTimeout(() => {
            console.error("❌ LA BASE DE DATOS ESTÁ TARDANDO DEMASIADO. Revisa la conectividad del host:", config.PGHOST);
        }, 10000);

        await memoryDb.initialize();
        clearTimeout(dbInitTimeout);
        console.log("[App] Base de datos inicializada.");
    } catch (error: any) {
        console.error("❌ ERROR CRÍTICO AL INICIAR:", error.message);
        console.log("Sugerencia: Revisa si el host de Postgres es alcanzable desde este entorno.");
        // No salimos con 1 para permitir que al menos el servidor Express suba y podamos ver logs si hay un panel
        // process.exit(1); 
    }

    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use(express.static("public"));

    app.post("/webhook", async (req, res) => {
        // Validar token secreto del webhook
        const webhookSecret = process.env.WEBHOOK_SECRET;
        if (webhookSecret) {
            const token = req.headers["x-webhook-secret"] || req.query.token;
            if (token !== webhookSecret) {
                console.log("[WhatsApp] ⛔ Webhook rechazado: token inválido");
                res.status(401).send("Unauthorized");
                return;
            }
        }

        // Return 200 early to Evolution
        res.status(200).send("OK");

        const payload = req.body;
        console.log("[WhatsApp] 📥 Webhook recibido:", JSON.stringify(payload).substring(0, 500));
        
        // Ensure this is a message upsert event
        if (!payload || !payload.data || !payload.data.message) {
            return;
        }

        const msgData = payload.data;
        const msgInfo = msgData.message;
        const remoteJid = msgData.key.remoteJid; // eg. 123456789@s.whatsapp.net
        const fromMe = msgData.key.fromMe;
        
        // Extract text depending on message type (conversation, extendedTextMessage, etc)
        let text = "";
        let messageType = "";
        if (msgInfo.conversation) {
            text = msgInfo.conversation;
            messageType = 'conversation';
        } else if (msgInfo.extendedTextMessage && msgInfo.extendedTextMessage.text) {
            text = msgInfo.extendedTextMessage.text;
            messageType = 'extendedTextMessage';
        }

        if (!text) return;

        const pushName = msgData.pushName; // Nombre de perfil de WhatsApp

        // Actualizar nombre si no existe o es nuevo
        if (pushName) {
            const lead = (await memoryDb.getAllLeads()).find(l => l.chat_id === remoteJid);
            if (!lead || !lead.name || lead.name === 'Sin Nombre') {
                await memoryDb.updateLeadStatus(remoteJid, { name: pushName });
            }
        }

        // El historial se guarda dentro de runAgentLoop para evitar duplicados
        // Limpiar el JID para no mostrar @s.whatsapp.net
        const cleanNumber = remoteJid.split("@")[0];

        console.log(`[WhatsApp] Mensaje de ${cleanNumber} (fromMe: ${fromMe}): ${text}`);

        // Números de administradores autorizados para comandos globales
        const ADMIN_NUMBERS = ["51992371285", "13107041147"]; // Añadido el número del screenshot como admin
        const isAdmin = ADMIN_NUMBERS.includes(cleanNumber);

        console.log(`[WhatsApp] Webhook Recibido: Chat=${cleanNumber} | Admin=${isAdmin} | DeMi=${fromMe} | Texto="${text}"`);

        // --- COMANDOS DE ADMIN (desde número admin, no fromMe) ---
        if (!fromMe && isAdmin) {
            if (text.trim() === "/apagarbot") {
                masterSwitch.isOn = false;
                await sendText(remoteJid, "🤖 MWP AI dice: IA APAGADA GLOBALMENTE. Descansaré hasta que digas /prenderbot.");
                return;
            }
            if (text.trim() === "/prenderbot") {
                masterSwitch.isOn = true;
                await sendText(remoteJid, "🤖 MWP AI dice: IA ENCENDIDA GLOBALMENTE. ¡A vender!");
                return;
            }
            // /reset NUMERO - resetear un chat específico desde admin
            if (text.trim().startsWith("/reset ")) {
                const targetNumber = text.trim().replace("/reset ", "").replace(/\D/g, "");
                const targetJid = `${targetNumber}@s.whatsapp.net`;
                await memoryDb.clearMemory(targetJid);
                delete pausedUsers[targetJid];
                await sendText(remoteJid, `🤖 MWP AI dice: Memoria borrada y bot reactivado para ${targetNumber}.`);
                return;
            }
            // /activar NUMERO - reactivar un chat sin borrar memoria
            if (text.trim().startsWith("/activar ")) {
                const targetNumber = text.trim().replace("/activar ", "").replace(/\D/g, "");
                const targetJid = `${targetNumber}@s.whatsapp.net`;
                delete pausedUsers[targetJid];
                await sendText(remoteJid, `🤖 MWP AI dice: Bot reactivado para ${targetNumber} (memoria intacta).`);
                return;
            }
        }

        // --- MANEJO DE COMANDOS DESDE EL CELULAR DE LA EMPRESA (fromMe) ---
        if (fromMe) {
            if (text.trim() === "/apagarbot") {
                masterSwitch.isOn = false;
                await sendText(remoteJid, "🤖 MWP AI dice: IA APAGADA GLOBALMENTE. Descansaré hasta que digas /prenderbot.");
                return;
            }
            if (text.trim() === "/prenderbot") {
                masterSwitch.isOn = true;
                await sendText(remoteJid, "🤖 MWP AI dice: IA ENCENDIDA GLOBALMENTE. ¡A vender!");
                return;
            }
            if (text.trim() === "/activar") {
                delete pausedUsers[remoteJid];
                await sendText(remoteJid, "🤖 MWP AI dice: Bot REACTIVADO en este chat. Seguiré atendiendo a este cliente.");
                return;
            }
            if (text.trim() === "/reset") {
                await memoryDb.clearMemory(remoteJid);
                delete pausedUsers[remoteJid];
                await sendText(remoteJid, "🤖 MWP AI dice: Memoria borrada y bot reactivado para este chat.");
                return;
            }

            // Si es un mensaje normal de Joseph hacia un cliente, pausamos al bot
            if (!text.startsWith("/")) {
                console.log(`[WhatsApp] 🛑 Humano intervino con ${cleanNumber}. Pausando bot para este chat.`);
                pausedUsers[remoteJid] = true;
                // Si un humano interviene, desactivamos seguimientos automáticos
                await memoryDb.updateLeadStatus(remoteJid, { needs_followup: false, reset_count: true });
            }
            return;
        }

        // --- IGNORAR SI BOT ESTÁ APAGADO MAESTRO O EN EL CHAT ---
        if (!masterSwitch.isOn) {
            return; // ignoramos el mensaje del cliente si el bot maestro está apagado
        }

        if (pausedUsers[remoteJid]) {
            // El bot está pausado (un humano está o debe estar atendiendo), 
            // pero el cliente sigue escribiendo. Enviamos la alerta al grupo.
            const cleanNum = remoteJid.split("@")[0];
            const GRUPO_ALERTAS = "120363425164097782@g.us";
            
            // Limitamos alertas a 1 por minuto por chat para no spamear el grupo si mandan muchos mensajitos cortos
            const now = Date.now();
            const lastAlert = lastAlertTimes[remoteJid] || 0;

            if (now - lastAlert > 60000) { // 60 segundos
                sendText(GRUPO_ALERTAS, `🔔 *CLIENTE EN ESPERA* 🔔\n\nEl cliente wa.me/${cleanNum} acaba de escribir:\n_"${text}"_\n\n👉 Por favor respóndele pronto.`).catch(() => {});
                lastAlertTimes[remoteJid] = now;
            }
            return; // El bot no responde directamente al cliente
        }

        // --- ENCOLAMIENTO DE MENSAJES DEL CLIENTE (DEBOUNCE) ---
        if (!messageQueues[remoteJid]) {
            messageQueues[remoteJid] = [];
        }
        messageQueues[remoteJid].push(text);

        // Si el cliente envía un mensaje, el sistema deja de necesitar seguimiento (ya respondió)
        await memoryDb.updateLeadStatus(remoteJid, { needs_followup: false, reset_count: true });

        if (messageTimeouts[remoteJid]) {
            clearTimeout(messageTimeouts[remoteJid]);
        }

        // Función para procesar la cola
        const processQueue = async () => {
            if (messageTimeouts[remoteJid]) clearTimeout(messageTimeouts[remoteJid]);
            
            const combinedText = messageQueues[remoteJid].join(" ").trim();
            delete messageQueues[remoteJid];
            delete messageTimeouts[remoteJid];

            if (!combinedText) return;

            console.log(`[Bot] 🤖 Procesando bloque consolidado (${cleanNumber}): "${combinedText}"`);

            try {
                await runAgentLoop(remoteJid, combinedText);
            } catch (error) {
                console.error("[Bot] Error en runAgentLoop:", error);
            }
        };

        // Si llegamos a 3 mensajes, procesamos de inmediato
        if (messageQueues[remoteJid].length >= 3) {
            console.log(`[Bot] 🚀 Límite de 3 mensajes alcanzado para ${cleanNumber}. Procesando...`);
            processQueue();
        } else {
            // Simulamos que el bot está leyendo/escribiendo
            sendPresence(remoteJid, "composing").catch(() => {});
            // Esperamos 10 segundos de silencio para consolidar más mensajes
            messageTimeouts[remoteJid] = setTimeout(processQueue, 10000); 
        }
    });

    const PORT = config.PORT;

    // --- API PARA DASHboard CRM ---
    app.get("/api/leads", async (req, res) => {
        try {
            const leads = await memoryDb.getAllLeads();
            res.json(leads);
        } catch (error) {
            res.status(500).json({ error: "Error al obtener leads" });
        }
    });

    app.post("/api/leads/update-status", async (req, res) => {
        const { chatId, status, name, date, amount } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: "chatId es requerido" });
        }
        try {
            await memoryDb.updateLeadStatus(chatId, { status, name, date, amount });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: "Error al actualizar lead" });
        }
    });

    app.listen(PORT, () => {
        console.log(`[App] 🚀 Servidor Webhook Express escuchando en el puerto ${PORT}...`);
        
        // Iniciar motor de seguimientos cada 30 minutos
        // Ejecución inmediata inicial tras 1 min
        setTimeout(processFollowups, 60 * 1000); 
        setInterval(processFollowups, 30 * 60 * 1000); 
    });
}

main().catch(console.error);
