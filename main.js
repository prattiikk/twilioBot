const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const axios = require('axios');
const twilio = require('twilio');
const send = require('send');

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
async function sendFileMenu(to) {
  try {
    // Ensure 'whatsapp:' prefix is added if not already present
    const formattedTo = to.startsWith('whatsapp:') ? to :`whatsapp:${to}`;

    const msg = await client.messages.create({
      from: 'whatsapp:+14155238886', // Twilio's WhatsApp sandbox number
      contentSid: 'HX822d436a1bf0c8ddfe059dffa5eba68a',
      to: formattedTo, // Recipient's phone number with whatsapp: prefix
    });

    console.log(`Message sent successfully! SID: ${msg.sid}`);
  } catch (err) {
    console.error(`Failed to send message: ${err.message}`);
  }
}
async function sendMsg(to,body){
  try {
    // Ensure 'whatsapp:' prefix is added if not already present
    const formattedTo = to.startsWith('whatsapp:') ? to :`whatsapp:${to}`;
    const msg = await client.messages.create({
      from: 'whatsapp:+14155238886', // Twilio's WhatsApp sandbox numberj
      to: formattedTo, // Recipient's phone number with whatsapp: prefix
      body:body
    });

    console.log(`Message sent successfully! SID: ${msg.sid}`);
  } catch (err) {
    console.error(`Failed to send message: ${err.message}`);
  }
}

// Webhook route to handle incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
  try {
    const {
      From,     // Sender's WhatsApp number (full format with country code)
      To,       // Recipient's WhatsApp number (the number your Twilio number received the message)
      Body,
      MediaUrl0
    } = req.body;

    // Check if the request contains either a Body message or MediaUrl0
    if (!Body && !MediaUrl0) {
      console.log('Invalid request: Missing both Body and MediaUrl0');
      return res.status(400).send('Bad Request: Missing message or media URL');
    }

    // Store the req.body when a file is received
    if (MediaUrl0) {
      // Store only req.body for the user (From)
      userRequests[From] = req.body;

      console.log(`Received file from ${From}: ${MediaUrl0}`);
      sendFileMenu(From);  // Send the menu to the user after file upload
    }

    console.log("Message: ", Body);

    switch (Body) {
      case "1":
        //save
        sendMsg(From,"Send your file, also give a name to it.")
        console.log('save')
        
        break;
      case "2":
        //list
        sendMsg(From,"Here are your files.");
        break;
      case "3":
            //search
      case "4":
            //convert
      default:
        sendFileMenu(From);
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
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Closing HTTP server.');
  app.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});

// Start the server
app.listen(PORT, () => {
  console.log('Server running on http://localhost:${PORT}');
});