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
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const msg = await client.messages.create({
      from: 'whatsapp:+14155238886',
      body: message,
      to: formattedTo,
    });
    console.log(`Message sent successfully! SID: ${msg.sid}`);
  } catch (err) {
    console.error(`Failed to send message: ${err.message}`);
  }
}

// Function to send the file menu
function sendFileMenu(to) {
  try {
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    client.messages
      .create({
        from: 'whatsapp:+14155238886',
        contentSid: 'HX48616562cd2739a84633025b1bc23d86',
        to: formattedTo,
      })
      .then((message) => console.log(`Menu sent with SID: ${message.sid}`))
      .catch((err) => console.error(`Error sending menu: ${err}`));
  } catch (err) {
    console.error(`Error in sendFileMenu: ${err.message}`);
  }
}

// Initialize Hugging Face client
const llmclient = new HfInference(process.env.HUGGING_FACE_API_KEY);

// Function to generate bot responses
async function replyAsABotToThisUserQuery(query) {
  try {
    const promptTemplate = `
You are an AI WhatsApp file management bot with three core functionalities:
1. Upload files to S3 cloud storage
2. Retrieve files from S3
3. Convert files between formats

create a simple and short reply to the query from the user based on the rules listed below
users query: ${query}

Interaction Rules:
- Always provide a direct, concise response
- Explain bot capabilities relevant to the query
- Use a friendly, natural WhatsApp conversation style
- Keep responses between 20-40 words
- Avoid technical jargon
- Do not use "Bot Response:" or similar prefixes

Response Strategy:
- If query is about bot usage: Explain file upload, retrieval, conversion
- If query is unclear: just tell user to upload a file first
- Focus on making file management simple and intuitive
- Encourage user to take specific action
- Everything except the search needs a file to be uploaded first, so upload the file first

Tone: Helpful, conversational, straightforward, professional
Goal: Make file management easy and quick
`;
    const response = await llmclient.textGeneration({
      model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      inputs: promptTemplate,
      max_new_tokens: 150,
    });
    return response.generated_text.trim() || "Hi there! I'm your file management assistant. How can I help you today?";
  } catch (error) {
    console.error('Error generating bot response:', error);
    return "Sorry, I'm having trouble processing your request right now. Please try again or send your file.";
  }
}

// Webhook route to handle incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
  try {
    const { From, Body, MediaUrl0 } = req.body;

    if (!Body && !MediaUrl0) {
      return res.status(400).send('Bad Request: Missing message or media URL');
    }

    if (!userRequests[From]) {
      userRequests[From] = { status: 'idle' };
    }

    switch (userRequests[From].status) {
      case 'idle':
        if (MediaUrl0) {

          if(req.body.Body){
          userRequests[From] = { ...req.body,fileName:req.body.Body, status: 'fileNamed' };
          console.log(`Received file from ${From}: ${MediaUrl0}`);      
          sendFileMenu(From);
          }else{
          userRequests[From] = { ...req.body, status: 'awaitingFileName' };
          console.log(`Received file from ${From}: ${MediaUrl0}`);
          await sendMessage(From, "Please provide a name for the uploaded file.");
          }
          
        } else {
          const reply = await replyAsABotToThisUserQuery(Body);
          await sendMessage(From, reply);
        }
        break;

      case 'awaitingFileName':
        if (Body) {
          userRequests[From].fileName = Body;
          userRequests[From].status = 'fileNamed';
          console.log(`File named by ${From}: ${Body}`);
          sendFileMenu(From);
        } else {
          await sendMessage(From, "Please provide a name for your file.");
        }
        break;

      case 'fileNamed':
        switch (Body.toLowerCase()) {
          case 'upload':
            const payload = {
              ...userRequests[From],
              fileUrl: userRequests[From].MediaUrl0,
              fileName: userRequests[From].fileName
            };

            try {
              await axios.post('http://localhost:8080/api/v1/executions/webhook/webhooks/webhook-logger/twilio', payload, {
                headers: { 'Content-Type': 'application/json' },
              });
              console.log("Requested Kestra to execute the rest...!");

              delete userRequests[From];
              await sendMessage(From, "Your file has been successfully uploaded!");
            } catch (uploadError) {
              console.error('Upload error:', uploadError);
              await sendMessage(From, "Sorry, there was an error uploading your file. Please try again.");
              delete userRequests[From];
            }
            break;

          case 'convert':
            console.log("File type is:", userRequests[From].MediaContentType0);

            switch (userRequests[From].MediaContentType0) {
              case 'application/pdf':
                userRequests[From].status = 'pdfConversionMenu';
                await sendMessage(From, "PDF Conversion Options:\n" +
                  "1. Convert to DOCX\n" +
                  "2. Convert to Text\n" +
                  "3. Extract Images\n" +
                  "Reply with the number of your desired conversion.");
                break;

              case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                userRequests[From].status = 'docxConversionMenu';
                await sendMessage(From, "DOCX Conversion Options:\n" +
                  "1. Convert to PDF\n" +
                  "2. Convert to Text\n" +
                  "3. Convert to HTML\n" +
                  "Reply with the number of your desired conversion.");
                break;

              case 'image/png':
              case 'image/jpeg':
              case 'image/jpg':
                userRequests[From].status = 'imageConversionMenu';
                await sendMessage(From, "Image Conversion Options:\n" +
                  "1. Convert to Text (OCR)\n" +
                  "2. Compress Image\n" +
                  "3. Convert to Black & White\n" +
                  "Reply with the number of your desired conversion.");
                break;

              default:
                await sendMessage(From, `Unsupported file type: ${userRequests[From].MediaContentType0}.`);
                console.log("Unsupported file type:", userRequests[From].MediaContentType0);
                delete userRequests[From];
                break;
            }
            break;

          default:
            await sendMessage(From, "Unexpected state. Please try again.");
            delete userRequests[From];
            break;
        }
        break;

      case 'pdfConversionMenu':
        switch (Body.trim()) {
          case '1':
            await pdfToDocx(userRequests[From].MediaUrl0);
            await sendMessage(From, "PDF converted to DOCX successfully.");
            delete userRequests[From];
            break;
          case '2':
            await pdfToText(userRequests[From].MediaUrl0);
            await sendMessage(From, "PDF converted to Text successfully.");
            delete userRequests[From];
            break;
          case '3':
            await pdfExtractImages(userRequests[From].MediaUrl0);
            await sendMessage(From, "Images extracted from PDF successfully.");
            delete userRequests[From];
            break;
          default:
            await sendMessage(From, "Invalid option. Please reply with 1, 2, or 3.");
            break;
        }
        break;

      case 'docxConversionMenu':
        switch (Body.trim()) {
          case '1':
            await docxToPdf(userRequests[From].MediaUrl0);
            await sendMessage(From, "Word document converted to PDF successfully.");
            delete userRequests[From];
            break;
          case '2':
            await docxToText(userRequests[From].MediaUrl0);
            await sendMessage(From, "Word document converted to Text successfully.");
            delete userRequests[From];
            break;
          case '3':
            await docxToHtml(userRequests[From].MediaUrl0);
            await sendMessage(From, "Word document converted to HTML successfully.");
            delete userRequests[From];
            break;
          default:
            await sendMessage(From, "Invalid option. Please reply with 1, 2, or 3.");
            break;
        }
        break;

      case 'imageConversionMenu':
        switch (Body.trim()) {
          case '1':
            await imageToText(userRequests[From].MediaUrl0);
            await sendMessage(From, "Image converted to Text (OCR) successfully.");
            delete userRequests[From];
            break;
          case '2':
            await compressImage(userRequests[From].MediaUrl0);
            await sendMessage(From, "Image compressed successfully.");
            delete userRequests[From];
            break;
          case '3':
            await convertImageToBlackAndWhite(userRequests[From].MediaUrl0);
            await sendMessage(From, "Image converted to Black & White successfully.");
            delete userRequests[From];
            break;
          default:
            await sendMessage(From, "Invalid option. Please reply with 1, 2, or 3.");
            break;
        }
        break;

      default:
        await sendMessage(From, "Unexpected state. Please try again.");
        delete userRequests[From];
        break;
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
