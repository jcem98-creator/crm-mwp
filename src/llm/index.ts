import OpenAI from "openai";
import { config } from "../config.js";

// Inicializar OpenAI
const openai = config.OPENAI_API_KEY ? new OpenAI({ apiKey: config.OPENAI_API_KEY }) : null;

// Modelo principal (Inteligencia superior y bajo costo)
const DEFAULT_MODEL = "gpt-4o";

export interface LLMMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
    tool_calls?: any[];
    tool_call_id?: string;
}

export async function generateResponse(messages: LLMMessage[], tools: any[] = []) {
    if (!openai) {
        throw new Error("No hay cliente LLM configurado. Revisa tu .env y añade OPENAI_API_KEY");
    }

    try {
        console.log("[LLM] Generando respuesta con OpenAI (gpt-4o-mini)...");
        const response = await openai.chat.completions.create({
            model: DEFAULT_MODEL,
            messages: messages as any,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? "auto" : undefined,
        });
        return response.choices[0].message;
    } catch (error: any) {
        console.error("[LLM] Error con OpenAI:", error.message);
        throw error;
    }
}

export async function generateJSON(messages: LLMMessage[]) {
    if (!openai) {
        throw new Error("No hay cliente LLM configurado. Revisa tu .env y añade OPENAI_API_KEY");
    }

    try {
        console.log("[LLM] Extrayendo datos en JSON...");
        const response = await openai.chat.completions.create({
            model: DEFAULT_MODEL,
            messages: messages as any,
            response_format: { type: "json_object" }
        });
        return JSON.parse(response.choices[0].message.content || "{}");
    } catch (error: any) {
        console.error("[LLM] Error con OpenAI JSON:", error.message);
        return {};
    }
}
