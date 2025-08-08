let mediaRecorder;
let audioChunks = [];
let audioBlob;

async function startRecording() {
    audioChunks = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = async () => {
        // Merge all chunks into one blob
        audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        console.log("Final Blob size before upload:", audioBlob.size, "bytes");

        // Create local playback URL for chat UI
        const audioUrl = URL.createObjectURL(audioBlob);
        addAudioMessageToChat(audioUrl); // your existing function to show the message

        // Convert to Base64 and send to backend
        const base64Audio = await blobToBase64(audioBlob);
        console.log("Base64 length before sending:", base64Audio.length);

        sendAudioToBackend(base64Audio);
    };

    mediaRecorder.start();
    console.log("Recording started...");
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        console.log("Recording stopped.");
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function sendAudioToBackend(base64Audio) {
    try {
        const res = await fetch("/your-backend-endpoint", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64Audio })
        });
        const data = await res.json();
        console.log("Backend response:", data);
        handleBackendResponse(data); // your existing chat handling
    } catch (err) {
        console.error("Error sending audio:", err);
    }
}
