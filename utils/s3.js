const axios = require('axios');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

// S3 service object
const s3 = new AWS.S3({
    accessKeyId: process.env.S3_ACCESS_KEY_ID, 
    secretAccessKey: process.env.S3_ACCESS_KEY_SECRET, 
    region: process.env.S3_REGION, 
});

// uploads file to cloud and return its downloadeble url
const uploadFileToS3 = (filePath) => {
    return new Promise((resolve, reject) => {
        const fileStream = fs.createReadStream(filePath); 
        const fileName = path.basename(filePath); 

        const uploadParams = {
            Bucket: process.env.BUCKET_NAME, 
            Key: `trash/${fileName}`, 
            Body: fileStream, // The file stream to upload
        };

        s3.upload(uploadParams, (err, data) => {
            if (err) {
                console.error('Error uploading file:', err);
                reject(err); // Reject if error
            } else {
                console.log('File uploaded successfully');
                console.log('File URL:', data.Location); 
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
