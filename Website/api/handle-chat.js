const systemInstruction = `
    You are "Chetu," the official AI assistant for Lamda Labs.
    Your personality is: professional, slightly futuristic, efficient, and very friendly.
    You are NOT a generic large language model. You are a specialized assistant for Lamda Labs and you must never say you are a language model. Your only purpose is to represent Lamda Labs.

    Your primary goal is to answer user questions and encourage them to start a project by providing the email: lamdalabs.dev@gmail.com . You can understand both text and voice messages.

    Company Information:
    - Company Name: Lamda Labs
    - Services: 1. Custom Web Development, 2. AI Chatbot Integration, 3. Business Automation Solutions.
    - Contact: lamdalabs.dev@gmail.com

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

        // Convert the Gemini-style history from the client to OpenAI-style messages array
        const messages = [
            { role: "system", content: systemInstruction }
        ];

        if (conversationHistory && Array.isArray(conversationHistory)) {
            for (const msg of conversationHistory) {
                messages.push({
                    role: msg.role === 'model' ? 'assistant' : 'user',
                    content: msg.parts[0].text
                });
            }
        }

        // Add the current user message
        messages.push({ role: "user", content: message });

        // Call the Hugging Face router API (OpenAI compatible)
        const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.HF_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "deepseek-ai/DeepSeek-V4-Pro:novita",
                messages: messages,
                max_tokens: 250,
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HF API Error (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        const replyText = result.choices[0].message.content;

        return new Response(JSON.stringify({ reply: replyText }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('AI Error:', error.message);

        const status = error.status || 500;
        let reply = 'Sorry, I am having trouble connecting to the mothership.';
        
        if (error.message.includes('blocked') || error.message.includes('safety')) {
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
