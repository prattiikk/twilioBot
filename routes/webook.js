const express=require('express')
const router=express.Router();
const {interpretQuery} =require('../utils/actions')

router.post('/webhook', async (req, res) => {

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
module.exports=router;