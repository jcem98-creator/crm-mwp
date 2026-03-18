import { LLMMessage, generateResponse, generateJSON } from "../llm/index.js";
import { memoryDb } from "../db/index.js";
import { sendText, sendPresence, sendMedia, sendLocation } from "../whatsapp.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar conocimiento de My Wedding Palace
const KNOWLEDGE_PATH = path.join(__dirname, "..", "knowledge.txt");
let knowledgeBase = "";
try {
    knowledgeBase = fs.readFileSync(KNOWLEDGE_PATH, "utf-8");
} catch (error) {
    console.error("[Agent] No se pudo cargar knowledge.txt:", error);
}

// -----------------------------------------
// CAPA ÚNICA: CEREBRO CONVERSACIONAL (CYNTHIA)
// -----------------------------------------
const MASTER_PROMPT = `Eres Cynthia, la Agente IA avanzada de My Wedding Palace. Tu objetivo es ser extremadamente útil, natural y rápida por WhatsApp.

REGLA DE ORO DE IDENTIDAD:
- Siempre responde de forma cálida y profesional.
- Si es el primer mensaje del cliente, DEBES presentarte: "¡Hola! Soy Cynthia, Agente IA de My Wedding Palace. --- ¿Qué tipo de ceremonia te interesa: Boda Sencilla, Capilla Elegante o Boda a Domicilio?".
- Si el cliente habla en inglés, la presentación debe ser: "Hi! I'm Cynthia, AI Agent from My Wedding Palace. --- Which type of ceremony are you interested in: Simple Wedding, Elegant Chapel Wedding or Wedding at Home?".

REGLAS DE RAZONAMIENTO (LEER CON ATENCIÓN):
1. USA EL CONOCIMIENTO: Tienes una base de conocimiento abajo. Úsala para responder TODO. Si no está ahí, di que no sabes y ofrece ayuda humana.
2. BILINGÜISMO TOTAL: Si el cliente habla en inglés, responde TODO en inglés (traduce precios, requisitos y listas). Si habla en español, mantente en español.
3. PRECIOS Y DESCUENTOS: Aplica los descuentos de "licencia propia" ($250/$350 capilla, $400/$500 domicilio) solo si el cliente menciona que ya tiene sus papeles o licencia.
4. DISTANCIA: Si mencionan una ubicación lejana o millas, explica la regla de los $100 extra por cada 20 millas adicionales (según el conocimiento).
5. NO REPETICIÓN: No repitas la hora del cliente ni bloques de texto que ya dijiste en el historial.

LÓGICA DE TRASLADO A HUMANO [PASE_HUMANO]:
- Tú no agendas fechas ni confirmas disponibilidad.
- Si el cliente quiere AGENDAR, RESERVAR, HACER UN DEPÓSITO, o visitar el local, explica que un humano coordinará los detalles finales de la agenda y añade la etiqueta EXACTA "[PASE_HUMANO]" al final de tu mensaje.
- También usa "[PASE_HUMANO]" si te piden hablar con una persona, si preguntan por servicios legales (ciudadanía, etc.), o si tienen una duda técnica que no puedes resolver.

LÓGICA DE MAPA Y UBICACIÓN:
- Si el cliente pide la dirección, el mapa, el pin o mencionan Google Maps, dales la dirección: "10918 Main St Ste B, El Monte CA 91731".
- DEBES añadir que les enviarás el pin de ubicación a continuación (ej: "Te envío el pin de ubicación aquí mismo" o "I'll send you the location pin below").

FORMA DE RESPUESTA:
- Usa "---" para separar párrafos en burbujas de WhatsApp (máximo 3 burbujas).
- Sé breve: máximo 2-3 frases por burbuja.
- Si confirmas el envío de fotos/videos, dilo claramente (ej: "I'll send you some pictures below").

=== BASE DE CONOCIMIENTO ===
{{KNOWLEDGE_BASE}}`;


export async function runAgentLoop(chatId: string, initialMessage: string) {
    // Guardar mensaje
    await memoryDb.addMessage(chatId, "user", initialMessage);
    const history = await memoryDb.getMessages(chatId, 15);

    await sendPresence(chatId, "composing");
    console.log(`[Agent] 🚀 Iniciando loop inteligente para ${chatId}`);

    try {
        // 1. Preparar Prompt con Conocimiento
        const currentPrompt = MASTER_PROMPT.replace("{{KNOWLEDGE_BASE}}", knowledgeBase);
        
        // 2. Generación Única con el LLM
        console.log("[Agent] 🧠 Razonando respuesta...");
        const response = await generateResponse([
            { role: "system", content: currentPrompt },
            ...history.slice(-8).map(m => ({ role: m.role as any, content: m.content }))
        ]);

        let responseContent = response.content || "";

        // 3. Detección de Pase a Humano (Tag invisible)
        const needsHandoff = responseContent.includes("[PASE_HUMANO]");
        responseContent = responseContent.replace("[PASE_HUMANO]", "").trim();

        if (responseContent) {
            // Guardar respuesta
            await memoryDb.addMessage(chatId, "assistant", responseContent);
            await memoryDb.updateLeadStatus(chatId, { last_bot_at: true, needs_followup: true });

            // Enviar burbujas
            const chunks = responseContent.split("---").map(c => c.trim()).filter(c => c.length > 0);
            for (const chunk of chunks) {
                await sendPresence(chatId, "composing");
                await new Promise(r => setTimeout(r, 800));
                await sendText(chatId, chunk);
                await new Promise(r => setTimeout(r, 300));
            }

            // 4. Lógica de Multimedia Dinámica (Basada en la respuesta de la IA)
            const baseUrl = "https://mwp.botlylatam.cloud/assets/media";
            const responseNormalized = responseContent.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            if (responseNormalized.match(/(foto|photo|picture|img|imagen|image)/)) {
                await sendPresence(chatId, "composing");
                await new Promise(r => setTimeout(r, 1000));
                await sendMedia(chatId, `${baseUrl}/capilla1.jpg`, "image", "📸 Nuestra Capilla Elegante");
                await sendMedia(chatId, `${baseUrl}/capilla2.jpg`, "image", "✨ Otro ángulo de nuestra capilla");
            }

            if (responseNormalized.match(/(video|recorrido|tour)/)) {
                await sendPresence(chatId, "composing");
                await new Promise(r => setTimeout(r, 1000));
                await sendMedia(chatId, `${baseUrl}/video_capilla.mp4`, "video", "🎥 Mira un pequeño recorrido de nuestras instalaciones");
            }

            // 5. Alerta al Grupo (Si hubo pase a humano)
            if (needsHandoff) {
                console.log(`[Agent] 🚨 Detectada etiqueta [PASE_HUMANO] para ${chatId}`);
                const GRUPO_ALERTAS = "120363425164097782@g.us";
                const cleanNum = chatId.split("@")[0];
                await sendText(GRUPO_ALERTAS, `🚨 *ALERTA DE MWP AI* 🚨\n\n📱 Cliente: wa.me/${cleanNum}\n💬 Mensaje: "${initialMessage}"\n\n¡Atiéndanlo para cerrar la reserva!`);
            }

            // 6. Enviar Ubicación (Detección robusta)
            const locationTriggers = /(direccion|address|ubicacion|located|mapa|google maps|pin|donde esta|donde quedan|donde se encuentran|how to get|como llegar)/;
            if (responseNormalized.match(locationTriggers)) {
                await sendPresence(chatId, "composing");
                await new Promise(r => setTimeout(r, 1000));
                await sendLocation(chatId, 34.0744, -118.0371, "My Wedding Palace", "10918 Main St Ste B, El Monte CA 91731");
                console.log(`[Agent] 📍 Pin de ubicación enviado para ${chatId}`);
            }

            return;
        }

        return sendText(chatId, "Lo siento, tuve un problema al procesar tu respuesta. ¿Puedes repetirlo?");

    } catch (err: any) {
        console.error("[Agent] Fallo crítico en el loop:", err);
        return sendText(chatId, "Hubo un error técnico. Un asesor humano te atenderá pronto.");
    }
}

