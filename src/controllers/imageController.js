const fs = require('fs').promises;
const asyncHandler = require('../middlewares/asyncHandler');
const { proxyImage } = require('../utils/helpers');
const path = require('path');

// GET /image
exports.imageProxy = asyncHandler(async (req, res) => {
  const { url } = req.query;
  await proxyImage(url, res);
});


exports.listImages = asyncHandler(async (req, res) => {
    const imagesDir = path.join(__dirname, '..', '..', 'public', 'img', 'app');
    const files = await fs.readdir(imagesDir);
    const images = files.filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));
    res.json(images);
});

exports.serveImage = asyncHandler(async (req, res) => {
    const { imageName } = req.params;
    const imagesDir = path.join(__dirname, '..', '..', 'public', 'img', 'app');
    const imagePath = path.join(imagesDir, imageName);
    await fs.access(imagePath); // lanzará si no existe
    res.sendFile(imagePath);
});
