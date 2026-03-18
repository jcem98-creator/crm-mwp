import { runAgentLoop } from "./src/agent/loop.js";
import { memoryDb } from "./src/db/index.js";

async function test() {
    const testJid = "test_user@s.whatsapp.net";
    const testMessage = "hola, me interesa la boda sencilla";
    
    console.log("--- INICIANDO TEST DE AGENTE ---");
    console.log(`Mensaje: ${testMessage}`);
    
    try {
        await memoryDb.initialize();
        console.log("DB Inicializada.");
        
        await runAgentLoop(testJid, testMessage);
        console.log("--- TEST COMPLETADO SIN ERRORES CRÍTICOS ---");
    } catch (error) {
        console.error("--- ERROR EN EL TEST ---");
        console.error(error);
    } finally {
        await memoryDb.close();
        process.exit(0);
    }
}

test();
