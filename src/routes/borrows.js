import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB, getMongoClient, supportsMongoTransactions } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

class ReturnAvailabilityError extends Error {}

function returnReservationFilter(borrowId, userEmail, expectedReturnedQuantity, returnQuantity) {
  return {
    _id: borrowId,
    userEmail,
    status: 'active',
    $expr: {
      $and: [
        { $eq: [{ $ifNull: ['$returnedQuantity', 0] }, expectedReturnedQuantity] },
        {
          $lte: [
            { $add: [expectedReturnedQuantity, returnQuantity] },
            { $ifNull: ['$quantity', 1] },
          ],
        },
      ],
    },
  };
}

function returnReservationUpdate(returnQuantity) {
  return [{
    $set: {
      returnedQuantity: { $add: [{ $ifNull: ['$returnedQuantity', 0] }, returnQuantity] },
    },
  }];
}

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { bookId } = req.body;
    const quantity = req.body.quantity === undefined ? 1 : req.body.quantity;
    if (typeof bookId !== 'string' || !ObjectId.isValid(bookId) || String(new ObjectId(bookId)) !== bookId) {
      return res.status(400).json({ message: 'A valid book ID is required' });
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: 'Quantity must be a positive whole number' });
    }

    const db = getDB();
    const books = db.collection('books');
    const borrows = db.collection('borrows');
    const id = new ObjectId(bookId);
    const book = await books.findOne({ _id: id });
    if (!book) return res.status(404).json({ message: 'Book not found' });

    const duplicate = await borrows.findOne({
      bookId,
      userEmail: req.user.email,
      status: 'active',
    });
    if (duplicate) {
      return res.status(409).json({ message: 'You have already borrowed this book. Return it before borrowing again.' });
    }

    const decrement = await books.findOneAndUpdate(
      { _id: id, availableCopies: { $gte: quantity } },
      { $inc: { availableCopies: -quantity } },
      { returnDocument: 'after' },
    );
    if (!decrement) {
      const currentBook = await books.findOne({ _id: id }, { projection: { availableCopies: 1 } });
      const availableCopies = currentBook?.availableCopies ?? 0;
      const message = availableCopies
        ? `Only ${availableCopies} ${availableCopies === 1 ? 'copy is' : 'copies are'} currently available`
        : 'This book is currently not available';
      return res.status(409).json({ message });
    }

    const borrowDate = new Date();
    const returnDate = new Date(borrowDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const document = {
      bookId,
      bookTitle: book.title,
      bookAuthor: book.author,
      bookImage: book.image,
      userEmail: req.user.email,
      quantity,
      returnedQuantity: 0,
      status: 'active',
      borrowDate,
      returnDate,
    };

    try {
      const inserted = await borrows.insertOne(document);
      return res.status(201).json({
        message: 'Book borrowed',
        borrow: { ...document, _id: inserted.insertedId },
      });
    } catch (error) {
      await books.updateOne({ _id: id }, { $inc: { availableCopies: quantity } });
      if (error?.code === 11000) {
        return res.status(409).json({ message: 'You have already borrowed this book. Return it before borrowing again.' });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const borrows = await getDB()
      .collection('borrows')
      .find({ userEmail: req.user.email, status: 'active' })
      .sort({ borrowDate: -1 })
      .toArray();
    const bookIds = [...new Set(borrows
      .map((borrow) => borrow.bookId)
      .filter((bookId) => typeof bookId === 'string' && ObjectId.isValid(bookId))
      .map((bookId) => new ObjectId(bookId).toHexString()))]
      .map((bookId) => new ObjectId(bookId));
    const bookAuthors = bookIds.length
      ? new Map((await getDB().collection('books')
        .find({ _id: { $in: bookIds } }, { projection: { author: 1 } })
        .toArray())
        .map((book) => [book._id.toHexString(), book.author]))
      : new Map();
    res.json({
      borrows: borrows.flatMap((borrow) => {
        const quantity = Number.isSafeInteger(borrow.quantity) && borrow.quantity > 0 ? borrow.quantity : 1;
        const returnedQuantity = Number.isSafeInteger(borrow.returnedQuantity)
          ? Math.max(0, Math.min(quantity, borrow.returnedQuantity))
          : 0;
        const remainingQuantity = quantity - returnedQuantity;
        return remainingQuantity > 0 ? [{
          ...borrow,
          bookAuthor: borrow.bookAuthor || bookAuthors.get(borrow.bookId) || '',
          quantity: remainingQuantity,
        }] : [];
      }),
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id) || String(new ObjectId(req.params.id)) !== req.params.id) {
      return res.status(400).json({ message: 'Invalid borrow ID' });
    }
    const requestedReturnedQuantity = req.body?.expectedReturnedQuantity;
    if (
      requestedReturnedQuantity !== undefined
      && (!Number.isSafeInteger(requestedReturnedQuantity) || requestedReturnedQuantity < 0)
    ) {
      return res.status(400).json({ message: 'A valid expected returned-copy count is required' });
    }

    const db = getDB();
    const borrows = db.collection('borrows');
    const borrowId = new ObjectId(req.params.id);
    const borrow = await borrows.findOne({ _id: borrowId });
    if (!borrow) return res.status(404).json({ message: 'Borrow record not found' });
    if (borrow.userEmail !== req.user.email) {
      return res.status(403).json({ message: 'You can only return books that you borrowed' });
    }
    if (borrow.status !== 'active') {
      return res.status(409).json({ message: 'This borrow was already returned' });
    }

    const quantity = Number.isSafeInteger(borrow.quantity) && borrow.quantity > 0 ? borrow.quantity : 1;
    const returnedQuantity = Number.isSafeInteger(borrow.returnedQuantity)
      ? Math.max(0, borrow.returnedQuantity)
      : 0;
    const expectedReturnedQuantity = requestedReturnedQuantity ?? returnedQuantity;
    const returnQuantity = req.body?.quantity === undefined ? 1 : req.body.quantity;
    if (!Number.isSafeInteger(returnQuantity) || returnQuantity < 1) {
      return res.status(400).json({ message: 'Return quantity must be a positive whole number' });
    }
    if (returnQuantity > quantity - returnedQuantity) {
      return res.status(400).json({ message: 'Return quantity cannot exceed the copies currently borrowed' });
    }
    if (returnedQuantity >= quantity) {
      await borrows.updateOne(
        { _id: borrowId, status: 'active' },
        { $set: { status: 'returned', returnedAt: new Date() } },
      );
      return res.status(409).json({ message: 'This borrow was already returned' });
    }
    if (!ObjectId.isValid(borrow.bookId)) {
      return res.status(409).json({ message: 'This borrow record has an invalid book reference' });
    }

    if (supportsMongoTransactions()) {
      const session = getMongoClient().startSession();
      let completedReturn;
      let duplicateReturn = false;
      try {
        await session.withTransaction(async () => {
          completedReturn = undefined;
          duplicateReturn = false;
          const reserved = await borrows.findOneAndUpdate(
            returnReservationFilter(borrowId, req.user.email, expectedReturnedQuantity, returnQuantity),
            returnReservationUpdate(returnQuantity),
            { returnDocument: 'after', session },
          );
          if (!reserved) {
            duplicateReturn = true;
            return;
          }

          const restored = await db.collection('books').updateOne(
            {
              _id: new ObjectId(borrow.bookId),
              $expr: {
                $lte: [
                  { $add: ['$availableCopies', returnQuantity] },
                  '$totalCopies',
                ],
              },
            },
            { $inc: { availableCopies: returnQuantity } },
            { session },
          );
          if (!restored.modifiedCount) throw new ReturnAvailabilityError();

          await borrows.updateOne(
            {
              _id: borrowId,
              status: 'active',
              $expr: {
                $gte: [
                  { $ifNull: ['$returnedQuantity', 0] },
                  { $ifNull: ['$quantity', 1] },
                ],
              },
            },
            { $set: { status: 'returned', returnedAt: new Date() } },
            { session },
          );

          const latestBorrow = await borrows.findOne({ _id: borrowId }, { session });
          const latestBook = await db.collection('books').findOne(
            { _id: new ObjectId(borrow.bookId) },
            { projection: { availableCopies: 1 }, session },
          );
          completedReturn = {
            message: 'Copies returned',
            returnedCopies: returnQuantity,
            returnedQuantity: latestBorrow?.returnedQuantity ?? expectedReturnedQuantity + returnQuantity,
            remainingQuantity: Math.max(
              0,
              quantity - (Number.isSafeInteger(latestBorrow?.returnedQuantity) ? latestBorrow.returnedQuantity : 0),
            ),
            book: { _id: borrow.bookId, availableCopies: latestBook?.availableCopies ?? null },
          };
        });
      } catch (error) {
        if (error instanceof ReturnAvailabilityError) {
          return res.status(409).json({ message: 'Book availability could not be restored safely' });
        }
        throw error;
      } finally {
        await session.endSession();
      }

      if (duplicateReturn) {
        return res.status(409).json({ message: 'This copy was already returned or the borrow has changed' });
      }
      return res.json(completedReturn);
    }

    const reserved = await borrows.findOneAndUpdate(
      returnReservationFilter(borrowId, req.user.email, expectedReturnedQuantity, returnQuantity),
      returnReservationUpdate(returnQuantity),
      { returnDocument: 'after' },
    );
    if (!reserved) {
      return res.status(409).json({ message: 'This copy was already returned or the borrow has changed' });
    }

    const restored = await db.collection('books').updateOne(
      {
        _id: new ObjectId(borrow.bookId),
        $expr: {
          $lte: [
            { $add: ['$availableCopies', returnQuantity] },
            '$totalCopies',
          ],
        },
      },
      { $inc: { availableCopies: returnQuantity } },
    );
    if (!restored.modifiedCount) {
      const rolledBack = await borrows.updateOne(
        { _id: borrowId, returnedQuantity: { $gte: returnQuantity } },
        [
          {
            $set: {
              returnedQuantity: {
                $subtract: [{ $ifNull: ['$returnedQuantity', 0] }, returnQuantity],
              },
            },
          },
          {
            $set: {
              status: {
                $cond: [
                  { $lt: ['$returnedQuantity', { $ifNull: ['$quantity', 1] }] },
                  'active',
                  'returned',
                ],
              },
              returnedAt: {
                $cond: [
                  { $lt: ['$returnedQuantity', { $ifNull: ['$quantity', 1] }] },
                  '$$REMOVE',
                  '$returnedAt',
                ],
              },
            },
          },
        ],
      );
      if (!rolledBack.modifiedCount) {
        throw new Error('Could not roll back the borrow return reservation');
      }
      return res.status(409).json({ message: 'Book availability could not be restored safely' });
    }

    await borrows.updateOne(
      {
        _id: borrowId,
        status: 'active',
        $expr: {
          $gte: [
            { $ifNull: ['$returnedQuantity', 0] },
            { $ifNull: ['$quantity', 1] },
          ],
        },
      },
      { $set: { status: 'returned', returnedAt: new Date() } },
    );

    const latestBorrow = await borrows.findOne({ _id: borrowId });
    const remainingQuantity = Math.max(
      0,
      quantity - (Number.isSafeInteger(latestBorrow?.returnedQuantity) ? latestBorrow.returnedQuantity : 0),
    );
    const latestBook = await db.collection('books').findOne(
      { _id: new ObjectId(borrow.bookId) },
      { projection: { availableCopies: 1 } },
    );
    res.json({
      message: 'Copies returned',
      returnedCopies: returnQuantity,
      returnedQuantity: latestBorrow?.returnedQuantity ?? expectedReturnedQuantity + returnQuantity,
      remainingQuantity,
      book: { _id: borrow.bookId, availableCopies: latestBook?.availableCopies ?? null },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
