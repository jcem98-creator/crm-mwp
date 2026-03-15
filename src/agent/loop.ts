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
// CAPA 1: EXTRACTOR DE INTENCIÓN (EXTRACTOR)
// -----------------------------------------
// La IA asume el rol exclusivo de un intérprete lingüístico que no sabe NADA de reglas de negocio, 
// solo extrae variables del mensaje del usuario (en español informal/roto).
const EXTRACTION_PROMPT = `Tu único trabajo es leer el ÚLTIMO mensaje del cliente y extraer datos estructurados. Eres un analizador semántico, no un vendedor.

REGLA CRÍTICA: Analiza SOLO el último mensaje del cliente, NO arrastres intenciones de mensajes anteriores. Si el último mensaje es solo una confirmación o respuesta corta como "ok", "thanks", "gracias", "bien", "good", "perfecto", "got it", "cool", la intención debe ser 'otra' y todos los booleanos deben ser false.

El cliente puede escribir en ESPAÑOL o INGLÉS. Detecta el idioma y extrae los datos en cualquier caso.

Responde ÚNICA Y EXCLUSIVAMENTE con un JSON válido:
{
  "intencion_principal": "String: basada SOLO en el último mensaje => 'consultar_precio' (price/cost/cuanto cuesta), 'capacidad_invitados' (capacity/how many guests), 'pagar_reservar' (pay/book/reserve/disponibilidad/availability/tiene fecha disponible/do you have availability/quiero agendar/quiero reservar), 'hablar_con_humano' (talk to a person/human), 'saludo_general' (hi/hello/hola), 'ubicacion' (where are you/address/dirección), 'tramite_legal' (legal/immigration), 'otra' (anything else including simple confirmations)",
  "tipo_servicio_mencionado": "String: 'capilla' (chapel), 'sencilla' (simple), 'domicilio' (at home/beach/park/external location), o 'ninguno'",
  "dia_mencionado": "String: day of week in Spanish ('lunes','martes','miercoles','jueves','viernes','sabado','domingo') or 'ninguno'. Convert English days to Spanish.",
  "trae_licencia_propia": "Boolean: true si menciona que YA tiene su marriage license/licencia de matrimonio",
  "quiere_pagar_o_agendar": "Boolean: true SOLO si usa palabras EXPLÍCITAS como 'agendar', 'reservar', 'pagar', 'disponibilidad', 'fecha disponible', 'availability', 'book a date', 'schedule', 'quiero ir', 'quiero visitar'. IMPORTANTE: Si el cliente SOLO dice el nombre de un tipo de boda (ej: 'boda a domicilio', 'capilla', 'la sencilla', 'domicilio') SIN mencionar ninguna de esas palabras, quiere_pagar_o_agendar DEBE ser false. Elegir un paquete NO es lo mismo que querer agendar.",
  "quiere_humano": "Boolean: true si pregunta si es bot, o pide hablar con persona/human/agent",
  "cliente_nombre": "String: nombre del cliente si lo mencionó, sino 'ninguno'",
  "fecha_boda_tentativa": "String: fecha aproximada o 'ninguno'",
  "pide_fotos": "Boolean: true SOLO si en el ÚLTIMO mensaje pide ver FOTOS/photos/images. Si habla de otra cosa, DEBE ser false.",
  "pide_videos": "Boolean: true SOLO si en el ÚLTIMO mensaje pide ver VIDEOS/video/tour. Si habla de otra cosa, DEBE ser false."
}`;


// -----------------------------------------
// CAPA 3: GENERADOR CONVERSACIONAL (PINTOR)
// -----------------------------------------
// Esta será la persona amistosa, pero sometida a reglas dictadoras de formato.
const SYNTHESIS_PROMPT = `Eres Cynthia, asesora virtual de My Wedding Palace. Respondes por WhatsApp de forma cálida, natural y conversacional — como una persona real, no un formulario.

Tu base de conocimiento completa está al final de este prompt. Úsala directamente para responder cualquier pregunta sobre paquetes, precios, días, requisitos e inclusiones.

FLUJO CONVERSACIONAL NATURAL:
- Si el cliente saluda o pide info general sin especificar paquete → preséntate (solo la primera vez) y pregunta qué tipo de ceremonia le interesa. NO des precios todavía.
- Si el cliente menciona un tipo de boda (Sencilla, Capilla, Domicilio) → da todos los detalles de ESE paquete: qué incluye, qué días se hace y el precio. Luego pregunta si tiene dudas o si le gustaría coordinar.
- Si el cliente pregunta algo específico (precio, días, qué incluye) → respóndelo directamente con la info del knowledge base.
- El asesor humano coordinará: fechas exactas/disponibilidad, depósito, y detalles finales. Tú no confirmas fechas.

REGLAS CRÍTICAS DE CONTENIDO:
1. Boda a Domicilio: de LUNES A SÁBADO ($545). Domingo precio especial $645. NUNCA digas 'cualquier día de la semana'.
2. Boda Sencilla: SOLO de lunes a jueves ($445). NO incluye música ni fotografía.
3. Boda en Capilla Elegante: viernes a sábado ($495), domingos ($595). Incluye música. Fotografía NO está incluida en ningún paquete (es servicio adicional).
4. NUNCA confirmes disponibilidad de fechas. NUNCA menciones el depósito de $200. NUNCA pidas datos personales.
5. Si traen licencia propia: Domicilio baja a $400 (L-S) o $500 (Dom). Capilla baja a $250 (V-S) o $350 (Dom). Sencilla NO tiene descuento.
6. DIRECCIÓN: Usa SOLO '10918 Main St Ste B, El Monte CA 91731'. NUNCA la inventes.
7. INCLUSIONS: Cuando el cliente pregunte qué incluye un paquete, CITA LOS ÍTEMS EXACTAMENTE como están escritos en el knowledge base. No resumas, no parafrasees, no inventes ítems, no omitas ninguno.

REGLAS DE FORMATO WhatsApp:
1. BILINGÜISMO: Detecta el idioma y responde siempre en ese idioma. Nombres de paquetes en español siempre igual; en inglés: Simple Wedding, Elegant Chapel Wedding, Wedding at Home.
2. PRESENTACIÓN: Solo en el primer mensaje saluda y preséntate como Cynthia. Después ve directo al grano. Si el cliente envió varios mensajes cortos juntos (ej: 'hol' + 'buenos días'), trátalo como un solo saludo y responde UNA sola vez — nunca saludes dos veces en la misma respuesta.
3. BURBUJAS: Usa "---" para separar mensajes. Máximo 2-3 burbujas. Respuestas cortas y naturales.
4. SIN LISTAS: No uses guiones (-), asteriscos (*) ni numeración. Solo texto fluido.
5. Termina siempre con una pregunta breve para mantener la conversación viva.
`;


export async function runAgentLoop(chatId: string, initialMessage: string) {
    // Guardar mensaje
    await memoryDb.addMessage(chatId, "user", initialMessage);
    const history = await memoryDb.getMessages(chatId, 15);

    await sendPresence(chatId, "composing");

    try {
        // ==========================================
        // CAPA 1: EXTRACCIÓN CON JSON MODE
        // ==========================================
        const extMessages: LLMMessage[] = [
            { role: "system", content: EXTRACTION_PROMPT },
            ...history.map(m => ({ role: m.role as any, content: m.content }))
        ];
        
        const extractedData = await generateJSON(extMessages);
        console.log("[Capa 1] Datos extraídos:", extractedData);

        // Actualizar datos del lead en el CRM
        await memoryDb.updateLeadStatus(chatId, {
            name: extractedData.cliente_nombre !== "ninguno" ? extractedData.cliente_nombre : undefined,
            package: extractedData.tipo_servicio_mencionado !== "ninguno" ? extractedData.tipo_servicio_mencionado : undefined,
            date: extractedData.fecha_boda_tentativa !== "ninguno" ? extractedData.fecha_boda_tentativa : undefined
        });

        // ==========================================
        // CAPA 2: GUARDIANES DUROS (solo 4 reglas críticas de negocio)
        // Todo lo demás lo maneja Cynthia leyendo el knowledge base directamente.
        // ==========================================
        let systemAlert = "";
        let pasarAhumanoForzado = false;

        const msgLower = initialMessage.toLowerCase();
        const hasExplicitBookingWords = msgLower.match(/(agendar|reservar|disponib|book|schedule|appointment|fecha disponible|quiero ir|visitar|ir a su local)/);
        const isJustPickingPackage = extractedData.tipo_servicio_mencionado !== 'ninguno'
            && !hasExplicitBookingWords
            && extractedData.intencion_principal !== 'pagar_reservar';

        // Guardia 1: Quiere agendar / reservar / visitar
        if (!isJustPickingPackage && (extractedData.quiere_pagar_o_agendar || extractedData.intencion_principal === "pagar_reservar" || hasExplicitBookingWords)) {
            systemAlert = "AVISO DEL SISTEMA: El cliente quiere agendar, reservar o visitar. Dile que con gusto lo conectas con un asesor humano para coordinar todos los detalles. NO menciones depósitos ni montos.";
            pasarAhumanoForzado = true;
        }
        // Guardia 2: Quiere hablar con una persona
        else if (extractedData.quiere_humano || extractedData.intencion_principal === "hablar_con_humano") {
            systemAlert = "AVISO DEL SISTEMA: El cliente quiere hablar con una persona. Sé transparente: dile que eres asesora virtual y que lo conectas con un asesor humano de inmediato.";
            pasarAhumanoForzado = true;
        }
        // Guardia 3: Matrimonio mismo sexo
        else if (msgLower.match(/(mismo sexo|gay|lesbiana|homosexual)/)) {
            systemAlert = "AVISO DEL SISTEMA: El cliente pregunta por matrimonio del mismo sexo. Responde amablemente que lamentablemente no ofrecemos ese servicio.";
        }
        // Guardia 4: Trámite legal / migratorio
        else if (extractedData.intencion_principal === "tramite_legal" || msgLower.match(/(ciudadan[ií]a|huellas|green card|permiso de trabajo|petici[oó]n familiar)/)) {
            systemAlert = "AVISO DEL SISTEMA: El cliente pregunta por trámites legales o migratorios. Dile que lo conectas con un asesor especializado para ese servicio.";
            pasarAhumanoForzado = true;
        }

        // Si hay pase a humano: agregar horario y alertar al grupo
        const GRUPO_ALERTAS = "120363425164097782@g.us";
        if (pasarAhumanoForzado) {
            systemAlert += " Menciona nuestro horario de atención: Lunes a Viernes 10:00 am a 7:00 pm, Sábados 10:00 am a 5:00 pm.";
            const cleanNum = chatId.split("@")[0];
            let motivo = "Quiere hablar con un asesor";
            if (extractedData.quiere_pagar_o_agendar || hasExplicitBookingWords) motivo = "Quiere agendar/reservar/visitar";
            else if (extractedData.intencion_principal === "tramite_legal") motivo = "Consulta trámite legal/migratorio";
            else if (extractedData.quiere_humano) motivo = "Pidió hablar con un humano";
            sendText(GRUPO_ALERTAS, `🚨 *ALERTA DE MWP AI* 🚨\n\n📱 Cliente: wa.me/${cleanNum}\n📋 Motivo: ${motivo}\n\n¡Atiéndanlo pronto!`).catch(() => {});
        }

        // Si se pide ubicación: indicarle a Cynthia que envíe la dirección y el pin
        if (extractedData.intencion_principal === 'ubicacion') {
            systemAlert += " AVISO: El cliente pregunta la dirección. Dile nuestra dirección y que le envías el pin de ubicación.";
        }
        // Si pide fotos o videos
        if (extractedData.pide_fotos) systemAlert += " AVISO: El cliente quiere ver fotos. Dile que se las envías ahora.";
        if (extractedData.pide_videos) systemAlert += " AVISO: El cliente quiere ver un video. Dile que se lo envías ahora.";


        // ==========================================
        // CAPA 3: GENERACIÓN DE RESPUESTA LINGÜÍSTICA
        // ==========================================
        // Verificamos si ya hubo mensajes del asistente para no repetir saludo
        const hasGreeted = history.some(m => m.role === "assistant") || history.filter(m => m.role === "user").length > 1;
        const greetingInstruction = hasGreeted 
            ? "REGLA CRÍTICA: YA TE PRESENTASTE ANTES. No vuelvas a decir 'Hola, soy Cynthia' ni a presentarte. Ve directo al grano y responde la pregunta del cliente." 
            : "REGLA CRÍTICA: Es el primer mensaje. DEBES saludarte y presentarte como Cynthia.";

        const synthPrompt = `${SYNTHESIS_PROMPT}\n\n${greetingInstruction}${systemAlert ? `\n\n=== AVISO DEL SISTEMA ===\n${systemAlert}` : ""}\n\n=== BASE DE CONOCIMIENTO ===\n${knowledgeBase}`;
        
        const synthMessages: LLMMessage[] = [
            { role: "system", content: synthPrompt },
            ...history.slice(-6).map(m => ({ role: m.role as any, content: m.content })) 
        ];

        const response = await generateResponse(synthMessages);
        
        if (response.content) {
            await memoryDb.addMessage(chatId, "assistant", response.content);
            // Marcar que el bot respondió y activar el seguimiento
            await memoryDb.updateLeadStatus(chatId, { last_bot_at: true, needs_followup: true });

            // Separación de Burbujas por "---"
            const chunks = response.content.split("---").map(c => c.trim()).filter(c => c.length > 0);

            for (let i = 0; i < chunks.length; i++) {
                if (i > 0) {
                    await sendPresence(chatId, "composing");
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
                await sendText(chatId, chunks[i]);
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            // --- ENVÍO DE MULTIMEDIA SELECTIVO (Fase 4) ---
            const baseUrl = "https://mwp.botlylatam.cloud/assets/media";

            if (extractedData.pide_fotos) {
                await sendPresence(chatId, "composing");
                await new Promise(r => setTimeout(r, 1000));
                await sendMedia(chatId, `${baseUrl}/capilla1.jpg`, "image", "📸 Nuestra Capilla Elegante");
                await new Promise(r => setTimeout(r, 800));
                await sendMedia(chatId, `${baseUrl}/capilla2.jpg`, "image", "✨ Otro ángulo de nuestra capilla");
            }

            if (extractedData.pide_videos) {
                await sendPresence(chatId, "composing");
                await new Promise(r => setTimeout(r, 1000));
                await sendMedia(chatId, `${baseUrl}/video_capilla.mp4`, "video", "🎥 Mira un pequeño recorrido de nuestras instalaciones");
            }

            // --- ENVÍO DE UBICACIÓN (PIN NATIVO) ---
            if (extractedData.intencion_principal === 'ubicacion') {
                await sendPresence(chatId, "composing");
                await new Promise(r => setTimeout(r, 1000));
                await sendLocation(chatId, 34.0744, -118.0371, "My Wedding Palace", "10918 Main St Suite B, El Monte, CA 91731");
            }

            return;
        }

        return sendText(chatId, "He procesado la solicitud pero no tengo nada que decir.");

    } catch (err: any) {
        console.error("[Agent] Iteración fallida:", err);
        return sendText(chatId, `Hubo un error al procesar tu solicitud: ${err.message}`);
    }
}
