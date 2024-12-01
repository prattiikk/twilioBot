const fs = require('fs');
const pdfParse = require('pdf-parse');
const { HfInference } = require('@huggingface/inference');
const dotenv = require("dotenv")
dotenv.config()

async function performRAGQuery(filePath, query) {
    const huggingfaceToken = process.env.HUGGING_FACE_API_KEY
    const { pipeline } = await import('@xenova/transformers');

    const hf = new HfInference(huggingfaceToken);

    const embeddingPipeline = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
    );

    const textGenerationModel = process.env.MODEL_NAME || 'facebook/opt-350m';

    const extractTextFromPdf = async (filePath) => {
        const fileBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(fileBuffer);
        return data.text;
    };

    const splitIntoChunks = (content, maxChunkSize = 800) => {
        const sentences = content.split('. ');
        const chunks = [];
        let currentChunk = "";

        for (const sentence of sentences) {
            if ((currentChunk + sentence).length > maxChunkSize) {
                chunks.push(currentChunk.trim());
                currentChunk = "";
            }
            currentChunk += sentence + ". ";
        }

        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    };

    const generateEmbeddings = async (textChunks) => {
        const embeddings = [];
        for (const chunk of textChunks) {
            const embedding = await embeddingPipeline(chunk, {
                pooling: 'mean',
                normalize: true
            });
            embeddings.push({
                chunk,
                embedding: Array.from(embedding)
            });
        }
        return embeddings;
    };

    const cosineSimilarity = (vec1, vec2) => {
        const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
        const normA = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
        const normB = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
        return dotProduct / (normA * normB);
    };

    const retrieveRelevantChunks = async (query, embeddings) => {
        const queryEmbedding = await embeddingPipeline(query, {
            pooling: 'mean',
            normalize: true
        });
        const queryEmbeddingArray = Array.from(queryEmbedding);

        const scoredChunks = embeddings.map((e) => ({
            chunk: e.chunk,
            score: cosineSimilarity(queryEmbeddingArray, e.embedding),
        }));

        scoredChunks.sort((a, b) => b.score - a.score);
        return scoredChunks.slice(0, 3).map((chunk) => chunk.chunk);
    };

    // Extract only the final concise answer
    const processResponse = (response) => {
        // Extract the last sentence, which should be the concise answer
        const match = response.match(/"([^"]+)"$/);

        if (match && match[1]) {
            // Truncate to 1600 characters if needed
            const truncatedResponse = match[1].length > 1600
                ? match[1].substring(0, 1597) + '...'
                : match[1];

            return truncatedResponse;
        }

        // Fallback if no quote is found
        return response.trim().split('.').pop().trim();
    };

    try {
        const text = await extractTextFromPdf(filePath);
        const textChunks = splitIntoChunks(text);
        const embeddings = await generateEmbeddings(textChunks);

        const relevantChunks = await retrieveRelevantChunks(query, embeddings);
        const context = relevantChunks.join("\n\n");

        const response = await hf.textGeneration({
            model: textGenerationModel,
            inputs: `Context: ${context}\n\nQuery: ${query}\n\nGive a direct, concise answer in one sentence:`,
            parameters: {
                max_new_tokens: 50,
                temperature: 0.3,
                top_p: 0.7
            }
        });



        const finalResponse = processResponse(response.generated_text);
        console.log("response ------------------> ", finalResponse)
        return finalResponse;
    } catch (error) {
        console.error("Error during RAG query:", error);
        throw error;
    }
}

module.exports = { performRAGQuery };