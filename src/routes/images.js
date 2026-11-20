import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const maxImageSize = 5 * 1024 * 1024;
const parseImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxImageSize, files: 1 },
  fileFilter(req, file, callback) {
    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Choose a valid image file.'));
      return;
    }
    callback(null, true);
  },
}).single('image');

function handleImageUpload(req, res, next) {
  parseImage(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        message: tooLarge ? 'Choose an image that is 5 MB or smaller.' : 'Invalid image upload.',
      });
    }
    return res.status(400).json({ message: error.message });
  });
}

router.post('/', requireAuth, handleImageUpload, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Choose an image to upload.' });
    }
    if (!process.env.IMGBB_API_KEY) {
      return res.status(503).json({
        message: 'Image uploads are not configured. Set IMGBB_API_KEY in the backend environment.',
      });
    }

    const formData = new FormData();
    formData.append(
      'image',
      new Blob([req.file.buffer], { type: req.file.mimetype }),
      'book-cover',
    );

    let response;
    try {
      response = await fetch(
        `https://api.imgbb.com/1/upload?key=${encodeURIComponent(process.env.IMGBB_API_KEY)}`,
        { method: 'POST', body: formData, signal: AbortSignal.timeout(30_000) },
      );
    } catch (error) {
      console.error('ImgBB upload request failed:', error);
      return res.status(502).json({ message: 'The image hosting service could not be reached.' });
    }

    let result;
    try {
      result = await response.json();
    } catch (error) {
      console.error('ImgBB returned an invalid response:', error);
      return res.status(502).json({ message: 'The image hosting service returned an invalid response.' });
    }

    const image = result?.data?.display_url;
    if (!response.ok || !result?.success || typeof image !== 'string') {
      return res.status(502).json({ message: 'The image hosting service rejected the upload.' });
    }
    return res.json({ image });
  } catch (error) {
    return next(error);
  }
});

export default router;
