
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { Quiz, QuizGenerationParams, TopicRequest, Question, ReadingSection, ListeningSection, WritingPrompt } from '../types';

const questionSchema = {
  type: Type.OBJECT,
  properties: {
    questionText: {
      type: Type.STRING,
      description: "Il testo completo della domanda. Per 'Fill in the blank', usa '___' seguito dal verbo all'infinito tra parentesi se necessario (es. '___ (to go)'). Per Reading Comprehension, la domanda deve basarsi sul testo fornito. Per 'Translation', il testo da tradurre."
    },
    questionType: {
      type: Type.STRING,
      enum: ['MULTIPLE_CHOICE', 'FILL_IN_THE_BLANK', 'SHORT_ANSWER', 'TRANSLATION'],
      description: "Il tipo di domanda."
    },
    topic: {
      type: Type.STRING,
      description: "L'argomento a cui questa domanda appartiene. Deve corrispondere esattamente a uno degli argomenti forniti."
    },
    options: {
      type: Type.ARRAY,
      description: "Un array di 4 opzioni per le domande MULTIPLE_CHOICE: una corretta, tre errate.",
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: "Il testo dell'opzione." },
          isCorrect: { type: Type.BOOLEAN, description: "True se è la risposta corretta." }
        },
        required: ['text', 'isCorrect']
      }
    },
    correctAnswer: {
      type: Type.STRING,
      description: "La risposta per FILL_IN_THE_BLANK, una risposta di esempio per SHORT_ANSWER, o la traduzione corretta per TRANSLATION."
    }
  },
  required: ['questionText', 'questionType', 'topic']
};

const readingSectionSchema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING, description: "L'argomento della sezione di lettura." },
    text: { type: Type.STRING, description: "Il testo generato o fornito per la lettura." },
    questions: { type: Type.ARRAY, items: questionSchema, description: "Domande (di solito a scelta multipla o risposta breve) basate SUL TESTO fornito." }
  },
  required: ['topic', 'text', 'questions']
};

const listeningSectionSchema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING, description: "L'argomento della sezione di ascolto." },
    text: { type: Type.STRING, description: "Il testo/transcript per l'esercizio di ascolto, della lunghezza appropriata per la durata richiesta." },
    questions: { type: Type.ARRAY, items: questionSchema, description: "Domande basate SUL TESTO fornito." }
  },
  required: ['topic', 'text', 'questions']
};

const quizSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "Un titolo conciso per il quiz, basato su tutti gli argomenti."
    },
    questions: {
      type: Type.ARRAY,
      description: "Un array di domande standard (non di lettura o scrittura).",
      items: questionSchema
    },
    readingSections: {
      type: Type.ARRAY,
      description: "Sezioni dedicate alla comprensione del testo.",
      items: readingSectionSchema
    },
    writingPrompts: {
      type: Type.ARRAY,
      description: "Sezioni dedicate alla produzione scritta.",
      items: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: "L'argomento della traccia di scrittura." },
          promptText: { type: Type.STRING, description: "La traccia o la domanda per l'esercizio di scrittura." },
          wordLimit: { type: Type.NUMBER, description: "Il limite di parole richiesto per la risposta." }
        },
        required: ['topic', 'promptText', 'wordLimit']
      }
    },
    listeningSections: {
      type: Type.ARRAY,
      description: "Sezioni dedicate all'ascolto.",
      items: listeningSectionSchema
    }
  },
  required: ['title', 'questions']
};

const getQuestionTypeEnumString = (exerciseType: string): string | null => {
  if (exerciseType.includes('Scelta Multipla')) return 'MULTIPLE_CHOICE';
  if (exerciseType.includes('Completa gli spazi')) return 'FILL_IN_THE_BLANK';
  if (exerciseType.includes('Risposta Breve')) return 'SHORT_ANSWER';
  if (exerciseType.includes('Traduzione')) return 'TRANSLATION';
  if (exerciseType.includes('Vero/Falso')) return 'MULTIPLE_CHOICE'; // Map True/False to multiple choice internally
  return null;
};

function buildPrompt(params: QuizGenerationParams, versionLabel: string, listeningTexts?: Record<string, string>): string {
  let topicDetails = params.topics.map(topic => {
    const exerciseCounts = Object.entries(topic.exercises)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => {
        const enumString = getQuestionTypeEnumString(type);
        let extra = '';
        if (type.includes('Vero/Falso')) {
          extra = ' con SOLO due opzioni: "Vero" e "Falso"';
        }
        return `- ${type} (usa il questionType "${enumString}"): ESATTAMENTE ${count} domande${extra}`;
      })
      .join('\n');

    let readingDetails = '';
    if (topic.reading.enabled) {
      const readingExerciseCounts = Object.entries(topic.reading.exercises || {})
        .filter(([, count]) => count > 0)
        .map(([type, count]) => {
          const enumString = getQuestionTypeEnumString(type);
          return `- ${type} (usa il questionType "${enumString}"): ESATTAMENTE ${count} domande`;
        })
        .join('\n');

      if (readingExerciseCounts) {
        if (topic.reading.mode === 'custom' && topic.reading.customText.trim() !== '') {
          readingDetails = `- Esercizio di Reading Comprehension basato su testo fornito:\n  - TESTO FORNITO:\n"""\n${topic.reading.customText}\n"""\n  - Basandoti ESCLUSIVAMENTE sul testo fornito qui sopra, crea le seguenti domande:\n${readingExerciseCounts.split('\n').map(l => `    ${l}`).join('\n')}`;
        } else {
          readingDetails = `- Esercizio di Reading Comprehension:\n  - Genera un testo di circa ${topic.reading.wordCount} parole.\n  - Basato sul testo, crea le seguenti domande:\n${readingExerciseCounts.split('\n').map(l => `    ${l}`).join('\n')}`;
        }
        if (topic.reading.directives) {
          readingDetails += `\n  - **DIRETTIVE SPECIALI DI LETTURA (TASSATIVE)**: Devi assolutamente e rigorosamente rispettare queste indicazioni dell'utente per la generazione del testo e/o delle domande di lettura: "${topic.reading.directives}"`;
        }
      }
    }

    let writingDetails = '';
    if (topic.writing.enabled && topic.writing.wordLimit > 0) {
      const numW = topic.writing.numQuestions || 1;
      writingDetails = `- Esercizio di Writing: genera ESATTAMENTE ${numW} traccia/e di scrittura (ciascuna come oggetto separato nel vettore writingPrompts), ciascuna con un limite di ${topic.writing.wordLimit} parole.`;
      if (topic.writing.directives) {
        writingDetails += `\n  - **DIRETTIVE SPECIALI DI SCRITTURA (TASSATIVE)**: Devi assolutamente e rigorosamente rispettare queste indicazioni dell'utente per la traccia di scrittura: "${topic.writing.directives}"`;
      }
    }

    let listeningDetails = '';
    if (topic.listening.enabled && topic.listening.durationSeconds > 0) {
      const wordEstimate = Math.round((topic.listening.durationSeconds / 60) * 150); // 150 wpm
      const listeningExerciseCounts = Object.entries(topic.listening.exercises || {})
        .filter(([, count]) => count > 0)
        .map(([type, count]) => {
          const enumString = getQuestionTypeEnumString(type);
          let extra = '';
          if (type.includes('Vero/Falso')) {
            extra = ' con SOLO due opzioni: "Vero" e "Falso"';
          }
          return `- ${type} (usa il questionType "${enumString}"): ESATTAMENTE ${count} domande${extra}`;
        })
        .join('\n');

      if (listeningExerciseCounts) {
        const preExistingText = listeningTexts?.[topic.name];
        if (preExistingText) {
          listeningDetails = `- Esercizio di Ascolto:\n  - **ATTENZIONE**: Per questo esercizio devi usare ESATTAMENTE il seguente testo (transcript) già stabilito per le altre file:\n"""\n${preExistingText}\n"""\n  - Non inventare un nuovo testo. Usa quello sopra.\n  - Basato su questo testo specifico, crea le seguenti domande (che devono essere diverse e uniche rispetto a quelle delle altre file):\n${listeningExerciseCounts.split('\n').map(l => `    ${l}`).join('\n')}`;
        } else {
          listeningDetails = `- Esercizio di Ascolto:\n  - Genera un testo (transcript) di circa ${wordEstimate} parole (per una durata audio di circa ${topic.listening.durationSeconds} secondi).\n  - Basato su questo testo, crea le seguenti domande:\n${listeningExerciseCounts.split('\n').map(l => `    ${l}`).join('\n')}`;
        }
        if (topic.listening.directives) {
          listeningDetails += `\n  - **DIRETTIVE SPECIALI DI ASCOLTO (TASSATIVE)**: Devi assolutamente e rigorosamente rispettare queste indicazioni dell'utente per la generazione del testo (transcript) e/o delle domande di ascolto: "${topic.listening.directives}"`;
        }
      }
    }

    const details = [exerciseCounts, readingDetails, writingDetails, listeningDetails].filter(Boolean).join('\n');

    return `**Argomento: "${topic.name}"**\nRichieste:\n${details}`;
  }).join('\n\n');

  return `
    Crea un quiz di lingua ${params.language} per studenti.

    **Livello Studenti (CEFR):** ${params.level}
    **Variante del compito:** File ${versionLabel}
    È FONDAMENTALE che le domande generate per questa variante ("File ${versionLabel}") siano uniche. Se stai generando multiple versioni, questa deve essere distinta dalle altre ma mantenere la stessa difficoltà e struttura.

    **Struttura del Quiz:**
    Il quiz deve essere suddivisso nei seguenti argomenti, con le specifiche richieste per ciascuno.

    ${topicDetails}

    **Istruzioni Aggiuntive:**
    - **ATTENZIONE: È FONDAMENTALE rispettare ESATTAMENTE il numero di domande richiesto per ciascun tipo di esercizio e argomento. Non generarne né più né meno.**
    - Assicurati che difficoltà, testi e domande siano appropriati per il livello ${params.level}.
    - Per ogni domanda, assegna la proprietà "topic" con il nome esatto dell'argomento a cui appartiene.
    - Per le domande a scelta multipla, fornisci una risposta corretta e tre distrattori plausibili.
    - **IMPORTANTE PER "Vero/Falso":** Quando generi domande Vero/Falso, devi usare obbligatoriamente solo e soltanto 2 opzioni nell'array options: "Vero" e "Falso".
    - **IMPORTANTE PER "FILL IN THE BLANK":** Se la domanda richiede la coniugazione di un verbo, devi inserire il verbo all'infinito tra parentesi subito dopo lo spazio vuoto. Esempio: "She ___ (to go) home." oppure "If I ___ (to be) you...".
    - Formula le domande, i testi e le tracce in ${params.language}. Le istruzioni generali o le frasi di partenza per gli esercizi di traduzione devono essere in italiano, dato che gli studenti sono di madrelingua italiana.
    - Genera un titolo generale per il quiz che rifletta tutti gli argomenti trattati. IMPORTANTE: NON includere MAI "Fila A/B" o la versione del compito nel titolo, verrà aggiunto automaticamente dal sistema.
  `;
}

async function makeApiCall(prompt: string, schema: object, signal?: AbortSignal): Promise<any> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("API key non trovata. Assicurati che sia configurata nell'ambiente.");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const models = ["gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash"];
  let lastError: any = null;

  for (const model of models) {
    if (signal?.aborted) {
      const err = new Error('AbortError');
      err.name = 'AbortError';
      throw err;
    }
    try {
      console.log(`Tentativo di chiamata API con modello: ${model}`);
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.7, // Increased slightly to ensure variance between versions
        },
        // @ts-ignore
        signal: signal,
      });

      const jsonText = response.text.trim();
      return JSON.parse(jsonText);

    } catch (error: any) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("Chiamata API annullata dall'utente.");
        throw error;
      }
      console.warn(`Modello ${model} fallito con errore:`, error.message || error);
      lastError = error;
      // Procedi con il modello successivo nella lista
    }
  }

  console.error("Tutti i modelli Gemini sono falliti. Ultimo errore:", lastError);
  throw new Error(lastError?.message || "Tutti i modelli della pipeline sono temporaneamente non disponibili.");
}

export async function generateSpeech(language: string, text: string, signal?: AbortSignal): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("API key non trovata.");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Say with a standard, clear tone for ${language} language learners: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Voce chiara e standard
          },
        },
      },
      // @ts-ignore
      signal: signal,
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.[0];
    if (audioPart && audioPart.inlineData) {
      return audioPart.inlineData.data;
    }
    throw new Error("Nessun dato audio ricevuto dall'API TTS.");
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log("Generazione audio annullata.");
      throw error;
    }
    console.error("Errore durante la generazione dello speech:", error);
    throw new Error("Impossibile generare l'audio.");
  }
}

export interface GenerationProgress {
  percentage: number;
  message: string;
  currentVersion?: number;
  totalVersions?: number;
  step?: 'text' | 'audio';
}

export async function generateQuizzes(
  params: QuizGenerationParams,
  signal?: AbortSignal,
  onSpeechGenerationStart?: () => void,
  onProgress?: (progress: GenerationProgress) => void
): Promise<Quiz[]> {
  const versions = Array.from({ length: params.numVersions }, (_, i) => String.fromCharCode(65 + i));
  const results: Quiz[] = [];
  const numVersions = params.numVersions;
  const listeningTexts: Record<string, string> = {};
  const listeningAudios: Record<string, string> = {};

  // Calculate total "work units" for progressive bar
  // Each version has: 1 (Prompt Building) + 5 (LLM Text Gen) + 1 (Audio Gen per listening section)
  // For subsequent versions, audio gen is skipped, but we keep calculations simple.
  const unitsPerVersion = 1 + 5 + params.topics.filter(t => t.listening.enabled).length;
  const totalUnits = numVersions * unitsPerVersion;
  let completedUnits = 0;

  const updateProgress = (step: 'text' | 'audio', message: string, bonusUnits: number = 0, versionIdx: number) => {
    if (onProgress) {
      const percentage = Math.round((completedUnits / totalUnits) * 100);
      onProgress({
        percentage: Math.min(percentage + bonusUnits, 100),
        message,
        currentVersion: versionIdx + 1,
        totalVersions: numVersions,
        step
      });
    }
  };

  for (let i = 0; i < versions.length; i++) {
    const versionLabel = versions[i];
    if (signal?.aborted) {
      const err = new Error('AbortError');
      err.name = 'AbortError';
      throw err;
    }

    // Phase 1: Build Prompt
    updateProgress('text', `Inizializzazione Fila ${versionLabel}...`, 0, i);
    const prompt = buildPrompt(params, versionLabel, listeningTexts);
    completedUnits += 1;

    // Phase 2: LLM Call
    updateProgress('text', `Generazione Esercizi Fila ${versionLabel}...`, 2, i);
    const quizData = await makeApiCall(prompt, quizSchema, signal);
    completedUnits += 5;

    if (!quizData.title || !Array.isArray(quizData.questions)) {
      throw new Error(`Formato JSON testuale non valido per la Fila ${versionLabel}.`);
    }

    quizData.versionLabel = versionLabel;

    const listeningSections = quizData.listeningSections || [];

    if (listeningSections.length > 0) {
      if (onSpeechGenerationStart) onSpeechGenerationStart();

      for (let j = 0; j < listeningSections.length; j++) {
        const section = listeningSections[j];
        const topicName = section.topic;

        if (listeningTexts[topicName]) {
          // Reuse transcript and audio from previous fila (e.g. Fila A)
          section.text = listeningTexts[topicName];
          section.audioBase64 = listeningAudios[topicName];
        } else {
          // First time generating this listening section
          updateProgress('audio', `Creazione Audio Fila ${versionLabel} (${j + 1}/${listeningSections.length})`, 0, i);

          if (section.text && !section.audioBase64) {
            if (signal?.aborted) {
              const err = new Error("Aborted");
              err.name = "AbortError";
              throw err;
            }
            section.audioBase64 = await generateSpeech(params.language, section.text, signal);
          }
          // Cache it for subsequent fili
          listeningTexts[topicName] = section.text;
          listeningAudios[topicName] = section.audioBase64 || '';
        }
        completedUnits += 1;
      }
    }

    results.push(quizData as Quiz);

    // Final update for this version if no audio was generated
    if (listeningSections.length === 0) {
      updateProgress('text', `Fila ${versionLabel} completata`, 0, i);
    } else {
      updateProgress('audio', `Fila ${versionLabel} completata`, 0, i);
    }

    if (versionLabel !== versions[versions.length - 1]) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Standardize titles for all versions: same base title, each with the Fila letter suffix
  const rawBaseTitle = results[0]?.title || 'Verifica';
  const baseTitle = rawBaseTitle.replace(/\s*-\s*Fila\s+[A-Z]/i, '').trim();
  results.forEach((quiz, i) => {
    const label = quiz.versionLabel || String.fromCharCode(65 + i);
    quiz.title = `${baseTitle} - Fila ${label}`;
  });

  if (onProgress) onProgress({ percentage: 100, message: 'Processo completato!', currentVersion: numVersions, totalVersions: numVersions });
  return results;
}

// Keep the old name for backward compatibility or refactor App to use generateQuizzes
// but App.tsx calls generateQuiz. Let's redirect.
export async function generateQuiz(
  params: QuizGenerationParams,
  signal?: AbortSignal,
  onSpeechGenerationStart?: () => void,
  onProgress?: (progress: GenerationProgress) => void
): Promise<Quiz[]> {
  return generateQuizzes(params, signal, onSpeechGenerationStart, onProgress);
}

export async function regenerateQuestions(language: string, level: string, topic: string, questionType: string, count: number, signal?: AbortSignal): Promise<Question[]> {
  // Use schema for array of questions
  const arraySchema = {
    type: Type.ARRAY,
    items: questionSchema,
  };

  const questionTypeEnum = getQuestionTypeEnumString(questionType);

  let prompt = `
    Genera ESATTAMENTE ${count} domande di ${language}.
    **Livello:** ${level}
    **Argomento:** ${topic}
    **Tipo Esercizio:** ${questionType} (questionType: "${questionTypeEnum}")
    
    IMPORTANTE:
    - Restituisci SOLO un array JSON di domande.
    - Le domande devono essere valide e coerenti con il livello.
    - Per 'Fill in the blank': Se la domanda richiede la coniugazione di un verbo, devi inserire il verbo all'infinito tra parentesi subito dopo lo spazio vuoto. Esempio: "She ___ (to go) home."
    - Le istruzioni generali o le frasi di partenza per gli esercizi di traduzione devono essere in italiano, dato che gli studenti sono di madrelingua italiana.
  `;
  return await makeApiCall(prompt, arraySchema, signal);
}

export async function regenerateComplexSection(
  language: string,
  level: string,
  topic: string,
  sectionType: 'reading' | 'listening',
  config: TopicRequest['reading'] | TopicRequest['listening'],
  signal?: AbortSignal,
  customTranscript?: string
): Promise<ReadingSection | ListeningSection> {

  let exercisesDetails = '';
  const exerciseCounts = Object.entries(config.exercises || {})
    .filter(([, count]) => count > 0)
    .map(([type, count]) => {
      const enumString = getQuestionTypeEnumString(type);
      let extra = '';
      if (type.includes('Vero/Falso')) {
        extra = ' con SOLO due opzioni: "Vero" e "Falso"';
      }
      return `- ${type} (usa il questionType "${enumString}"): ESATTAMENTE ${count} domande${extra}`;
    })
    .join('\n');

  let prompt = '';
  let schema = {};

  if (sectionType === 'reading') {
    const readConfig = config as TopicRequest['reading'];
    schema = readingSectionSchema;
    let directivesText = '';
    if (readConfig.directives) {
      directivesText = `\n  - **DIRETTIVE SPECIALI DI LETTURA (TASSATIVE)**: Devi assolutamente e rigorosamente rispettare queste indicazioni dell'utente per la generazione del testo e/o delle domande di lettura: "${readConfig.directives}"`;
    }
    if (readConfig.mode === 'custom' && readConfig.customText) {
      prompt = `
                Crea un esercizio di Reading Comprehension in ${language}.
                **Argomento:** ${topic}
                **Livello:** ${level}
                **Testo Fornito:**
                """
                ${readConfig.customText}
                """
                Basandoti SUL TESTO FORNITO, genera le seguenti domande:
                ${exerciseCounts}${directivesText}
                
                IMPORTANTE: Le istruzioni generali o le frasi di partenza per gli esercizi di traduzione devono essere in italiano, dato che gli studenti sono di madrelingua italiana.
             `;
    } else {
      prompt = `
                Crea un esercizio di Reading Comprehension in ${language}.
                **Argomento:** ${topic}
                **Livello:** ${level}
                Genera un testo di circa ${readConfig.wordCount || 150} parole.
                Basandoti sul testo generato, crea le seguenti domande:
                ${exerciseCounts}${directivesText}
                
                IMPORTANTE: Le istruzioni generali o le frasi di partenza per gli esercizi di traduzione devono essere in italiano, dato che gli studenti sono di madrelingua italiana.
             `;
    }
  } else {
    const listenConfig = config as TopicRequest['listening'];
    schema = listeningSectionSchema;
    let directivesText = '';
    if (listenConfig.directives) {
      directivesText = `\n  - **DIRETTIVE SPECIALI DI ASCOLTO (TASSATIVE)**: Devi assolutamente e rigorosamente rispettare queste indicazioni dell'utente per la generazione del testo (transcript) e/o delle domande di ascolto: "${listenConfig.directives}"`;
    }

    if (customTranscript) {
      prompt = `
            Crea un esercizio di Ascolto (Listening) in ${language}.
            **Argomento:** ${topic}
            **Livello:** ${level}
            **Testo dell'audio (Transcript) prefissato**:
            """
            ${customTranscript}
            """
            Usa ESATTAMENTE il testo sopra per l'audio (non modificarlo).
            Basandoti su questo transcript specifico, crea le seguenti domande (che devono essere diverse e uniche rispetto alle altre file):
            ${exerciseCounts}${directivesText}
            
            IMPORTANTE: Le istruzioni generali o le frasi di partenza per gli esercizi di traduzione devono essere in italiano, dato che gli studenti sono di madrelingua italiana.
         `;
    } else {
      prompt = `
            Crea un esercizio di Ascolto (Listening) in ${language}.
            **Argomento:** ${topic}
            **Livello:** ${level}
            Genera un transcript (testo) adatto per un audio di ${listenConfig.durationSeconds} secondi.
            Basandoti sul transcript, crea le seguenti domande:
            ${exerciseCounts}${directivesText}
            
            IMPORTANTE: Le istruzioni generali o le frasi di partenza per gli esercizi di traduzione devono essere in italiano, dato che gli studenti sono di madrelingua italiana.
         `;
    }
  }

  const data = await makeApiCall(prompt, schema, signal);

  if (sectionType === 'listening' && data.text) {
    if (customTranscript) {
      data.text = customTranscript; // Force exact match
    } else {
      data.audioBase64 = await generateSpeech(language, data.text, signal);
    }
  }

  return data;
}

export async function regenerateWritingPrompt(
  language: string,
  level: string,
  topic: string,
  config: TopicRequest['writing'],
  signal?: AbortSignal
): Promise<WritingPrompt> {
  const wDirectives = config.directives ? `\n        - **DIRETTIVE SPECIALI DI SCRITTURA (TASSATIVE)**: Devi assolutamente e rigorosamente rispettare queste indicazioni dell'utente per la traccia di scrittura: "${config.directives}"` : '';
  const prompt = `
        Crea un singolo esercizio di produzione scritta (Writing) in ${language}.
        **Argomento:** ${topic}
        **Livello:** ${level}
        **Limite di parole:** ${config.wordLimit} parole
        ${wDirectives}

        Genera una traccia di scrittura coinvolgente ed educativa adatta al livello e argomento specificati.
        
        **REGOLA TASSATIVA PER LE CONSEGNE (ISTRUZIONI):** La consegna (l'istruzione dell'esercizio di scrittura, es. "Scrivi un testo su...") deve essere scritta **SEMPRE nella lingua del compito (${language})**, mai in italiano o altre lingue.
    `;
  const schema = {
    type: Type.OBJECT,
    properties: {
      topic: { type: Type.STRING, description: "L'argomento della traccia di scrittura." },
      promptText: { type: Type.STRING, description: "La traccia o la domanda per l'esercizio di scrittura." },
      wordLimit: { type: Type.NUMBER, description: "Il limite di parole richiesto per la risposta." }
    },
    required: ['topic', 'promptText', 'wordLimit']
  };

  const data = await makeApiCall(prompt, schema, signal);
  return data;
}
