import { NodeSSH } from 'node-ssh';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const ssh = new NodeSSH();

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      env[key] = value;
    }
  });
  return env;
}

async function main() {
  try {
    // Carica configurazioni da .env locale e backend/.env
    const rootEnv = loadEnv('./.env.local');
    const backendEnv = loadEnv('./backend/.env');

    const sshPassword = rootEnv.DEPLOY_SSH_PASSWORD || process.env.DEPLOY_SSH_PASSWORD;
    const googleClientId = backendEnv.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = backendEnv.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

    if (!sshPassword) {
      throw new Error('DEPLOY_SSH_PASSWORD non trovata in .env.local o variabili d\'ambiente.');
    }
    if (!googleClientId || !googleClientSecret) {
      throw new Error('GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET non trovati in backend/.env.');
    }

    // 1. Build frontend locally
    console.log('--- Esecuzione build locale del frontend ---');
    execSync('npm run build', { stdio: 'inherit' });
    console.log('Build completata con successo!\n');

    // 2. Connect to SSH
    console.log('--- Connessione al server tramite SSH ---');
    await ssh.connect({
      host: '192.168.1.109',
      username: 'u0_a270',
      password: sshPassword,
      port: 8022
    });
    console.log('Connessione stabilita con successo!\n');

    const remoteRoot = '/data/data/com.termux/files/home/SebastianAI';

    // 3. Upload dist directory
    console.log('--- Caricamento cartella dist (frontend compilato) ---');
    await ssh.putDirectory('./dist', `${remoteRoot}/dist`, {
      recursive: true,
      concurrency: 10
    });
    console.log('Cartella dist caricata!\n');

    // 4. Upload backend directory (escludendo node_modules e .env locale)
    console.log('--- Caricamento cartella backend ---');
    await ssh.putDirectory('./backend', `${remoteRoot}/backend`, {
      recursive: true,
      concurrency: 10,
      validate: (localPath) => {
        const relative = path.relative('./backend', localPath);
        if (relative.startsWith('node_modules') || relative === '.env') {
          return false;
        }
        return true;
      }
    });
    console.log('Cartella backend caricata!\n');

    // 5. Configurazione remote .env
    console.log('--- Configurazione variabili d\'ambiente (.env) sul server ---');
    const envContent = `GOOGLE_CLIENT_ID=${googleClientId}
GOOGLE_CLIENT_SECRET=${googleClientSecret}
GOOGLE_REDIRECT_URI=http://192.168.1.109:3001/auth/google/callback
FRONTEND_URL=http://192.168.1.109:3001
PORT=3001`;

    const writeEnvRes = await ssh.execCommand(`cat << 'EOF' > ${remoteRoot}/backend/.env
${envContent}
EOF`);
    if (writeEnvRes.code !== 0) {
      throw new Error(`Errore durante la scrittura del file .env remoto: ${writeEnvRes.stderr}`);
    }
    console.log('File .env remoto configurato correttamente con l\'IP del server!\n');

    // 6. Restart or start PM2 process
    console.log('--- Riavvio del server tramite PM2 ---');
    const checkRes = await ssh.execCommand('pm2 show SebastianAI');
    if (checkRes.code === 0) {
      const restartRes = await ssh.execCommand('pm2 restart SebastianAI');
      console.log(restartRes.stdout || restartRes.stderr);
      console.log('Processo riavviato!\n');
    } else {
      console.log('SebastianAI non esiste in PM2, avvio del processo...');
      const startRes = await ssh.execCommand(`cd ${remoteRoot}/backend && pm2 start server.js --name SebastianAI`);
      console.log(startRes.stdout || startRes.stderr);
      console.log('Processo avviato per la prima volta!\n');
    }

    ssh.dispose();
    console.log('--- Deploy completato con successo! ---');
  } catch (err) {
    console.error('Errore durante il deploy:', err);
    ssh.dispose();
    process.exit(1);
  }
}

main();
