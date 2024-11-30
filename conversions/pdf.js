const fs = require('fs');
const pdfParse = require('pdf-parse');
const { Document, Packer, Paragraph } = require('docx');
const PDFImage = require('pdf-image').PDFImage; // For extracting images

// Function to extract text from PDF
async function convertTextFromPDF(pdfPath, textOutputPath) {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const { text } = await pdfParse(pdfBuffer);

    fs.writeFileSync(textOutputPath, text);
    console.log(`Extracted text saved to: ${textOutputPath}`);
    return text;
}

// Function to extract images from PDF


// Function to convert PDF to DOCX
async function convertPDFToDOCX(pdfPath, docxOutputPath) {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const { text } = await pdfParse(pdfBuffer);

    const paragraphs = text.split('\n').map((line) => new Paragraph(line.trim()));
    const doc = new Document({
        sections: [{ children: paragraphs }],
    });

    const docxBuffer = await Packer.toBuffer(doc);
    fs.writeFileSync(docxOutputPath, docxBuffer);
    console.log(`PDF converted to DOCX and saved to: ${docxOutputPath}`);
}

module.exports={convertPDFToDOCX,convertTextFromPDF}
