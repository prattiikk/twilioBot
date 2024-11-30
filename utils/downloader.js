const axios = require("axios");
const path = require('path');
const fs = require("fs");

// Function to download the file from a given URL (e.g., from Twilio)
const downloadFileFromURL = async (fileUrl, filename) => {
    const authHeader = 'ACe1b2a9f5178e94e89f11a1ba5f0aedf2:6082592c2ca385580e3e7f88d0a06db7';

    return new Promise(async (resolve, reject) => {
        try {
            // Ensure the 'downloads' directory exists outside the current folder
            const downloadsDir = path.join(__dirname, '..', 'downloads'); // Point to ../downloads
            if (!fs.existsSync(downloadsDir)) {
                fs.mkdirSync(downloadsDir, { recursive: true }); // Create the directory if it doesn't exist
            }

            // Send request to get the file and the headers to determine the content type
            const response = await axios.get(fileUrl, {
                responseType: 'stream', // This allows us to handle large files efficiently
                headers: {
                    Authorization: `Basic ${Buffer.from(authHeader).toString('base64')}`, // Include the authorization header
                },
            });

            // Determine the file extension based on the Content-Type header
            const contentType = response.headers['content-type'];

            // Map content-type to file extensions
            const mimeTypeToExtension = {
                'image/jpeg': '.jpg',
                'image/png': '.png',
                'image/webp': '.webp',
                'image/gif': '.gif',
                'application/pdf': '.pdf',
                'application/zip': '.zip',
                'audio/mpeg': '.mp3',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
                'application/vnd.ms-excel': '.xls',
                'application/vnd.ms-powerpoint': '.ppt',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
                'text/plain': '.txt',
                'application/rtf': '.rtf',
                'application/json': '.json',
                // Add more MIME types and extensions as needed
            };

            // Retrieve the extension based on the content type, default to .bin if unknown
            const fileExtension = mimeTypeToExtension[contentType] || '.bin';

            const finalFileName = filename + fileExtension; // Add the extension to the filename

            // Full path to save the file locally in ../downloads
            const tempFilePath = path.join(downloadsDir, finalFileName);

            const writer = fs.createWriteStream(tempFilePath);

            response.data.pipe(writer); // Stream the data to a local file

            // Wait for the file to be fully written
            writer.on('finish', () => {
                console.log(`File downloaded successfully to ${tempFilePath}`);
                resolve(tempFilePath); // Return the path of the downloaded file
            });

            writer.on('error', (err) => {
                console.error('Error writing file:', err);
                reject(err); // Reject the promise if there is an error
            });
        } catch (error) {
            console.error('Error downloading the file:', error);
            reject(error); // Reject the promise if there is a download error
        }
    });
};

// Function to delete all files in a folder
function deleteAllFilesInFolder(folderPath) {
    // Check if the folder exists
    if (fs.existsSync(folderPath)) {
        // Read all files and directories in the folder
        const files = fs.readdirSync(folderPath);

        // Iterate over each file and delete it
        files.forEach(file => {
            const filePath = path.join(folderPath, file);
            const stat = fs.statSync(filePath);

            // If the file is a directory, recursively delete it
            if (stat.isDirectory()) {
                deleteAllFilesInFolder(filePath);  // Recursive call to delete subdirectories
                fs.rmdirSync(filePath);  // Remove the empty directory
            } else {
                fs.unlinkSync(filePath);  // Delete the file
            }
        });

        console.log(`All files in ${folderPath} have been deleted.`);
    } else {
        console.log(`Folder ${folderPath} does not exist.`);
    }
}

module.exports = { downloadFileFromURL, deleteAllFilesInFolder };
