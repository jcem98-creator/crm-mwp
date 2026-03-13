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
  "quiere_pagar_o_agendar": "Boolean: true si habla de disponibilidad, fecha específica, reservar, pagar, agendar. También true si pregunta '¿tienen disponibilidad?', '¿puedo agendar el [fecha]?', 'availability', 'book a date'.",
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
const SYNTHESIS_PROMPT = `Eres Cynthia, agente IA de My Wedding Palace.
Tu trabajo es tomar los "DATOS INYECTADOS POR EL SISTEMA" y decírselos al cliente de forma coloquial por WhatsApp.

REGLAS DICTATORIALES DE FORMATO (¡Si rompes una, te desconectamos!):
1. BILINGÜISMO: Detecta el idioma del cliente y responde SIEMPRE en ese mismo idioma. Paquetes en español: "Boda Sencilla o Simple", "Boda en Capilla Elegante", "Boda a Domicilio". En inglés: "Simple Wedding", "Elegant Chapel Wedding", "Wedding at Home". (NUNCA digas "Mobile Wedding" ni "Boda Móvil").
2. SALUDO Y PRESENTACIÓN SIEMPRE JUNTOS: Si es el primer mensaje, comienza SIEMPRE con un saludo y luego preséntate. Ejemplo: "¡Hola! Soy Cynthia, agente IA de My Wedding Palace." (O en inglés). Esto DEBE ir en la misma burbuja.
3. BURBUJAS: Usa "---" para separar ideas. Máximo 2-3 burbujas por respuesta. La primera burbuja debe ser el saludo/presentación y la segunda la información o pregunta.
   Ejemplo: ¡Hola! Soy Cynthia, agente IA de My Wedding Palace. --- ¿Qué tipo de ceremonia les interesa? Tenemos Boda Sencilla, Boda en Capilla Elegante y Boda a Domicilio.
4. PROHIBIDO LISTAS: No uses guiones (-), asteriscos (*) ni números. Solo texto fluido separado por "---".
5. CONCISIÓN: No des discursos. Termina siempre con una pregunta corta. No menciones depósitos.
6. ENFOQUE: Si el cliente ya expresó interés en un tipo de boda específico, enfócate SOLO en ese paquete. NO le ofrezcas los otros paquetes a menos que el cliente pregunte.
7. PROHIBIDO ABSOLUTO: NUNCA confirmes disponibilidad de fechas. NUNCA digas 'tenemos disponibilidad para el [fecha]' ni nada similar. Tú no tienes acceso al calendario. NUNCA pidas nombres completos, números de contacto ni datos de la pareja. Eso lo coordina el asesor humano.
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
        // CAPA 2: MOTOR DE REGLAS DURO (CÓDIGO PURO)
        // ==========================================
        let datosInyectadosAlSistema = "Regla General: Estamos ubicados en 10918 Main St Ste B, El Monte, CA 91731. Somos un servicio de bodas civiles. ";
        let pasarAhumanoForzado = false;

        // Reglas de Escape Rápidas (Pase a Humano)
        if (extractedData.quiere_pagar_o_agendar || extractedData.intencion_principal === "pagar_reservar" || initialMessage.toLowerCase().includes("ir a su local") || initialMessage.toLowerCase().includes("visitar")) {
            datosInyectadosAlSistema = "AVISO CRÍTICO PARA CYNTHIA: El cliente quiere agendar, reservar, o visitar el local. DI INMEDIATAMENTE QUE LO PASAS CON UN ASESOR HUMANO PARA COORDINAR LOS DETALLES O LA VISITA. MUY IMPORTANTE: NO menciones nada sobre pagos o depósitos de $200 (puede asustar al cliente), solo ofrécele pasarlo con el asesor para coordinarlo.";
            pasarAhumanoForzado = true;
        } 
        else if (extractedData.quiere_humano || extractedData.intencion_principal === "hablar_con_humano") {
             datosInyectadosAlSistema = "AVISO CRÍTICO PARA CYNTHIA: El cliente pregunta si eres bot o quiere un humano. DI LA VERDAD: QUE ERES ASESORA VIRTUAL Y QUE LO PASAS CON UN HUMANO INMEDIATAMENTE.";
             pasarAhumanoForzado = true;
        }
        else if (initialMessage.toLowerCase().includes("mismo sexo") || initialMessage.toLowerCase().includes("gay") || initialMessage.toLowerCase().includes("lesbiana") || initialMessage.toLowerCase().includes("homosexual")) {
             datosInyectadosAlSistema = "REGLA DE EMPRESA INQUEBRANTABLE (ACATA OBLIGATORIAMENTE): El cliente está preguntando si hacemos matrimonios o bodas del mismo sexo. TU RESPUESTA DEBE SER UN ROTUNDO 'NO'. Dile amablemente que NO realizamos ni hacemos matrimonios del mismo sexo. Si respondes que sí o que trabajamos con todas las parejas, fallarás críticamente.";
        }
        else if (extractedData.intencion_principal === "tramite_legal" || initialMessage.toLowerCase().includes("ciudadania") || initialMessage.toLowerCase().includes("huellas") || initialMessage.toLowerCase().includes("green card")) {
             datosInyectadosAlSistema = "AVISO CRÍTICO PARA CYNTHIA: El cliente está preguntando por un servicio legal o migratorio (ciudadanía, huellas, etc). DI INMEDIATAMENTE QUE LO PASAS CON UN ASESOR HUMANO PARA ESOS TRÁMITES. Tienes prohibido dar asesoría legal o precios.";
             pasarAhumanoForzado = true;
        }

        // Si se fuerza el pase a humano por cualquier razón, agregamos la info del horario
        // y notificamos al grupo de asesores
        const GRUPO_ALERTAS = "120363425164097782@g.us";
        if (pasarAhumanoForzado) {
            datosInyectadosAlSistema += " ADEMÁS, ES OBLIGATORIO QUE LE MENCIONES NUESTRO HORARIO DE ATENCIÓN para que sepa cuándo le responderá el humano: De Lunes a Viernes de 10:00 am a 7:00 pm, y Sábados de 10:00 am a 5:00 pm.";
            
            // Determinar el motivo
            const cleanNum = chatId.split("@")[0];
            let motivo = "Quiere hablar con un asesor";
            if (extractedData.quiere_pagar_o_agendar) motivo = "Quiere agendar/reservar/visitar";
            else if (extractedData.intencion_principal === "tramite_legal") motivo = "Consulta sobre trámite legal/migratorio";
            else if (extractedData.quiere_humano) motivo = "Pidió hablar con un humano";
            
            // Enviar alerta al grupo
            sendText(GRUPO_ALERTAS, `🚨 *ALERTA DE MWP AI* 🚨\n\n📱 Cliente: wa.me/${cleanNum}\n📋 Motivo: ${motivo}\n\n¡Atiéndanlo pronto!`).catch(() => {});
        }
        else {
            // Lógica de Información (Sin escape a humano)
            
            // Si el cliente pide información de capacidad
            if (extractedData.intencion_principal === 'capacidad_invitados') {
                if (extractedData.tipo_servicio_mencionado === 'domicilio') {
                    datosInyectadosAlSistema += "Capacidad a Domicilio: NO digas que es ilimitada. Simplemente dile que para eventos a domicilio la capacidad de invitados debe ser coordinada con un asesor de ventas, y ofrécele pasarlo con uno. ";
                } else {
                    datosInyectadosAlSistema += "Capacidad en Capilla (Sencilla o Elegante): Un límite máximo de hasta 36 personas. ";
                }
            }
            
            // Si el cliente pide precios / planes
            if (extractedData.intencion_principal === 'consultar_precio' || extractedData.intencion_principal === 'otra') {
                 if (extractedData.tipo_servicio_mencionado === 'domicilio') {
                      let precioDom = extractedData.dia_mencionado === 'domingo' ? "$645" : "$545";
                      if (extractedData.trae_licencia_propia) precioDom = extractedData.dia_mencionado === 'domingo' ? "$500" : "$400";
                      datosInyectadosAlSistema += `Precios Boda a Domicilio: El costo es ${precioDom} (ya incluye descuento si traen licencia). A más de 20 millas se cobran $100 extra. `;
                 } else if (extractedData.tipo_servicio_mencionado === 'sencilla' || (extractedData.dia_mencionado && ['lunes', 'martes', 'miercoles', 'jueves'].includes(extractedData.dia_mencionado))) {
                      datosInyectadosAlSistema += "Boda Sencilla (Solo Lunes a Jueves): Precio $445 fijos. Incluye: Licencia del condado, certificado, ceremonia por ministro profesional, notary public y estacionamiento. NO incluye música de ambiente ni fotografía. ";
                      if (extractedData.trae_licencia_propia) {
                           datosInyectadosAlSistema += "IMPORTANTE: Aclárale al cliente que para la Boda Sencilla NO hay descuento por traer su propia licencia, el precio sigue siendo $445 fijos. ";
                      }
                 } else if (extractedData.tipo_servicio_mencionado === 'capilla' || (extractedData.dia_mencionado && ['viernes', 'sabado', 'domingo'].includes(extractedData.dia_mencionado))) {
                      let precioCap = extractedData.dia_mencionado === 'domingo' ? "$595" : "$495";
                      if (extractedData.trae_licencia_propia) precioCap = extractedData.dia_mencionado === 'domingo' ? "$350" : "$250";
                      datosInyectadosAlSistema += `Boda en Capilla Elegante (Viernes a Domingo): El costo es ${precioCap}. Incluye: Licencia del condado, certificado, ministro profesional, notary public, estacionamiento, música de ambiente y fotografía de regalo. `;
                 } else {
                      datosInyectadosAlSistema += "Regla: No enlistes todos los paquetes de golpe. Dile que la Boda Sencilla (L-J) cuesta $445 y la Capilla Elegante (Fin de semana) inicia en $495. A Domicilio desde $545. Pregúntale qué día tenían pensado casarse. ";
                 }
            }
            
            // Si la intención es solo saludo general
            if (extractedData.intencion_principal === 'saludo_general') {
                datosInyectadosAlSistema += "Saluda amablemente y pregúntale: ¿Qué tipo de ceremonia les interesa? Tenemos Boda Sencilla, Boda en Capilla Elegante y Boda a Domicilio. Hazlo todo en una sola idea. ";
            }

            // Si el cliente pregunta por la ubicación
            if (extractedData.intencion_principal === 'ubicacion') {
                datosInyectadosAlSistema += " AVISO: El cliente pregunta por la ubicación. Dile nuestra dirección y que le envías la ubicación ahora mismo. ";
            }

            // --- REGLA FASE 4: RECONOCIMIENTO DE MEDIA ---
            if (extractedData.pide_fotos) {
                datosInyectadosAlSistema += " AVISO: El cliente quiere ver FOTOS. Dile que con gusto se las envías ahora mismo. ";
            }
            if (extractedData.pide_videos) {
                datosInyectadosAlSistema += " AVISO: El cliente quiere ver VIDEOS. Dile que con gusto le envías un video del local ahora mismo. ";
            }
        }

        // ==========================================
        // CAPA 3: GENERACIÓN DE RESPUESTA LINGÜÍSTICA
        // ==========================================
        // Verificamos si ya hubo mensajes del asistente para no repetir saludo
        const hasGreeted = history.some(m => m.role === "assistant") || history.filter(m => m.role === "user").length > 1;
        const greetingInstruction = hasGreeted 
            ? "REGLA CRÍTICA: YA TE PRESENTASTE ANTES. No vuelvas a decir 'Hola, soy Cynthia' ni a presentarte. Ve directo al grano y responde la pregunta del cliente." 
            : "REGLA CRÍTICA: Es el primer mensaje. DEBES saludarte y presentarte como Cynthia.";

        const synthPrompt = `${SYNTHESIS_PROMPT}\n\n${greetingInstruction}\n\n=== INSTRUCCIÓN DEL SISTEMA DE NEGOCIO ===\n${datosInyectadosAlSistema}\n\n=== BASE DE CONOCIMIENTO ===\n${knowledgeBase}`;
        
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
