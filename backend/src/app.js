import express from 'express';
import cors from 'cors';
import rutas from './routes/index.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', rutas);
app.use(notFound);
app.use(errorHandler);

export default app;
