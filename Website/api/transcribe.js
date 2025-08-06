import multiparty from 'multiparty';
import axios from 'axios';
import fs from 'fs';

// This requires you to install axios and multiparty
// Run `npm install axios multiparty` in your terminal

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
        // Netlify functions receive the raw body, so we need to handle multipart data differently.
        const bodyBuffer = Buffer.from(request.body, 'base64');
        const boundary = request.headers['content-type'].split('boundary=')[1];

        // 1. Upload the audio file to AssemblyAI
        const uploadResponse = await axios.post('https://api.assemblyai.com/v2/upload', bodyBuffer, {
            headers: {
                'authorization': ASSEMBLYAI_API_KEY,
                'Content-Type': `multipart/form-data; boundary=${boundary}`
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
            await sleep(1000); // Wait for 1 second
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
