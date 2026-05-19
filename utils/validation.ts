
import type { Quiz, QuizGenerationParams, Question, TopicRequest, ReadingSection, ListeningSection, WritingPrompt } from '../types';
import { QuestionType } from '../types';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Mappa il nome visualizzato dell'esercizio (usato nell'UI) al valore enum corrispondente.
 * Restituisce null se il tipo di esercizio non è supportato dallo schema di domande standard.
 */
const getQuestionTypeEnum = (exerciseType: string): QuestionType | null => {
  if (exerciseType.includes('Scelta Multipla')) return QuestionType.MULTIPLE_CHOICE;
  if (exerciseType.includes('Completa gli spazi')) return QuestionType.FILL_IN_THE_BLANK;
  if (exerciseType.includes('Risposta Breve')) return QuestionType.SHORT_ANSWER;
  if (exerciseType.includes('Traduzione')) return QuestionType.TRANSLATION;
  return null; 
};

/**
 * Valida l'intera bozza del quiz rispetto ai parametri originali richiesti.
 */
export const validateQuizDraft = (quiz: Quiz, params: QuizGenerationParams): ValidationResult => {
  const errors: string[] = [];

  if (!quiz.title || typeof quiz.title !== 'string' || quiz.title.trim() === '') {
    errors.push("Il titolo del quiz è mancante o non valido.");
  }

  if (!Array.isArray(quiz.questions)) {
    errors.push("La struttura delle domande principali non è valida (non è un array).");
    return { isValid: false, errors }; // Errore bloccante
  }

  const allQuestions = [
      ...quiz.questions,
      ...(quiz.readingSections || []).flatMap(rs => rs.questions || [])
  ];

  // 1. Validazione strutturale di ogni singola domanda
  allQuestions.forEach((q, i) => {
    if (!q.questionText || !q.questionType || !q.topic) {
        errors.push(`Alla domanda ${i+1} mancano campi essenziali (testo, tipo o argomento).`);
        return;
    }
    if (q.questionType === QuestionType.MULTIPLE_CHOICE) {
      if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
        errors.push(`Domanda "${q.questionText.substring(0, 20)}...": mancano le opzioni o sono insufficienti.`);
      } else {
        const correctOptions = q.options.filter(opt => opt.isCorrect).length;
        if (correctOptions !== 1) {
          errors.push(`Domanda "${q.questionText.substring(0, 20)}...": deve avere esattamente una risposta corretta (trovate ${correctOptions}).`);
        }
      }
    } else if (q.questionType === QuestionType.FILL_IN_THE_BLANK || q.questionType === QuestionType.SHORT_ANSWER || q.questionType === QuestionType.TRANSLATION) {
      if (!q.correctAnswer || q.correctAnswer.trim() === '') {
        errors.push(`Domanda "${q.questionText.substring(0, 20)}...": manca la risposta corretta.`);
      }
    }
  });

  // 2. Validazione dei conteggi e delle sezioni rispetto ai parametri
  params.topics.forEach(topic => {
      // Controlla le domande standard
      Object.keys(topic.exercises).forEach(exerciseType => {
          const expectedCount = topic.exercises[exerciseType] as number;
          const questionTypeEnum = getQuestionTypeEnum(exerciseType);
          const isTrueFalse = exerciseType.includes('Vero/Falso');

          if (expectedCount > 0 && (questionTypeEnum || isTrueFalse)) {
              let actualCount = 0;
              if (isTrueFalse) {
                  actualCount = quiz.questions.filter(q => q.topic === topic.name && q.questionType === QuestionType.MULTIPLE_CHOICE && q.options && q.options.length === 2).length;
              } else if (questionTypeEnum === QuestionType.MULTIPLE_CHOICE) {
                  actualCount = quiz.questions.filter(q => q.topic === topic.name && q.questionType === QuestionType.MULTIPLE_CHOICE && (!q.options || q.options.length > 2)).length;
              } else {
                  actualCount = quiz.questions.filter(q => q.topic === topic.name && q.questionType === questionTypeEnum).length;
              }

              if (actualCount !== expectedCount) {
                  errors.push(`Argomento "${topic.name}": attese ${expectedCount} domande di tipo "${exerciseType}", ma ne sono state trovate ${actualCount}.`);
              }
          }
      });

      // Controlla la sezione di Lettura
      if (topic.reading.enabled) {
          const readingSection = (quiz.readingSections || []).find(rs => rs.topic === topic.name);
          if (!readingSection) {
              errors.push(`Argomento "${topic.name}": sezione di lettura richiesta ma non trovata.`);
          } else {
              if (!readingSection.text || readingSection.text.trim().length < 20) {
                  errors.push(`Argomento "${topic.name}": il testo della sezione di lettura sembra troppo corto o mancante.`);
              }
              // Valida il numero di domande di lettura per tipo
              const requestedReadingExercises = topic.reading.exercises || {};
              Object.keys(requestedReadingExercises).forEach(exerciseType => {
                const expectedCount = requestedReadingExercises[exerciseType] as number;
                const questionTypeEnum = getQuestionTypeEnum(exerciseType);
                const isTrueFalse = exerciseType.includes('Vero/Falso');

                if (expectedCount > 0 && (questionTypeEnum || isTrueFalse)) {
                    let actualCount = 0;
                    if (isTrueFalse) {
                        actualCount = (readingSection.questions || []).filter(q => q.questionType === QuestionType.MULTIPLE_CHOICE && q.options && q.options.length === 2).length;
                    } else if (questionTypeEnum === QuestionType.MULTIPLE_CHOICE) {
                        actualCount = (readingSection.questions || []).filter(q => q.questionType === QuestionType.MULTIPLE_CHOICE && (!q.options || q.options.length > 2)).length;
                    } else {
                        actualCount = (readingSection.questions || []).filter(q => q.questionType === questionTypeEnum).length;
                    }

                    if (actualCount !== expectedCount) {
                        errors.push(`Lettura, Argomento "${topic.name}": attese ${expectedCount} domande di tipo "${exerciseType}", ma ne sono state trovate ${actualCount}.`);
                    }
                }
              });
          }
      }

      // Controlla la sezione di Ascolto
      if (topic.listening.enabled) {
          const listeningSection = (quiz.listeningSections || []).find(ls => ls.topic === topic.name);
          if (!listeningSection) {
              errors.push(`Argomento "${topic.name}": sezione di ascolto richiesta ma non trovata.`);
          } else {
              if (!listeningSection.text || listeningSection.text.trim().length < 20) {
                  errors.push(`Argomento "${topic.name}": lo script della sezione di ascolto sembra troppo corto o mancante.`);
              }
              // Valida il numero di domande di ascolto per tipo
              const requestedListeningExercises = topic.listening.exercises || {};
              Object.keys(requestedListeningExercises).forEach(exerciseType => {
                const expectedCount = requestedListeningExercises[exerciseType] as number;
                const questionTypeEnum = getQuestionTypeEnum(exerciseType);
                const isTrueFalse = exerciseType.includes('Vero/Falso');

                if (expectedCount > 0 && (questionTypeEnum || isTrueFalse)) {
                    let actualCount = 0;
                    if (isTrueFalse) {
                        actualCount = (listeningSection.questions || []).filter(q => q.questionType === QuestionType.MULTIPLE_CHOICE && q.options && q.options.length === 2).length;
                    } else if (questionTypeEnum === QuestionType.MULTIPLE_CHOICE) {
                        actualCount = (listeningSection.questions || []).filter(q => q.questionType === QuestionType.MULTIPLE_CHOICE && (!q.options || q.options.length > 2)).length;
                    } else {
                        actualCount = (listeningSection.questions || []).filter(q => q.questionType === questionTypeEnum).length;
                    }

                    if (actualCount !== expectedCount) {
                        errors.push(`Ascolto, Argomento "${topic.name}": attese ${expectedCount} domande di tipo "${exerciseType}", ma ne sono state trovate ${actualCount}.`);
                    }
                }
              });
          }
      }

      // Controlla la sezione di Scrittura
      if (topic.writing.enabled) {
          const expectedCount = topic.writing.numQuestions || 1;
          const writingPrompts = (quiz.writingPrompts || []).filter(wp => wp.topic === topic.name);
          if (writingPrompts.length !== expectedCount) {
              errors.push(`Argomento "${topic.name}": attese ${expectedCount} tracce di scrittura, ma ne sono state trovate ${writingPrompts.length}.`);
          }
          writingPrompts.forEach((wp, wpIdx) => {
              if (!wp.promptText || wp.promptText.trim().length < 10) {
                   errors.push(`Argomento "${topic.name}", traccia ${wpIdx + 1}: la traccia della sezione di scrittura sembra troppo corta o mancante.`);
              }
          });
      }
  });


  return { isValid: errors.length === 0, errors };
};

/**
 * Valida un set di domande appena rigenerate.
 */
export const validateRegeneratedQuestions = (questions: Question[], expectedCount: number): ValidationResult => {
    const errors: string[] = [];

    if(!Array.isArray(questions)) {
        errors.push("La risposta dell'API non era un array di domande valido.");
        return { isValid: false, errors };
    }

    if (questions.length !== expectedCount) {
        errors.push(`Richieste ${expectedCount} domande, ma ne sono state rigenerate ${questions.length}.`);
    }

    questions.forEach((q, i) => {
        if (!q.questionText || !q.questionType || !q.topic) {
            errors.push(`Domanda rigenerata ${i + 1}: mancano campi essenziali (testo, tipo o argomento).`);
            return;
        }
        if (q.questionType === QuestionType.MULTIPLE_CHOICE) {
            if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
                errors.push(`Domanda rigenerata ${i + 1}: mancano le opzioni o sono insufficienti.`);
            } else {
                const correctOptions = q.options.filter(opt => opt.isCorrect).length;
                if (correctOptions !== 1) {
                    errors.push(`Domanda rigenerata ${i + 1}: deve avere esattamente una risposta corretta (trovate ${correctOptions}).`);
                }
            }
        } else if (q.questionType === QuestionType.FILL_IN_THE_BLANK || q.questionType === QuestionType.SHORT_ANSWER || q.questionType === QuestionType.TRANSLATION) {
            if (!q.correctAnswer || q.correctAnswer.trim() === '') {
                errors.push(`Domanda rigenerata ${i + 1}: manca la risposta corretta.`);
            }
        }
    });

    return { isValid: errors.length === 0, errors };
};

/**
 * Valida una sezione complessa (lettura/ascolto) appena rigenerata.
 */
export const validateRegeneratedComplexSection = (
  section: ReadingSection | ListeningSection,
  config: TopicRequest['reading'] | TopicRequest['listening'],
  sectionType: 'reading' | 'listening'
): ValidationResult => {
    const errors: string[] = [];

    if (!section) {
        errors.push("La sezione rigenerata è vuota o non valida.");
        return { isValid: false, errors };
    }
    if (!section.text || section.text.trim().length < 20) {
        errors.push(`Il testo della sezione rigenerata sembra troppo corto o mancante.`);
    }
    if (!Array.isArray(section.questions)) {
        errors.push("Le domande per la sezione rigenerata non sono in un formato valido (array).");
    } else {
        const expectedCount = Object.values(config.exercises || {}).reduce((sum, count) => sum + count, 0);
        if (section.questions.length !== expectedCount) {
            errors.push(`Attese ${expectedCount} domande, ma ne sono state rigenerate ${section.questions.length}.`);
        }
    }

    if (sectionType === 'listening') {
        const listeningSection = section as ListeningSection;
        if (!listeningSection.audioBase64 || listeningSection.audioBase64.trim() === '') {
            errors.push("L'audio per la sezione di ascolto non è stato generato correttamente.");
        }
    }
    
    return { isValid: errors.length === 0, errors };
};

/**
 * Valida un esercizio di scrittura (writing) appena rigenerato.
 */
export const validateRegeneratedWritingPrompt = (
  prompt: WritingPrompt,
  config: TopicRequest['writing']
): ValidationResult => {
    const errors: string[] = [];

    if (!prompt) {
        errors.push("La traccia rigenerata è vuota o non valida.");
        return { isValid: false, errors };
    }
    if (!prompt.promptText || prompt.promptText.trim().length < 10) {
        errors.push("La traccia della sezione di scrittura sembra troppo corta o mancante.");
    }
    
    return { isValid: errors.length === 0, errors };
};
