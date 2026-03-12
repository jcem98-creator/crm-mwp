import { LLMMessage, generateResponse, generateJSON } from "../llm/index.js";
import { memoryDb } from "../db/index.js";
import { sendText, sendPresence } from "../whatsapp.js";
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
const EXTRACTION_PROMPT = `Tu único trabajo es leer el último mensaje del cliente en su contexto y extraer datos estructurados. Eres un analizador semántico, no un vendedor.
Responde ÚNICA Y EXCLUSIVAMENTE con un JSON válido que siga esta estructura:
{
  "intencion_principal": "String: una de las siguientes opciones => 'consultar_precio', 'capacidad_invitados', 'pagar_reservar', 'hablar_con_humano', 'saludo_general', 'ubicacion', 'tramite_legal', 'otra'",
  "tipo_servicio_mencionado": "String: 'capilla', 'sencilla', 'domicilio', o 'ninguno' (nota: asume domicilio si menciona playa, parque o locación externa)",
  "dia_mencionado": "String: día de la semana si lo mencionó ('lunes', 'sabado', etc.) o 'ninguno'",
  "trae_licencia_propia": "Boolean: true si el cliente menciona que YA tiene su licencia de matrimonio",
  "quiere_pagar_o_agendar": "Boolean: true si usa palabras como 'pagar', 'cuanto es el deposito', 'agendar fecha', 'reservar'",
  "quiere_humano": "Boolean: true si pregunta si es un bot, o pide hablar con una persona o asesor",
  "cliente_nombre": "String: El nombre del cliente si lo mencionó claramente, sino 'ninguno'",
  "fecha_boda_tentativa": "String: La fecha u ocasión aproximada (ej: '15 de Mayo', 'el próximo sábado', 'Diciembre') o 'ninguno'"
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
   Ejemplo: ¡Hola! Soy Cynthia, agente IA de My Wedding Palace. --- ¿En qué paquete o locación estaban pensando para su boda?
4. PROHIBIDO LISTAS: No uses guiones (-), asteriscos (*) ni números. Solo texto fluido separado por "---".
5. CONCISIÓN: No des discursos. Termina siempre con una pregunta corta. No menciones depósitos.
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
                      datosInyectadosAlSistema += "Boda Sencilla (Solo Lunes a Jueves): Precio $445 fijos. Incluye capilla, ministro y documentos. NO incluye fotos ni música. ";
                      if (extractedData.trae_licencia_propia) {
                           datosInyectadosAlSistema += "IMPORTANTE: Aclárale al cliente que para la Boda Sencilla NO hay opción ni descuento por traer su propia licencia, el precio sigue siendo $445 fijos. ";
                      }
                 } else if (extractedData.tipo_servicio_mencionado === 'capilla' || (extractedData.dia_mencionado && ['viernes', 'sabado', 'domingo'].includes(extractedData.dia_mencionado))) {
                      let precioCap = extractedData.dia_mencionado === 'domingo' ? "$595" : "$495";
                      if (extractedData.trae_licencia_propia) precioCap = extractedData.dia_mencionado === 'domingo' ? "$350" : "$250";
                      datosInyectadosAlSistema += `Boda en Capilla Elegante (Fin de semana): El costo es ${precioCap} (ya incluye descuento si traen licencia). Incluye TODO lo de la sencilla PLUS Música y Fotografía de regalo. `;
                 } else {
                      datosInyectadosAlSistema += "Regla: No enlistes todos los paquetes de golpe. Dile que la Boda Sencilla (L-J) cuesta $445 y la Capilla Elegante (Fin de semana) inicia en $495. A Domicilio desde $545. Pregúntale qué día tenían pensado casarse. ";
                 }
            }
            
            // Si la intención es solo saludo general
            if (extractedData.intencion_principal === 'saludo_general') {
                datosInyectadosAlSistema += "Saluda amablemente y de inmediato pregunta en qué paquete o locación estaban pensando para su boda. Hazlo todo en una sola idea. ";
            }
        }

        // ==========================================
        // CAPA 3: GENERACIÓN DE RESPUESTA LINGÜÍSTICA
        // ==========================================
        const synthPrompt = `${SYNTHESIS_PROMPT}\n\n=== INSTRUCCIÓN DEL SISTEMA DE NEGOCIO (Acata esto 100% sobre cómo reaccionar al cliente ahora) ===\n${datosInyectadosAlSistema}\n\n=== BASE DE CONOCIMIENTO (Aquí están los detalles: qué incluye la boda, límite exacto de 36 confirmados, domicilio, etc. Úsalo si te preguntan detalles técnicos) ===\n${knowledgeBase}`;
        
        const synthMessages: LLMMessage[] = [
            { role: "system", content: synthPrompt },
            // Solo mandamos un par de mensajes recientes para mantener el hilo natural, pero el core es el dato duro
            ...history.slice(-4).map(m => ({ role: m.role as any, content: m.content })) 
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
            return;
        }

        return sendText(chatId, "He procesado la solicitud pero no tengo nada que decir.");

    } catch (err: any) {
        console.error("[Agent] Iteración fallida:", err);
        return sendText(chatId, `Hubo un error al procesar tu solicitud: ${err.message}`);
    }
}
