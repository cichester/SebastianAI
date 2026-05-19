import React, { useState, useEffect } from 'react';
import { ClipboardIcon, CheckIcon, XMarkIcon } from './icons';
import { PdfFormat } from '../types';
import { auth, googleProvider } from '../services/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

interface SettingsModalProps {
    currentUrl: string | null;
    currentPdfFormat: PdfFormat;
    onClose: () => void;
    onSave: (url: string) => void;
    onSavePdfFormat: (format: PdfFormat) => void;
}

const PDF_PREVIEWS = {
    [PdfFormat.MODERN]: (
        <div className="w-full h-32 bg-slate-50 border border-slate-200 rounded p-2 overflow-hidden flex flex-col gap-1">
            <div className="h-2 w-1/2 bg-slate-300 rounded mb-2"></div>
            <div className="h-1 w-1/3 bg-slate-200 rounded"></div>
            <div className="h-1 w-full bg-slate-200 rounded"></div>
            <div className="mt-2 space-y-1">
                <div className="h-1.5 w-1/4 bg-blue-200 rounded"></div>
                <div className="h-1 w-full bg-slate-100 rounded"></div>
                <div className="h-1 w-full bg-slate-100 rounded"></div>
            </div>
        </div>
    ),
    [PdfFormat.CLASSIC]: (
        <div className="w-full h-32 bg-white border border-slate-200 rounded p-2 overflow-hidden flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <div className="h-3 w-1/3 bg-slate-400 rounded"></div>
                <div className="w-16 h-8 border border-slate-300 rounded p-1 flex flex-col gap-0.5">
                    <div className="h-0.5 w-full bg-slate-200 rounded"></div>
                    <div className="h-0.5 w-full bg-slate-200 rounded"></div>
                    <div className="h-0.5 w-full bg-slate-200 rounded"></div>
                </div>
            </div>
            <div className="h-2 w-full bg-slate-200 rounded mb-1"></div>
            <div className="mt-2 space-y-1">
                <div className="h-3 w-full bg-slate-100 rounded flex items-center px-1">
                    <div className="h-1 w-1/4 bg-slate-300 rounded"></div>
                </div>
                <div className="h-1 w-full bg-slate-100 rounded"></div>
            </div>
        </div>
    ),
    [PdfFormat.FORMAL]: (
        <div className="w-full h-32 bg-white border border-slate-200 rounded p-2 overflow-hidden flex flex-col items-center">
            <div className="h-3 w-1/2 bg-slate-800 rounded mb-3"></div>
            <div className="w-full flex gap-1 mb-2">
                <div className="h-1 flex-1 bg-slate-200 rounded"></div>
                <div className="h-1 flex-1 bg-slate-200 rounded"></div>
                <div className="h-1 w-8 bg-slate-400 rounded"></div>
            </div>
            <div className="w-full border-t border-slate-200 pt-2 flex flex-col gap-1">
                <div className="flex justify-between items-center">
                    <div className="h-2 w-1/4 bg-slate-700 rounded"></div>
                    <div className="h-1 w-12 bg-slate-300 rounded"></div>
                </div>
                <div className="h-1 w-full bg-slate-100 rounded"></div>
            </div>
        </div>
    )
};

const getWebAppScript = (): string => {
    return `// Benvenuto in Butler AI!
// 1. Incolla questo script in un nuovo progetto Google Apps Script.
// 2. Salva il progetto.
// 3. Fai clic su "Distribuisci" > "Nuova distribuzione".
// 4. Scegli "Web App" come tipo.
// 5. In "Chi ha accesso", seleziona "Chiunque" (ANYONE). ATTENZIONE: Questo richiede l'autorizzazione per Google Docs e Forms.
// 6. Fai clic su "Distribuisci". Concedi le autorizzazioni necessarie.
// 7. Copia l' "URL Web App" e incollalo nell'app Butler AI.

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const target = payload.target || 'form'; // 'form' o 'doc'

    if (target === 'doc') {
      return createDocument(payload);
    } else { // 'form' or default
      return createForm(payload);
    }

  } catch (err) {
    Logger.log('ERRORE CRITICO: ' + err.toString() + ' Stack: ' + err.stack);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Errore critico: ' + err.toString(),
      errors: []
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// --- LOGICA PER GOOGLE FORMS ---
function createForm(payload) {
    const action = payload.action || 'create';
    let form;
    const errors = []; 

    if (action === 'create') {
      const quizData = payload;
      if (!quizData || !quizData.title) throw new Error('Dati del quiz non validi.');
      
      form = FormApp.create(quizData.title)
        .setTitle(quizData.title)
        .setDescription('Quiz generato automaticamente. Per favore, rispondi a tutte le domande.');
      
      form.setIsQuiz(true);
      form.addSectionHeaderItem().setTitle('Dati Studente');
      form.addTextItem().setTitle('Nome').setRequired(true);
      form.addTextItem().setTitle('Cognome').setRequired(true);
      form.addTextItem().setTitle('Classe').setRequired(true);
      form.addDateItem().setTitle('Data').setRequired(true);
      form.addPageBreakItem().setTitle('Inizio del Quiz');

      const topicsInOrder = getTopicsInOrder(quizData);
      topicsInOrder.forEach(topic => {
        form.addSectionHeaderItem().setTitle(topic);
        (quizData.listeningSections || []).filter(ls => ls.topic === topic).forEach(ls => addListeningSectionToForm(form, ls, errors));
        (quizData.readingSections || []).filter(rs => rs.topic === topic).forEach(rs => addReadingSectionToForm(form, rs, errors));
        (quizData.questions || []).filter(q => q.topic === topic).forEach(q => addQuestionToForm(form, q, errors));
        (quizData.writingPrompts || []).filter(wp => wp.topic === topic).forEach(wp => addWritingPromptToForm(form, wp, errors));
      });

    } else if (action === 'append') {
      const { editUrl, failedQuestions } = payload;
      if (!editUrl || !failedQuestions) throw new Error("Dati mancanti per 'append'.");
      form = FormApp.openByUrl(editUrl);
      form.addPageBreakItem().setTitle("Domande Aggiunte (Nuovo Tentativo)");
      failedQuestions.forEach(q => addQuestionToForm(form, q, errors));
    
    } else {
      throw new Error("Azione non supportata: " + action);
    }

    const response = {
      status: errors.length > 0 ? 'partial_success' : 'success',
      message: errors.length > 0 
          ? \`Operazione completata. Errori: \${errors.length}\`
          : (action === 'create' ? 'Modulo creato con successo!' : 'Domande aggiunte con successo!'),
      editUrl: form.getEditUrl(),
      errors: errors
    };
    
    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

// --- LOGICA PER GOOGLE DOCS ---
function createDocument(quizData) {
    if (!quizData || !quizData.title) throw new Error('Dati del quiz non validi.');

    const doc = DocumentApp.create(quizData.title);
    const body = doc.getBody();
    const answerKey = [];
    let qNum = 1;

    // Intestazione
    body.appendParagraph(quizData.title).setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    body.appendParagraph('\\nNome e Cognome: _________________________\\nClasse: _________________________\\nData: _________________________\\n').setBold(false);
    body.appendHorizontalRule();

    const topicsInOrder = getTopicsInOrder(quizData);
    topicsInOrder.forEach(topic => {
      body.appendParagraph(topic).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      
      (quizData.listeningSections || []).filter(ls => ls.topic === topic).forEach(section => {
          body.appendParagraph("Listening Exercise").setHeading(DocumentApp.ParagraphHeading.HEADING3);
          const transcriptStyle = {};
          transcriptStyle[DocumentApp.Attribute.ITALIC] = true;
          transcriptStyle[DocumentApp.Attribute.BACKGROUND_COLOR] = '#DCEAFB'; // Colore blu chiaro
          body.appendParagraph('Ascolta l\\'audio e rispondi alle seguenti domande basandoti sulla traccia (transcript):');
          body.appendParagraph(section.text).setAttributes(transcriptStyle);
          body.appendParagraph('');
          section.questions.forEach(q => { addQuestionToDoc(body, q, qNum++, answerKey); });
      });

      (quizData.readingSections || []).filter(rs => rs.topic === topic).forEach(section => {
          body.appendParagraph("Reading Comprehension").setHeading(DocumentApp.ParagraphHeading.HEADING3);
          const readingStyle = {};
          readingStyle[DocumentApp.Attribute.ITALIC] = true;
          readingStyle[DocumentApp.Attribute.BACKGROUND_COLOR] = '#F3F4F6';
          body.appendParagraph(section.text).setAttributes(readingStyle);
          body.appendParagraph('');
          section.questions.forEach(q => { addQuestionToDoc(body, q, qNum++, answerKey); });
      });

      (quizData.questions || []).filter(q => q.topic === topic).forEach(q => addQuestionToDoc(body, q, qNum++, answerKey));

      (quizData.writingPrompts || []).filter(wp => wp.topic === topic).forEach(prompt => {
          body.appendParagraph("Writing Prompt").setHeading(DocumentApp.ParagraphHeading.HEADING3);
          body.appendParagraph(prompt.promptText);
          body.appendParagraph(\`\\n(Rispondi in circa \${prompt.wordLimit} parole)\\n\\n\\n\\n\`);
      });
    });

    // Chiave Risposte
    body.appendPageBreak();
    body.appendParagraph("Answer Key").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    answerKey.forEach(answer => body.appendListItem(answer).setGlyphType(DocumentApp.GlyphType.DECIMAL));

    doc.saveAndClose();

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Documento creato con successo!',
      docUrl: doc.getUrl(),
    })).setMimeType(ContentService.MimeType.JSON);
}


// --- FUNZIONI HELPER COMUNI ---
function getTopicsInOrder(quizData) {
    const topics = new Set();
    if (quizData.listeningSections) quizData.listeningSections.forEach(ls => topics.add(ls.topic));
    if (quizData.readingSections) quizData.readingSections.forEach(rs => topics.add(rs.topic));
    if (quizData.questions) quizData.questions.forEach(q => topics.add(q.topic));
    if (quizData.writingPrompts) quizData.writingPrompts.forEach(wp => topics.add(wp.topic));
    return Array.from(topics);
}

// --- HELPER PER FORMS ---
function addQuestionToForm(form, question, errors) {
    try {
      if (!question || !question.questionType) throw new Error('Dati della domanda non validi.');
      switch (question.questionType) {
        case 'MULTIPLE_CHOICE': addMultipleChoiceQuestionToForm(form, question); break;
        case 'FILL_IN_THE_BLANK': case 'SHORT_ANSWER': case 'TRANSLATION': addShortAnswerQuestionToForm(form, question); break;
        default: throw new Error('Tipo di domanda non supportato: ' + question.questionType);
      }
    } catch (e) {
      const errorMessage = 'Domanda "' + (question.questionText || 'sconosciuta').substring(0, 40) + '...": ' + e.toString();
      errors.push({ question: question, error: errorMessage });
      Logger.log('ERRORE nel creare la domanda: ' + errorMessage);
      form.addPageBreakItem().setTitle('⚠️ ERRORE: Domanda non generata').setHelpText(errorMessage);
    }
}
function addListeningSectionToForm(form, section, errors) {
    form.addPageBreakItem().setTitle("Listening: " + section.topic).setHelpText("Leggi il transcript e rispondi alle domande. (L'audio verrà fornito separatamente).");
    form.addSectionHeaderItem().setTitle("Transcript").setHelpText(section.text);
    if (section.questions) section.questions.forEach(q => addQuestionToForm(form, q, errors));
}
function addReadingSectionToForm(form, section, errors) {
    form.addPageBreakItem().setTitle("Reading: " + section.topic).setHelpText("Leggi il testo e rispondi.");
    form.addSectionHeaderItem().setTitle("Testo").setHelpText(section.text);
    if (section.questions) section.questions.forEach(q => addQuestionToForm(form, q, errors));
}
function addWritingPromptToForm(form, prompt, errors) {
  try {
    form.addParagraphTextItem().setTitle(prompt.promptText).setHelpText("Rispondi in circa " + prompt.wordLimit + " parole.").setRequired(true);
  } catch (e) {
    errors.push({ question: prompt, error: 'Errore traccia scrittura: ' + e.toString() });
  }
}
function addMultipleChoiceQuestionToForm(form, question) {
  if (!question.options || !Array.isArray(question.options)) throw new Error('Opzioni non valide.');
  const item = form.addMultipleChoiceItem();
  item.setTitle(question.questionText);
  item.setChoices(question.options.map(opt => item.createChoice(opt.text, opt.isCorrect || false)));
  item.setRequired(true).setPoints(1);
}
function addShortAnswerQuestionToForm(form, question) {
  const item = form.addTextItem().setTitle(question.questionText).setRequired(true);
  if (question.correctAnswer) {
    const feedback = FormApp.createFeedback().setText("Risposta corretta: " + question.correctAnswer).build();
    item.setPoints(1).setGeneralFeedback(feedback);
  }
}

// --- HELPER PER DOCS ---
function addQuestionToDoc(body, question, qNum, answerKey) {
  try {
    switch(question.questionType) {
      case 'MULTIPLE_CHOICE': addMultipleChoiceToDoc(body, question, qNum, answerKey); break;
      case 'FILL_IN_THE_BLANK': case 'SHORT_ANSWER': case 'TRANSLATION': addShortAnswerToDoc(body, question, qNum, answerKey); break;
      default: body.appendParagraph(\`\${qNum}. TIPO NON SUPPORTATO: \${question.questionText}\`);
    }
  } catch(e) {
     body.appendParagraph(\`\${qNum}. ERRORE NEL GENERARE DOMANDA: \${question.questionText}\`);
  }
}
function addMultipleChoiceToDoc(body, question, qNum, answerKey) {
  body.appendParagraph(\`\${qNum}. \${question.questionText}\`);
  let correctAnswerText = '';
  question.options.forEach((opt, index) => {
    const letter = String.fromCharCode(65 + index); // A, B, C, D
    body.appendListItem(\`  \${letter}) \${opt.text}\`).setGlyphType(DocumentApp.GlyphType.LATIN_LOWER);
    if (opt.isCorrect) correctAnswerText = \`\${letter}) \${opt.text}\`;
  });
  answerKey.push(\`\${qNum}. \${correctAnswerText}\`);
  body.appendParagraph(''); // Spaziatura
}
function addShortAnswerToDoc(body, question, qNum, answerKey) {
  body.appendParagraph(\`\${qNum}. \${question.questionText}\`);
  body.appendParagraph("\\n__________________________________________________\\n");
  answerKey.push(\`\${qNum}. \${question.correctAnswer}\`);
}
`
};

const SettingsModal: React.FC<SettingsModalProps> = ({ currentUrl, currentPdfFormat, onClose, onSave, onSavePdfFormat }) => {
    const [url, setUrl] = useState(currentUrl || '');
    const [copied, setCopied] = useState(false);
    const scriptContent = getWebAppScript();

    const handleCopy = () => {
        navigator.clipboard.writeText(scriptContent).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleSave = () => {
        onSave(''); // We don't need to save the URL anymore
    };

    const handleGoogleConnect = async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                localStorage.setItem('googleAccessToken', credential.accessToken);
                console.log('Token Google OAuth collegato con successo tramite popup Firebase');
                window.location.reload();
            }
        } catch (error: any) {
            console.error("Errore durante la connessione con Google:", error);
            alert("Errore durante la connessione con Google: " + error.message);
        }
    };
    
    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-60 dark:bg-opacity-80 flex items-center justify-center p-4 z-50 transition-opacity"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col transition-colors"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Impostazioni</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-8">
                    {/* PDF Section */}
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Formato Esportazione PDF</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Scegli come verranno impaginati i tuoi quiz quando li scarichi in formato PDF.</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {(Object.keys(PdfFormat) as Array<keyof typeof PdfFormat>).map((key) => {
                                const format = PdfFormat[key];
                                const isSelected = currentPdfFormat === format;
                                return (
                                    <button
                                        key={format}
                                        onClick={() => onSavePdfFormat(format)}
                                        className={`flex flex-col text-left p-4 rounded-xl border-2 transition-all ${
                                            isSelected 
                                            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 ring-2 ring-indigo-500/20' 
                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                        }`}
                                    >
                                        <div className="mb-3">
                                            {PDF_PREVIEWS[format]}
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                                                {format === PdfFormat.MODERN ? 'Moderno (Default)' : format === PdfFormat.CLASSIC ? 'Classico (Pearson)' : 'Formale (Compito)'}
                                            </span>
                                            {isSelected && <CheckIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
                                        </div>
                                        <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                            {format === PdfFormat.MODERN ? 'Layout pulito e minimalista.' : format === PdfFormat.CLASSIC ? 'Design scolastico tradizionale.' : 'Intestazione formale e punteggio.'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-700"></div>

                    {/* Google App Section */}
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Integrazione Google (Docs & Forms)</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Collega il tuo account Google per permettere a Butler AI di creare automaticamente quiz e documenti nel tuo Google Drive.
                        </p>
                        
                        {localStorage.getItem('googleAccessToken') ? (
                            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex justify-between items-center">
                                <div className="flex items-center text-green-700 dark:text-green-400">
                                    <CheckIcon className="w-5 h-5 mr-2" />
                                    <span className="font-semibold">Account Google Collegato</span>
                                </div>
                                <button
                                    onClick={() => {
                                        localStorage.removeItem('googleAccessToken');
                                        window.location.reload();
                                    }}
                                    className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline"
                                >
                                    Scollega
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={handleGoogleConnect}
                                className="inline-flex items-center justify-center px-6 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition w-full md:w-auto"
                            >
                                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    <path fill="none" d="M1 1h22v22H1z" />
                                </svg>
                                <span className="font-semibold text-slate-700 dark:text-slate-200">Accedi con Google</span>
                            </button>
                        )}
                    </div>
                </div>
                <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition"
                    >
                        Annulla
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
                    >
                        Salva e Chiudi
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;