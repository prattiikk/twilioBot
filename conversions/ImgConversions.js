const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

/**
 * Converts an image to the specified format.
 * @param {string} inputPath - The path of the input image file.
 * @param {string} outputPath - The path to save the converted image.
 * @param {string} format - The desired output format ('jpg', 'jpeg', 'png', 'webp').
 */
async function convertImage(inputPath, outputPath, format) {
    try {
        // Validate format
        const supportedFormats = ['jpg', 'jpeg', 'png', 'webp'];
        if (!supportedFormats.includes(format.toLowerCase())) {
            throw new Error(`Unsupported format. Choose from: ${supportedFormats.join(', ')}`);
        }

        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Perform conversion
        await sharp(inputPath)
            .toFormat(format)
            .toFile(outputPath);

        console.log(`Image successfully converted to ${format} and saved at ${outputPath}`);
        return outputPath;
    } catch (error) {
        console.error(`Error converting image: ${error.message}`);
        throw error;
    }
}

/**
 * Converts an image to JPG.
 * @param {string} inputPath - The path of the input image file.
 * @param {string} outputPath - The path to save the JPG image.
 */
async function toJpg(inputPath, outputPath) {
    return await convertImage(inputPath, outputPath, 'jpg');
}

/**
 * Converts an image to JPEG.
 * @param {string} inputPath - The path of the input image file.
 * @param {string} outputPath - The path to save the JPEG image.
 */
async function toJpeg(inputPath, outputPath) {
    return await convertImage(inputPath, outputPath, 'jpeg');
}

/**
 * Converts an image to PNG.
 * @param {string} inputPath - The path of the input image file.
 * @param {string} outputPath - The path to save the PNG image.
 */
async function toPng(inputPath, outputPath) {
    return await convertImage(inputPath, outputPath, 'png');
}

/**
 * Converts an image to WebP.
 * @param {string} inputPath - The path of the input image file.
 * @param {string} outputPath - The path to save the WebP image.
 */
async function toWebp(inputPath, outputPath) {
    return await convertImage(inputPath, outputPath, 'webp');
}

/**
 * Convert image to text using OCR
 * @param {string} inputPath - Path to the input image file
 * @param {string} outputPath - Path to save the extracted text
 * @returns {Promise<string>} Extracted text from the image
 */
async function imageToText(inputPath, outputPath = null) {
    try {
        // Perform OCR
        const { data: { text } } = await Tesseract.recognize(
            inputPath,
            'eng',
            { logger: m => console.log(m) }
        );

        // If output path is provided, write text to file
        if (outputPath) {
            fs.writeFileSync(outputPath, text);
            console.log(`Text extracted and saved to: ${outputPath}`);
        }

        return text;
    } catch (error) {
        console.error('Error in OCR:', error);
        throw error;
    }
}

/**
 * Compress image while maintaining quality
 * @param {string} inputPath - Path to the input image file
 * @param {string} outputPath - Path to save the compressed image
 * @param {Object} options - Compression options
 * @returns {Promise<string>} Path to the compressed image
 */
async function compressImage(inputPath, outputPath = null, options = {}) {
    try {
        // If no output path is provided, create one in the same directory
        if (!outputPath) {
            const parsedPath = path.parse(inputPath);
            outputPath = path.join(
                parsedPath.dir,
                `compressed-${parsedPath.base}`
            );
        }

        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Default compression options
        const defaultOptions = {
            quality: 70,  // Reduce quality to 70%
            mozjpeg: true,  // Use mozjpeg for better JPEG compression
        };

        // Merge provided options with defaults
        const compressionOptions = { ...defaultOptions, ...options };

        // Perform compression
        await sharp(inputPath)
            .jpeg(compressionOptions)
            .toFile(outputPath);

        console.log(`Image compressed and saved to: ${outputPath}`);
        return outputPath;
    } catch (error) {
        console.error('Error compressing image:', error);
        throw error;
    }
}

/**
 * Convert image to black and white (grayscale)
 * @param {string} inputPath - Path to the input image file
 * @param {string} outputPath - Path to save the black and white image
 * @returns {Promise<string>} Path to the black and white image
 */
async function convertImageToBlackAndWhite(inputPath, outputPath = null) {
    try {
        // If no output path is provided, create one in the same directory
        if (!outputPath) {
            const parsedPath = path.parse(inputPath);
            outputPath = path.join(
                parsedPath.dir,
                `bw-${parsedPath.base}`
            );
        }

        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Convert to black and white
        await sharp(inputPath)
            .grayscale()
            .toFile(outputPath);

        console.log(`Image converted to black and white and saved to: ${outputPath}`);
        return outputPath;
    } catch (error) {
        console.error('Error converting image to black and white:', error);
        throw error;
    }
}

module.exports = {
    // Format Conversion Functions
    convertImage,
    toJpg,
    toJpeg,
    toPng,
    toWebp,

    // Image Processing Functions
    imageToText,
    compressImage,
    convertImageToBlackAndWhite
};