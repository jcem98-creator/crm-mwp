import { runAgentLoop } from "./loop.js";
import { memoryDb } from "../db/index.js";
import * as whatsapp from "../whatsapp.js";

async function runTest(chatId: string, message: string) {
    console.log(`\n[Test] Sending message from ${chatId}: "${message}"`);
    await runAgentLoop(chatId, message);
}

async function main() {
    console.log("Starting Bot Rules Verification...");
    
    // Clear test memory
    const testChatId = "51992371285@s.whatsapp.net";
    await memoryDb.clearMemory(testChatId);

    // Test 1: Initial Greeting
    await runTest(testChatId, "Hola");

    // Test 2: Information inquiry (Sencilla)
    await runTest(testChatId, "cuanto cuesta la sencilla");

    // Test 3: Booking intent (should trigger human alert)
    await runTest(testChatId, "quiero reservar para el proximo sabado");

    // Test 4: Same-sex marriage (should be rejected)
    await runTest(testChatId, "matrimonio gay");

    // Test 5: Location inquiry
    await runTest(testChatId, "cual es su direccion");

    console.log("\nTests finished. Check logs above for LLM outputs and guardrail triggers.");
    process.exit(0);
}

// Since we are using tsx/node directly and not a test runner in the repo yet, 
// we'll just implement a simple local mock or spy if needed, but for now 
// let's just run it and observe the console logs.

// Mocking Database to avoid connection errors locally
(memoryDb as any).initialize = async () => {};
(memoryDb as any).clearMemory = async () => { (memoryDb as any).messages = []; };
(memoryDb as any).addMessage = async (chatId: string, role: string, content: string) => {
    if (!(memoryDb as any).messages) (memoryDb as any).messages = [];
    (memoryDb as any).messages.push({ role, content });
};
(memoryDb as any).getMessages = async (chatId: string, limit: number) => {
    return ((memoryDb as any).messages || []).slice(-limit);
};
(memoryDb as any).updateLeadStatus = async () => {};
(memoryDb as any).getAllLeads = async () => [];
(memoryDb as any).getLeadsForFollowup = async () => [];

// Mocking global fetch to intercept Evolution API calls
(globalThis as any).fetch = async (url: string, init: any) => {
    const body = JSON.parse(init.body || "{}");
    console.log(`[MOCK FETCH] URL: ${url} | Payload:`, JSON.stringify(body, null, 2));
    
    // Return a mock response
    return {
        status: 201,
        text: async () => JSON.stringify({ key: { id: "mock-id" }, status: "PENDING" })
    } as any;
};

main().catch(console.error);
