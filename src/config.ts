import dotenv from "dotenv";

dotenv.config();

export const config = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DB_PATH: process.env.DB_PATH || "./memory.db",
    EVOLUTION_API_URL: process.env.EVOLUTION_API_URL,
    EVOLUTION_INSTANCE_NAME: process.env.EVOLUTION_INSTANCE_NAME,
    EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
    PORT: process.env.PORT || 3000,
    PGHOST: process.env.PGHOST,
    PGPORT: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
    PGUSER: process.env.PGUSER,
    PGPASSWORD: process.env.PGPASSWORD,
    PGDATABASE: process.env.PGDATABASE,
};

export function validateConfig() {
    const missing = [];
    if (!config.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
    if (!config.EVOLUTION_API_URL) missing.push("EVOLUTION_API_URL");
    if (!config.EVOLUTION_INSTANCE_NAME) missing.push("EVOLUTION_INSTANCE_NAME");
    if (!config.EVOLUTION_API_KEY) missing.push("EVOLUTION_API_KEY");

    // PG es opcional por ahora si queremos fallback a SQLite, pero como estamos migrando lo validamos
    if (!config.PGHOST) missing.push("PGHOST");
    if (!config.PGUSER) missing.push("PGUSER");
    if (!config.PGPASSWORD) missing.push("PGPASSWORD");
    if (!config.PGDATABASE) missing.push("PGDATABASE");

    if (missing.length > 0) {
        throw new Error(`Faltan variables de entorno requeridas: ${missing.join(", ")}`);
    }
}
