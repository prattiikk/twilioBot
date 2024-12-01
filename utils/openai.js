const fs = require('fs');
const pdfParse = require('pdf-parse');
const { HfInference } = require('@huggingface/inference');
const dotenv = require("dotenv")
dotenv.config()


async function performRAGQuery(filePath, query) {
    const huggingfaceToken = process.env.HUGGING_FACE_API_KEY
    // Dynamically import transformers
    const { pipeline } = await import('@xenova/transformers');

    // Initialize Hugging Face Inference
    const hf = new HfInference(huggingfaceToken);

    // Initialize embedding model
    const embeddingPipeline = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
    );

    // Define QA model
    // const qaModel = 'deepset/roberta-base-squad2';
    const qaModel = 'google-bert/bert-large-uncased-whole-word-masking-finetuned-squad'

    // Extract text from PDF file
    const extractTextFromPdf = async (filePath) => {
        const fileBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(fileBuffer);
        return data.text;
    };

    // Split text into smaller chunks
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

    // Generate embeddings for text chunks
    const generateEmbeddings = async (textChunks) => {
        const embeddings = [];
        for (const chunk of textChunks) {
            const embedding = await embeddingPipeline(chunk, {
                pooling: 'mean',
                normalize: true
            });
            embeddings.push({
                chunk,
                embedding: Array.from(embedding)  // Convert to standard array
            });
        }
        return embeddings;
    };

    // Calculate cosine similarity between two vectors
    const cosineSimilarity = (vec1, vec2) => {
        const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
        const normA = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
        const normB = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
        return dotProduct / (normA * normB);
    };

    // Retrieve relevant chunks based on the query
    const retrieveRelevantChunks = async (query, embeddings) => {
        // Generate embedding for the query
        const queryEmbedding = await embeddingPipeline(query, {
            pooling: 'mean',
            normalize: true
        });
        const queryEmbeddingArray = Array.from(queryEmbedding);

        // Score and sort chunks
        const scoredChunks = embeddings.map((e) => ({
            chunk: e.chunk,
            score: cosineSimilarity(queryEmbeddingArray, e.embedding),
        }));

        scoredChunks.sort((a, b) => b.score - a.score);
        return scoredChunks.slice(0, 3).map((chunk) => chunk.chunk);
    };

    try {
        // Extract and process PDF
        const text = await extractTextFromPdf(filePath);
        const textChunks = splitIntoChunks(text);
        const embeddings = await generateEmbeddings(textChunks);

        // Retrieve relevant chunks
        const relevantChunks = await retrieveRelevantChunks(query, embeddings);
        const context = relevantChunks.join("\n\n");

        // Use Hugging Face inference for question answering
        const response = await hf.questionAnswering({
            model: qaModel,
            inputs: {
                question: query,
                context: context
            }
        });

        console.log(response.answer)
        return response.answer;
    } catch (error) {
        console.error("Error during RAG query:", error);
        throw error;
    }
}


module.exports = { performRAGQuery };