import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google AI client with the API key from environment variables.
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// System instruction to define the chatbot's personality, rules, and knowledge base.
// This ensures the bot stays on-brand and provides consistent answers.
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
 * Vercel Serverless Function to handle chat requests.
 * It receives a message and conversation history, gets a response from the
 * Google Generative AI, and sends it back.
 * @param {object} request - The incoming request object.
 * @param {object} response - The outgoing response object.
 */
export default async function handler(request, response) {
    // Only allow POST requests to this endpoint.
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Destructure the message and history from the request body.
        const { message, history: conversationHistory } = request.body;

        // Get the generative model with the specified system instruction.
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-pro',
            systemInstruction: systemInstruction,
        });
        
        // Start a new chat session with the provided history.
        const chat = model.startChat({
            history: conversationHistory || [],
            generationConfig: {
                maxOutputTokens: 250, // Limit the length of the AI's response.
            },
        });

        // Send the user's message to the AI model.
        const result = await chat.sendMessage(message);
        const aiResponse = result.response;
        const text = aiResponse.text();

        // Send the AI's text response back to the client.
        return response.status(200).json({ reply: text });

    } catch (error) {
        // Log the full error to the server console for debugging.
        console.error('AI Error:', error);

        // --- EDITED SECTION ---
        // Check if the error is a 503 "Service Unavailable" error.
        // This happens when the Google AI model is temporarily overloaded.
        if (error.status === 503) {
            return response.status(503).json({ 
                reply: 'The AI is currently too busy processing requests. Please try again in a moment.' 
            });
        }
        
        // For all other types of errors, send a generic failure message.
        return response.status(500).json({ 
            reply: 'Sorry, I am having trouble connecting to the mothership. Please try again later.' 
        });
    }
}