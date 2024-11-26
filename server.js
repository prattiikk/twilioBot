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

// // Function to send a message
// async function sendMessage(to, message) {
//   try {
//     const msg = await client.messages.create({
//       from: 'whatsapp:+14155238886', // Twilio's WhatsApp sandbox number
//       to: to, // Recipient's phone number
//       body: message, // Message content
//     });
//     console.log(`Message sent successfully! SID: ${msg.sid}`);
//   } catch (err) {
//     console.error(`Failed to send message: ${err.message}`);
//   }
// }

// Function to send a media file
function sendMediaFile(mediaUrl, caption = '') {
  console.log("trying to send that file to the user .........................!")

  client.messages
    .create({
      from: 'whatsapp:+14155238886', // Twilio's WhatsApp sandbox number or your Twilio WhatsApp number
      to: "whatsapp:+917058385245", // Recipient's WhatsApp number
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



// need to write the implementation for these functions
async function setReminder(query) {

  const event = "play cricket"
  const time = 11

  return `remainder set for event ${event}  at time ${11}`
}

async function searchFile(query) {

  const url = "https://picsum.photos/id/237/200/300"

  return url;

}

async function createTodo(query) {

  const tasks = "implement this funcitons";

  return `${tasks} added to todays tasks`
}




// Function to handle different intents
async function interpretQuery(query) {
  try {
    const { intent, confidence } = await getIntentClassification(query);

    switch (intent) {
      case "setReminder":
        console.log("Set reminder intent detected", { intent, confidence });

        // Implement reminder logic
        const successMsg = await setReminder(query)
        return { success: true, action: 'setReminder', msg: successMsg };

      case "searchFiles":
        console.log("Search files intent detected", { intent, confidence });
        // Implement file search logic
        const fileUrl = await searchFile(query)
        return { success: true, action: 'searchFiles', fileUrl: fileUrl };

      case "createTodo":
        console.log("Create todo intent detected", { intent, confidence });
        // Implement todo creation logic
        const Msg = await createTodo(query)
        return { success: true, action: 'createTodo', msg: Msg };

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
      if (intentResult.success) {
        const twiml = new MessagingResponse();

        // Customize response based on the detected action
        switch (intentResult.action) {
          case 'setReminder':
            twiml.message(`✅ Reminder set successfully! Message: ${intentResult.msg}`);
            break;

          case 'searchFiles':
            if (intentResult.fileUrl) {
              const mediaMessage = twiml.message(`📂 File found!`);
              // mediaMessage.media(intentResult.fileUrl); // Attach media URL to the message
              sendMediaFile(intentResult.fileUrl, "your file")
            } else {
              twiml.message(`❌ No files found matching your query.`);
            }
            break;

          case 'createTodo':
            twiml.message(`📝 Todo created! Message: ${intentResult.msg}`);
            break;

          default:
            twiml.message(`❓ Sorry, I couldn't understand your request. Please try again.`);
            break;
        }

        // Send the Twilio response
        return res.type('text/xml').send(twiml.toString());
      } else {
        // Handle cases where intent could not be determined
        const twiml = new MessagingResponse();
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