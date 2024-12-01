const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const axios = require('axios');
const twilio = require("twilio")
const { downloadFileFromURL, deleteAllFilesInFolder } = require('./utils/downloader');
const { getList, getUrl } = require('./utils/list.js')
const { performRAGQuery } = require('./utils/llm.js');
const { sendMedia, sendMenu, sendMessage } = require('./utils/twilioMsg.js');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and URL-encoded requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// In-memory store to track file uploads by sender
const userRequests = {};


async function handleAiMode({ From, Body }) {
  try {
    if (Body.toLowerCase() === 'exit') {
      userRequests[From].status = 'fileNamed';
      await sendMessage(From, "AI mode deactivated. Returning to main menu.");
      // sendFileMenu(From);
      sendMenu(From, process.env.RETRIEVE_MENU);
      return;
    }

    const response = await performRAGQuery(
      userRequests[From].filePath,
      Body,
    );
    await sendMessage(From, response);
  } catch (error) {
    console.error("AI Mode Error:", error);
    await sendMessage(From, "An error occurred. Please try again or type 'exit' to return to the main menu.");
  }
}











// Webhook route to handle incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
  try {

    const { From, Body, MediaUrl0 } = req.body;

    if (!Body && !MediaUrl0) {
      return res.status(400).send('Bad Request: Missing message or media URL');
    }


    // Ensure user request exists before any operations
    if (!userRequests[From]) {
      userRequests[From] = { status: 'initial' };
    }

    if (Body) {
      if (userRequests[From].status === 'initial') {
        // Text-only interaction
        if (!MediaUrl0) {
          if (Body.toLowerCase() === "retrieve") {
            userRequests[From].status = "retrieve";
          } else if (Body.toLowerCase() === "manage") {
            userRequests[From].status = "manage";
          } else {
            // Default case: send retrieve menu for any other text
            await sendMenu(From, process.env.RETRIEVE_MENU);
          }
        } else {
          // File upload without previous context
          userRequests[From].status = "idle";
        }
      }
    }

    // Ensure user request still exists and has a status
    if (!userRequests[From] || !userRequests[From].status) {
      userRequests[From] = { status: 'initial' };
    }

    if (userRequests[From].status === 'aiMode') {
      await handleAiMode({ From, Body });
      return res.status(200).send("OK");
    }

    switch (userRequests[From].status) {
      case "initial":
        break;
      case 'retrieve':
        console.log("retrieve called ", From)
        try {
          const data = await getList(From);
          // const data = "list 1\nlist 2"
          await sendMessage(From, data);
          userRequests[From].status = 'awaitingFileName';
          userRequests[From].retrieve = true;
        } catch (error) {
          console.error('Retrieve error:', error);
          await sendMessage(From, "Failed to retrieve list. Please try again.");
          delete userRequests[From];
        }
        break;
      case "manage":
        await sendMessage(From, "upload or forward the file");
        console.log("inside manage so asked to upload a file");
        userRequests[From].status = 'idle';
        break;
      case 'idle':
        if (MediaUrl0) {

          if (req.body.Body) {
            userRequests[From] = { ...req.body, fileName: req.body.Body, status: 'fileNamed' };
            console.log(`Received file from ${From}: ${MediaUrl0}`);
            // sendFileMenu(From);
            sendMenu(From, process.env.FILE_MENU)
          } else {
            userRequests[From] = { ...req.body, status: 'awaitingFileName' };
            console.log(`Received file from ${From}: ${MediaUrl0}`);
            await sendMessage(From, "Please provide a name for the uploaded file.");
          }
        } else {
          // const reply = await replyAsABotToThisUserQuery(Body);
          // await sendMessage(From, reply);
          await sendMessage(From, "Please send a file and then choose an option from the menu.");

        }
        break;
      case 'awaitingFileName':
        if (Body) {
          userRequests[From].fileName = Body;
          userRequests[From].status = 'fileNamed';
          console.log(`File named by ${From}: ${Body}`);
          if (userRequests[From].retrieve) {
            const s3_url = await getUrl(From, userRequests[From].fileName);
            if (s3_url) {
              sendMedia(From, s3_url, userRequests[From].fileName);
            }
            else {
              await sendMessage(From, "cant find the file you are looking for!");
              await sendMenu(From, process.env.RETRIEVE_MENU);
            }
            delete userRequests[From];

          } else {
            delete userRequests[From];
            sendMenu(From, process.env.FILE_MENU);
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


          case "ai":
            const type = userRequests[From].MediaContentType0 == "application/pdf"
            if (type) {
              console.log("before conversion")
              const url = userRequests[From].MediaUrl0;
              const name = userRequests[From].fileName
              deleteAllFilesInFolder(path.join(__dirname, "downloads"));
              const filePath = await downloadFileFromURL(url, name)
              userRequests[From].filePath = filePath;
              console.log("file path for ai : ", filePath)
              userRequests[From].status = 'aiMode';
              await sendMessage(From, "AI mode activated. You can now ask questions about your document.");
            }
            else {
              await sendMessage(From, "please uplaod a pdf document to use this mode.");
            }
            break;

          case 'aiMode':
            try {
              // Check for exit command
              if (Body.toLowerCase() === 'exit') {
                await sendMessage(From, "AI mode deactivated. Returning to main menu.");
                userRequests[From].status = 'fileNamed';
                delete userRequests[From];
                break;
              }

              // Perform RAG query
              const ragResponse = await performRAGQuery(
                userRequests[From].filePath,
                Body,
              );

              // Send response to user
              await sendMessage(From, ragResponse);
            } catch (error) {
              console.error('RAG Query Error:', error);
              delete userRequests[From];
              await sendMessage(From, "Sorry, there was an error processing your query. Please try again or type 'exit' to return to the main menu.");
            }
            break;



          case 'convert':
            console.log("File type is:", userRequests[From].MediaContentType0);
            // downloads the file for conversion
            console.log("before conversion")
            const url = userRequests[From].MediaUrl0;
            const name = userRequests[From].fileName
            // deleteAllFilesInFolder(path.join(__dirname, "downloads"));
            // const filePath = await downloadFileFromURL(url, name)
            // userRequests[From].filePath = filePath;
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
            try {
              const body = {
                url: userRequests[From].MediaUrl0,
                authHeader: process.env.TWILIO_HEADER,
                filename: userRequests[From].fileName,
                operation: 'docx',
                phone: From
              };

              axios.post(process.env.PDF_URL, body)
                .then((response) => {
                  console.log('Script called successfully:', response.data);
                })
                .catch((error) => {
                  console.error('Error calling the script:', error.response?.data || error.message);
                });


            } catch (error) {
              console.error('File upload failed:', error);
            }
            delete userRequests[From];
            break;
          case 'text':
            try {
              const body = {
                url: userRequests[From].MediaUrl0,
                authHeader: process.env.TWILIO_HEADER,
                filename: userRequests[From].fileName,
                operation: 'text',
                phone: From
              };

              axios.post(process.env.PDF_URL, body)
                .then((response) => {
                  console.log('Script called successfully:', response.data);
                })
                .catch((error) => {
                  console.error('Error calling the script:', error.response?.data || error.message);
                });


            } catch (error) {
              console.error('File upload failed:', error);
            }
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
            try {
              const body = {
                url: userRequests[From].MediaUrl0,
                authHeader: process.env.TWILIO_HEADER,
                filename: userRequests[From].fileName,
                format: 'pdf',
                tp: From
              };
              axios.post(process.env.DOC_URL, body)
                .then((response) => {
                  console.log('Script called successfully:', response.data);
                })
                .catch((error) => {
                  console.error('Error calling the script:', error.response?.data || error.message);
                });
            } catch (error) {
              console.error('File upload failed:', error);
            }
            delete userRequests[From];
            break;

          case 'text':
            try {
              const body = {
                url: userRequests[From].MediaUrl0,
                authHeader: process.env.TWILIO_HEADER,
                filename: userRequests[From].fileName,
                format: 'txt',
                tp: From
              };
              axios.post(process.env.DOC_URL, body)
                .then((response) => {
                  console.log('Script called successfully:', response.data);
                })
                .catch((error) => {
                  console.error('Error calling the script:', error.response?.data || error.message);
                });
            } catch (error) {
              console.error('File upload failed:', error);
            }
            break;

          case 'html':
            // Convert the DOCX to HTML
            try {
              const body = {
                url: userRequests[From].MediaUrl0,
                authHeader: process.env.TWILIO_HEADER,
                filename: userRequests[From].fileName,
                format: 'html',
                tp: From
              };
              axios.post(process.env.DOC_URL, body)
                .then((response) => {
                  console.log('Script called successfully:', response.data);
                })
                .catch((error) => {
                  console.error('Error calling the script:', error.response?.data || error.message);
                });
            } catch (error) {
              console.error('File upload failed:', error);
            }
            delete userRequests[From];
            break;

          // case 'markdown':
          //   // Convert the DOCX to Markdown
          //   inputPath = userRequests[From].filePath;
          //   outputPath = userRequests[From].filePath.replace('.docx', '.md')
          //   await docxToMarkdown(inputPath, outputPath);
          //   try {
          //     const fileUrl = await uploadFileToS3(outputPath); // Upload the file and get the URL
          //     console.log('File is available at:', fileUrl); // Use the URL
          //     sendMedia(From, fileUrl, "Word document converted to Markdown successfully.")
          //   } catch (error) {
          //     console.error('File upload failed:', error);
          //   }
          //   // await sendMessage(From, "Word document converted to MARKDOWN successfully.");
          //   break;

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
            try {
              const body = {
                url: userRequests[From].MediaUrl0,
                authHeader: process.env.TWILIO_HEADER,
                filename: userRequests[From].fileName,
                format: 'jpg',
                phone: From
              };
              axios.post(process.env.IMG_URL, body)
                .then((response) => {
                  console.log('Script called successfully:', response.data);
                })
                .catch((error) => {
                  console.error('Error calling the script:', error.response?.data || error.message);
                });
            } catch (error) {
              console.error('File upload failed:', error);
            }
            delete userRequests[From];
            break;
          case 'jpeg':
            try {
              const body = {
                url: userRequests[From].MediaUrl0,
                authHeader: process.env.TWILIO_HEADER,
                filename: userRequests[From].fileName,
                format: 'jpeg',
                phone: From
              };
              axios.post(process.env.IMG_URL, body)
                .then((response) => {
                  console.log('Script called successfully:', response.data);
                })
                .catch((error) => {
                  console.error('Error calling the script:', error.response?.data || error.message);
                });
            } catch (error) {
              console.error('File upload failed:', error);
            }
            delete userRequests[From];
            break;
          case 'png':
            try {
              const body = {
                url: userRequests[From].MediaUrl0,
                authHeader: process.env.TWILIO_HEADER,
                filename: userRequests[From].fileName,
                format: 'png',
                phone: From
              };
              axios.post(process.env.IMG_URL, body)
                .then((response) => {
                  console.log('Script called successfully:', response.data);
                })
                .catch((error) => {
                  console.error('Error calling the script:', error.response?.data || error.message);
                });
            } catch (error) {
              console.error('File upload failed:', error);
            }
            delete userRequests[From];
            break;
          case 'webp':
            try {
              const body = {
                url: userRequests[From].MediaUrl0,
                authHeader: process.env.TWILIO_HEADER,
                filename: userRequests[From].fileName,
                format: 'webp',
                phone: From
              };
              axios.post(process.env.IMG_URL, body)
                .then((response) => {
                  console.log('Script called successfully:', response.data);
                })
                .catch((error) => {
                  console.error('Error calling the script:', error.response?.data || error.message);
                });
            } catch (error) {
              console.error('File upload failed:', error);
            }
            delete userRequests[From];
            break;

          // // Image Processing
          // case 'compress':
          //   // Compress Image
          //   const compressedPath = path.join(outputDir, `compressed-${Date.now()}.jpg`);
          //   await compressImage(filePath, compressedPath);
          //   try {
          //     const fileUrl = await uploadFileToS3(compressedPath); // Upload the file and get the URL
          //     console.log('File is available at:', fileUrl); // Use the URL
          //     sendMedia(From, fileUrl, "Image compressed successfully.")
          //   } catch (error) {
          //     console.error('File upload failed:', error);
          //   }
          //   // await sendMessage(From, "Image compressed successfully.");
          //   delete userRequests[From];
          //   break;
          // case 'black&white':
          //   // Convert to Black & White
          //   const bwPath = path.join(outputDir, `bw-${Date.now()}.jpg`);
          //   await convertImageToBlackAndWhite(filePath, bwPath);
          //   try {
          //     const fileUrl = await uploadFileToS3(bwPath); // Upload the file and get the URL
          //     console.log('File is available at:', fileUrl); // Use the URL
          //     sendMedia(From, fileUrl, "Image converted to Black & White successfully.")
          //   } catch (error) {
          //     console.error('File upload failed:', error);
          //   }
          //   // await sendMessage(From, "Image converted to Black & White successfully.");
          //   delete userRequests[From];
          //   break;

          default:
            await sendMessage(From, "something went wrong...!");
            break;
        }
        break;
      default:
        console.log("status : ", userRequests[From].status)
        await sendMessage(From, `Unexpected state. Please try again. ${userRequests[From].status}`);
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






