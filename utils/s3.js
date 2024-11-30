const axios = require('axios');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

// Initialize the S3 service object
const s3 = new AWS.S3({
    accessKeyId: process.env.S3_ACCESS_KEY_ID, // Use your IAM access key (recommend using environment variables for sensitive info)
    secretAccessKey: process.env.S3_ACCESS_KEY_SECRET, // Use your IAM secret key (recommend using environment variables for sensitive info)
    region: process.env.S3_REGION, // Specify your AWS region
});

// Function to upload the downloaded file to S3 and return the file URL
const uploadFileToS3 = (filePath) => {
    return new Promise((resolve, reject) => {
        const fileStream = fs.createReadStream(filePath); // Create a stream from the file
        const fileName = path.basename(filePath); // Extract the file name

        const uploadParams = {
            Bucket: 'kestra-bot-project', // Replace with your S3 bucket name
            Key: `trash/${fileName}`, // Specify the folder/path in the bucket
            Body: fileStream, // The file stream to upload
        };

        s3.upload(uploadParams, (err, data) => {
            if (err) {
                console.error('Error uploading file:', err);
                reject(err); // Reject the promise if there is an error
            } else {
                console.log('File uploaded successfully');
                console.log('File URL:', data.Location); // The public URL of the uploaded file
                resolve(data.Location); // Resolve the promise with the file URL

                // // Optionally, delete the local temporary file after upload
                // fs.unlink(filePath, (unlinkErr) => {
                //     if (unlinkErr) {
                //         console.error('Error deleting temp file:', unlinkErr);
                //     } else {
                //         console.log('Temporary file deleted successfully');
                //     }
                // });
            }
        });
    });
};





module.exports = { uploadFileToS3 };
