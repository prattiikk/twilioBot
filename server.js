const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { MessagingResponse } = require('twilio').twiml;
const twilio = require('twilio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

// Directory for uploaded files
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// In-memory store for file metadata
const fileMetadataStore = {};

// Function to send a message
async function sendMessage(to, message) {
  try {
    const msg = await client.messages.create({
      from: 'whatsapp:+14155238886', // Twilio's WhatsApp sandbox number
      to: to, // Recipient's phone number
      body: message, // Message content
    });
    console.log(`Message sent successfully! SID: ${msg.sid}`);
  } catch (err) {
    console.error(`Failed to send message: ${err.message}`);
  }
}

// Hugging Face API URL and Token
const HF_API_URL = 'https://api-inference.huggingface.co/models/facebook/bart-large-mnli';
const HF_API_TOKEN = process.env.HUGGING_FACE_API_KEY;

// Validate Hugging Face API Token
if (!HF_API_TOKEN) {
  console.error('Missing Hugging Face API key. Please set HUGGING_FACE_API_KEY in .env');
  process.exit(1);
}

// Function to call Hugging Face API for intent classification
async function getIntentClassification(query) {
  const candidateLabels = ["setReminder", "searchFiles", "createTodo", "unknown"];

  try {
    const response = await axios.post(
      HF_API_URL,
      {
        inputs: query,
        parameters: { candidate_labels: candidateLabels },
      },
      {
        headers: {
          Authorization: `Bearer ${HF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      intent: response.data.labels[0],
      confidence: response.data.scores[0],
    };
  } catch (error) {
    console.error('Error with Hugging Face API:', error.message);
    return { intent: 'unknown', confidence: 0 };
  }
}

// Function to handle different intents
async function interpretQuery(query) {
  try {
    const { intent, confidence } = await getIntentClassification(query);

    switch (intent) {
      case "setReminder":
        console.log("Set reminder intent detected", { intent, confidence });
        // Implement reminder logic
        return { success: true, action: 'setReminder' };
      
      case "searchFiles":
        console.log("Search files intent detected", { intent, confidence });
        // Implement file search logic
        return { success: true, action: 'searchFiles' };
      
      case "createTodo":
        console.log("Create todo intent detected", { intent, confidence });
        // Implement todo creation logic
        return { success: true, action: 'createTodo' };
      
      default:
        console.log(`Unknown intent: ${intent}`);
        return { success: false, action: 'unknown' };
    }
  } catch (error) {
    console.error('Query interpretation error:', error);
    return { success: false, action: 'error' };
  }
}

// Webhook route to handle incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
  try {
    const { From, Body, MediaUrl0, MediaContentType0 } = req.body;
    console.log(`Message received from ${From}: ${Body}`);

    // Handle text messages without media
    if (Body && !MediaUrl0) {
      // Check if it's a description for a previously uploaded file
      if (Body.trim().toLowerCase().startsWith('description:')) {
        const description = Body.replace(/^description:\s*/i, '').trim();
        if (fileMetadataStore[From]) {
          fileMetadataStore[From].description = description;
          console.log(`Metadata updated: ${JSON.stringify(fileMetadataStore[From])}`);

          const twiml = new MessagingResponse();
          twiml.message('Thank you! Your file has been tagged successfully.');
          return res.type('text/xml').send(twiml.toString());
        } else {
          const twiml = new MessagingResponse();
          twiml.message('We couldn\'t find a recently uploaded file to associate this description with. Please try uploading again.');
          return res.type('text/xml').send(twiml.toString());
        }
      }

      // Interpret text message intent
      const intentResult = await interpretQuery(Body);
      if (intentResult.success) {
        // Potential future expansion: send a specific response based on intent
        const twiml = new MessagingResponse();
        twiml.message(`Intent detected: ${intentResult.action}`);
        return res.type('text/xml').send(twiml.toString());
      }
    }

    // Handle media messages
    if (MediaUrl0) {
      try {
        const mediaResponse = await axios.get(MediaUrl0, {
          responseType: 'stream',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          },
        });

        const fileExtension = MediaContentType0 ? MediaContentType0.split('/')[1] : 'unknown';
        const fileType = MediaContentType0 ? MediaContentType0.split('/')[0] : 'unknown';
        const fileName = `uploaded_media_${Date.now()}.${fileExtension}`;
        const filePath = path.join(uploadDir, fileName);

        const writer = fs.createWriteStream(filePath);
        mediaResponse.data.pipe(writer);

        writer.on('finish', () => {
          console.log(`Media file saved to: ${filePath}`);

          // Store file metadata for later tagging
          fileMetadataStore[From] = {
            fileName,
            fileType,
            filePath,
            timestamp: Date.now(),
          };

          // Ask the user for a description
          const twiml = new MessagingResponse();
          twiml.message(
            `Your ${fileType} has been uploaded. Please provide a few related keywords or a description to tag this file for future reference. Start the response with\nDescription: `
          );
          res.type('text/xml').send(twiml.toString());
        });

        writer.on('error', (err) => {
          console.error(`File write error: ${err.message}`);
          res.status(500).send('Failed to save media file');
        });
      } catch (error) {
        console.error(`Media download error: ${error.message}`);
        res.status(500).send('Failed to process media file');
      }
    } else {
      const twiml = new MessagingResponse();
      twiml.message('Thanks for your message!');
      res.type('text/xml').send(twiml.toString());
    }
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
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Closing HTTP server.');
  app.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});