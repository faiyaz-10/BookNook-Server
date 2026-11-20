import express from 'express';import cors from 'cors';import booksRouter from './routes/books.js';import borrowsRouter from './routes/borrows.js';import {requireAuth} from './middleware/auth.js';
const configuredOrigins=(process.env.CLIENT_ORIGIN||'http://localhost:3000').split(',').map(x=>x.trim()).filter(Boolean);
const app=express();app.use(cors({origin:(origin,callback)=>{
  if(!origin||configuredOrigins.includes(origin)||(process.env.NODE_ENV!=='production'&&/^http:\/\/localhost:\d+$/.test(origin)))return callback(null,true);
  return callback(null,false);
},credentials:true}));app.use(express.json({limit:'2mb'}));app.get('/health',(req,res)=>res.json({status:'ok',service:'BookNook API'}));
// The assignment's GET /books supports a private ?mine=true mode while the ordinary list remains public.
app.use('/books',(req,res,next)=>{if(req.method==='GET'&&req.query.mine==='true')return requireAuth(req,res,next);next()},booksRouter);
app.use('/borrows',borrowsRouter);
app.use((req,res)=>res.status(404).json({message:'API route not found'}));
app.use((err,req,res,next)=>{console.error(err);if(res.headersSent)return next(err);const status=Number.isInteger(err.status)&&err.status>=400&&err.status<500?err.status:500;const message=err.type==='entity.parse.failed'?'Invalid JSON request body':status===413?'Request body is too large':'Internal server error';res.status(status).json({message})});
export default app;
