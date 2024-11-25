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

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.post('/webhook', async (req, res) => {
  const { From, Body, MediaUrl0, MediaContentType0 } = req.body;

  console.log(`Message received from ${From}: ${Body}`);

  if (MediaUrl0) {
      try {
          // Ensure uploads directory exists with correct permissions
          fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });

          // Verify MediaUrl0 is not undefined
          if (!MediaUrl0) {
              throw new Error('No media URL provided');
          }

          // Download media with authentication
          const mediaResponse = await axios.get(MediaUrl0, {
              responseType: 'stream',
              headers: {
                  'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
              }
          });

          const fileExtension = MediaContentType0 ? MediaContentType0.split('/')[1] : 'unknown';
          const fileName = `uploaded_media_${Date.now()}.${fileExtension}`;
          const filePath = path.join(uploadDir, fileName);

          const writer = fs.createWriteStream(filePath);
          mediaResponse.data.pipe(writer);

          writer.on('finish', () => {
              console.log(`Media file saved to: ${filePath}`);
              const twiml = new MessagingResponse();
              twiml.message('Media file received successfully!');
              res.type('text/xml').send(twiml.toString());
          });

          writer.on('error', (err) => {
              console.error(`File write error: ${err.message}`);
              res.status(500).send('Failed to save media file');
          });

      } catch (error) {
          console.error(`Media download error: ${error.message}`);
          console.error('Error details:', error);
          res.status(500).send('Failed to process media file');
      }
  } else {
      // Handle text messages as before
      const twiml = new MessagingResponse();
      twiml.message('Thanks for your message!');
      res.type('text/xml').send(twiml.toString());
  }
});
// Simple endpoint for testing connectivity
app.post('/hi', (req, res) => {
    console.log('Hi there!');
    res.send({ msg: 'Hi there!' });
});

// Health check route
app.get('/', (req, res) => {
    res.send('Server is running!');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});