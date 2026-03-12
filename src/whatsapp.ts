import { config } from "./config.js";

export async function sendPresence(remoteJid: string, presence: "composing" | "available" | "unavailable" = "composing") {
    try {
        const res = await fetch(`${config.EVOLUTION_API_URL}/chat/sendPresence/${config.EVOLUTION_INSTANCE_NAME}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": config.EVOLUTION_API_KEY as string
            },
            body: JSON.stringify({
                number: remoteJid,
                presence: presence,
                delay: 1200
            })
        });
        const data = await res.text();
        console.log(`[WhatsApp] sendPresence response (${res.status}):`, data.substring(0, 200));
    } catch (e) {
        console.error("[WhatsApp] Error sending presence:", e);
    }
}

export async function sendText(remoteJid: string, text: string) {
    // Intentar con el JID completo primero, luego sin @s.whatsapp.net
    const number = remoteJid.includes("@") ? remoteJid.split("@")[0] : remoteJid;
    
    console.log(`[WhatsApp] Enviando texto a: ${number} (original: ${remoteJid})`);
    
    try {
        const res = await fetch(`${config.EVOLUTION_API_URL}/message/sendText/${config.EVOLUTION_INSTANCE_NAME}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": config.EVOLUTION_API_KEY as string
            },
            body: JSON.stringify({
                number: number,
                text: text
            })
        });
        const data = await res.text();
        console.log(`[WhatsApp] sendText response (${res.status}):`, data.substring(0, 300));
    } catch (e) {
        console.error("[WhatsApp] Error sending text:", e);
    }
}

export async function sendMedia(remoteJid: string, mediaUrl: string, mediaType: "image" | "video", caption?: string) {
    const number = remoteJid.includes("@") ? remoteJid.split("@")[0] : remoteJid;
    const fileName = mediaUrl.split("/").pop() || "archivo";

    console.log(`[WhatsApp] Enviando ${mediaType} a: ${number}. URL: ${mediaUrl}`);

    try {
        const res = await fetch(`${config.EVOLUTION_API_URL}/message/sendMedia/${config.EVOLUTION_INSTANCE_NAME}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": config.EVOLUTION_API_KEY as string
            },
            body: JSON.stringify({
                number: number,
                mediaMessage: {
                    media: mediaUrl,
                    mediaType: mediaType,
                    caption: caption || "",
                    fileName: fileName
                }
            })
        });
        const data = await res.text();
        console.log(`[WhatsApp] sendMedia response (${res.status}):`, data);
    } catch (e) {
        console.error("[WhatsApp] Error sending media:", e);
    }
}
