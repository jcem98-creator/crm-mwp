import { runAgentLoop } from "./src/agent/loop.js";
import { memoryDb } from "./src/db/index.js";

// Mock de base de datos para ignorar errores de conexión en el entorno local de test
memoryDb.initialize = async () => { console.log("[Mock] DB Init"); };
memoryDb.addMessage = async () => { console.log("[Mock] Add message"); };
memoryDb.getMessages = async () => { 
    return [{ role: "user", content: "hola" }]; 
};
memoryDb.updateLeadStatus = async () => { console.log("[Mock] Update lead"); };
memoryDb.getAllLeads = async () => { return []; };

async function test() {
    const testJid = "test_user@s.whatsapp.net";
    const testMessage = "hola, me interesa la boda sencilla";
    
    console.log("--- INICIANDO TEST DE LÓGICA (MOCK DB) ---");
    
    try {
        await runAgentLoop(testJid, testMessage);
        console.log("--- TEST COMPLETADO ---");
    } catch (error) {
        console.error("--- ERROR EN EL TEST ---");
        console.error(error);
    } finally {
        process.exit(0);
    }
}

test();
