const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const axios = require('axios');
const twilio = require('twilio');
const { HfInference } = require('@huggingface/inference');
const { downloadFileFromURL, deleteAllFilesInFolder } = require('./utils/downloader');
const path = require('path');
const { docxToHtml, docxToTxt, docxToPdf, docxToMarkdown } = require('./conversions/docsConversions');
const {convertPDFToDOCX,convertTextFromPDF}=require('./conversions/pdf.js')
const {getList,getUrl}=require('./utils/list.js')
const {
  toJpg,
  toJpeg,
  toPng,
  toWebp,
  compressImage,
  convertImageToBlackAndWhite
} = require('./conversions/ImgConversions');
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
async function sendMedia(to, url, message = "success!") {
  try {
    console.log("url inside sendmedia : ", url);
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const msg = await client.messages.create({
      from: 'whatsapp:+14155238886',
      body: message,
      mediaUrl: url,
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

function sendMenu(to, MenuCode) {
  try {
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    client.messages
      .create({
        from: 'whatsapp:+14155238886',
        contentSid: MenuCode,
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
    // console.log(await getList('whatsapp:+917058385245')) 
    // console.log(await getUrl('whatsapp:+917058385245','tbgranny'));
    if (!Body && !MediaUrl0) {
      return res.status(400).send('Bad Request: Missing message or media URL');
    }

    if (!userRequests[From]) {
      userRequests[From] = { status: 'idle' };
    }

    switch (userRequests[From].status) {
      case 'idle':
        if (MediaUrl0) {

          if (req.body.Body) {
            userRequests[From] = { ...req.body, fileName: req.body.Body, status: 'fileNamed' };
            console.log(`Received file from ${From}: ${MediaUrl0}`);
            sendFileMenu(From);
          } else {
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
          if(userRequests[From].retrieve){
                   const s3_url=await getUrl(From,userRequests[From].fileName);
                   sendMedia(From,s3_url,userRequests[From].fileName);
                   delete userRequests[From];
          }else{
                   sendFileMenu(From);
          }
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

          case 'retrieve':
            const data=await getList(From);
            await sendMessage(From,data);
            await sendMessage(From,'Send the file Name from this list to retrieve');
            userRequests[From].status='awaitingFileName';
            userRequests[From].retrieve=true;
            break;
          case 'convert':
            console.log("File type is:", userRequests[From].MediaContentType0);
            // downloads the file for conversion
            console.log("before conversion")
            const url = userRequests[From].MediaUrl0;
            const name = userRequests[From].fileName
            deleteAllFilesInFolder(path.join(__dirname, "downloads"));
            const filePath = await downloadFileFromURL(url, name)
            userRequests[From].filePath = filePath;
            console.log("after conversion path : ", filePath)

            switch (userRequests[From].MediaContentType0) {
              case 'application/pdf':
                userRequests[From].status = 'pdfConversionMenu';
                sendMenu(From, "HX3c25ca869b4201f37358c56a3be91975");
                break;

              case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                userRequests[From].status = 'docxConversionMenu';
                sendMenu(From, 'HX3f0f117bd02ed857fc4a0279ec779e30');
                break;

              case 'image/png':
              case 'image/jpeg':
              case 'image/jpg':
                userRequests[From].status = 'imageConversionMenu';
                sendMenu(From, 'HX43981a6698e5b23091b5cad8ee768b67');
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
          case 'word':
            await convertPDFToDOCX(userRequests[From].filePath,userRequests[From].filePath.replace('.pdf', '.docx'))
            await sendMessage(From, "PDF converted to DOCX successfully.");
            delete userRequests[From];
            break;

          case 'text': 
            await convertTextFromPDF(userRequests[From].filePath,userRequests[From].filePath.replace('.pdf', '.docx'))   
            await sendMessage(From, "PDF converted to Text successfully.");
            delete userRequests[From];
            break;

          default:
            await sendMessage(From, "Something went wrong.");
            break;
        }
        break;

      case 'docxConversionMenu':
        switch (Body.trim()) {

          case 'pdf':
            await docxToPdf(userRequests[From].filePath, userRequests[From].filePath.replace('.docx', '.pdf'));
            await sendMessage(From, "Word document converted to PDF successfully.");
            delete userRequests[From];
            break;

          case 'text':
            // Convert the DOCX to Text
            await docxToTxt(userRequests[From].filePath, userRequests[From].filePath.replace('.docx', '.txt'));
            await sendMessage(From, "Word document converted to Text successfully.");
            delete userRequests[From];
            break;

          case 'html':
            // Convert the DOCX to HTML
            await docxToHtml(userRequests[From].filePath, userRequests[From].filePath.replace('.docx', '.html'));
            await sendMessage(From, "Word document converted to HTML successfully.");
            delete userRequests[From];
            break;

          case 'markdown':
            await docxToMarkdown(userRequests[From].filePath, userRequests[From].filePath.replace('.docx', '.html'));
            await sendMessage(From, "Word document converted to MARKDOWN successfully.");
            break;
            
          default:
            await sendMessage(From, "Something went wrong. Please choose a valid option.");
            break;
        }
        break;

      case 'imageConversionMenu':
        const filePath = userRequests[From].filePath;
        const outputDir = path.dirname(filePath);

        switch (Body.trim()) {
          // Format Conversions
          case 'jpg':
            // Convert to JPG
            const jpgPath = path.join(outputDir, `converted-${Date.now()}.jpg`);
            await toJpg(filePath, jpgPath);
            await sendMessage(From, "Image converted to JPG successfully.");
            delete userRequests[From];
            break;
          case 'jpeg':
            // Convert to JPEG
            const jpegPath = path.join(outputDir, `converted-${Date.now()}.jpeg`);
            await toJpeg(filePath, jpegPath);
            await sendMessage(From, "Image converted to JPEG successfully.");
            delete userRequests[From];
            break;
          case 'png':
            // Convert to PNG
            const pngPath = path.join(outputDir, `converted-${Date.now()}.png`);
            await toPng(filePath, pngPath);
            await sendMessage(From, "Image converted to PNG successfully.");
            delete userRequests[From];
            break;
          case 'webp':
            // Convert to WebP
            const webpPath = path.join(outputDir, `converted-${Date.now()}.webp`);
            await toWebp(filePath, webpPath);
            await sendMessage(From, "Image converted to WebP successfully.");
            delete userRequests[From];
            break;

          // Image Processing
          case 'compress':
            // Compress Image
            const compressedPath = path.join(outputDir, `compressed-${Date.now()}.jpg`);
            await compressImage(filePath, compressedPath);
            await sendMessage(From, "Image compressed successfully.");
            delete userRequests[From];
            break;
          case 'black&white':
            // Convert to Black & White
            const bwPath = path.join(outputDir, `bw-${Date.now()}.jpg`);
            await convertImageToBlackAndWhite(filePath, bwPath);
            await sendMessage(From, "Image converted to Black & White successfully.");
            delete userRequests[From];
            break;

          default:
            await sendMessage(From, "something went wrong...!");
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
