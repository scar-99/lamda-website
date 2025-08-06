import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google AI client with the API key from environment variables.
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// System instruction to define the chatbot's personality, rules, and knowledge base.
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
`;

/**
 * Netlify Serverless Function to handle chat requests.
 */
export default async function handler(request) {
    // Only allow POST requests.
    if (request.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        // Parse the incoming request body.
        const { message, history: conversationHistory } = JSON.parse(request.body);

        const model = genAI.getGenerativeModel({ 
            model: 'gemini-pro',
            systemInstruction: systemInstruction,
        });
        
        const chat = model.startChat({
            history: conversationHistory || [],
            generationConfig: {
                maxOutputTokens: 250,
            },
        });

        const result = await chat.sendMessage(message);
        const aiResponse = result.response;
        const text = aiResponse.text();

        // --- CORRECTED RESPONSE FORMAT FOR NETLIFY ---
        return {
            statusCode: 200,
            body: JSON.stringify({ reply: text })
        };

    } catch (error) {
        console.error('AI Error:', error);

        // --- CORRECTED ERROR RESPONSE FORMAT FOR NETLIFY ---
        if (error.status === 503) {
            return {
                statusCode: 503,
                body: JSON.stringify({ reply: 'The AI is currently too busy processing requests. Please try again in a moment.' })
            };
        }
        
        return {
            statusCode: 500,
            body: JSON.stringify({ reply: 'Sorry, I am having trouble connecting to the mothership. Please try again later.' })
        };
    }
}
