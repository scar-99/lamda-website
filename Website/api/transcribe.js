import axios from 'axios';

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        let base64AudioString;

        // Detect how the audio data is sent
        if (request.headers.get('content-type')?.includes('application/json')) {
            // JSON body: { audio: "data:audio/webm;base64,..." }
            const { audio } = await request.json();
            base64AudioString = audio;
        } else {
            // Raw base64 string body
            base64AudioString = await request.text();
        }

        if (!base64AudioString) {
            throw new Error("No audio data received from request");
        }

        // Remove any data URI prefix
        const base64Data = base64AudioString.includes(',')
            ? base64AudioString.split(',')[1]
            : base64AudioString;

        // ✅ Add these debug logs
        console.log("First 50 chars of base64:", base64Data.slice(0, 50));
        console.log("Buffer size in bytes:", Buffer.from(base64Data, 'base64').length);

        // Convert base64 to binary
        const audioData = Buffer.from(base64Data, 'base64');


        // 1. Upload the audio to AssemblyAI
        const uploadResponse = await axios.post(
            'https://api.assemblyai.com/v2/upload',
            audioData,
            {
                headers: {
                    'authorization': ASSEMBLYAI_API_KEY,
                    'Content-Type': 'application/octet-stream'
                }
            }
        );

        const upload_url = uploadResponse.data.upload_url;

        // 2. Request transcription
        const transcribeResponse = await axios.post(
            'https://api.assemblyai.com/v2/transcript',
            { audio_url: upload_url },
            {
                headers: {
                    'authorization': ASSEMBLYAI_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        const transcriptId = transcribeResponse.data.id;

        // 3. Poll for transcription results
        let transcript = { status: 'processing' };
        while (['processing', 'queued'].includes(transcript.status)) {
            await sleep(1500);
            const pollResponse = await axios.get(
                `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
                { headers: { 'authorization': ASSEMBLYAI_API_KEY } }
            );
            transcript = pollResponse.data;
        }

        if (transcript.status === 'error') {
            throw new Error(transcript.error);
        }

        // 4. Send transcription result
        return new Response(
            JSON.stringify({ text: transcript.text || "Could not understand audio." }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error transcribing audio:', error.message);
        return new Response(
            JSON.stringify({ error: 'Failed to transcribe audio.', details: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
