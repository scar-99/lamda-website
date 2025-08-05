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

    // --- Core Functions ---
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
        if (e.key === 'Enter') sendMessage();
    });

    // --- Show Chatbot After Intro Animation ---
    // This assumes your main script has a timeline named `introTl`
    // If not, you can replace this with a simple setTimeout.
    const introTimeline = window.introTl; // Accessing global timeline from main script
    if (introTimeline) {
        introTimeline.eventCallback("onComplete", () => {
             setTimeout(() => {
                chatContainer.classList.add('visible');
            }, 500);
        });
    } else {
        setTimeout(() => {
            chatContainer.classList.add('visible');
        }, 4000); // Fallback if timeline isn't found
    }
});
