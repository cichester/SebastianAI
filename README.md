<div align="center">
<img width="1200" height="475" alt="Sebastian AI Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# 🎓 Sebastian AI - Assistente Docente
**L'IA che trasforma l'insegnamento generando test anti-copia in pochi secondi.**
</div>

---

## 💡 Cos'è Sebastian AI?
Sebastian AI è una piattaforma web avanzata dedicata agli insegnanti di lingue, progettata per velocizzare la creazione di materiali didattici. Sfruttando la potenza del modello **Google Gemini**, l'applicazione genera istantaneamente quiz completi, differenziati in più varianti per prevenire le copiatura in classe, e pronti per essere somministrati sia su carta che digitalmente.

## 🌟 Caratteristiche Principali

- **Generazione Multi-Variante**: Crea automaticamente diverse file (Fila A, B, C...) dello stesso compito, con domande diverse ma di equivalente difficoltà per contrastare il cheating.
- **Mix di Esercizi Didattici**: Supporta esercizi di Lettura (Reading), Ascolto (Listening), Domande a Risposta Multipla, Completamento Spazi (Fill in the blank) e Traduzioni.
- **Esportazione Dinamica**: Scarica i compiti direttamente in PDF con stili eleganti (Moderno, Classico o Formale) o in formato Microsoft Word.
- **Integrazione Google Workspace**: Collega il tuo account per generare automaticamente documenti su Google Docs e sondaggi pronti su Google Forms.
- **Libreria & Storico Intelligente**: Tutti i compiti creati vengono salvati sul Cloud, permettendoti di cercarli, filtrarli, rinominarli o **duplicarli/rigenerarli** con un clic per riciclare vecchie configurazioni.
- **Design Premium & Responsive**: Doppia interfaccia nativa (Light Mode & Dark Mode) ad alto contrasto per proteggere la vista e un look&feel moderno basato sulle ultime linee guida UX.

## 🛠️ Tecnologie Utilizzate

Il progetto sfrutta uno stack tecnologico moderno basato su TypeScript e Cloud computing:

### Frontend
- **Framework**: React.js (con Vite per builds istantanee)
- **Styling**: Tailwind CSS & Vanilla CSS per micro-interazioni
- **Animazioni**: Framer Motion (Motion React)
- **Rendering PDF**: html2pdf.js

### Servizi Cloud & AI
- **Intelligenza Artificiale**: Google Gemini AI API (`@google/genai`)
- **Database & Autenticazione**: Firebase Authentication & Firestore per il salvataggio degli storici utente.

---

## 🚀 Installazione Locale

Segui questi passaggi per avviare il progetto sul tuo computer.

### Prerequisiti
- [Node.js](https://nodejs.org/) installato sul tuo sistema.
- Un browser web aggiornato.

### Passaggio 1: Installazione Dipendenze
Clona la repository sul tuo computer, apri il terminale nella cartella del progetto ed esegui:

```bash
npm install
```

### Passaggio 2: Configurazione Variabili d'Ambiente
Crea (o modifica) il file `.env.local` nella directory principale e configura le tue chiavi API:

```env
# Chiave API di Google Gemini per la generazione dei test
VITE_GEMINI_API_KEY="LA_TUA_GEMINI_KEY"

# URL del backend locale per integrazioni Docs/Forms
VITE_BACKEND_URL="http://localhost:3001"

# Configurazione Firebase (prendi questi valori dalla console di Firebase)
VITE_FIREBASE_API_KEY="LA_TUA_KEY"
VITE_FIREBASE_AUTH_DOMAIN="xxx.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="xxx"
VITE_FIREBASE_STORAGE_BUCKET="xxx.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="xxx"
VITE_FIREBASE_APP_ID="xxx"
```

### Passaggio 3: Avvio Server di Sviluppo
Avvia l'applicazione in modalità locale:

```bash
npm run dev
```

L'app sarà ora accessibile nel browser, solitamente all'indirizzo `http://localhost:5173`.

---

## 👥 Supporto e Contatti

Hai riscontrato problemi tecnici o hai idee per migliorare l'applicazione? 
Scrivi direttamente all'assistenza tecnica di progetto all'indirizzo:

📧 **cichester0706@gmail.com**

---
*Copyright © 2026 Sebastian AI Team - Tutti i diritti riservati.*
