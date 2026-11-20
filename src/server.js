import 'dotenv/config';
import app from './app.js';
import {connectDB} from './db.js';
const port=Number(process.env.PORT)||5000;connectDB().then(()=>app.listen(port,()=>console.log(`BookNook API listening on ${port}`))).catch(error=>{console.error('Failed to start API:',error);process.exit(1)});
