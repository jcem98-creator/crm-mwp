import { memoryDb } from "../db/index.js";
import { sendText, sendPresence, sendMedia } from "../whatsapp.js";
import { LLMMessage, generateResponse } from "../llm/index.js";

/**
 * Objetivo: Redactar seguimientos humanos. 
 * El prompt le dice a Cynthia qué etapa del seguimiento es.
 */
const FOLLOWUP_SYSTEM_PROMPT = `Eres Cynthia, agente IA de My Wedding Palace.
Tu objetivo es reactivar una conversación que se quedó fría. 

INSTRUCCIONES:
1. Sé extremadamente breve (máximo 15-20 palabras).
2. Usa el idioma del historial previo.
3. El mensaje debe ser cordial, nada de presión de venta agresiva.
4. Escribe en prosa, sin listas ni viñetas.
5. NO uses "---" aquí, envía solo una burbuja corta.

OBJETIVO SEGÚN ETAPA:
- Etapa 5h: "¿Pudiste ver la información que te envié? 😊 Estoy aquí si te surgió alguna duda sobre los precios o la locación."
- Etapa 24h: "¡Hola! Solo quería asegurar que recibiste todo lo necesario para tu boda. ¿Te gustaría agendar una llamada rápida con un asesor?"

Adapta estos objetivos al contexto de la charla.`;

/**
 * Verifica si es una hora socialmente aceptable en California (PST)
 * Solo enviar de 9:00 AM a 8:00 PM
 */
function isSocialHour(): boolean {
    const laTime = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    const hour = new Date(laTime).getHours();
    return hour >= 9 && hour < 20;
}

function parseDbDate(value: unknown): Date | null {
    if (typeof value !== "string" || value.trim() === "") return null;
    const s = value.trim();

    // If it's already ISO-ish with timezone, let Date parse it.
    if (/[zZ]$|[+-]\d\d:\d\d$/.test(s)) {
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // SQLite CURRENT_TIMESTAMP is typically "YYYY-MM-DD HH:MM:SS" in UTC.
    // Convert to ISO "YYYY-MM-DDTHH:MM:SSZ" to avoid locale-dependent parsing.
    const iso = s.includes(" ") && !s.includes("T") ? s.replace(" ", "T") + "Z" : s + "Z";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

export async function processFollowups() {
    if (!isSocialHour()) {
        console.log("[Followup] Fuera de horario social en California. Esperando...");
        return;
    }

    console.log("[Followup] Buscando leads para seguimiento...");
    const leads = await memoryDb.getLeadsForFollowup();

    for (const lead of leads) {
        try {
            const now = new Date();
            const lastBotAt = parseDbDate(lead.last_bot_message_at) ?? now;
            const diffHours = (now.getTime() - lastBotAt.getTime()) / (1000 * 60 * 60);

            let shouldSend = false;
            let targetCount = 0;

            if (lead.followup_count === 0 && diffHours >= 5) {
                shouldSend = true;
                targetCount = 1;
            } else if (lead.followup_count === 1 && diffHours >= 15) {
                // 15 horas después del ÚLTIMO mensaje (que fue el primer seguimiento)
                // O si prefieres 24h desde el original, ajustamos el diff
                shouldSend = true;
                targetCount = 2;
            }

            if (shouldSend) {
                console.log(`[Followup] Enviando etapa ${targetCount} a ${lead.chat_id}...`);
                
                // Bloqueo inmediato: incrementamos el contador para que ningún otro proceso lo tome
                await memoryDb.updateLeadStatus(lead.chat_id, { 
                    increment_count: true 
                });

                // Obtener contexto breve
                const history = await memoryDb.getMessages(lead.chat_id, 5);
                
                const messages: LLMMessage[] = [
                    { role: "system", content: FOLLOWUP_SYSTEM_PROMPT },
                    ...history.map(m => ({ role: m.role as any, content: m.content })),
                    { role: "system", content: `INSTRUCCIÓN: Genera el seguimiento para la Etapa ${targetCount === 1 ? '5h' : '24h'}.` }
                ];

                const response = await generateResponse(messages);
                
                if (response.content) {
                    await sendPresence(lead.chat_id, "composing");
                    await new Promise(r => setTimeout(r, 2000));
                    await sendText(lead.chat_id, response.content);
                    
                    // Si es Etapa 2 (24h), enviamos la foto de una pareja feliz para re-enganchar
                    if (targetCount === 2) {
                        await new Promise(r => setTimeout(r, 2000));
                        const baseUrl = "https://mwp.botlylatam.cloud/assets/media";
                        await sendMedia(lead.chat_id, `${baseUrl}/pareja.jpg`, "image", "¡Esperamos verte pronto por aquí! 💍✨");
                    }

                    // Guardar en memoria y actualizar marca de tiempo
                    await memoryDb.addMessage(lead.chat_id, "assistant", `(SEGUIMIENTO AUTO) ${response.content}`);
                    await memoryDb.updateLeadStatus(lead.chat_id, { 
                        last_bot_at: true 
                    });
                } else {
                    // Si falló el LLM, revertimos el conteo (opcional, pero mejor dejarlo así)
                    console.error(`[Followup] Error: No se generó contenido para ${lead.chat_id}`);
                }
            }
        } catch (error) {
            console.error(`[Followup] Error procesando ${lead.chat_id}:`, error);
        }
    }
}
