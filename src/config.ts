import dotenv from "dotenv";

dotenv.config();

export const config = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DB_PATH: process.env.DB_PATH || "./memory.db",
    EVOLUTION_API_URL: process.env.EVOLUTION_API_URL,
    EVOLUTION_INSTANCE_NAME: process.env.EVOLUTION_INSTANCE_NAME,
    EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
    PORT: process.env.PORT || 3000,
};

export function validateConfig() {
    const missing = [];
    if (!config.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
    if (!config.EVOLUTION_API_URL) missing.push("EVOLUTION_API_URL");
    if (!config.EVOLUTION_INSTANCE_NAME) missing.push("EVOLUTION_INSTANCE_NAME");
    if (!config.EVOLUTION_API_KEY) missing.push("EVOLUTION_API_KEY");

    if (missing.length > 0) {
        throw new Error(`Faltan variables de entorno requeridas: ${missing.join(", ")}`);
    }
}
