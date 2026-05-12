import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/drive.file'
];

export const getOauth2Client = (redirectUri) => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback'
  );
};

export const getAuthUrl = () => {
  const oauth2Client = getOauth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Per ottenere il refresh token
    scope: SCOPES,
    prompt: 'consent' // Forza a mostrare la schermata per garantire il refresh token
  });
};
