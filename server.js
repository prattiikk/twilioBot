const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { MessagingResponse } = require('twilio').twiml;
const twilio = require('twilio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { HfInference } = require('@huggingface/inference');
const {listfile}=require('./utils/list_file');

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
    // Ensure 'whatsapp:' prefix is added if not already present
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    const msg = await client.messages.create({
      from: 'whatsapp:+14155238886', // Twilio's WhatsApp sandbox number
      to: formattedTo, // Recipient's phone number with whatsapp: prefix
      body: message, // Message content
    });

    console.log(`Message sent successfully! SID: ${msg.sid}`);
  } catch (err) {
    console.error(`Failed to send message: ${err.message}`);
  }
}

// Function to send a media file
function sendMediaFile(to, mediaUrl, caption = '') {
  console.log("trying to send that file to the user .........................!")
  // Ensure 'whatsapp:' prefix is added if not already present
  const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  client.messages
    .create({
      from: 'whatsapp:+14155238886', // Twilio's WhatsApp sandbox number or your Twilio WhatsApp number
      to: formattedTo, // Recipient's WhatsApp number
      mediaUrl: [mediaUrl], // Array of media URLs
      body: caption, // Optional caption for the media
    })
    .then((message) => console.log(`Media message sent successfully! SID: ${message.sid}`))
    .catch((err) => console.error(`Failed to send media: ${err.message}`));

  console.log("done sending filesssssssss .........!")
}

// Hugging Face API URL and Token
const HF_API_URL = 'https://api-inference.huggingface.co/models/facebook/bart-large-mnli';
const HF_API_TOKEN = process.env.HUGGING_FACE_API_KEY;

// Validate Hugging Face API Token
if (!HF_API_TOKEN) {
  console.error('Missing Hugging Face API key. Please set HUGGING_FACE_API_KEY in .env');
  process.exit(1);
}



const llmclient = new HfInference(process.env.HUGGING_FACE_API_KEY);

async function getIntentClassification(query) {
  const candidateLabels = ["setReminder", "searchFiles", "createTodo", "unknown"];

  try {
    const chatCompletion = await llmclient.chatCompletion({
      model: "mistralai/Mixtral-8x7B-Instruct-v0.1",
      messages: [
        {
          role: "user",
          content: `Classify the intent of the following text by selecting ONLY ONE word from these candidate labels: ${candidateLabels.join(', ')}

Text: "${query}"

Respond with ONLY the SINGLE MOST APPROPRIATE intent from the given labels.`
        }
      ],
      max_tokens: 50
    });

    const intent = chatCompletion.choices[0].message.content.trim().toLowerCase();
    console.log("intent ->> ", intent);

    // More robust intent validation
    const validIntent = candidateLabels
      .find(label => label.toLowerCase() === intent) || 'unknown';

    return {
      intent: validIntent,
      confidence: 1.0 // Note: Mixtral doesn't provide a native confidence score
    };
  } catch (error) {
    console.error('Error with Hugging Face API:', error.message);
    return { intent: 'unknown', confidence: 0 };
  }
}

async function setReminder(query) {
  try {
    // Use the LLM to extract event and time from the query
    const reminderDetails = await llmclient.chatCompletion({
      model: "mistralai/Mixtral-8x7B-Instruct-v0.1",
      messages: [
        {
          role: "user",
          content: `Extract the event and time from this query: "${query}"
          
Respond in this format:
Event: [extracted event]
Time: [extracted time]`
        }
      ],
      max_tokens: 100
    });

    const detailsText = reminderDetails.choices[0].message.content;

    // Simple parsing of the extracted details
    const eventMatch = detailsText.match(/Event:\s*(.+)/i);
    const timeMatch = detailsText.match(/Time:\s*(.+)/i);

    const event = eventMatch ? eventMatch[1].trim() : "Unnamed Event";
    const time = timeMatch ? timeMatch[1].trim() : "Not Specified";

    return `Reminder set for event "${event}" at time ${time}`;
  } catch (error) {
    console.error('Error setting reminder:', error);
    return `Reminder set with default details`;
  }
}

async function searchFile(query) {
  try {
    // Use the LLM to extract file details from the query
    const fileDetails = await llmclient.chatCompletion({
      model: "mistralai/Mixtral-8x7B-Instruct-v0.1",
      messages: [
        {
          role: "user",
          content: `Extract the file details from this search query: "${query}"
          
Respond with the most relevant file description.`
        }
      ],
      max_tokens: 100
    });

    const fileDescription = fileDetails.choices[0].message.content.trim();

    // For demo, return a placeholder URL with the file description
    return {
      url: "https://picsum.photos/id/237/200/300",
      description: fileDescription || "Generic file"
    };
  } catch (error) {
    console.error('Error searching file:', error);
    return {
      url: "https://picsum.photos/id/237/200/300",
      description: "Default file"
    };
  }
}

async function createTodo(query) {
  try {
    // Use the LLM to extract todo details from the query
    const todoDetails = await llmclient.chatCompletion({
      model: "mistralai/Mixtral-8x7B-Instruct-v0.1",
      messages: [
        {
          role: "user",
          content: `Extract the task details from this todo query: "${query}"
          
Respond with the most relevant task description.`
        }
      ],
      max_tokens: 100
    });

    const task = todoDetails.choices[0].message.content.trim();

    return `Task "${task}" added to today's todos`;
  } catch (error) {
    console.error('Error creating todo:', error);
    return "Default task added to todos";
  }
}

async function interpretQuery(query) {
  try {
    const { intent, confidence } = await getIntentClassification(query);

    switch (intent.toLowerCase()) {
      case "setreminder":
        console.log("Set reminder intent detected", { intent, confidence });
        const reminderMsg = await setReminder(query);
        return {
          success: true,
          action: 'setReminder',
          msg: reminderMsg
        };

      case "searchfiles":
        console.log("Search files intent detected", { intent, confidence });
        const fileResult = await searchFile(query);
        return {
          success: true,
          action: 'searchFiles',
          fileUrl: fileResult.url,
          description: fileResult.description
        };

      case "createtodo":
        console.log("Create todo intent detected", { intent, confidence });
        const todoMsg = await createTodo(query);
        return {
          success: true,
          action: 'createTodo',
          msg: todoMsg
        };

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
    const {
      From,     // Sender's WhatsApp number (full format with country code)
      To,       // Recipient's WhatsApp number (the number your Twilio number received the message)
      Body,
      MediaUrl0,
      MediaContentType0
    } = req.body;

    console.log(`Message Details:`, {
      from: From,       // Sender's number
      to: To,           // Recipient's number
      body: Body,
      mediaUrl: MediaUrl0,
      mediaContentType: MediaContentType0
    });

    // Example of extracting just the phone number without the 'whatsapp:' prefix
    const senderPhoneNumber = From.replace('whatsapp:', '');
    const recipientPhoneNumber = To.replace('whatsapp:', '');

    sendMessage(senderPhoneNumber, "Let me figure that out...!");

    console.log(`Parsed Phone Numbers:`, {
      sender: senderPhoneNumber,
      recipient: recipientPhoneNumber
    });

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
      const twiml = new MessagingResponse();
      if (intentResult.success) {
        // Customize response based on the detected action
        switch (intentResult.action) {
          case 'setReminder':
            // sendMessage(senderPhoneNumber, `✅ Reminder set successfully! Message: ${intentResult.msg}`);
            twiml.message(`✅ Reminder set successfully! Message: ${intentResult.msg}`);
            break;

          case 'searchFiles':
            // sendMediaFile(senderPhoneNumber, intentResult.fileUrl, 'Here is the file you requested!');
            const mediaMessage = twiml.message('Here is the file you requested!');
            mediaMessage.media(intentResult.fileUrl);
            break;

          case 'createTodo':
            // sendMessage(senderPhoneNumber, `✅ Task added successfully: ${intentResult.msg}`);
            twiml.message(`✅ Task added successfully: ${intentResult.msg}`);
            break;

          default:
            // sendMessage(senderPhoneNumber, 'Unknown action detected.');
            twiml.message('Unknown action detected.');
            break;
        }

        // Send the Twilio response
        return res.type('text/xml').send(twiml.toString());
      } else {

        // sendMessage(recipientPhoneNumber, `⚠️ Oops! I couldn't process your request. Please try again.`);
        twiml.message(`⚠️ Oops! I couldn't process your request. Please try again.`);

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