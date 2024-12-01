const fs = require('fs');
const pg = require('pg');
const url = require('url');
const dotenv = require("dotenv").config();

const config = {
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: true,
        ca: process.env.DB_CERTIFICATE,
    },
};
async function getUrl(phone_no, fileName) {
    const client = new pg.Client(config);
    try {
        await client.connect();
        const query = `
            SELECT files.original_filename, files.s3_url 
            FROM files 
            JOIN users ON files.user_id = users.user_id 
            WHERE users.phone_number = $1;
        `;
        const result = await client.query(query, [phone_no]);

        // Filter for the specified fileName and return the corresponding s3_url
        const file = result.rows.find(row => row.original_filename === fileName);
        if (file) {
            return file.s3_url; // Return the s3_url if a match is found
        } else {
            return null; // Return null if no match is found
        }
    } catch (err) {
        console.error("Error querying the database:", err);
        throw err;
    } finally {
        await client.end();
    }
}

module.exports = { getUrl };

// async function getList(phone_no) {
//     const client = new pg.Client(config);
//     try {
//         await client.connect();
//         const query = `
//             SELECT original_filename 
//             FROM files 
//             JOIN users ON files.user_id = users.user_id 
//             WHERE users.phone_number = $1;
//         `;
//         const result = await client.query(query, [phone_no]);
//         return result.rows.map(row => row.original_filename);
//     } catch (err) {
//         console.error("Error querying the database:", err);
//         throw err;
//     } finally {
//         await client.end();
//     }
// }

async function getList(phone_no) {
    const client = new pg.Client(config);
    try {
        await client.connect();
        const query = `
            SELECT original_filename 
            FROM files 
            JOIN users ON files.user_id = users.user_id 
            WHERE users.phone_number = $1;
        `;
        const result = await client.query(query, [phone_no]);

        // Format the filenames into a numbered list with new lines
        const fileList = result.rows.map((row, index) => `${index + 1}. ${row.original_filename}`).join('\n');

        // Add instruction at the end
        // return `${fileList}\n\nReply with the file name you want to get back.`;
        return fileList
    } catch (err) {
        console.error("Error querying the database:", err);
        throw err;
    } finally {
        await client.end();
    }
}


module.exports = { getList, getUrl };
