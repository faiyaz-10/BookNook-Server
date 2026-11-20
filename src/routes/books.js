import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const categories = ['Fiction', 'Science', 'History', 'Kids', 'Others'];

const validId = (id) => typeof id === 'string'
  && ObjectId.isValid(id)
  && String(new ObjectId(id)) === id;

function positiveCopyCount(value, fallback = 1) {
  return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

function availableCopyCount(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function normalizeCopies(book) {
  if (!book) return book;
  const totalCopies = positiveCopyCount(book.totalCopies, positiveCopyCount(book.availableCopies, 1));
  const availableCopies = Math.min(
    totalCopies,
    availableCopyCount(book.availableCopies, totalCopies),
  );
  return { ...book, totalCopies, availableCopies };
}

function validateBook(body, { creating = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ['A valid book object is required'];
  }

  const errors = [];
  const limits = { title: 120, author: 120, image: 2048, description: 1500 };

  for (const [field, maxLength] of Object.entries(limits)) {
    if (typeof body[field] !== 'string' || !body[field].trim()) {
      errors.push(`${field} is required`);
    } else if (body[field].trim().length > maxLength) {
      errors.push(`${field} must be ${maxLength} characters or fewer`);
    }
  }

  if (!categories.includes(body.category)) {
    errors.push('Invalid book category');
  }

  if (typeof body.image === 'string' && body.image.trim()) {
    try {
      const imageUrl = new URL(body.image.trim());
      if (!['http:', 'https:'].includes(imageUrl.protocol)) errors.push('Image must be an HTTP(S) URL');
    } catch {
      errors.push('Image must be a valid URL');
    }
  }

  if (creating && (!Number.isSafeInteger(body.totalCopies) || body.totalCopies < 1)) {
    errors.push('Total copies must be a positive whole number');
  } else if (
    !creating
    && body.totalCopies !== undefined
    && (!Number.isSafeInteger(body.totalCopies) || body.totalCopies < 1)
  ) {
    errors.push('Total copies must be a positive whole number');
  }

  return errors;
}

router.get('/', async (req, res, next) => {
  try {
    const filter = req.query.mine === 'true' ? { userEmail: req.user.email } : {};
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 0;
    const projection = req.query.mine === 'true' ? {} : { userEmail: 0 };
    let cursor = getDB().collection('books').find(filter, { projection }).sort({ createdAt: -1 });
    if (limit) cursor = cursor.limit(limit);
    const books = (await cursor.toArray()).map(normalizeCopies);
    res.json({ books });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid book ID' });
    const book = await getDB().collection('books').findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { userEmail: 0 } },
    );
    if (!book) return res.status(404).json({ message: 'Book not found' });
    res.json({ book: normalizeCopies(book) });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const errors = validateBook(req.body, { creating: true });
    if (errors.length) return res.status(400).json({ message: errors.join(', ') });

    const document = {
      title: req.body.title.trim(),
      author: req.body.author.trim(),
      category: req.body.category,
      image: req.body.image.trim(),
      description: req.body.description.trim(),
      userName: req.user.name || req.user.email.split('@')[0],
      userEmail: req.user.email,
      totalCopies: req.body.totalCopies,
      availableCopies: req.body.totalCopies,
      createdAt: new Date(),
    };
    const result = await getDB().collection('books').insertOne(document);
    res.status(201).json({ message: 'Book created', book: { ...document, _id: result.insertedId } });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid book ID' });
    const errors = validateBook(req.body);
    if (errors.length) return res.status(400).json({ message: errors.join(', ') });

    const id = new ObjectId(req.params.id);
    const books = getDB().collection('books');
    const existingRaw = await books.findOne({ _id: id });
    const existing = normalizeCopies(existingRaw);
    if (!existing) return res.status(404).json({ message: 'Book not found' });
    if (existing.userEmail !== req.user.email) {
      return res.status(403).json({ message: 'You can only edit books you added' });
    }

    const currentlyBorrowed = existing.totalCopies - existing.availableCopies;
    const totalCopies = req.body.totalCopies ?? existing.totalCopies;
    if (totalCopies < currentlyBorrowed) {
      return res.status(400).json({ message: `At least ${currentlyBorrowed} copies are currently borrowed` });
    }

    const update = {
      title: req.body.title.trim(),
      author: req.body.author.trim(),
      category: req.body.category,
      image: req.body.image.trim(),
      description: req.body.description.trim(),
      totalCopies,
      availableCopies: totalCopies - currentlyBorrowed,
      updatedAt: new Date(),
    };
    await books.updateOne(
      { _id: id, $or: [{ totalCopies: { $exists: false } }, { availableCopies: { $exists: false } }] },
      { $set: { totalCopies: existing.totalCopies, availableCopies: existing.availableCopies } },
    );
    const result = await books.updateOne(
      {
        _id: id,
        userEmail: req.user.email,
        totalCopies: existing.totalCopies,
        availableCopies: existing.availableCopies,
      },
      { $set: update },
    );
    if (!result.matchedCount) {
      return res.status(409).json({ message: 'Book availability changed. Reload and try again.' });
    }
    res.json({ message: 'Book updated', book: { ...existing, ...update } });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid book ID' });

    const id = new ObjectId(req.params.id);
    const books = getDB().collection('books');
    const bookRaw = await books.findOne({ _id: id });
    const book = normalizeCopies(bookRaw);
    if (!book) return res.status(404).json({ message: 'Book not found' });
    if (book.userEmail !== req.user.email) {
      return res.status(403).json({ message: 'You can only delete books you added' });
    }

    const activeBorrows = await getDB().collection('borrows').countDocuments({
      bookId: req.params.id,
      status: 'active',
    });
    if (activeBorrows > 0) {
      return res.status(409).json({ message: 'Books with active borrows cannot be deleted' });
    }

    await books.updateOne(
      { _id: id, $or: [{ totalCopies: { $exists: false } }, { availableCopies: { $exists: false } }] },
      { $set: { totalCopies: book.totalCopies, availableCopies: book.availableCopies } },
    );
    const result = await books.deleteOne({
      _id: id,
      userEmail: req.user.email,
      totalCopies: book.totalCopies,
      availableCopies: book.availableCopies,
    });
    if (!result.deletedCount) {
      return res.status(409).json({ message: 'Books with active borrows cannot be deleted' });
    }
    res.json({ message: 'Book deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
