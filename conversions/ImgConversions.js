const sharp = require('sharp');
const fs = require('fs');

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

    // Perform conversion
    await sharp(inputPath)
      .toFormat(format)
      .toFile(outputPath);

    console.log(`Image successfully converted to ${format} and saved at ${outputPath}`);
  } catch (error) {
    console.error(`Error converting image: ${error.message}`);
  }
}

/**
 * Converts an image to JPG.
 * @param {string} inputPath - The path of the input image file.
 * @param {string} outputPath - The path to save the JPG image.
 */
async function toJpg(inputPath, outputPath) {
  await convertImage(inputPath, outputPath, 'jpg');
}

/**
 * Converts an image to JPEG.
 * @param {string} inputPath - The path of the input image file.
 * @param {string} outputPath - The path to save the JPEG image.
 */
async function toJpeg(inputPath, outputPath) {
  await convertImage(inputPath, outputPath, 'jpeg');
}

/**
 * Converts an image to PNG.
 * @param {string} inputPath - The path of the input image file.
 * @param {string} outputPath - The path to save the PNG image.
 */
async function toPng(inputPath, outputPath) {
  await convertImage(inputPath, outputPath, 'png');
}

/**
 * Converts an image to WebP.
 * @param {string} inputPath - The path of the input image file.
 * @param {string} outputPath - The path to save the WebP image.
 */
async function toWebp(inputPath, outputPath) {
  await convertImage(inputPath, outputPath, 'webp');
}

// Example Usage:
(async () => {
  // Test conversion
  const inputFilePath = 'input.png'; // Path to your input image
  const outputDir = './output/'; // Output directory

  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  await toJpg(inputFilePath, `${outputDir}output.jpg`);
  await toJpeg(inputFilePath, `${outputDir}output.jpeg`);
  await toPng(inputFilePath, `${outputDir}output.png`);
  await toWebp(inputFilePath, `${outputDir}output.webp`);
})();
