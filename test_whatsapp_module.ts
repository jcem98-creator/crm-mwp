import { sendMedia, sendText } from "./src/whatsapp.ts";
import { config } from "./src/config.ts";
import dotenv from "dotenv";

dotenv.config();

const adminNumber = "51992371285@s.whatsapp.net";
const imageUrl = "https://mwp.botlylatam.cloud/assets/media/capilla1.jpg";

async function test() {
    console.log("Testing WhatsApp module...");
    try {
        console.log("1. Sending test text...");
        await sendText(adminNumber, "Test message from OpenGravity System");
        
        console.log("\n2. Sending test image...");
        await sendMedia(adminNumber, imageUrl, "image", "Test image from OpenGravity System");
        
        console.log("\nTests completed. Check WhatsApp.");
    } catch (e) {
        console.error("Test failed:", e);
    }
}

test();
