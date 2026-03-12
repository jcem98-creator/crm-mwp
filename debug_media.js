import fetch from 'node-fetch';

const config = {
    EVOLUTION_API_URL: 'https://evolutionapi.botlylatam.cloud',
    EVOLUTION_INSTANCE_NAME: 'Pruebas',
    EVOLUTION_API_KEY: 'q0PMIE3+WJxOHDkjN38/oigV/9Cg4vp8w2IGTeNByglY7r28sYBU/n0++0/haMzVq2KJDJYUxX3MXONXN4Upfg==',
};

const chatId = '51992371285'; // Admin number for testing
const mediaUrl = 'https://mwp.botlylatam.cloud/assets/media/capilla1.jpg';

async function testFormat(name, body) {
    console.log(`\n--- Testing Format: ${name} ---`);
    console.log('Payload:', JSON.stringify(body, null, 2));
    try {
        const res = await fetch(`${config.EVOLUTION_API_URL}/message/sendMedia/${config.EVOLUTION_INSTANCE_NAME}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': config.EVOLUTION_API_KEY
            },
            body: JSON.stringify(body)
        });
        const data = await res.text();
        console.log(`Status: ${res.status}`);
        console.log('Response:', data);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

async function run() {
    // Format 1: Current implementation (top level fields)
    await testFormat('Top Level Fields', {
        number: chatId,
        media: mediaUrl,
        mediaType: 'image',
        caption: 'Test Top Level',
        fileName: 'capilla1.jpg'
    });

    // Format 2: mediaMessage wrapper (V2 style often seen in docs)
    await testFormat('mediaMessage Wrapper', {
        number: chatId,
        mediaMessage: {
            media: mediaUrl,
            mediaType: 'image',
            caption: 'Test Wrapper',
            fileName: 'capilla1.jpg'
        }
    });

    // Format 3: "mediatype" all lowercase
    await testFormat('Lowercase mediatype', {
        number: chatId,
        media: mediaUrl,
        mediatype: 'image',
        caption: 'Test Lowercase',
        fileName: 'capilla1.jpg'
    });
}

run();
