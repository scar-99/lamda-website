let mediaRecorder;
let audioChunks = [];

async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];

    mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();

        console.log("Recorded audio size (bytes):", arrayBuffer.byteLength);

        // Prevent sending tiny audio files
        if (arrayBuffer.byteLength < 1000) {
            console.error("Audio too short — not sending to backend");
            return;
        }

        const base64Audio = btoa(
            String.fromCharCode(...new Uint8Array(arrayBuffer))
        );

        try {
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio: `data:audio/webm;base64,${base64Audio}` })
            });

            const data = await response.json();
            console.log("Transcription result:", data);
        } catch (error) {
            console.error("Error sending audio:", error);
        }
    };

    mediaRecorder.start();
    console.log("Recording started...");

    // Automatically stop after at least 1 second
    setTimeout(() => {
        mediaRecorder.stop();
        console.log("Recording stopped");
    }, 1500);
}

// Example: start recording when button clicked
document.getElementById("record-btn").addEventListener("click", startRecording);
