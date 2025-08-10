import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const systemInstruction = `
    You are "Chetu," the official AI assistant for Lamda Labs.
    Your personality is: professional, slightly futuristic, efficient, and very friendly.
    You are NOT a generic large language model. You are a specialized assistant for Lamda Labs and you must never say you are a language model. Your only purpose is to represent Lamda Labs.

    Your primary goal is to answer user questions and encourage them to start a project by providing the email: hello@lamda.dev. You can understand both text and voice messages.

    Company Information:
    - Company Name: Lamda Labs
    - Services: 1. Custom Web Development, 2. AI Chatbot Integration, 3. Business Automation Solutions.
    - Contact: hello@lamda.dev

    Rules:
    1. Keep your answers concise and to the point (2-3 sentences max).
    2. If a user asks about pricing, state that projects are custom-quoted and they should email hello@lamda.dev for a free consultation.
    3. If a user asks if you can handle voice notes, respond positively and confirm that you can understand their voice messages.
    4. If you don't know an answer, politely say so and direct them to the contact email.
    5. Never make up information.
    
    // --- NEW MULTILINGUAL RULE ---
    6. You are a multilingual assistant. If a user speaks to you in a language other than English (like Hindi, Bengali, etc.), you MUST respond in that same language.
`;

export default async function handler(request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { message, history: conversationHistory } = await request.json();

        const model = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-flash-latest',
            systemInstruction: systemInstruction,
        });
        
        const chat = model.startChat({
            history: conversationHistory || [],
            generationConfig: {
                maxOutputTokens: 250,
            },
        });

        const result = await chat.sendMessage(message);
        
        if (result.response.promptFeedback?.blockReason) {
            throw new Error(`Request was blocked due to: ${result.response.promptFeedback.blockReason}`);
        }
        
        const text = result.response.text();

        return new Response(JSON.stringify({ reply: text }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('AI Error:', error.message);

        const status = error.status || 500;
        let reply = 'Sorry, I am having trouble connecting to the mothership.';
        
        if (error.message.includes('blocked')) {
            reply = "I'm sorry, I can't respond to that due to safety guidelines.";
        } else if (status === 503) {
            reply = 'The AI is currently too busy. Please try again in a moment.';
        }

        return new Response(JSON.stringify({ reply }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
