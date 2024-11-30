const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const axios = require('axios');
const twilio = require('twilio');
const { HfInference } = require('@huggingface/inference');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and URL-encoded requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Load Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// Validate Twilio credentials
if (!accountSid || !authToken) {
  console.error('Missing Twilio credentials. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
  process.exit(1);
}

// Initialize Twilio client
const client = twilio(accountSid, authToken);

// In-memory store to track file uploads by sender
const userRequests = {};

// Function to send a message
async function sendMessage(to, message) {
  try {
    // Ensure 'whatsapp:' prefix is added if not already present
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    const msg = await client.messages.create({
      from: 'whatsapp:+14155238886', // Twilio's WhatsApp sandbox number
      body: message, // Message body
      to: formattedTo, // Recipient's phone number with whatsapp: prefix
    });

    console.log(`Message sent successfully! SID: ${msg.sid}`);
  } catch (err) {
    console.error(`Failed to send message: ${err.message}`);
  }
}

// Initialize Hugging Face client
const llmclient = new HfInference(process.env.HUGGING_FACE_API_KEY);

// Function to reply as a bot
async function replyAsABotToThisUserQuery(query) {
  try {
    // Contextual prompt for file management bot
    const promptTemplate = `
You are an AI WhatsApp file management bot with three core functionalities:
1. Upload files to S3 cloud storage
2. Retrieve files from S3
3. Convert files between formats

create a simple and short reply to the query form the user based on the rules listed below
users query : ${query}

Interaction Rules:
- Always provide a direct, concise response
- Explain bot capabilities relevant to the query
- Use a friendly, natural WhatsApp conversation style
- Keep responses between 20-40 words
- Avoid technical jargon
- Do not use "Bot Response:" or similar prefixes

Response Strategy:
- If query is about bot usage: Explain file upload, retrieval, conversion
- If query is unclear: Guide user to upload a file or clarify request
- Focus on making file management simple and intuitive
- Encourage user to take specific action

Tone: Helpful, conversational, straightforward , professional
Goal: Make file management easy and quick
`;
    const reminderDetails = await llmclient.textGeneration({
      model: "mistralai/Mixtral-8x7B-Instruct-v0.1",
      inputs: promptTemplate,
      max_new_tokens: 150
    });

    // Clean and format the response
    const reply = reminderDetails.generated_text
      .replace(promptTemplate, '')  // Remove the original prompt
      .trim();

    return reply || "Hi there! I'm your file management assistant. I can help you store, organize, and convert files easily. How can I assist you today?";
  } catch (error) {
    console.error('Error generating bot response:', error);
    return "Sorry, I'm having trouble processing your request right now. Please try again or send your file.";
  }
}

// Webhook route to handle incoming WhatsApp messages
// Webhook route to handle incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
  try {
    const { From, To, Body, MediaUrl0 } = req.body;

    // Check if the request contains either a Body message or MediaUrl0
    if (!Body && !MediaUrl0) {
      console.log('Invalid request: Missing both Body and MediaUrl0');
      return res.status(400).send('Bad Request: Missing message or media URL');
    }

    // Store the req.body when a file is received
    if (MediaUrl0) {
      userRequests[From] = req.body;
      console.log(`Received file from ${From}: ${MediaUrl0}`);
      sendFileMenu(From);  // Send the menu to the user after file upload
    }

    // Check if the user already has an active request
    if (userRequests[From]) {
      console.log(`User ${From} has an active request. Skipping bot reply.`);
      return res.status(200).send('Webhook processed');
    }

    // Handle text-based messages (only if no active request is ongoing)
    if (Body) {
      const reply = await replyAsABotToThisUserQuery(Body);
      sendMessage(From, reply);
    }

    console.log("Message: ", Body);

    switch (Body) {
      case "convert":
        // Send the conversion menu (or handle conversion logic)
        break;
      case "upload":
        // Handle file upload using the stored req.body data
        if (userRequests[From]) {
          const storedRequest = userRequests[From];

          const payload = {
            ...storedRequest,
            fileUrl: storedRequest.MediaUrl0,  // File URL from stored req.body
          };

          // Call the Kestra workflow to upload the file
          await axios.post('http://localhost:8080/api/v1/executions/webhook/webhooks/webhook-logger/twilio', payload, {
            headers: {
              'Content-Type': 'application/json',
            },
          });

          // Optionally, clear the stored data after upload
          delete userRequests[From];
        } else {
          console.log(`No stored data found for ${From}`);
        }
        break;
      default:
        console.log(`Unknown command: ${Body}`);
    }

    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).send('Internal Server Error');
  }
});


// Health check route
app.get('/', (req, res) => {
  res.send('Server is running!');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Graceful shutdown
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Closing HTTP server.');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});
