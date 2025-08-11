import axios from 'axios';

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const MIN_AUDIO_SIZE = 2000;
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const validateAudioBuffer = (buffer) => {
  if (!buffer || buffer.length < MIN_AUDIO_SIZE) {
    throw new Error(`Audio file too small (${buffer?.length || 0} bytes). Minimum ${MIN_AUDIO_SIZE} bytes required.`);
  }
  if (buffer.length > MAX_AUDIO_SIZE) {
    throw new Error(`Audio file too large (${buffer.length} bytes). Maximum ${MAX_AUDIO_SIZE} bytes allowed.`);
  }
  if (buffer[0] !== 0x1A || buffer[1] !== 0x45 || buffer[2] !== 0xDF || buffer[3] !== 0xA3) {
    throw new Error("Invalid audio format. Expected WebM/Opus format.");
  }
};

export default async function handler(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
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
    let audioBuffer;
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const audioFile = formData.get('audio');
      if (!audioFile) throw new Error("No audio file found in form data");
      audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    }
    else if (contentType.includes('application/json')) {
      const { audio } = await request.json();
      if (!audio) throw new Error("No audio data in JSON body");
      const base64Data = audio.includes(',') ? audio.split(',')[1] : audio;
      audioBuffer = Buffer.from(base64Data, 'base64');
    }
    else if (contentType.includes('audio/')) {
      audioBuffer = Buffer.from(await request.arrayBuffer());
    }
    else {
      throw new Error("Unsupported content type");
    }

    validateAudioBuffer(audioBuffer);
    console.log(`Received valid audio (${audioBuffer.length} bytes)`);

    // 1. Upload to AssemblyAI
    const uploadResponse = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      audioBuffer,
      {
        headers: {
          'authorization': ASSEMBLYAI_API_KEY,
          'transfer-encoding': 'chunked',
          'content-type': 'application/octet-stream'
        },
        maxContentLength: MAX_AUDIO_SIZE,
        maxBodyLength: MAX_AUDIO_SIZE
      }
    );

    if (!uploadResponse.data?.upload_url) {
      throw new Error("Failed to upload audio to AssemblyAI");
    }

    // 2. Start transcription with AUTO language detection
    const transcribeResponse = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: uploadResponse.data.upload_url,
        language_detection: true, // Critical for auto-detection
        language_code: null, // Let AssemblyAI decide
        punctuate: true,
        format_text: true,
        speech_threshold: 0.5, // Works better for tonal languages
        word_boost: ["নমস্কার", "hello", "नमस्ते"], // Boost common greetings
        dual_channel: true // Better for mixed-language audio
      },
      {
        headers: {
          'authorization': ASSEMBLYAI_API_KEY,
          'content-type': 'application/json'
        },
        timeout: 15000 // Increased timeout for language analysis
      }
    );

    const transcriptId = transcribeResponse.data?.id;
    if (!transcriptId) throw new Error("Failed to start transcription");

    // 3. Poll for results with language detection
    const startTime = Date.now();
    const timeoutMs = 300000;
    let transcript;

    while (true) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error("Transcription timeout exceeded");
      }

      const pollResponse = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { 'authorization': ASSEMBLYAI_API_KEY } }
      );

      transcript = pollResponse.data;
      
      if (transcript.status === 'completed') break;
      if (transcript.status === 'error') {
        throw new Error(transcript.error || "Transcription failed");
      }
      
      await sleep(2500); // Slightly longer polling for language detection
    }

    // 4. Return response with detected language info
    return new Response(
      JSON.stringify({
        text: transcript.text || "Could not understand audio.",
        language: transcript.language_code || 'auto',
        confidence: transcript.language_detection?.confidence || null,
        words: transcript.words
      }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error('Transcription error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Failed to process audio',
        details: error.message,
        suggested_language: 'bn', // Fallback suggestion
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
      { status: 500, headers }
    );
  }
}