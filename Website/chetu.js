document.addEventListener('DOMContentLoaded', () => {
    const chatbotHTML = `
        <div id="chat-widget-container">
            <div id="chat-window">
                <div id="chat-header">Lamda Support</div>
                <div id="chat-messages"></div>
                <div id="input-area-container">
                    <input type="text" id="chat-input" placeholder="Ask something..." />
                    <button id="send-btn" class="chat-btn" aria-label="Send Message" style="display: none;">➤</button>
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

    let isFirstOpen = true;

    // FAQ Data
    const faqs = [
        {
            question: "What services do you offer?",
            keywords: ["services", "offer", "do you do", "what do you do", "web", "app", "develop", "create"],
            answer: "We offer a wide range of professional tech solutions including full-stack web development, mobile applications, and custom AI integrations.",
        },
        {
            question: "Pricing information",
            keywords: ["price", "pricing", "cost", "how much", "charges", "fee", "budget"],
            answer: "Our pricing is flexible and depends on the project scope and requirements. Please contact our sales team for a custom and competitive quote.",
        },
        {
            question: "How can I contact support?",
            keywords: ["contact", "support", "help", "reach", "email", "phone", "number"],
            answer: "You can reach our dedicated support team 24/7 via email at support@lamdalabs.com or call us at +1-800-555-0199.",
        },
        {
            question: "Where are you located?",
            keywords: ["location", "located", "address", "where", "office", "headquarters", "based"],
            answer: "Our main headquarters are in San Francisco, CA, but we are a globally distributed team ready to help you anywhere.",
        }
    ];

    // Core functions
    const addMessage = (text, sender) => {
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
            messageElement.innerHTML = text;
        }
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return messageElement;
    };

    const addOptions = (optionsTextArray) => {
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'faq-options-container';
        
        optionsTextArray.forEach(optText => {
            const btn = document.createElement('button');
            btn.className = 'faq-option-btn';
            btn.textContent = optText;
            btn.onclick = () => {
                // Disable options after clicking one to prevent spam
                const allBtns = optionsContainer.querySelectorAll('.faq-option-btn');
                allBtns.forEach(b => {
                    b.disabled = true;
                    b.style.opacity = '0.5';
                    b.style.cursor = 'default';
                });
                handleUserMessage(optText);
            };
            optionsContainer.appendChild(btn);
        });

        messagesContainer.appendChild(optionsContainer);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    const handleBotResponse = (userText) => {
        const lowerText = userText.toLowerCase();
        
        let bestMatch = null;
        for (const faq of faqs) {
            if (faq.question.toLowerCase() === lowerText) {
                bestMatch = faq;
                break;
            }
            for (const keyword of faq.keywords) {
                if (lowerText.includes(keyword)) {
                    bestMatch = faq;
                    break;
                }
            }
            if (bestMatch) break;
        }

        setTimeout(() => {
            const typingIndicator = document.querySelector('.bot-typing-message');
            if (typingIndicator) typingIndicator.remove();

            if (bestMatch) {
                addMessage(bestMatch.answer, 'bot');
                
                const otherOptions = faqs
                    .filter(f => f.question !== bestMatch.question)
                    .map(f => f.question)
                    .slice(0, 3);
                
                if (otherOptions.length > 0) {
                    setTimeout(() => addOptions(otherOptions), 500);
                }
            } else {
                addMessage("I'm sorry, I don't quite understand that. Please choose from one of the options below or rephrase your question.", 'bot');
                setTimeout(() => {
                    const options = faqs.map(f => f.question);
                    addOptions(options);
                }, 500);
            }
        }, 800);
    };

    const handleUserMessage = (text) => {
        addMessage(text, 'user');
        addMessage('', 'bot-typing');
        handleBotResponse(text);
    };

    const sendMessage = () => {
        const userMessage = chatInput.value.trim();
        if (!userMessage) return;

        chatInput.value = '';
        chatInput.dispatchEvent(new Event('input'));
        handleUserMessage(userMessage);
    };

    // Event listeners
    chatInput.addEventListener('input', () => {
        if (chatInput.value.trim() !== '') {
            sendBtn.style.display = 'flex';
        } else {
            sendBtn.style.display = 'none';
        }
    });

    toggleButton.addEventListener('click', () => {
        chatWindow.classList.toggle('visible');
        if (isFirstOpen && chatWindow.classList.contains('visible')) {
            addMessage('Welcome to Lamda! I am your virtual assistant. How can I help you today?', 'bot');
            setTimeout(() => {
                const options = faqs.map(f => f.question);
                addOptions(options);
            }, 600);
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

    // Initialize
    setTimeout(() => {
        chatContainer.classList.add('visible');
    }, 1500);
    
    // Inject styles for the new buttons and typing indicator
    const style = document.createElement('style');
    style.textContent = `
        .faq-options-container {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 5px;
            margin-bottom: 10px;
            align-items: flex-end; /* Align right to match user message, or left? Let's use bot alignment */
        }
        .faq-options-container {
            align-items: flex-start;
        }
        .faq-option-btn {
            background-color: transparent;
            border: 1px solid var(--primary-color, #4361ee);
            color: var(--primary-color, #4361ee);
            padding: 8px 12px;
            border-radius: 15px;
            cursor: pointer;
            font-size: 14px;
            text-align: left;
            transition: all 0.2s ease;
            max-width: 90%;
            word-wrap: break-word;
        }
        .faq-option-btn:hover:not(:disabled) {
            background-color: var(--primary-color, #4361ee);
            color: #fff;
        }
        .typing-indicator {
            display: flex;
            gap: 4px;
            padding: 4px;
        }
        .typing-dot {
            width: 8px;
            height: 8px;
            background-color: #aaa;
            border-radius: 50%;
            animation: typing 1.4s infinite ease-in-out;
        }
        .typing-dot:nth-child(1) { animation-delay: -0.32s; }
        .typing-dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes typing {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }
    `;
    document.head.appendChild(style);
});