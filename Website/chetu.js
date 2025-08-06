document.addEventListener('DOMContentLoaded', () => {
    // This HTML is injected into the #chatbot-container div in your main HTML file.
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

    // --- Element References ---
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

    // --- State Variables ---
    let chatHistory = [];
    let isFirstOpen = true;
    let mediaRecorder, audioChunks = [], isRecording = false, isLocked = false;
    let timerInterval, seconds = 0;
    let startX, startY;

    // --- Core Chat Functions ---
    const addMessage = (text, sender, addToHistory = true) => {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${sender}-message`;
        messageElement.textContent = text;
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        if (addToHistory && sender !== 'bot-typing') {
            const role = (sender === 'user') ? 'user' : 'model';
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
            container: waveformDiv, waveColor: '#aaa', progressColor: 'var(--primary-color)',
            height: 30, cursorWidth: 0, barWidth: 2, barRadius: 3,
        });
        wavesurfer.load(audioUrl);
        wavesurfer.on('ready', () => { durationSpan.textContent = `${Math.round(wavesurfer.getDuration())}s`; });
        playBtn.onclick = () => { wavesurfer.playPause(); playBtn.innerHTML = wavesurfer.isPlaying() ? '⏸' : '▶'; };
        wavesurfer.on('finish', () => { playBtn.innerHTML = '▶'; });
    };

    const sendMessage = async () => {
        const userMessage = chatInput.value.trim();
        if (userMessage === '') return;
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
    
    const sendAudioToServer = async (audioBlob) => {
        addVoiceMessage(audioBlob);
        const typingIndicator = addMessage('...', 'bot-typing', false);
        try {
            // --- CORRECTED CODE: Send raw audio blob directly ---
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'audio/webm' }, // Specify the content type
                body: audioBlob // Send the raw blob data
            });

            if (!response.ok) throw new Error('Transcription failed');
            const data = await response.json();
            
            chatInput.value = data.text;
            typingIndicator.remove();
            await sendMessage(); 
        } catch (error) {
            console.error("Error sending audio:", error);
            typingIndicator.remove();
            addMessage("Sorry, I couldn't understand your voice note.", 'bot', false);
        }
    };

    // --- Voice Recording Logic ---
    const startRecording = async (e) => {
        e.preventDefault();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            isRecording = true;
            startX = e.clientX || e.touches[0].clientX;
            startY = e.clientY || e.touches[0].clientY;
            inputArea.classList.add('is-recording');
            chatInput.style.display = 'none';
            recordingUi.style.display = 'flex';
            
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();
            audioChunks = [];
            mediaRecorder.addEventListener("dataavailable", event => audioChunks.push(event.data));
            
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
            addMessage("Microphone access was denied. Please check your browser permissions.", "bot-typing", false);
            resetUI();
        }
    };

    const stopRecording = (e) => {
        if (!isRecording || isLocked) return;
        
        if (seconds < 1) {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            audioChunks = [];
            resetUI();
            return;
        }

        const endX = e.clientX || (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : startX);
        
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.onstop = () => {
                if (endX >= startX - 50) {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    if (audioBlob.size > 100) { 
                        sendAudioToServer(audioBlob); 
                    }
                }
                audioChunks = [];
            };
            mediaRecorder.stop();
        }
        resetUI();
    };
    
    const handleMove = (e) => {
        if (!isRecording || isLocked) return;
        const currentY = e.clientY || e.touches[0].clientY;
        if (startY - currentY > 60) {
            isLocked = true;
            inputArea.classList.remove('is-recording');
            inputArea.classList.add('is-locked');
            recordingUi.style.display = 'none';
            lockedUi.style.display = 'flex';
        }
    };
    
    const resetUI = () => {
        isRecording = false; isLocked = false;
        clearInterval(timerInterval);
        inputArea.classList.remove('is-recording', 'is-locked');
        chatInput.style.display = 'block';
        recordingUi.style.display = 'none';
        lockedUi.style.display = 'none';
        chatInput.value = '';
        chatInput.dispatchEvent(new Event('input'));
    };

    lockedSendBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                if (audioBlob.size > 100) { 
                    sendAudioToServer(audioBlob); 
                }
                audioChunks = [];
                resetUI();
            };
            mediaRecorder.stop();
        } else {
            resetUI();
        }
    });

    lockedTrashBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.onstop = () => {
                audioChunks = [];
                resetUI();
            };
            mediaRecorder.stop();
        } else {
            resetUI();
        }
    });

    // --- Event Listeners ---
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
    
    // --- Show Chatbot After Intro ---
    setTimeout(() => {
        chatContainer.classList.add('visible');
    }, 4500);
});
