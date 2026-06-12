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

    const forms = google.forms({ version: 'v1', auth: oauth2Client });

    // Step 1: Crea il modulo base
    const createRes = await forms.forms.create({
      requestBody: {
        info: {
          title: quiz.title,
          documentTitle: quiz.title
        }
      }
    });

    const formId = createRes.data.formId;
    const formUrl = `https://docs.google.com/forms/d/${formId}/edit`;

    // Step 2: Crea gli elementi da aggiornare
    let index = 0;
    const requests = [];

    // Descrizione iniziale
    requests.push({
      updateFormInfo: {
        info: { description: 'Quiz generato automaticamente da Sebastian AI. Per favore, rispondi a tutte le domande.' },
        updateMask: 'description'
      }
    });

    // Quiz settings (IsQuiz) non sembra essere supportato direttamente via batchUpdate dalla v1 REST
    // Ma possiamo aggiungere i punti se necessario.

    const addTextQuestion = (title) => {
      requests.push({
        createItem: {
          item: {
            title,
            questionItem: { question: { required: true, textQuestion: { paragraph: false } } }
          },
          location: { index: index++ }
        }
      });
    };

    requests.push({
      createItem: {
        item: { title: 'Dati Studente', pageBreakItem: {} },
        location: { index: index++ }
      }
    });
    addTextQuestion('Nome');
    addTextQuestion('Cognome');
    addTextQuestion('Classe');
    addTextQuestion('Data');

    requests.push({
      createItem: {
        item: { title: 'Inizio del Quiz', pageBreakItem: {} },
        location: { index: index++ }
      }
    });

    const topics = new Set();
    if (quiz.listeningSections) quiz.listeningSections.forEach(ls => topics.add(ls.topic));
    if (quiz.readingSections) quiz.readingSections.forEach(rs => topics.add(rs.topic));
    if (quiz.questions) quiz.questions.forEach(q => topics.add(q.topic));
    if (quiz.writingPrompts) quiz.writingPrompts.forEach(wp => topics.add(wp.topic));

    Array.from(topics).forEach(topic => {
      requests.push({
        createItem: {
          item: { title: topic, textItem: {} },
          location: { index: index++ }
        }
      });

      (quiz.listeningSections || []).filter(ls => ls.topic === topic).forEach(section => {
        section.questions.forEach(q => addQuestionToRequests(q, requests, index++));
      });

      (quiz.readingSections || []).filter(rs => rs.topic === topic).forEach(section => {
        requests.push({
          createItem: {
            item: { title: 'Testo da leggere', description: section.text, textItem: {} },
            location: { index: index++ }
          }
        });
        section.questions.forEach(q => addQuestionToRequests(q, requests, index++));
      });

      (quiz.questions || []).filter(q => q.topic === topic).forEach(q => {
        addQuestionToRequests(q, requests, index++);
      });

      (quiz.writingPrompts || []).filter(wp => wp.topic === topic).forEach(wp => {
        requests.push({
          createItem: {
            item: {
              title: wp.promptText,
              description: `Rispondi in circa ${wp.wordLimit} parole.`,
              questionItem: { question: { required: true, textQuestion: { paragraph: true } } }
            },
            location: { index: index++ }
          }
        });
      });
    });

    // Eseguiamo il batchUpdate
    if (requests.length > 0) {
      await forms.forms.batchUpdate({
        formId,
        requestBody: { requests }
      });
    }

    res.json({ status: 'success', editUrl: formUrl });

  } catch (error) {
    console.error('--- ERRORE CREAZIONE FORM ---');
    console.error('Messaggio:', error.message);
    console.error('Stack:', error.stack);
    if (error.response) {
      console.error('Google API response status:', error.response.status);
      console.error('Google API response data:', JSON.stringify(error.response.data, null, 2));
    }
    res.status(500).json({ error: error.message || 'Errore durante la creazione del form' });
  }
});

function addQuestionToRequests(question, requests, index) {
  if (question.questionType === 'MULTIPLE_CHOICE') {
    const choices = question.options.map(opt => ({ value: opt.text }));
    requests.push({
      createItem: {
        item: {
          title: question.questionText,
          questionItem: {
            question: {
              required: true,
              choiceQuestion: { type: 'RADIO', options: choices }
            }
          }
        },
        location: { index }
      }
    });
  } else {
    // Fill in the blank, short answer
    requests.push({
      createItem: {
        item: {
          title: question.questionText,
          description: `Risposta corretta attesa: ${question.correctAnswer}`,
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: false }
            }
          }
        },
        location: { index }
      }
    });
  }
}

export default router;
