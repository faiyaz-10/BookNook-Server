import { MongoClient } from 'mongodb';

let client;
let database;
let supportsTransactions = false;

function copyCount(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export async function connectDB() {
  if (database) return database;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is missing');

  client = new MongoClient(uri);
  await client.connect();
  const topology = await client.db('admin').command({ hello: 1 });
  supportsTransactions = Boolean(topology.setName || topology.msg === 'isdbgrid');
  database = client.db(process.env.DB_NAME || 'booknook');

  const books = database.collection('books');
  const legacyBooks = await books.find({
    $or: [
      { totalCopies: { $exists: false } },
      { availableCopies: { $exists: false } },
      { totalCopies: { $type: 'string' } },
      { availableCopies: { $type: 'string' } },
      { totalCopies: { $lt: 1 } },
      { availableCopies: { $lt: 0 } },
      { $expr: { $gt: ['$availableCopies', '$totalCopies'] } },
    ],
  }).toArray();

  for (const book of legacyBooks) {
    const totalCopies = copyCount(book.totalCopies, copyCount(book.availableCopies, 1));
    const availableCopies = copyCount(
      book.availableCopies,
      copyCount(book.totalCopies, totalCopies),
    );
    await books.updateOne(
      { _id: book._id },
      {
        $set: {
          totalCopies,
          availableCopies: Math.min(totalCopies, availableCopies),
        },
      },
    );
  }

  const borrows = database.collection('borrows');
  await borrows.updateMany(
    { status: { $exists: false } },
    { $set: { status: 'active' } },
  );

  await books.createIndex({ createdAt: -1 });
  await books.createIndex({ userEmail: 1 });
  await borrows.createIndex({ returnDate: 1 });

  const borrowIndexes = await borrows.indexes();
  for (const index of borrowIndexes) {
    const isLegacyBorrowIndex = index.unique
      && index.key?.userEmail === 1
      && index.key?.bookId === 1
      && index.name !== 'unique_active_borrow';
    if (isLegacyBorrowIndex) {
      await borrows.dropIndex(index.name);
    }
  }
  await borrows.createIndex(
    { userEmail: 1, bookId: 1 },
    {
      unique: true,
      partialFilterExpression: { status: 'active' },
      name: 'unique_active_borrow',
    },
  );

  console.log(`MongoDB connected: ${database.databaseName}`);
  return database;
}

export function getDB() {
  if (!database) throw new Error('Database has not been initialized');
  return database;
}

export function isDBConnected() {
  return Boolean(database);
}

export function getMongoClient() {
  if (!client) throw new Error('Database has not been initialized');
  return client;
}

export function supportsMongoTransactions() {
  return supportsTransactions;
}

export async function closeDB() {
  if (!client) return;
  await client.close();
  client = undefined;
  database = undefined;
  supportsTransactions = false;
}
