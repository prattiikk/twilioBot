const fs = require('fs');
const mammoth = require('mammoth');
const PDFDocument = require('pdfkit');
const { JSDOM } = require('jsdom');

// Function to convert docx to pdf
async function docxToPdf(docxPath, pdfPath) {
    const docxBuffer = fs.readFileSync(docxPath);
    const { value: text } = await mammoth.extractRawText({ buffer: docxBuffer });

    const pdfDoc = new PDFDocument();
    pdfDoc.pipe(fs.createWriteStream(pdfPath));
    pdfDoc.font('Helvetica').fontSize(12).text(text);
    pdfDoc.end();
}

// Function to convert docx to plain text
async function docxToTxt(docxPath, txtPath) {
    const docxBuffer = fs.readFileSync(docxPath);
    const { value: text } = await mammoth.extractRawText({ buffer: docxBuffer });

    fs.writeFileSync(txtPath, text);
    console.log(`File saved as plain text: ${txtPath}`);
}

// Function to convert docx to HTML
async function docxToHtml(docxPath, htmlPath) {
    const docxBuffer = fs.readFileSync(docxPath);
    const { value: html } = await mammoth.convertToHtml({ buffer: docxBuffer });

    fs.writeFileSync(htmlPath, html);
    console.log(`File saved as HTML: ${htmlPath}`);
}

// Function to convert docx to Markdown
async function docxToMarkdown(docxPath, mdPath) {
    const docxBuffer = fs.readFileSync(docxPath);
    const { value: text } = await mammoth.extractRawText({ buffer: docxBuffer });

    // More sophisticated Markdown conversion
    const markdown = text
        .split('\n')
        .map((line) => {
            // Remove leading/trailing whitespace
            line = line.trim();

            // Skip empty lines
            if (!line) return '';

            // Detect headings (you can adjust the logic as needed)
            if (line.match(/^#{1,6}\s/)) {
                return line; // Keep existing headings
            }

            // Detect lists (you might want to add more sophisticated list detection)
            if (line.match(/^-\s/)) {
                return line; // Keep existing lists
            }

            // Convert other lines to paragraphs
            return line.startsWith('- ') ? line : `${line}\n`;
        })
        .filter(line => line !== '') // Remove empty lines
        .join('\n');

    fs.writeFileSync(mdPath, markdown);
    console.log(`File saved as Markdown: ${mdPath}`);
}


module.exports = { docxToHtml, docxToMarkdown, docxToPdf, docxToTxt }