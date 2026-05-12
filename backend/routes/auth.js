import express from 'express';
import { getAuthUrl, getOauth2Client } from '../services/googleAuth.js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

// Step 1: Redirect a Google
router.get('/google', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// Step 2: Callback da Google
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send('Codice di autorizzazione mancante.');
  }

  try {
    const oauth2Client = getOauth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    // Reindirizziamo al frontend con i token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    const redirectUrl = new URL(`${frontendUrl}/oauth-callback`);
    redirectUrl.searchParams.append('access_token', tokens.access_token);
    if (tokens.refresh_token) {
        redirectUrl.searchParams.append('refresh_token', tokens.refresh_token);
    }
    
    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('Errore durante lo scambio del codice:', error);
    res.status(500).send('Errore durante autenticazione con Google.');
  }
});

export default router;
