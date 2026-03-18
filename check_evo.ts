import { config } from "./src/config.js";

async function checkStatus() {
    console.log(`Checking instance: ${config.EVOLUTION_INSTANCE_NAME}...`);
    try {
        const res = await fetch(`${config.EVOLUTION_API_URL}/instance/connectionState/${config.EVOLUTION_INSTANCE_NAME}`, {
            headers: {
                "apikey": config.EVOLUTION_API_KEY as string
            }
        });
        const data = await res.json();
        console.log("Connection State:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error checking Evolution API:", error);
    }
}

checkStatus();
