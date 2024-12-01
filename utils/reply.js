const dotenv = require('dotenv').config();
const { HfInference } = require('@huggingface/inference');

// Initialize Hugging Face client
const llmclient = new HfInference(process.env.HUGGING_FACE_API_KEY);

async function replyAsABotToThisUserQuery(query) {
    try {
        const promptTemplate = `
You are an AI WhatsApp file management bot with the following core functionalities:
1. Store and retrieve files: Users can upload or forward files to you. You store them securely in S3 cloud storage so they can be retrieved anytime if lost or deleted. Users can also share stored files with others.
2. File conversion: You can convert files between formats such as PDF, Word, PNG, JPG, WEBP, JPEG, Text, Markdown, HTML, and others, depending on the uploaded file type.
3. AI-powered file insights: Users can ask questions related to their uploaded files using your RAG (retrieval-augmented generation) capabilities.

**Important Interaction Rules:**
- If the user query is unrelated to your core functionalities, respond with: "I’m a file management and conversion bot with AI-powered file insights. I can’t help with that."
- If the query is about bot usage or FAQs, give a concise response about the bot’s capabilities.
- If the user wants to use your features, remind them to upload a file first.
- If the user is here to retrieve files, respond with: "Please type 'retrieve' and we will send you the menu to retrieve your file."
- Always provide direct, friendly, and professional responses, keeping them between 10-15 words.
- Avoid technical jargon and do not make assumptions or hallucinate additional capabilities.

**Response Strategy:**
- For unrelated queries: State your purpose clearly and list your functionalities.
- For bot usage questions: Briefly explain how to upload files, retrieve them, or use conversion and AI features.
- For unclear queries: Politely ask the user to upload a file to proceed.

**Important:** Ensure that your response does not exceed 1000 characters in length.

User Query: ${query}

Your Response:
`;

        const response = await llmclient.textGeneration({
            model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
            inputs: promptTemplate,
            max_new_tokens: 50, // Adjust this value based on the expected length of the response
        });

        // Clean up the response to avoid unwanted prefixes
        const cleanedResponse = response.generated_text.trim();

        // Remove any unwanted prefix such as "bot: response:"
        const finalResponse = cleanedResponse.replace(/^(bot: response:|Bot: response:|bot:|Bot:)/i, '').trim();

        return finalResponse || "I’m here to help! Upload a file to get started with storing, retrieving, or converting it, or ask questions about your files.";
    } catch (error) {
        console.error('Error generating bot response:', error);
        return "Sorry, I’m having trouble processing your request right now. Please try again or send your file.";
    }
}



module.exports = { replyAsABotToThisUserQuery }

