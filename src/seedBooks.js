import 'dotenv/config';
import { closeDB, connectDB } from './db.js';

// Sample catalog records are shared demo books. They can be borrowed by users,
// but the existing ownership rules prevent users from editing/deleting them.
const sampleBooks = [
  {
    seedKey: 'clean-code-robert-c-martin',
    title: 'Clean Code',
    author: 'Robert C. Martin',
    category: 'Others',
    image: 'https://covers.openlibrary.org/b/isbn/9780132350884-L.jpg',
    description: 'A practical guide to writing readable, maintainable, and well-structured software. A useful resource for programmers who want to improve their coding habits.',
    totalCopies: 5,
  },
  {
    seedKey: 'the-pragmatic-programmer',
    title: 'The Pragmatic Programmer',
    author: 'David Thomas and Andrew Hunt',
    category: 'Others',
    image: 'https://covers.openlibrary.org/b/id/10143650-L.jpg?default=false',
    description: 'A collection of practical ideas and techniques for becoming a more effective software developer and building better software.',
    totalCopies: 4,
  },
  {
    seedKey: 'introduction-to-algorithms',
    title: 'Introduction to Algorithms',
    author: 'Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest and Clifford Stein',
    category: 'Science',
    image: 'https://covers.openlibrary.org/b/isbn/9780262046305-L.jpg',
    description: 'A comprehensive textbook covering fundamental algorithms, data structures, and the analysis of algorithm efficiency.',
    totalCopies: 3,
  },
  {
    seedKey: 'atomic-habits',
    title: 'Atomic Habits',
    author: 'James Clear',
    category: 'Others',
    image: 'https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg',
    description: 'A practical approach to building good habits, breaking bad ones, and making small improvements that compound over time.',
    totalCopies: 5,
  },
  {
    seedKey: 'deep-work',
    title: 'Deep Work',
    author: 'Cal Newport',
    category: 'Others',
    image: 'https://covers.openlibrary.org/b/isbn/9781455586691-L.jpg',
    description: 'Explores the value of focused, distraction-free work and offers strategies for developing this increasingly valuable skill.',
    totalCopies: 3,
  },
  {
    seedKey: 'the-alchemist',
    title: 'The Alchemist',
    author: 'Paulo Coelho',
    category: 'Fiction',
    image: 'https://covers.openlibrary.org/b/isbn/9780062315007-L.jpg',
    description: 'A philosophical novel about Santiago, a young shepherd who travels in search of a treasure and discovers lessons about purpose and dreams.',
    totalCopies: 6,
  },
  {
    seedKey: 'the-great-gatsby',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    category: 'Fiction',
    image: 'https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg',
    description: 'A classic novel set in the Jazz Age, exploring ambition, wealth, love, and the American Dream.',
    totalCopies: 4,
  },
  {
    seedKey: 'nineteen-eighty-four',
    title: 'Nineteen Eighty-Four',
    author: 'George Orwell',
    category: 'Fiction',
    image: 'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg',
    description: 'A dystopian novel about surveillance, propaganda, and individual freedom under an oppressive government.',
    totalCopies: 4,
  },
  {
    seedKey: 'to-kill-a-mockingbird',
    title: 'To Kill a Mockingbird',
    author: 'Harper Lee',
    category: 'Fiction',
    image: 'https://covers.openlibrary.org/b/isbn/9780061120084-L.jpg',
    description: 'A novel about childhood, justice, empathy, and moral courage in a small Alabama town.',
    totalCopies: 3,
  },
  {
    seedKey: 'pride-and-prejudice',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    category: 'Fiction',
    image: 'https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg',
    description: 'A classic romantic novel following Elizabeth Bennet as she navigates family, social expectations, and first impressions.',
    totalCopies: 3,
  },
  {
    seedKey: 'a-brief-history-of-time',
    title: 'A Brief History of Time',
    author: 'Stephen Hawking',
    category: 'Science',
    image: 'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg',
    description: 'An accessible introduction to big questions about the universe, including space, time, black holes, and the origins of the cosmos.',
    totalCopies: 4,
  },
  {
    seedKey: 'sapiens',
    title: 'Sapiens: A Brief History of Humankind',
    author: 'Yuval Noah Harari',
    category: 'History',
    image: 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg',
    description: 'A broad account of human history, from early humans to modern societies, examining the ideas and developments that shaped our world.',
    totalCopies: 4,
  },
  {
    seedKey: 'the-hobbit',
    title: 'The Hobbit',
    author: 'J. R. R. Tolkien',
    category: 'Kids',
    image: 'https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg',
    description: 'A fantasy adventure following Bilbo Baggins on an unexpected journey with a group of dwarves.',
    totalCopies: 5,
  },
  {
    seedKey: 'charlottes-web',
    title: "Charlotte's Web",
    author: 'E. B. White',
    category: 'Kids',
    image: 'https://covers.openlibrary.org/b/isbn/9780064400558-L.jpg',
    description: 'A beloved children’s story about friendship between a pig named Wilbur and a clever spider named Charlotte.',
    totalCopies: 4,
  },
  {
    seedKey: 'alice-adventures-in-wonderland',
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    category: 'Kids',
    image: 'https://covers.openlibrary.org/b/id/10527843-M.jpg',
    description: 'A classic fantasy adventure in which Alice enters a curious world filled with unusual characters and imaginative events.',
    totalCopies: 4,
  },
  {
    seedKey: 'the-selfish-gene',
    title: 'The Selfish Gene',
    author: 'Richard Dawkins',
    category: 'Science',
    image: 'https://covers.openlibrary.org/b/isbn/9780198788607-L.jpg',
    description: 'An influential introduction to evolution that explains natural selection through the perspective of genes.',
    totalCopies: 2,
  },
  {
    seedKey: 'the-adventures-of-sherlock-holmes',
    title: 'The Adventures of Sherlock Holmes',
    author: 'Arthur Conan Doyle',
    category: 'Fiction',
    image: 'https://covers.openlibrary.org/b/id/6717853-L.jpg',
    description: 'A collection of detective stories featuring Sherlock Holmes and Dr. Watson as they solve unusual mysteries.',
    totalCopies: 4,
  },
  {
    seedKey: 'the-boy-in-the-striped-pyjamas',
    title: 'The Boy in the Striped Pyjamas',
    author: 'John Boyne',
    category: 'History',
    image: 'https://covers.openlibrary.org/b/isbn/9780385751537-L.jpg',
    description: 'A historical novel told through the perspective of a child during the Second World War.',
    totalCopies: 2,
  },
];

async function seedBooks() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing. Create server/.env before running the seed command.');
  }

  const db = await connectDB();
  const books = db.collection('books');
  let inserted = 0;
  let alreadyPresent = 0;

  for (const sample of sampleBooks) {
    const document = {
      ...sample,
      userName: 'BookNook Library',
      userEmail: 'booknook-seed@system.local',
      availableCopies: sample.totalCopies,
      createdAt: new Date(),
    };
    const { image, ...insertFields } = document;

    const result = await books.updateOne(
      { seedKey: sample.seedKey },
      { $set: { image }, $setOnInsert: insertFields },
      { upsert: true },
    );

    if (result.upsertedCount === 1) inserted += 1;
    else alreadyPresent += 1;
  }

  const totalBooks = await books.countDocuments();
  console.log(`BookNook seeding complete. Inserted: ${inserted}; already seeded: ${alreadyPresent}; total books in collection: ${totalBooks}.`);
  console.log('Run this command again safely: existing sample books will not be duplicated or have their copy counts reset; their cover URLs are refreshed.');
}

seedBooks()
  .catch((error) => {
    console.error('Failed to seed BookNook books:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closeDB();
    } catch (error) {
      console.error('Failed to close the MongoDB connection:', error);
      process.exitCode = 1;
    }
  });
