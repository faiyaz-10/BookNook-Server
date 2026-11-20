import 'dotenv/config';
import app from './app.js';
import { closeDB, connectDB } from './db.js';

const port = process.env.PORT === undefined ? 5000 : Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

let server;

async function shutdown(signal) {
  console.log(`${signal} received; closing BookNook API`);
  server.close(async (error) => {
    if (error) {
      console.error('Failed to close the HTTP server:', error);
      process.exitCode = 1;
    }
    try {
      await closeDB();
    } catch (closeError) {
      console.error('Failed to close MongoDB:', closeError);
      process.exitCode = 1;
    }
  });
}

connectDB()
  .then(() => {
    server = app.listen(port, () => {
      console.log(`BookNook API listening on ${port}`);
    });
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
  })
  .catch((error) => {
    console.error('Failed to start API:', error);
    return closeDB()
      .catch((closeError) => {
        console.error('Failed to close MongoDB after startup failure:', closeError);
      })
      .finally(() => {
        process.exitCode = 1;
      });
  });
