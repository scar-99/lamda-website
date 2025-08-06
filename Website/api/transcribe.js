import multiparty from 'multiparty';
import axios from 'axios';
import fs from 'fs';

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
        // Correctly parse the multipart form data from Netlify's request stream
        const { files } = await new Promise((resolve, reject) => {
            const form = new multiparty.Form();
            // The 'request' object itself is the stream to be parsed
            form.parse(request, (err, fields, files) => {
                if (err) return reject(err);
                resolve({ fields, files });
            });
        });

        const audioFile = files.audio[0];
        const audioData = fs.readFileSync(audioFile.path);

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
