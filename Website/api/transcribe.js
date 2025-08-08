import axios from 'axios';

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// Helper function to poll for transcription results
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // The frontend now sends a JSON payload with a base64 audio string
        const { audio: base64AudioString } = await request.json();

        // Remove the data URI prefix (e.g., "data:audio/webm;base64,")
        const base64Data = base64AudioString.split(',')[1];
        
        // Convert the base64 string back to a Buffer for upload
        const audioData = Buffer.from(base64Data, 'base64');

        // 1. Upload the audio file to AssemblyAI
        const uploadResponse = await axios.post('https://api.assemblyai.com/v2/upload', audioData, {
            headers: {
                'authorization': ASSEMBLYAI_API_KEY,
                'Content-Type': 'application/octet-stream'
            }
        });

        const upload_url = uploadResponse.data.upload_url;

        // 2. Request the transcription
        const transcribeResponse = await axios.post('https://api.assemblyai.com/v2/transcript', {
            audio_url: upload_url
        }, {
            headers: {
                'authorization': ASSEMBLYAI_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        const transcriptId = transcribeResponse.data.id;

        // 3. Poll for the result
        let transcript = { status: 'processing' };
        while (transcript.status === 'processing' || transcript.status === 'queued') {
            await sleep(1500); // Wait for 1.5 seconds
            const pollResponse = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
                headers: { 'authorization': ASSEMBLYAI_API_KEY }
            });
            transcript = pollResponse.data;
        }

        if (transcript.status === 'error') {
            throw new Error(transcript.error);
        }

        return new Response(JSON.stringify({ text: transcript.text || "Could not understand audio." }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error transcribing audio:', error.message);
        return new Response(JSON.stringify({ error: 'Failed to transcribe audio.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
