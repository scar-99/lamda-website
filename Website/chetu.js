document.addEventListener('DOMContentLoaded', () => {
    const chatbotHTML = `
        <div id="chat-widget-container">
            <div id="chat-window">
                <div id="chat-header">Lamda</div>
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
            <button id="chat-toggle-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="#4361ee">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </button>
        </div>
    `;
    document.getElementById('chatbot-container').innerHTML = chatbotHTML;

    // Element references
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

    // State variables
    let chatHistory = [];
    let isFirstOpen = true;
    let mediaRecorder, audioChunks = [], isRecording = false, isLocked = false, isCancelled = false;
    let timerInterval, seconds = 0;
    let startX = 0, startY = 0;

    // Core functions
    const addMessage = (text, sender, addToHistory = true) => {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${sender}-message`;
        
        if (sender === 'bot-typing') {
            messageElement.classList.add('bot-typing-message');
            messageElement.innerHTML = `
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            `;
        } else {
            messageElement.textContent = text;
        }
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        if (addToHistory && sender !== 'bot-typing') {
            const role = sender === 'user' ? 'user' : 'model';
            chatHistory.push({ role, parts: [{ text }] });
        }
        return messageElement;
    };

    const sendMessage = async () => {
        const userMessage = chatInput.value.trim();
        if (!userMessage) return;

        addMessage(userMessage, 'user');
        const currentMessage = chatInput.value;
        chatInput.value = '';
        chatInput.dispatchEvent(new Event('input'));

        const typingIndicator = addMessage('', 'bot-typing', false);

        try {
            const response = await fetch('/api/handle-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: currentMessage, history: chatHistory }),
            });
            
            if (!response.ok) {
                const errorData = await response.text();
                try {
                    const jsonError = JSON.parse(errorData);
                    console.error('API Error:', jsonError);
                    throw new Error(jsonError.message || 'API request failed');
                } catch {
                    throw new Error(errorData || 'Unknown server error');
                }
            }
            
            const data = await response.json();
            typingIndicator.remove();
            addMessage(data.reply, 'bot');
        } catch (error) {
            typingIndicator.remove();
            console.error('Full error:', error);
            
            if (error.message.includes('Failed to fetch')) {
                addMessage('Network error. Please check your connection.', 'bot');
            } else if (error.message.includes('API request failed')) {
                addMessage('Server is experiencing issues. Please try later.', 'bot');
            } else {
                addMessage(`Server error: ${error.message}`, 'bot');
            }
        }
    };

    // Voice recording functions
    const startRecording = async (e) => {
        e.preventDefault();
        isCancelled = false;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            isRecording = true;
            audioChunks = [];
            
            startX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
            startY = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;

            inputArea.classList.add('is-recording');
            chatInput.style.display = 'none';
            recordingUi.style.display = 'flex';

            // Check for supported MIME types
            const mimeTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
                ''
            ];
            const supportedMimeType = mimeTypes.find(type => 
                MediaRecorder.isTypeSupported(type)
            ) || '';

            mediaRecorder = new MediaRecorder(stream, { 
                mimeType: supportedMimeType,
                audioBitsPerSecond: 128000
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start(200); // Slice into 200ms chunks

            // Timer setup
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
            addMessage("Microphone access was denied. Please check permissions.", "bot", false);
            resetUI();
        }
    };

    const stopRecording = (e) => {
        if (!isRecording || isLocked) return;

        // If recording less than 1 second, discard
        if (seconds < 1) {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            resetUI();
            return;
        }

        // Stop the media recorder
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }

        // Process the recording
        mediaRecorder.onstop = () => {
            const endX = e ? (e.clientX || (e.changedTouches && e.changedTouches[0]?.clientX) || startX) : startX;
            
            // Check if the user didn't slide to cancel
            if (!isCancelled && endX >= startX - 50) {
                const audioBlob = new Blob(audioChunks, { type: audioChunks[0]?.type || 'audio/webm' });
                console.log('Audio blob size:', audioBlob.size);
                if (audioBlob.size > 1000) {
                    sendAudioToServer(audioBlob);
                } else {
                    console.warn('Audio blob too small:', audioBlob.size);
                    addMessage("Recording too short. Please try again.", "bot", false);
                }
            }
            resetUI();
        };
    };

    const handleMove = (e) => {
        if (!isRecording || isLocked) return;
        const currentX = e.clientX || (e.touches && e.touches[0]?.clientX) || startX;
        const currentY = e.clientY || (e.touches && e.touches[0]?.clientY) || startY;

        if (startY - currentY > 60) {
            isLocked = true;
            inputArea.classList.remove('is-recording');
            inputArea.classList.add('is-locked');
            recordingUi.style.display = 'none';
            lockedUi.style.display = 'flex';
        } else if (startX - currentX > 50) {
            isCancelled = true;
            stopRecording();
        }
    };

    const resetUI = () => {
        isRecording = false;
        isLocked = false;
        isCancelled = false;
        clearInterval(timerInterval);
        inputArea.classList.remove('is-recording', 'is-locked');
        chatInput.style.display = 'block';
        recordingUi.style.display = 'none';
        lockedUi.style.display = 'none';
        chatInput.value = '';
        chatInput.dispatchEvent(new Event('input'));
        audioChunks = [];
    };

    // Audio processing
    const sendAudioToServer = async (audioBlob) => {
        addVoiceMessage(audioBlob);
        const typingIndicator = addMessage('', 'bot-typing', false);

        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'voice-message.webm');

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Transcription failed');
            const data = await response.json();

            typingIndicator.remove();
            chatInput.value = data.text;
            await sendMessage();
        } catch (error) {
            console.error("Error sending audio:", error);
            typingIndicator.remove();
            addMessage("Sorry, I couldn't process your voice note.", 'bot', false);
        }
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
            progressColor: '#4361ee',
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

    // Event listeners
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
            addMessage('Welcome to Lamda Labs! How can I assist you today?', 'bot', false);
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
    window.addEventListener('mouseup', (e) => { if (isRecording && !isLocked) stopRecording(e); });
    window.addEventListener('touchend', (e) => { if (isRecording && !isLocked) stopRecording(e); });
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove, { passive: false });

    lockedSendBtn.addEventListener('click', () => {
        isCancelled = false;
        stopRecording();
    });

    lockedTrashBtn.addEventListener('click', () => {
        isCancelled = true;
        stopRecording();
    });

    // Initialize
    setTimeout(() => {
        chatContainer.classList.add('visible');
    }, 1500);
});