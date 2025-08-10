import axios from 'axios';

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const MIN_AUDIO_SIZE = 2000; // Increased minimum size to ensure quality
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB max file size
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to validate audio buffer
const validateAudioBuffer = (buffer) => {
    if (!buffer || buffer.length < MIN_AUDIO_SIZE) {
        throw new Error(`Audio file too small (${buffer?.length || 0} bytes). Minimum ${MIN_AUDIO_SIZE} bytes required.`);
    }
    if (buffer.length > MAX_AUDIO_SIZE) {
        throw new Error(`Audio file too large (${buffer.length} bytes). Maximum ${MAX_AUDIO_SIZE} bytes allowed.`);
    }
    // Add basic WebM header check (0x1A 0x45 0xDF 0xA3)
    if (buffer[0] !== 0x1A || buffer[1] !== 0x45 || buffer[2] !== 0xDF || buffer[3] !== 0xA3) {
        throw new Error("Invalid audio format. Expected WebM/Opus format.");
    }
};

export default async function handler(request) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // For CORS
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
    }

    try {
        // --- FINAL FIX: Manually parse the raw request body ---
        // This is the most reliable way to handle incoming data on Netlify.
        const rawBody = await request.text();
        const { audio: base64AudioString } = JSON.parse(rawBody);

        if (!base64AudioString) {
            throw new Error("No audio data received in JSON body");
        }

        const base64Data = base64AudioString.split(',')[1];
        const audioBuffer = Buffer.from(base64Data, 'base64');

        validateAudioBuffer(audioBuffer);
        console.log(`Received valid audio (${audioBuffer.length} bytes)`);

        // 1. Upload to AssemblyAI
        const uploadResponse = await axios.post(
            'https://api.assemblyai.com/v2/upload',
            audioBuffer,
            {
                headers: {
                    'authorization': ASSEMBLYAI_API_KEY,
                    'Content-Type': 'application/octet-stream'
                }
            }
        );

        const upload_url = uploadResponse.data?.upload_url;
        if (!upload_url) {
            throw new Error("Failed to upload audio to AssemblyAI");
        }

        // 2. Start transcription
        const transcribeResponse = await axios.post(
            'https://api.assemblyai.com/v2/transcript',
            {
                audio_url: upload_url,
                language_detection: true,
                punctuate: true,
                format_text: true
            },
            {
                headers: {
                    'authorization': ASSEMBLYAI_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        const transcriptId = transcribeResponse.data?.id;
        if (!transcriptId) {
            throw new Error("Failed to start transcription");
        }

        // 3. Poll for results
        let transcript;
        while (true) {
            const pollResponse = await axios.get(
                `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
                { headers: { 'authorization': ASSEMBLYAI_API_KEY } }
            );
            transcript = pollResponse.data;
            if (transcript.status === 'completed' || transcript.status === 'error') {
                break;
            }
            await sleep(2000);
        }

        if (transcript.status === 'error') {
            throw new Error(transcript.error || "Transcription failed");
        }

        // 4. Return successful response
        return new Response(
            JSON.stringify({ text: transcript.text || "Could not understand audio." }),
            { status: 200, headers }
        );

    } catch (error) {
        console.error('Transcription error:', error.message);
        
        let status = 500;
        let errorMessage = 'Failed to process audio';

        if (error.message.includes('too small')) {
            status = 400;
            errorMessage = 'Audio recording too short. Please record for at least 2 seconds.';
        }

        return new Response(
            JSON.stringify({ error: errorMessage, details: error.message }),
            { status, headers }
        );
    }
}
