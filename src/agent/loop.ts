import { LLMMessage, generateResponse } from "../llm/index.js";
import { config } from "../config.js";
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
Detecta el idioma del ÚLTIMO mensaje del cliente y responde COMPLETAMENTE en ese idioma.
- Si el último mensaje está en INGLÉS → TODA tu respuesta DEBE ser en inglés.
- Si el último mensaje está en ESPAÑOL → TODA tu respuesta DEBE ser en español.
- Si el mensaje es ambiguo ("yes", "ok", "no", emojis) → usa el mismo idioma de TU respuesta anterior.
- NUNCA mezcles español e inglés en un mismo mensaje.
- CRÍTICO: La base de conocimiento está en español. Cuando respondas en INGLÉS,
  TRADUCE absolutamente TODO al inglés: listas, precios, requisitos, descripciones.
  NUNCA copies texto en español dentro de una respuesta en inglés.
- Paquetes en inglés: "Simple Wedding", "Elegant Chapel Wedding", "Wedding at Home"
- Paquetes en español: "Boda Sencilla", "Boda en Capilla Elegante", "Boda a Domicilio"
- Listas de lo que incluye, requisitos, horarios → TODO traducido al idioma del cliente.

================================================================
                   PRINCIPIO FUNDAMENTAL
================================================================
Solo respondes con información de tu BASE DE CONOCIMIENTO.
Si algo no está en ella, dilo honestamente y ofrece conectar al cliente con un asesor.
NUNCA inventes precios, horarios, disponibilidad ni información que no esté en la base.
DEPÓSITO: NUNCA reveles el monto del depósito. Si preguntan sobre depósito, adelanto,
enganche, down payment o initial deposit, responde que un asesor les dará esa información
y usa [PASE_HUMANO]. No des el número bajo ninguna circunstancia.

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
- CONDICIÓN DE PROMOCIÓN (FOTO 10x8) ¡MUY IMPORTANTE!: 
  1. Si preguntan SOLO precio, responde SOLO el precio y NO menciones la promoción.
  2. Si preguntan qué incluye, beneficios, promociones o regalos y la consulta es explícitamente para VIERNES o SÁBADO, estás OBLIGADO a añadir "1 fotografía impresa 10x8 cm de obsequio" como beneficio adicional en tu respuesta.
  3. Si preguntan qué incluye, beneficios, promociones o regalos pero NO especifican día, NO menciones la promoción. En ese caso solo da la lista de incluye general y sugiere confirmar la fecha.
  4. Si la consulta es explícitamente para DOMINGO, está ESTRICTAMENTE PROHIBIDO mencionar la promoción.
- AL INFORMAR "QUÉ INCLUYE": Enumera únicamente los ítems de "LO QUE INCLUYE" (más la promo si aplica según las reglas de arriba). NO agregues el precio en la misma respuesta salvo que el cliente también lo haya pedido explícitamente.

OBJETIVO FINAL — CTA HACIA EL ASESOR:
Tu meta es que el cliente llegue a hablar con un asesor humano para cerrar la cita.
Al final de CADA respuesta informativa haz UNA pregunta natural en el IDIOMA DEL CLIENTE:
  ESPAÑOL: "¿Tienes alguna fecha en mente para tu boda? 😊"
  ENGLISH: "Do you have a date in mind for your wedding? 😊"
  ESPAÑOL: "¿Te gustaría que un asesor te contacte para coordinar los detalles?"
  ENGLISH: "Would you like an advisor to contact you to coordinate the details?"
  ESPAÑOL: "¿Quieres saber qué incluye este paquete?"
  ENGLISH: "Would you like to know what this package includes?"
REGLA: Elige SOLO UNA del idioma correcto. NUNCA uses la versión en español si el cliente habla inglés.

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
Incluye estos tags al FINAL de tu respuesta SOLO cuando correspondan. Son invisibles para el cliente.

[SEND_PHOTOS]          → Cuando el cliente pide ver FOTOS, IMÁGENES o "the place/el lugar".
                         "show me the place" = [SEND_PHOTOS], NO [SEND_VIDEO].
                         NO usar cuando pregunten qué incluye, precios o disponibilidad.
                         Si dicen "don't send photos" o "no envíes fotos" → NO usar este tag.

[SEND_VIDEO]           → SOLO cuando el cliente dice LITERALMENTE "video", "recorrido" o "tour".
                         NUNCA lo uses para "show me the place", "photos", "fotos" o similares.

[SEND_LOCATION]        → Cuando pregunten dirección, cómo llegar, mapa, pin, ubicación.

REGLAS:
- Usa SOLO el tag que corresponde. NO combines [SEND_PHOTOS] y [SEND_VIDEO].
- NUNCA escribas sintaxis de imagen markdown como ![Foto...] o ![Photo...] en tu texto.
  El sistema envía los archivos automáticamente; tú solo escribe texto normal.

================================================================
                     FORMATO DE RESPUESTA
================================================================
- Escribe en prosa natural, como una persona escribiría en WhatsApp.
- Respuestas cortas y directas, máximo 3-4 líneas por mensaje.
- Usa "---" SOLO cuando necesites separar dos temas claramente distintos en el mismo mensaje.
- NO fragmentes artificialmente una idea en dos burbujas si cabe en una sola.
- No repitas información que ya diste en el historial.
- NUNCA uses sintaxis markdown de imágenes (![...]) ni listas numeradas de fotos.
  El sistema envía las fotos automáticamente. Solo escribe texto conversacional.

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

        // 2. Detectar idioma del mensaje actual por código (frases claramente inglesas, sin palabras que existen en español)
        const isEnglishMsg = /(hello|hi there|hey there|how much|how do|how can|do you|can you|can i |i want|i need|i would|i'd like|i'm looking|i'm interested|we are|we're |does it|is it |are you|could you|would you|please |thank|thanks|sure!|okay|of course|wedding at home|simple wedding|elegant chapel|at home|package|booking|book a|show me|see photos|see the|let me|included|available|requirements|bring my|own minister|same.sex|tuxedo|documents do|what does|what is|what's |what are|photos of|pictures of|do i need)/i.test(initialMessage);

        // 3. Generar respuesta con el LLM + instrucción de idioma forzada
        console.log(`[Agent] 🧠 Razonando respuesta... (idioma detectado: ${isEnglishMsg ? "EN" : "ES"})`);
        const langEnforcement = isEnglishMsg
            ? "⚠️ MANDATORY: The client wrote in ENGLISH. You MUST respond ENTIRELY in English. Use ONLY the ENGLISH VERSION section of the knowledge base. Do NOT include ANY Spanish word in your response. All lists, prices, descriptions, and closing questions MUST be in English."
            : "⚠️ OBLIGATORIO: El cliente escribió en ESPAÑOL. Responde completamente en español usando la sección en español de la base de conocimiento.";

        const response = await generateResponse([
            { role: "system", content: currentPrompt },
            ...history.slice(-8).map(m => ({ role: m.role as any, content: m.content })),
            { role: "system", content: langEnforcement }
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
        const aiResponseHandoff = /(asesor te contactara por whatsapp|advisor will reach out to you via)/i.test(responseNorm);

        const needsHandoff = userTriggersHandoff || aiTriggeredHandoff || aiResponseHandoff;

        // Si el usuario disparó el handoff pero la IA no usó el mensaje estándar,
        // reemplazar la respuesta con el texto correcto
        const isSpanish = !/(hello|hi |hey |what |how |do you|can you|i want|i need|i'm |simple wedding|elegant|wedding at home|package|price|book|reserve|visit|call me|contact|advisor|deposit|document|located|where |when |photo|video|chapel|wedding|ceremony|married|minister|office|show|see|place|pics|pictures|image|address)/i.test(initialMessage);
        if (userTriggersHandoff && !aiTriggeredHandoff && !aiResponseHandoff) {
            responseContent = isSpanish
                ? "¡Perfecto! Un asesor te contactará por WhatsApp o llamada lo antes posible.\nNuestro horario de atención es lunes a viernes de 10 am a 7 pm y sábados de 10 am a 5 pm. 😊"
                : "Perfect! An advisor will reach out to you via WhatsApp or call as soon as possible.\nOur office hours are Monday–Friday 10 am–7 pm and Saturday 10 am–5 pm. 😊";
        }

        // MULTIMEDIA — Detección por capas:
        // Capa 1: mensaje del usuario (más fiable)
        // Capa 2: tag explícito de la IA
        // Capa 3: keywords en la respuesta de la IA (fallback)

        // FOTOS: keywords explícitos + pedidos visuales (con negación)
        const hasPhotoKeyword = /(foto|photo|image|picture|imagenes|pics)/i.test(userNorm);
        const hasVisualRequest = /(show\s*me|ense[ñn]ame|muestrame|quiero\s*ver|let\s*me\s*see|can\s*i\s*see|puedo\s*ver)/i.test(userNorm);
        const hasVideoKeyword = /(video|recorrido|tour)/i.test(userNorm);
        const hasPhotoNegation = /(no.*(foto|photo|envie|send|mand)|don'?t\s+send|sin\s+foto|without\s+photo)/i.test(userNorm);
        const userWantsPhotos = (hasPhotoKeyword || (hasVisualRequest && !hasVideoKeyword)) && !hasPhotoNegation;
        const sendPhotos = (userWantsPhotos || responseContent.includes("[SEND_PHOTOS]")) && !hasPhotoNegation;

        // VIDEO: SOLO keywords explícitos o AI tag (protegido contra conflicto con fotos)
        const sendVideo = hasVideoKeyword || (responseContent.includes("[SEND_VIDEO]") && !userWantsPhotos && !hasVisualRequest);

        // PIN de ubicación: usuario pregunta por dirección/mapa/ubicación
        const userWantsLocation = /(direccion|address|ubicacion|donde|mapa|map|pin|google maps|waze|como llegar|how to get)/i.test(userNorm);
        const sendLocationPin = userWantsLocation
            || responseContent.includes("[SEND_LOCATION]")
            || /(10918 main st|te mando el pin|sending the pin|aqui el pin)/i.test(responseNorm);

        // Limpiar todos los tags y markdown de imágenes del texto visible
        responseContent = responseContent
            .replace(/\[PASE_HUMANO\]/g, "")
            .replace(/\[SEND_PHOTOS\]/g, "")
            .replace(/\[SEND_VIDEO\]/g, "")
            .replace(/\[SEND_LOCATION\]/g, "")
            .replace(/!\[[^\]]*\]\([^)]*\)/g, "")  // eliminar ![alt](url)
            .replace(/!\[[^\]]*\]/g, "")             // eliminar ![alt] sueltos
            .replace(/^\s*\d+\.\s*$/gm, "")          // eliminar líneas "1." vacías
            .replace(/\n{3,}/g, "\n\n")              // colapsar saltos excesivos
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
                const GRUPO_ALERTAS = config.GRUPO_ALERTAS_JID;
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
