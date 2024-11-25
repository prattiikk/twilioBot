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
const accountSid = process.env.TWILIO_ACCOUNT_SID || 'your_account_sid';
const authToken = process.env.TWILIO_AUTH_TOKEN || 'your_auth_token';

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
function sendMessage(to, message) {
  client.messages
    .create({
      from: 'whatsapp:+14155238886', // Twilio's WhatsApp sandbox number
      to: to, // Recipient's phone number
      body: message, // Message content
    })
    .then((msg) => console.log(`Message sent successfully! SID: ${msg.sid}`))
    .catch((err) => console.error(`Failed to send message: ${err.message}`));
}

app.post('/webhook', async (req, res) => {
  const { From, Body, MediaUrl0, MediaContentType0 } = req.body;
  console.log(`Message received from ${From}: ${Body}`);

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
          `Your ${fileType} has been uploaded. Please provide a few related keywords or a description to tag this file for future reference. start the response with\nDescription: `
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
  } else if (Body && Body.startsWith('Description:')) {
    // Extract description and update metadata
    const description = Body.replace('Description:', '').trim();
    if (fileMetadataStore[From]) {
      fileMetadataStore[From].description = description;
      console.log(`Metadata updated: ${JSON.stringify(fileMetadataStore[From])}`);

      const twiml = new MessagingResponse();
      twiml.message('Thank you! Your file has been tagged successfully.');
      res.type('text/xml').send(twiml.toString());
    } else {
      const twiml = new MessagingResponse();
      twiml.message(
        'We couldn’t find a recently uploaded file to associate this description with. Please try uploading again.'
      );
      res.type('text/xml').send(twiml.toString());
    }
  } else {
    const twiml = new MessagingResponse();
    twiml.message('Thanks for your message!');
    res.type('text/xml').send(twiml.toString());
  }
});

// Health check route
app.get('/', (req, res) => {
  res.send('Server is running!');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
