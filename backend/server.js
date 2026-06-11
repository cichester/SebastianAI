import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import docsRoutes from './routes/docs.js';
import formsRoutes from './routes/forms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configurazione CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/auth', authRoutes);
app.use('/api/docs', docsRoutes);
app.use('/api/forms', formsRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Butler AI Backend is running' });
});

// Servire i file statici del frontend in produzione
const frontendBuildPath = path.join(__dirname, '../dist');
app.use(express.static(frontendBuildPath));

// Gestire tutte le altre route inviando index.html (per il routing di React)
app.get('*', (req, res) => {
  if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/auth')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server avviato sulla porta ${PORT}`);
  console.log(`Frontend URL consentito: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});
