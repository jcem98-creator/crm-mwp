import { LLMMessage, generateResponse } from "../llm/index.js";
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
const MASTER_PROMPT = `Eres Cynthia, la Agente IA de My Wedding Palace. Eres amable, natural y eficiente por WhatsApp.

================================================================
                     IDIOMA — REGLA ABSOLUTA
================================================================
Detecta el idioma del cliente desde su PRIMER mensaje y úsalo en TODA tu respuesta.
- Si el cliente escribió en INGLÉS (aunque sea una sola palabra o frase en inglés):
  Responde TODO en inglés — precios, listas, preguntas, cierre — absolutamente todo.
- Si el cliente escribió en ESPAÑOL: responde todo en español.
- NUNCA mezcles español e inglés en un mismo mensaje.
- En inglés: "Simple Wedding", "Elegant Chapel Wedding", "Wedding at Home"
- En español: "Boda Sencilla", "Boda en Capilla Elegante", "Boda a Domicilio"

================================================================
                   PRINCIPIO FUNDAMENTAL
================================================================
Solo respondes con información de tu BASE DE CONOCIMIENTO.
Si algo no está en ella, dilo honestamente y ofrece conectar al cliente con un asesor.
NUNCA inventes precios, horarios, disponibilidad ni información que no esté en la base.

================================================================
              ESTILO DE CONVERSACIÓN — REGLA CRÍTICA
================================================================
Responde SOLO lo que el cliente preguntó. No agregues información extra que no pidieron.
Una cosa a la vez:
- Precio → da el precio del paquete relevante. Sin detalles de lo que incluye.
- "¿Cómo es la capilla?" → describe brevemente y manda fotos. NO la lista de includes.
- "¿Qué incluye?" → entonces sí, da la lista completa.
- Boda a domicilio → explica el concepto y el precio. No menciones descuentos de licencia propia
  a menos que el cliente los pregunte explícitamente.

OBJETIVO FINAL — CTA HACIA EL ASESOR:
Tu meta es que el cliente llegue a hablar con un asesor humano para cerrar la cita.
Al final de CADA respuesta informativa haz una pregunta natural que avance la conversación:
  "¿Tienes alguna fecha en mente para tu boda? 😊"
  "¿Te gustaría que un asesor te contacte para coordinar los detalles?"
  "¿Quieres saber qué incluye este paquete?"
  "¿Te gustaría agendar una visita a nuestras instalaciones?"
Adáptala al contexto. No la repitas igual en cada mensaje.

================================================================
                   IDENTIDAD Y PRESENTACIÓN
================================================================
- Responde siempre de forma cálida y profesional.
- Si es el PRIMER mensaje (no hay historial): preséntate y pregunta qué tipo de ceremonia le interesa.
  Español: "¡Hola! Soy Cynthia, Agente IA de My Wedding Palace 💍 --- ¿Qué tipo de ceremonia te interesa: Boda Sencilla, Capilla Elegante o Boda a Domicilio?"
  Inglés:  "Hi! I'm Cynthia, AI Agent from My Wedding Palace 💍 --- Which type of ceremony are you interested in: Simple Wedding, Elegant Chapel Wedding or Wedding at Home?"
- Si el cliente abrió con una pregunta específica, responde primero la duda y luego la presentación.

================================================================
              CUÁNDO PASAR A UN ASESOR HUMANO [PASE_HUMANO]
================================================================

NO incluyas [PASE_HUMANO] cuando el cliente solo pregunte sobre precios, paquetes,
qué incluye, requisitos, fotos, video o dirección. Solo informa.

PASE INMEDIATO — cuando el cliente muestra INTENCIÓN DE ACCIÓN, incluye [PASE_HUMANO]
al FINAL de tu respuesta. Aplica para:

  ► RESERVAR / APARTAR:
    "quiero reservar", "quiero apartar", "cómo aparto", "cómo reservo",
    "donde deposito", "dar el adelanto", "cómo hago el pago",
    "quiero separar el día", "quiero hacer la reserva", "how do I book",
    "how do I reserve", "how much is the deposit"

  ► VISITAR EL LOCAL:
    "puedo ir", "quiero ir a visitarlos", "puedo caerle", "quiero ir al local",
    "ver la capilla en persona", "puedo pasarme", "me caigo", "quiero conocer el lugar",
    "cuándo puedo ir", "can I visit", "I want to visit", "can I go"

  ► QUE LO LLAMEN / HABLAR CON ALGUIEN:
    "me pueden llamar", "llámenme", "échenme un grito", "denme un fonazo",
    "márcame", "denme una llamada", "quiero hablar con un asesor",
    "pásame con alguien", "call me", "can you call me"

  ► SERVICIOS LEGALES (Green Card, Ciudadanía, Peticiones, Huellas):
    Aplica pase sin dar precios ni detalles.

REGLA DE ORO — RESPUESTA ESTÁNDAR PARA TODOS LOS PASES:
  No preguntes confirmación. No coordines tú. No pidas fecha ni hora.
  El asesor humano hace eso. Tú solo informa y cede el control.

  Texto en ESPAÑOL (úsalo siempre):
  "¡Perfecto! Un asesor te contactará por WhatsApp o llamada lo antes posible.
  Nuestro horario de atención es lunes a viernes de 10 am a 7 pm y sábados de 10 am a 5 pm. 😊"

  Texto en INGLÉS (si el cliente escribió en inglés):
  "Perfect! An advisor will reach out to you via WhatsApp or call as soon as possible.
  Our office hours are Monday–Friday 10 am–7 pm and Saturday 10 am–5 pm. 😊"

CASO ESPECIAL — FECHA ESPECÍFICA SIN INTENCIÓN CLARA:
  Si mencionan fecha/mes pero NO piden reservar ni acción concreta:
  1. Responde con el precio del día correspondiente.
  2. Pregunta: "¿Te gustaría que un asesor te contacte para confirmar esa fecha? 😊"
  3. Si dice SÍ → incluye [PASE_HUMANO] con el texto estándar arriba.
  Si menciona fecha + intención de reservar → pase inmediato directo.

================================================================
                    ENVÍO DE MULTIMEDIA [TAGS]
================================================================
Incluye estos tags al FINAL de tu respuesta cuando aplique. Son invisibles para el cliente.
El sistema los procesa y envía los archivos automáticamente.

[SEND_PHOTOS]          → SOLO cuando pido ver fotos: "manden fotos", "quiero ver la capilla", "foto del lugar".
                         NO usar cuando pregunten qué incluye, precios o disponibilidad.

[SEND_VIDEO]           → SOLO cuando el cliente EXPLICITAMENTE pide un video o recorrido.
                         NUNCA lo uses si preguntaron fotos, precios o qué incluye.
                         Si los piden: "Aquí te mando el video de nuestras instalaciones 🎥"
[SEND_LOCATION]        → cuando pregunten dirección, cómo llegar, mapa, pin, Google Maps o Waze.
                         SIEMPRE junto con la dirección, sin preguntar permiso.
                         Di: "Nuestra dirección es 10918 Main St Ste B, El Monte CA 91731. Te mando el pin 📍"

REGLA: Solo usa el tag que corresponde exactamente a lo que pidieron.

================================================================
                     FORMATO DE RESPUESTA
================================================================
- Escribe en prosa natural, como una persona escribiría en WhatsApp.
- Respuestas cortas y directas, máximo 3-4 líneas por mensaje.
- Usa "---" SOLO cuando necesites separar dos temas claramente distintos en el mismo mensaje.
- NO fragmentes artificialmente una idea en dos burbujas si cabe en una sola.
- No repitas información que ya diste en el historial.

=== BASE DE CONOCIMIENTO ===
{{KNOWLEDGE_BASE}}`;


export async function runAgentLoop(chatId: string, initialMessage: string) {
    // Guardar mensaje del usuario
    await memoryDb.addMessage(chatId, "user", initialMessage);
    const history = await memoryDb.getMessages(chatId, 15);

    await sendPresence(chatId, "composing");
    console.log(`[Agent] 🚀 Iniciando loop inteligente para ${chatId}`);

    try {
        // 1. Preparar Prompt con Conocimiento
        const currentPrompt = MASTER_PROMPT.replace("{{KNOWLEDGE_BASE}}", knowledgeBase);

        // 2. Generar respuesta con el LLM
        console.log("[Agent] 🧠 Razonando respuesta...");
        const response = await generateResponse([
            { role: "system", content: currentPrompt },
            ...history.slice(-8).map(m => ({ role: m.role as any, content: m.content }))
        ]);

        let responseContent = response.content || "";

        // 3. Normalizar mensajes para detección
        const responseNorm = responseContent.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const userNorm     = initialMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // PASE A HUMANO — Detección en 3 capas:
        // Capa 1: mensaje del usuario (keywords amplio ES+EN — una sola línea, JS no soporta flag x)
        const handoffUserKeywords = /(puedo\s*ir|quiero\s*ir|puedo\s*caer|visitar|quiero\s*conocer|me\s*pueden\s*llamar|pueden\s*llamarme|llamarme|marcame|llavenme|echenme|fonazo|denme\s*un|quiero\s*reservar|quiero\s*apartar|como\s*reservo|como\s*aparto|hacer\s*la\s*reserva|separar\s*la\s*fecha|apartar\s*la\s*fecha|dar\s*el\s*adelanto|dar\s*el\s*deposito|dar\s*enganche|contactame|contactenme|con\s*un\s*asesor|quiero\s*hablar|necesito\s*hablar|quiero\s*que\s*me\s*llamen|quiero\s*que\s*me\s*contacten|me\s*contactan|pasame|comuniquense|comunicarse\s*conmigo|ponerse\s*en\s*contacto|hablar\s*con\s*alguien|hablar\s*con\s*un\s*asesor|green\s*card|ciudadania|peticion\s*familiar|huellas|live\s*scan|call\s*me|contact\s*me|reach\s*out|speak\s*with|talk\s*to\s*someone|talk\s*to\s*an\s*advisor|can\s*i\s*visit|i\s*want\s*to\s*visit|can\s*i\s*go|how\s*do\s*i\s*book|how\s*do\s*i\s*reserve|want\s*to\s*book|want\s*to\s*reserve|i\s*want\s*to\s*book|i\s*want\s*to\s*reserve|i\s*want\s*to\s*come|citizenship|immigration)/i;
        const userTriggersHandoff = handoffUserKeywords.test(userNorm);

        // Capa 2: tag explícito de la IA
        const aiTriggeredHandoff = responseContent.includes("[PASE_HUMANO]");

        // Capa 3: la IA escribió el texto de pase aunque olvidó el tag
        // (el prompt le dice exactamente qué escribir → detectamos eso)
        const aiResponseHandoff = /(asesor te contactar|advisor will reach out|asesor te contact|un asesor se comunicar)/i.test(responseNorm);

        const needsHandoff = userTriggersHandoff || aiTriggeredHandoff || aiResponseHandoff;

        // Si el usuario disparó el handoff pero la IA no usó el mensaje estándar,
        // reemplazar la respuesta con el texto correcto
        const isSpanish = !/(hello|hi |what |how |do you|can you|i want|i need|simple wedding|elegant|wedding at home|package|price)/i.test(initialMessage);
        if (userTriggersHandoff && !aiTriggeredHandoff && !aiResponseHandoff) {
            responseContent = isSpanish
                ? "¡Perfecto! Un asesor te contactará por WhatsApp o llamada lo antes posible.\nNuestro horario de atención es lunes a viernes de 10 am a 7 pm y sábados de 10 am a 5 pm. 😊"
                : "Perfect! An advisor will reach out to you via WhatsApp or call as soon as possible.\nOur office hours are Monday–Friday 10 am–7 pm and Saturday 10 am–5 pm. 😊";
        }

        // MULTIMEDIA — Detección por capas:
        // Capa 1: mensaje del usuario (más fiable)
        // Capa 2: tag explícito de la IA
        // Capa 3: keywords en la respuesta de la IA (fallback)

        // FOTOS capilla: cuando piden ver fotos explícitamente
        const userWantsToSee = /(foto|photo|image|picture|imagenes|ver|show)/i.test(userNorm);
        const sendPhotos = userWantsToSee || responseContent.includes("[SEND_PHOTOS]");

        // VIDEO: SOLO desde mensaje del usuario o AI tag — sin fallback de respuesta (causa falsos positivos)
        const userWantsVideo = /(video|recorrido|tour)/i.test(userNorm);
        const sendVideo = userWantsVideo || responseContent.includes("[SEND_VIDEO]");

        // PIN de ubicación: usuario pregunta por dirección/mapa/ubicación
        const userWantsLocation = /(direccion|address|ubicacion|donde|mapa|map|pin|google maps|waze|como llegar|how to get)/i.test(userNorm);
        const sendLocationPin = userWantsLocation
            || responseContent.includes("[SEND_LOCATION]")
            || /(10918 main st|te mando el pin|sending the pin|aqui el pin)/i.test(responseNorm);

        // Limpiar todos los tags del texto visible
        responseContent = responseContent
            .replace(/\[PASE_HUMANO\]/g, "")
            .replace(/\[SEND_PHOTOS\]/g, "")

            .replace(/\[SEND_VIDEO\]/g, "")
            .replace(/\[SEND_LOCATION\]/g, "")
            .trim();

        if (responseContent) {
            // Guardar respuesta en memoria
            await memoryDb.addMessage(chatId, "assistant", responseContent);
            await memoryDb.updateLeadStatus(chatId, { last_bot_at: true, needs_followup: true });

            // 4. Enviar burbujas de texto
            const chunks = responseContent.split("---").map(c => c.trim()).filter(c => c.length > 0);
            for (const chunk of chunks) {
                await sendPresence(chatId, "composing");
                await new Promise(r => setTimeout(r, 800));
                await sendText(chatId, chunk);
                await new Promise(r => setTimeout(r, 300));
            }

            const baseUrl = "https://mwp.botlylatam.cloud/assets/media";

            // 5. Enviar multimedia según los tags que puso la IA
            if (sendPhotos) {
                console.log(`[Agent] 📸 Enviando fotos de capilla para ${chatId}`);
                await sendPresence(chatId, "composing");
                await new Promise(r => setTimeout(r, 1000));
                await sendMedia(chatId, `${baseUrl}/capilla1.jpg`, "image", "📸 Nuestra Capilla Elegante");
                await new Promise(r => setTimeout(r, 500));
                await sendMedia(chatId, `${baseUrl}/capilla2.jpg`, "image", "✨ Otro ángulo de nuestra capilla");
            }



            if (sendVideo) {
                console.log(`[Agent] 🎥 Enviando video de recorrido para ${chatId}`);
                await sendPresence(chatId, "composing");
                await new Promise(r => setTimeout(r, 1000));
                await sendMedia(chatId, `${baseUrl}/video_capilla.mp4`, "video", "🎥 Un pequeño recorrido de nuestras instalaciones");
            }

            if (sendLocationPin) {
                console.log(`[Agent] 📍 Enviando pin de ubicación para ${chatId}`);
                await sendPresence(chatId, "composing");
                await new Promise(r => setTimeout(r, 800));
                await sendLocation(chatId, 34.0744, -118.0371, "My Wedding Palace", "10918 Main St Ste B, El Monte CA 91731");
            }

            // 6. Alerta al grupo si hubo pase a humano
            if (needsHandoff) {
                console.log(`[Agent] 🚨 Pase a humano detectado para ${chatId}`);
                const GRUPO_ALERTAS = "120363425164097782@g.us";
                const cleanNum = chatId.split("@")[0];
                try {
                    await sendText(
                        GRUPO_ALERTAS,
                        `🚨 *ALERTA DE MWP AI* 🚨\n\n📱 Cliente: wa.me/${cleanNum}\n💬 Mensaje: "${initialMessage}"\n\n¡Atiéndanlo para cerrar la reserva!`
                    );
                    console.log(`[Agent] ✅ Alerta enviada al grupo ${GRUPO_ALERTAS}`);
                } catch (groupErr: any) {
                    console.error(`[Agent] 🔴 Error enviando alerta al grupo:`, groupErr?.message || groupErr);
                }
            }

            return;
        }

        return sendText(chatId, "Lo siento, tuve un problema al procesar tu respuesta. ¿Puedes repetirlo?");

    } catch (err: any) {
        console.error("[Agent] Fallo crítico en el loop:", err);
        return sendText(chatId, "Hubo un error técnico. Un asesor humano te atenderá pronto.");
    }
}
