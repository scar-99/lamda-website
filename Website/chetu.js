document.addEventListener('DOMContentLoaded', () => {
    const chatbotHTML = `
        <div id="chat-widget-container">
            <div id="chat-window">
                <div id="chat-header">Chetu</div>
                <div id="chat-messages"></div>
                <div id="input-area-container">
                    <input type="text" id="chat-input" placeholder="Ask something..." />
                    <div id="recording-ui" style="display: none;">
                        <span id="record-timer">0:00</span>
                        <span id="slide-to-cancel-text">ᐊ Slide to cancel</span>
                    </div>
                    <div id="locked-ui" style="display: none;">
                        <button id="locked-trash-btn" aria-label="Delete Recording">🗑️</button>
                        <span id="locked-timer">0:00</span>
                        <button id="locked-send-btn" class="chat-btn" aria-label="Send Voice Message">➤</button>
                    </div>
                    <button id="send-btn" class="chat-btn" style="display: none;" aria-label="Send Message">➤</button>
                    <button id="record-btn" class="chat-btn" aria-label="Start Voice Recording">🎤</button>
                </div>
            </div>
            <button id="chat-toggle-btn"><img src="/logo.gif" alt="Chat Logo" /></button>
        </div>
    `;
    document.getElementById('chatbot-container').innerHTML = chatbotHTML;

    const chatContainer = document.getElementById('chatbot-container');
    const chatWindow = document.getElementById('chat-window');
    const toggleButton = document.getElementById('chat-toggle-btn');
    const messagesContainer = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const recordBtn = document.getElementById('record-btn');
    const inputArea = document.getElementById('input-area-container');
    const recordingUi = document.getElementById('recording-ui');
    const lockedUi = document.getElementById('locked-ui');
    const recordTimer = document.getElementById('record-timer');
    const lockedTimer = document.getElementById('locked-timer');
    const lockedSendBtn = document.getElementById('locked-send-btn');
    const lockedTrashBtn = document.getElementById('locked-trash-btn');

    let chatHistory = [];
    let isFirstOpen = true;
    let mediaRecorder, audioChunks = [], isRecording = false, isLocked = false;
    let timerInterval, seconds = 0;
    let startX = 0, startY = 0;
    let lastEndX = null; // used to tell finalizeRecording whether to send or discard

    const addMessage = (text, sender, addToHistory = true) => {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${sender}-message`;
        messageElement.textContent = text;
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        if (addToHistory && sender !== 'bot-typing') {
            const role = sender === 'user' ? 'user' : 'model';
            chatHistory.push({ role, parts: [{ text }] });
        }
        return messageElement;
    };

    const addVoiceMessage = (audioBlob) => {
        const messageElement = document.createElement('div');
        messageElement.className = 'message user-message voice-message-bubble';

        const playBtn = document.createElement('button');
        playBtn.className = 'voice-play-btn';
        playBtn.innerHTML = '▶';

        const waveformDiv = document.createElement('div');
        waveformDiv.className = 'voice-waveform';

        const durationSpan = document.createElement('span');
        durationSpan.className = 'voice-duration';

        messageElement.append(playBtn, waveformDiv, durationSpan);
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        const audioUrl = URL.createObjectURL(audioBlob);
        const wavesurfer = WaveSurfer.create({
            container: waveformDiv,
            waveColor: '#aaa',
            progressColor: 'var(--primary-color)',
            height: 30,
            cursorWidth: 0,
            barWidth: 2,
            barRadius: 3,
        });

        wavesurfer.load(audioUrl);

        wavesurfer.on('ready', () => {
            durationSpan.textContent = `${Math.round(wavesurfer.getDuration())}s`;
        });

        playBtn.onclick = () => {
            wavesurfer.playPause();
            playBtn.innerHTML = wavesurfer.isPlaying() ? '⏸' : '▶';
        };

        wavesurfer.on('finish', () => {
            playBtn.innerHTML = '▶';
        });
    };

    const sendMessage = async () => {
        const userMessage = chatInput.value.trim();
        if (!userMessage) return;

        addMessage(userMessage, 'user');
        const currentMessage = chatInput.value;
        chatInput.value = '';
        chatInput.dispatchEvent(new Event('input'));

        const typingIndicator = addMessage('...', 'bot-typing', false);

        try {
            const response = await fetch('/api/handle-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: currentMessage, history: chatHistory }),
            });
            const data = await response.json();

            typingIndicator.remove();
            if (!response.ok) {
                addMessage(data.reply || 'Sorry, an error occurred.', 'bot', false);
                return;
            }
            addMessage(data.reply, 'bot');
        } catch (error) {
            typingIndicator.remove();
            addMessage('Sorry, something went wrong connecting to the server.', 'bot', false);
            console.error('Error fetching bot response:', error);
        }
    };

    // sendAudioToServer: will receive the final merged blob
    const sendAudioToServer = async (audioBlob) => {
        // Show the voice message in UI (same blob used for playback)
        addVoiceMessage(audioBlob);

        const typingIndicator = addMessage('...', 'bot-typing', false);

        try {
            // Log the blob size in browser console BEFORE upload
            console.log("Uploading audio blob size (bytes):", audioBlob.size);

            // Use FormData (your backend should accept this). If your backend expects base64, replace FormData section below.
            const formData = new FormData();
            formData.append('audio', audioBlob, 'voice-message.webm');

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Transcription failed');
            const data = await response.json();

            typingIndicator.remove();
            chatInput.value = data.text || '';
            await sendMessage();
        } catch (error) {
            console.error("Error sending audio:", error);
            typingIndicator.remove();
            addMessage("Sorry, I couldn't understand your voice note.", 'bot', false);
        }
    };

    // Finalize: merge chunks, decide whether to send or discard, then cleanup
    const finalizeRecording = async (endX) => {
        try {
            // Merge chunks into single blob
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });

            console.log("Final Blob size (bytes):", audioBlob.size);

            // Basic protect: if file is too small, don't send
            if (audioBlob.size < 1000) {
                console.warn("Blob too small — not sending to backend.");
            } else {
                // Decide if we should send based on endX (slide-to-cancel logic)
                if (endX === Infinity || endX >= (startX - 50)) {
                    await sendAudioToServer(audioBlob);
                } else {
                    console.log("Recording cancelled by slide.");
                }
            }
        } catch (err) {
            console.error("Error finalizing recording:", err);
        } finally {
            // cleanup
            audioChunks = [];
            lastEndX = null;
        }
    };

    const startRecording = async (e) => {
        e.preventDefault();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            isRecording = true;

            startX = (e && (e.clientX || (e.touches && e.touches[0]?.clientX))) || 0;
            startY = (e && (e.clientY || (e.touches && e.touches[0]?.clientY))) || 0;

            inputArea.classList.add('is-recording');
            chatInput.style.display = 'none';
            recordingUi.style.display = 'flex';

            // initialize recorder
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
            audioChunks = [];

            mediaRecorder.addEventListener("dataavailable", event => {
                if (event.data && event.data.size > 0) audioChunks.push(event.data);
            });

            // Set onstop once - it will call finalizeRecording with the lastEndX value
            mediaRecorder.onstop = () => {
                // finalizeRecording uses lastEndX (set by stop handlers)
                finalizeRecording(lastEndX);
            };

            mediaRecorder.start();

            seconds = 0;
            recordTimer.textContent = '0:00';
            lockedTimer.textContent = '0:00';
            timerInterval = setInterval(() => {
                seconds++;
                const formatTime = s => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;
                recordTimer.textContent = formatTime(seconds);
                lockedTimer.textContent = formatTime(seconds);
            }, 1000);
        } catch (err) {
            console.error("Mic access denied:", err);
            addMessage("Microphone access was denied. Please check your browser permissions.", "bot", false);
            resetUI();
        }
    };

    const stopRecording = (e) => {
        if (!isRecording || isLocked) return;

        // If recording was very short, just stop and drop
        if (seconds < 1) {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                // mark as cancelled
                lastEndX = -Infinity;
                mediaRecorder.stop();
            }
            audioChunks = [];
            resetUI();
            return;
        }

        // compute endX (where pointer lifted)
        const endX = (e && (e.clientX || (e.changedTouches && e.changedTouches[0]?.clientX))) || startX;
        lastEndX = endX;

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop(); // this triggers mediaRecorder.onstop -> finalizeRecording(lastEndX)
        }
        resetUI();
    };

    const handleMove = (e) => {
        if (!isRecording || isLocked) return;
        const currentY = e.clientY || (e.touches && e.touches[0]?.clientY) || startY;
        if (startY - currentY > 60) {
            isLocked = true;
            inputArea.classList.remove('is-recording');
            inputArea.classList.add('is-locked');
            recordingUi.style.display = 'none';
            lockedUi.style.display = 'flex';
        }
    };

    const resetUI = () => {
        isRecording = false;
        isLocked = false;
        clearInterval(timerInterval);
        inputArea.classList.remove('is-recording', 'is-locked');
        chatInput.style.display = 'block';
        recordingUi.style.display = 'none';
        lockedUi.style.display = 'none';
        chatInput.value = '';
        chatInput.dispatchEvent(new Event('input'));
    };

    // Locked-send: force send regardless of endX
    lockedSendBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            lastEndX = Infinity; // signal finalizeRecording to always send
            mediaRecorder.stop();
            // finalizeRecording will be called by mediaRecorder.onstop
        } else {
            resetUI();
        }
    });

    // Locked-trash: discard recording
    lockedTrashBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            lastEndX = -Infinity; // signal cancel
            mediaRecorder.stop();
        } else {
            resetUI();
        }
    });

    chatInput.addEventListener('input', () => {
        if (chatInput.value.trim() !== '') {
            sendBtn.style.display = 'flex';
            recordBtn.style.display = 'none';
        } else {
            sendBtn.style.display = 'none';
            recordBtn.style.display = 'flex';
        }
    });

    toggleButton.addEventListener('click', () => {
        chatWindow.classList.toggle('visible');
        if (isFirstOpen && chatWindow.classList.contains('visible')) {
            addMessage('Welcome to Lamda Labs! How can I assist you today?', 'bot');
            isFirstOpen = false;
        }
    });

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });

    recordBtn.addEventListener('mousedown', startRecording);
    recordBtn.addEventListener('touchstart', startRecording, { passive: false });
    window.addEventListener('mouseup', stopRecording);
    window.addEventListener('touchend', stopRecording);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove, { passive: false });

    setTimeout(() => {
        chatContainer.classList.add('visible');
    }, 4500);
});
