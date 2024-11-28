const dotenv = require('dotenv');
const { HfInference } = require('@huggingface/inference');
dotenv.config()
async function sendMessage(to, message) { try {
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
    console.log(process.env.HUGGING_FACE_API_KEY)
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
  module.exports = {
    sendMessage,
    sendMediaFile,
    getIntentClassification,
    setReminder,
    searchFile,
    createTodo,
    interpretQuery,
  }; 