import express from 'express';
import { google } from 'googleapis';
import { getOauth2Client } from '../services/googleAuth.js';

const router = express.Router();

router.post('/create', async (req, res) => {
  const { quiz, access_token } = req.body;

  if (!access_token || !quiz) {
    return res.status(400).json({ error: 'Manca access_token o dati del quiz' });
  }

  try {
    const oauth2Client = getOauth2Client();
    oauth2Client.setCredentials({ access_token });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Costruiamo un HTML semplificato che Google Drive convertirà in Doc
    let htmlContent = `<h1 style="text-align: center;">${quiz.title}</h1>`;
    htmlContent += `<p>Nome e Cognome: _________________________<br>Classe: _________________________<br>Data: _________________________</p><hr>`;

    const answerKey = [];
    let qNum = 1;

    // Raccogliamo tutti i topic
    const topics = new Set();
    if (quiz.listeningSections) quiz.listeningSections.forEach(ls => topics.add(ls.topic));
    if (quiz.readingSections) quiz.readingSections.forEach(rs => topics.add(rs.topic));
    if (quiz.questions) quiz.questions.forEach(q => topics.add(q.topic));
    if (quiz.writingPrompts) quiz.writingPrompts.forEach(wp => topics.add(wp.topic));

    Array.from(topics).forEach(topic => {
      htmlContent += `<h2>${topic}</h2>`;

      (quiz.listeningSections || []).filter(ls => ls.topic === topic).forEach(section => {
        htmlContent += `<h3>Listening Exercise</h3>`;
        htmlContent += `<p style="background-color: #DCEAFB; font-style: italic; padding: 10px;">${section.text}</p>`;
        section.questions.forEach(q => { htmlContent += formatQuestionForHtml(q, qNum++, answerKey); });
      });

      (quiz.readingSections || []).filter(rs => rs.topic === topic).forEach(section => {
        htmlContent += `<h3>Reading Comprehension</h3>`;
        htmlContent += `<p style="background-color: #F3F4F6; font-style: italic; padding: 10px;">${section.text}</p>`;
        section.questions.forEach(q => { htmlContent += formatQuestionForHtml(q, qNum++, answerKey); });
      });

      (quiz.questions || []).filter(q => q.topic === topic).forEach(q => {
        htmlContent += formatQuestionForHtml(q, qNum++, answerKey);
      });

      (quiz.writingPrompts || []).filter(wp => wp.topic === topic).forEach(prompt => {
        htmlContent += `<h3>Writing Prompt</h3>`;
        htmlContent += `<p>${prompt.promptText}</p>`;
        htmlContent += `<p><em>(Rispondi in circa ${prompt.wordLimit} parole)</em></p><br><br><br><br>`;
      });
    });

    // Answer Key
    htmlContent += `<h1 style="page-break-before: always;">Answer Key</h1><ul>`;
    answerKey.forEach(answer => {
      htmlContent += `<li>${answer}</li>`;
    });
    htmlContent += `</ul>`;

    // Creiamo il file tramite l'API Drive specificando che vogliamo convertirlo in Doc
    const result = await drive.files.create({
      requestBody: {
        name: quiz.title,
        mimeType: 'application/vnd.google-apps.document',
      },
      media: {
        mimeType: 'text/html',
        body: htmlContent
      }
    });

    const docId = result.data.id;
    const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

    res.json({ status: 'success', docUrl });

  } catch (error) {
    console.error('Errore creazione documento:', error);
    res.status(500).json({ error: error.message || 'Errore durante la creazione del documento' });
  }
});

function formatQuestionForHtml(question, qNum, answerKey) {
  let html = `<p><strong>${qNum}. ${question.questionText}</strong></p>`;
  
  if (question.questionType === 'MULTIPLE_CHOICE') {
    let correctAnswerText = '';
    html += `<ul style="list-style-type: lower-alpha;">`;
    question.options.forEach((opt, index) => {
      const letter = String.fromCharCode(97 + index); // a, b, c, d
      html += `<li>${opt.text}</li>`;
      if (opt.isCorrect) correctAnswerText = `${letter}) ${opt.text}`;
    });
    html += `</ul>`;
    answerKey.push(`<strong>${qNum}.</strong> ${correctAnswerText}`);
  } else {
    html += `<p>__________________________________________________</p>`;
    answerKey.push(`<strong>${qNum}.</strong> ${question.correctAnswer}`);
  }
  return html;
}

export default router;
