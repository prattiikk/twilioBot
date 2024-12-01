const twilio = require('twilio');
const dotenv = require("dotenv").config()
// Load Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
    console.error('Missing Twilio credentials. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
    process.exit(1);
}

// Initialize Twilio client
const client = twilio(accountSid, authToken);



// // Function to send the file menu
// function sendFileMenu(to) {
//     try {
//         const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
//         client.messages
//             .create({
//                 from: process.env.TWILIO_NUMBER,
//                 contentSid: "HX1ea54687b0584fa381e842e812bfcb11",
//                 to: formattedTo,
//             })
//             .then((message) => console.log(`Menu sent with SID: ${message.sid}`))
//             .catch((err) => console.error(`Error sending menu: ${err}`));
//     } catch (err) {
//         console.error(`Error in sendFileMenu: ${err.message}`);
//     }
// }



// // Function to send the file menu
// function sendRetrieveMenu(to) {
//     try {
//         const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
//         client.messages
//             .create({
//                 from: process.env.TWILIO_NUMBER,
//                 contentSid: process.env.RETRIEVE_MENU,
//                 to: formattedTo,
//             })
//             .then((message) => console.log(`Menu sent with SID: ${message.sid}`))
//             .catch((err) => console.error(`Error sending menu: ${err}`));
//     } catch (err) {
//         console.error(`Error in sendFileMenu: ${err.message}`);
//     }
// }





function sendMenu(to, MenuCode) {
    try {
        const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        client.messages
            .create({
                from: process.env.TWILIO_NUMBER,
                contentSid: MenuCode,
                to: formattedTo,
            })
            .then((message) => console.log(`Menu sent with SID: ${message.sid}`))
            .catch((err) => console.error(`Error sending menu: ${err}`));
    } catch (err) {
        console.error(`Error in sendFileMenu: ${err.message}`);
    }
}






// Function to send a message
async function sendMessage(to, message) {
    console.log("sendmsg phone : ", to);
    console.log("Concatenated body called", message.length);
    console.log(message);
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



// sends files along with msg
async function sendMedia(to, url, message = "success!") {
    try {
        console.log("url inside sendmedia : ", url);
        const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        const msg = await client.messages.create({
            from: process.env.TWILIO_NUMBER,
            body: message,
            mediaUrl: url,
            to: formattedTo,
        });
        console.log(`Message sent successfully! SID: ${msg.sid}`);
    } catch (err) {
        console.error(`Failed to send message: ${err.message}`);
    }
}


module.exports = { sendMedia, sendMenu, sendMessage }