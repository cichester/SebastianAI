import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './services/firebase';
import { getUserHistory, saveUserHistory } from './services/firestoreService';
import QuizInputForm from './components/QuizInputForm';
import QuizPreview from './components/QuizPreview';
import SettingsModal from './components/SettingsModal';
import LoadingSpinner from './components/LoadingSpinner';
import HistoryPanel from './components/HistoryPanel';
import DashboardView from './components/DashboardView';
import LoginView from './components/LoginView';
import Sidebar from './components/Sidebar';
import SupportModal from './components/SupportModal';
import { SunIcon, MoonIcon } from './components/icons';
import { generateQuiz, regenerateQuestions, regenerateComplexSection, regenerateWritingPrompt, type GenerationProgress } from './services/geminiService';
import { validateQuizDraft, validateRegeneratedQuestions, validateRegeneratedComplexSection, validateRegeneratedWritingPrompt } from './utils/validation';
import type { Quiz, QuizGenerationParams, Question, HistoryEntry, ReadingSection, ListeningSection, WritingPrompt } from './types';
import { PdfFormat } from './types';
import { HISTORY_KEY } from './constants';
import { safeGetItem, safeSetItem, safeRemoveItem } from './utils/storage';

const MAX_RETRIES = 5;
const MAX_HISTORY_ITEMS = 10;

type CreationStatus = 'idle' | 'loading' | 'success' | 'partial_success' | 'error';

interface FailedQuestionInfo {
    question: Question;
    error: string;
}

interface CreationState {
    status: CreationStatus;
    message?: string;
    url?: string; // stores last created or a summary link if possible
    urls?: string[]; // array containing links to all created files in batch
    failedItems?: FailedQuestionInfo[];
}


const getErrorDetails = (errText: string) => {
  const lower = errText.toLowerCase();
  if (lower.includes('503') || lower.includes('service unavailable') || lower.includes('high demand') || lower.includes('overloaded') || lower.includes('unavailable')) {
    return {
      title: 'Gemini API Temporaneamente Sovraccarica (Errore 503)',
      desc: 'Il servizio Google Gemini sta ricevendo troppe richieste in questo momento ed è momentaneamente congestionato. Riprova tra qualche secondo.',
      color: 'bg-amber-50 border-amber-500 text-amber-900 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-200',
      iconColor: 'text-amber-500 dark:text-amber-400'
    };
  }
  if (lower.includes('api key non trovata') || lower.includes('key non trovata') || lower.includes('missing api key') || lower.includes('invalid api key')) {
    return {
      title: 'Configurazione Chiave API Mancante o Errata',
      desc: 'Non è stato possibile autenticarsi con le API di Google Gemini. Verifica che il file .env contenga la variabile GEMINI_API_KEY con una chiave valida.',
      color: 'bg-red-50 border-red-500 text-red-900 dark:bg-red-950/30 dark:border-red-700 dark:text-red-200',
      iconColor: 'text-red-500 dark:text-red-400'
    };
  }
  if (lower.includes('non è valida') || lower.includes('validazione') || lower.includes('tentativo')) {
    return {
      title: 'Impossibile Generare un Compito Valido',
      desc: 'Il modello IA non è riuscito a generare esercizi conformi allo schema richiesto dopo diversi tentativi. Ti consigliamo di modificare i parametri del quiz (es. numero domande o tipologia di esercizi) e riprovare.',
      color: 'bg-red-50 border-red-500 text-red-900 dark:bg-red-950/30 dark:border-red-700 dark:text-red-200',
      iconColor: 'text-red-500 dark:text-red-400'
    };
  }
  return {
    title: 'Errore durante la Creazione del Compito',
    desc: errText,
    color: 'bg-red-50 border-red-500 text-red-900 dark:bg-red-950/30 dark:border-red-700 dark:text-red-200',
    iconColor: 'text-red-500 dark:text-red-400'
  };
};

const App: React.FC = () => {
  const [quizParams, setQuizParams] = useState<QuizGenerationParams | null>(null);
  const [pendingParams, setPendingParams] = useState<QuizGenerationParams | null>(null);
  const [showFormatSelector, setShowFormatSelector] = useState<boolean>(false);
  const [quizDraft, setQuizDraft] = useState<Quiz[] | null>(null); // Changed to array
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress>({ percentage: 0, message: '' });
  const [displayProgress, setDisplayProgress] = useState<number>(0);
  const progressIntervalRef = useRef<number | null>(null);

  // Smooth progress animation
  useEffect(() => {
    if (isLoading) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      
      progressIntervalRef.current = window.setInterval(() => {
        setDisplayProgress(prev => {
          // If we haven't reached the real target, increment by 1
          if (prev < generationProgress.percentage) {
            return Math.min(prev + 1, generationProgress.percentage);
          }
          // If we are at the target, potentially fake a slow climb (up to a cap) 
          // to make it feel "active" during long API calls
          if (prev < 99) {
            return prev + 0.1; // Very slow increment
          }
          return prev;
        });
      }, 100);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setDisplayProgress(0);
    }
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isLoading, generationProgress.percentage]);
  const [isGeneratingSpeech, setIsGeneratingSpeech] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState(0);
  const [webAppUrl, setWebAppUrl] = useState<string | null>(null);
  const [formCreationState, setFormCreationState] = useState<CreationState>({ status: 'idle' });
  const [docCreationState, setDocCreationState] = useState<CreationState>({ status: 'idle' });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<'welcome' | 'dashboard' | 'create' | 'preview' | 'settings'>('welcome');
  const [pdfFormat, setPdfFormat] = useState<PdfFormat>(() => {
    if (typeof window !== 'undefined' && safeGetItem('pdfFormat')) {
        return safeGetItem('pdfFormat') as PdfFormat;
    }
    return PdfFormat.MODERN;
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined' && safeGetItem('theme')) {
        return safeGetItem('theme') as 'light' | 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthenticated(!!u);
      if (u) {
          const userHistory = await getUserHistory(u.uid);
          setHistory(userHistory);
      } else {
          setHistory([]);
      }
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        safeSetItem('theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        safeSetItem('theme', 'light');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    // Gestione del callback OAuth di Google dal backend
    if (window.location.pathname === '/oauth-callback' || window.location.search.includes('access_token=')) {
      const params = new URLSearchParams(window.location.search);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      
      if (accessToken) {
        safeSetItem('googleAccessToken', accessToken);
        console.log('Token OAuth salvato correttamente da oauth-callback');
      }
      if (refreshToken) {
        safeSetItem('googleRefreshToken', refreshToken);
      }
      // Pulisci l'URL e reindirizza alla home page pulita
      window.history.replaceState({}, document.title, '/');
      // Ricarica la pagina per sincronizzare lo stato dei componenti se necessario
      window.location.reload();
    }

    const savedUrl = safeGetItem('googleWebAppUrl');
    if (savedUrl) {
      setWebAppUrl(savedUrl);
    }
  }, []);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const updateHistory = useCallback((newEntry: HistoryEntry) => {
      setHistory(currentHistory => {
          const updatedHistory = [newEntry, ...currentHistory].slice(0, MAX_HISTORY_ITEMS);
          if (auth.currentUser) {
              saveUserHistory(auth.currentUser.uid, updatedHistory).catch(console.error);
          }
          return updatedHistory;
      });
  }, []);

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setIsLoading(false);
        setIsGeneratingSpeech(false);
        setError("Generazione annullata dall'utente.");
    }
  };
  
  const resetCreationStates = () => {
    setFormCreationState({ status: 'idle' });
    setDocCreationState({ status: 'idle' });
  };

  const startQuizGeneration = useCallback(async (params: QuizGenerationParams, isFullRegen: boolean = false) => {
    if(!isFullRegen) {
      setQuizDraft(null);
      resetCreationStates();
    }
    setIsLoading(true);
    setGenerationProgress({ percentage: 0, message: 'Inizializzazione...' });
    setIsGeneratingSpeech(false);
    setError(null);
    setQuizParams(params);
    setRetryCount(0);
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (signal.aborted) {
            console.log("Processo di generazione interrotto prima del tentativo", attempt);
            return;
        }

        try {
            setRetryCount(attempt);
            const onSpeechStart = () => setIsGeneratingSpeech(true);
            const onProgress = (p: GenerationProgress) => setGenerationProgress(p);
            const quizzes = await generateQuiz(params, signal, onSpeechStart, onProgress);
            
            if (signal.aborted) {
                console.log("Generazione annullata ma la risposta è arrivata. Risultato scartato.");
                return;
            }
            
            // Validate all quizzes
            const validationErrors: string[] = [];
            for(let i=0; i<quizzes.length; i++) {
                const validation = validateQuizDraft(quizzes[i], params);
                if (!validation.isValid) {
                    validationErrors.push(`Versione ${i+1}: ${validation.errors.join(', ')}`);
                }
            }
            
            if (validationErrors.length === 0) {
                setQuizDraft(quizzes);
                setError(null);
                
                const newEntry: HistoryEntry = {
                    id: Date.now(),
                    createdAt: new Date().toISOString(),
                    title: quizzes[0].title.split(' - Fila')[0], // Use base title
                    quizzes: quizzes,
                    params: params,
                };
                updateHistory(newEntry);
                setCurrentView('preview');

                setIsLoading(false);
                setIsGeneratingSpeech(false);
                return;
            } else {
                const errorMessage = `Tentativo ${attempt} fallito. Errori: \n${validationErrors.join('\n')}`;
                console.warn(errorMessage);
                setError(`La bozza generata non è valida (tentativo ${attempt}/${MAX_RETRIES}). Sto ritentando...\n${validationErrors.join("\n")}`);
            }
        } catch (e: any) {
            if (e.name === 'AbortError') {
              console.log("Catturata eccezione AbortError. Uscita dalla generazione.");
              return;
            }
            console.error("Generazione fallita con errore fatale:", e);
            setError(e.message || `Si è verificato un errore sconosciuto durante il tentativo ${attempt}.`);
            setIsLoading(false);
            setIsGeneratingSpeech(false);
            return;
        }
    }
    
    setIsLoading(false);
    setIsGeneratingSpeech(false);
    if (!signal.aborted && !error) {
        setError(`Impossibile generare una bozza valida dopo ${MAX_RETRIES} tentativi. Per favore, prova a modificare i parametri o riprova più tardi.`);
    }

  }, [updateHistory]);

  const handleGenerateQuiz = useCallback((params: QuizGenerationParams) => {
    setPendingParams(params);
    setShowFormatSelector(true);
  }, []);

  const confirmGeneration = (selectedFormat?: PdfFormat) => {
    if (selectedFormat) {
      setPdfFormat(selectedFormat);
      localStorage.setItem('pdfFormat', selectedFormat);
    }
    setShowFormatSelector(false);
    if (pendingParams) {
      startQuizGeneration(pendingParams);
    }
  };

  const handleFullRegenerate = useCallback(() => {
    if (quizParams) {
        resetCreationStates();
        startQuizGeneration(quizParams, true);
    }
  }, [quizParams, startQuizGeneration]);
  
  const handleRegenerateSection = useCallback(async (quizIndex: number, topic: string, questionType: string, count: number) => {
    if (!quizParams) return;

    resetCreationStates();
    const regenId = `${topic}-${questionType}`;
    setIsRegenerating(regenId);
    setError(null);
    
    const controller = new AbortController();

    try {
        const newQuestions = await regenerateQuestions(quizParams.language, quizParams.level, topic, questionType, count, controller.signal);
        const validation = validateRegeneratedQuestions(newQuestions, count);

        if (!validation.isValid) {
          const errorMessage = `Le domande rigenerate non sono valide:\n- ${validation.errors.join("\n- ")}`;
          setError(errorMessage);
          return;
        }
        
        setQuizDraft(currentDraft => {
            if (!currentDraft || !currentDraft[quizIndex]) return currentDraft;
            
            const newDrafts = [...currentDraft];
            const targetQuiz = newDrafts[quizIndex];

            const questionTypeMap: {[key: string]: string} = {
              'Scelta Multipla': 'MULTIPLE_CHOICE',
              'Completa gli Spazi': 'FILL_IN_THE_BLANK',
              'Risposta Breve': 'SHORT_ANSWER',
              'Traduzione': 'TRANSLATION',
            };
            const mappedType = questionTypeMap[questionType];

            const updatedQuestions = targetQuiz.questions.filter(
                q => !(q.topic === topic && q.questionType === mappedType)
            );

            newDrafts[quizIndex] = {
                ...targetQuiz,
                questions: [...updatedQuestions, ...newQuestions],
            };
            return newDrafts;
        });

    } catch (e: any) {
        if (e.name !== 'AbortError') {
          setError(e.message || "Errore durante la rigenerazione.");
        }
    } finally {
        setIsRegenerating(null);
    }
  }, [quizParams]);
  
  const handleRegenerateComplexSection = useCallback(async (quizIndex: number, sectionType: 'reading' | 'listening', topic: string) => {
    if (!quizParams || !quizDraft) return;

    resetCreationStates();
    const regenId = `complex-${sectionType}-${topic}`;
    setIsRegenerating(regenId);
    setError(null);

    const controller = new AbortController();
    
    const topicConfig = quizParams.topics.find(t => t.name === topic);
    if (!topicConfig) {
        setError(`Configurazione non trovata per l'argomento "${topic}".`);
        setIsRegenerating(null);
        return;
    }
    const sectionConfig = topicConfig[sectionType];

    try {
        const newSection = await regenerateComplexSection(quizParams.language, quizParams.level, topic, sectionType, sectionConfig, controller.signal);

        const validation = validateRegeneratedComplexSection(newSection, sectionConfig, sectionType);

        if (!validation.isValid) {
            const errorMessage = `La sezione rigenerata non è valida:\n- ${validation.errors.join("\n- ")}`;
            setError(errorMessage);
            return;
        }

        setQuizDraft(currentDraft => {
            if (!currentDraft || !currentDraft[quizIndex]) return currentDraft;
            const newDrafts = [...currentDraft];
            const targetQuiz = newDrafts[quizIndex];
            
            if (sectionType === 'reading') {
                const sections = targetQuiz.readingSections || [];
                const index = sections.findIndex(s => s.topic === topic);
                if (index === -1) return currentDraft;
                const newSections = [...sections];
                newSections[index] = newSection as ReadingSection;
                newDrafts[quizIndex] = { ...targetQuiz, readingSections: newSections };
            } else { // listening
                const sections = targetQuiz.listeningSections || [];
                const index = sections.findIndex(s => s.topic === topic);
                if (index === -1) return currentDraft;
                const newSections = [...sections];
                newSections[index] = newSection as ListeningSection;
                 newDrafts[quizIndex] = { ...targetQuiz, listeningSections: newSections };
            }
            return newDrafts;
        });

    } catch (e: any) {
        if (e.name !== 'AbortError') {
            setError(e.message || `Errore durante la rigenerazione della sezione ${sectionType}.`);
        }
    } finally {
        setIsRegenerating(null);
    }
}, [quizParams, quizDraft]);

  const handleRegenerateWritingPrompt = useCallback(async (quizIndex: number, topic: string) => {
    if (!quizParams || !quizDraft) return;

    resetCreationStates();
    const regenId = `writing-${topic}`;
    setIsRegenerating(regenId);
    setError(null);

    const controller = new AbortController();
    
    const topicConfig = quizParams.topics.find(t => t.name === topic);
    if (!topicConfig) {
        setError(`Configurazione non trovata per l'argomento "${topic}".`);
        setIsRegenerating(null);
        return;
    }
    const sectionConfig = topicConfig.writing;

    try {
        const newPrompt = await regenerateWritingPrompt(quizParams.language, quizParams.level, topic, sectionConfig, controller.signal);

        const validation = validateRegeneratedWritingPrompt(newPrompt, sectionConfig);

        if (!validation.isValid) {
            const errorMessage = `La sezione rigenerata non è valida:\n- ${validation.errors.join("\n- ")}`;
            setError(errorMessage);
            return;
        }

        setQuizDraft(currentDraft => {
            if (!currentDraft || !currentDraft[quizIndex]) return currentDraft;
            const newDrafts = [...currentDraft];
            const targetQuiz = newDrafts[quizIndex];
            
            const prompts = targetQuiz.writingPrompts || [];
            const index = prompts.findIndex(p => p.topic === topic);
            if (index === -1) return currentDraft;
            const newPrompts = [...prompts];
            newPrompts[index] = newPrompt;
            newDrafts[quizIndex] = { ...targetQuiz, writingPrompts: newPrompts };
            return newDrafts;
        });

    } catch (e: any) {
        if (e.name !== 'AbortError') {
            setError(e.message || `Errore durante la rigenerazione della sezione di scrittura.`);
        }
    } finally {
        setIsRegenerating(null);
    }
  }, [quizParams, quizDraft]);


  const handleApproveAndCreateForm = async () => {
    const token = safeGetItem('googleAccessToken');
    if (!quizDraft || !token) {
      setIsSettingsModalOpen(true);
      return;
    }
    
    setFormCreationState({ status: 'loading', message: `Contatto il server per creare ${quizDraft.length} form...` });
    setDocCreationState({ status: 'idle' }); 

    try {
        const createdUrls: string[] = [];
        const allErrors: FailedQuestionInfo[] = [];
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

        for (let i = 0; i < quizDraft.length; i++) {
             const quiz = quizDraft[i];
             setFormCreationState({ status: 'loading', message: `Creazione Form ${i+1} di ${quizDraft.length} (${quiz.versionLabel || 'A'})...` });

             const response = await fetch(`${backendUrl}/api/forms/create`, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quiz, access_token: token })
            });

            if (response.status === 401 || response.status === 403) {
              throw new Error("TOKEN_EXPIRED");
            }

            if (!response.ok) {
              const errText = await response.text().catch(() => '');
              if (errText.includes('Invalid Credentials') || errText.includes('authError') || errText.includes('invalid_grant')) {
                throw new Error("TOKEN_EXPIRED");
              }
              throw new Error(`Errore di rete file ${i+1}: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.status === 'success' || result.status === 'partial_success') {
                createdUrls.push(result.editUrl);
                if(result.errors) allErrors.push(...result.errors);
            } else {
                 if (result.message && (result.message.includes('Invalid Credentials') || result.message.includes('authError') || result.message.includes('invalid_grant'))) {
                   throw new Error("TOKEN_EXPIRED");
                 }
                 throw new Error(`Errore creazione file ${i+1}: ${result.message}`);
            }
        }

        setFormCreationState({
            status: allErrors.length > 0 ? 'partial_success' : 'success',
            message: `Creati ${createdUrls.length} Google Forms con successo!`,
            url: createdUrls[0],
            urls: createdUrls,
            failedItems: allErrors
        });

    } catch (err: any) {
        let errorMsg = err.message || '';
        if (errorMsg === "TOKEN_EXPIRED" || errorMsg.includes("Invalid Credentials") || errorMsg.includes("authError") || errorMsg.includes("401")) {
          errorMsg = "Il token di accesso Google è scaduto o non è valido. Per favore, clicca sull'icona delle Impostazioni (ingranaggio) in alto a destra ed effettua nuovamente l'accesso con Google per autorizzare l'applicazione.";
        }
        setFormCreationState({ status: 'error', message: `Errore durante la creazione dei form. Dettagli: ${errorMsg}` });
    }
  };

  const handleApproveAndCreateDoc = async () => {
    const token = safeGetItem('googleAccessToken');
    if (!quizDraft || !token) {
      setIsSettingsModalOpen(true);
      return;
    }
    
    setDocCreationState({ status: 'loading', message: `Contatto il server per creare ${quizDraft.length} documenti...` });
    setFormCreationState({ status: 'idle' });

    try {
        const createdUrls: string[] = [];
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

         for (let i = 0; i < quizDraft.length; i++) {
             const quiz = quizDraft[i];
             setDocCreationState({ status: 'loading', message: `Creazione Doc ${i+1} di ${quizDraft.length} (${quiz.versionLabel || 'A'})...` });

             const response = await fetch(`${backendUrl}/api/docs/create`, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quiz, access_token: token })
            });

            if (response.status === 401 || response.status === 403) {
              throw new Error("TOKEN_EXPIRED");
            }

            if (!response.ok) {
              const errText = await response.text().catch(() => '');
              if (errText.includes('Invalid Credentials') || errText.includes('authError') || errText.includes('invalid_grant')) {
                throw new Error("TOKEN_EXPIRED");
              }
              throw new Error(`Errore di rete file ${i+1}: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.status === 'success') {
                createdUrls.push(result.docUrl);
            } else {
                 if (result.message && (result.message.includes('Invalid Credentials') || result.message.includes('authError') || result.message.includes('invalid_grant'))) {
                   throw new Error("TOKEN_EXPIRED");
                 }
                 throw new Error(`Errore creazione file ${i+1}: ${result.message}`);
            }
        }

        setDocCreationState({
            status: 'success',
            message: `Creati ${createdUrls.length} Google Docs con successo!`,
            url: createdUrls[0],
            urls: createdUrls,
        });

    } catch (err: any) {
        let errorMsg = err.message || '';
        if (errorMsg === "TOKEN_EXPIRED" || errorMsg.includes("Invalid Credentials") || errorMsg.includes("authError") || errorMsg.includes("401")) {
          errorMsg = "Il token di accesso Google è scaduto o non è valido. Per favore, clicca sull'icona delle Impostazioni (ingranaggio) in alto a destra ed effettua nuovamente l'accesso con Google per autorizzare l'applicazione.";
        }
        setDocCreationState({ status: 'error', message: `Errore durante la creazione dei documenti. Dettagli: ${errorMsg}` });
    }
  };

  const handleRetryFailedQuestions = async () => {
    // Retry logic is tricky with multiple forms. For now disabling or simplified to alert.
    alert("Funzionalità di retry disponibile solo per creazione singola al momento.");
    // Implementation for retry would require tracking which form had which error.
    // Given the complexity upgrade, we pause this for the batch update.
  };
  
  const handleLoadFromHistory = useCallback((entry: HistoryEntry) => {
    setQuizParams(entry.params);
    setQuizDraft(entry.quizzes); // Load array
    resetCreationStates();
    setError(null);
    setCurrentView('preview');
  }, []);

  const handleDeleteFromHistory = useCallback((id: number) => {
      setHistory(currentHistory => {
          const updatedHistory = currentHistory.filter(entry => entry.id !== id);
          if (auth.currentUser) {
              saveUserHistory(auth.currentUser.uid, updatedHistory).catch(console.error);
          }
          return updatedHistory;
      });
  }, []);
  
  const handleUpdateHistoryTitle = useCallback((id: number, newTitle: string) => {
    setHistory(currentHistory => {
        const updatedHistory = currentHistory.map(entry => 
            entry.id === id ? { ...entry, title: newTitle } : entry
        );
        if (auth.currentUser) {
            saveUserHistory(auth.currentUser.uid, updatedHistory).catch(console.error);
        }
        return updatedHistory;
    });
  }, []);

  const handleDuplicateHistory = useCallback((entry: HistoryEntry) => {
      const duplicatedEntry: HistoryEntry = {
          ...entry,
          id: Date.now(),
          createdAt: new Date().toISOString(),
          title: `${entry.title} (Copia)`
      };
      updateHistory(duplicatedEntry);
  }, [updateHistory]);

  const handleDuplicateAndRegenerate = useCallback((entry: HistoryEntry) => {
      startQuizGeneration(entry.params);
  }, [startQuizGeneration]);

  const getFormCreationStateUI = () => {
      if (formCreationState.status === 'idle') return null;

      const baseClasses = "p-4 rounded-lg shadow-md mt-6 transition-colors border-l-4";
      let statusConfig = { containerClasses: '', title: '', linkClasses: '', linkText: 'Apri Primo Form' };

      switch (formCreationState.status) {
          case 'loading':
              statusConfig = { ...statusConfig, containerClasses: "bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-300", title: "Operazione in corso..." };
              break;
          case 'success':
              statusConfig = { ...statusConfig, containerClasses: "bg-green-50 dark:bg-green-900/20 border-green-500 dark:border-green-600 text-green-700 dark:text-green-300", title: "Successo!", linkClasses: "text-green-800 dark:text-green-200 hover:underline" };
              break;
          case 'partial_success':
              statusConfig = { ...statusConfig, containerClasses: "bg-amber-50 dark:bg-amber-900/20 border-amber-500 dark:border-amber-600 text-amber-700 dark:text-amber-300", title: "Successo Parziale", linkClasses: "text-amber-800 dark:text-amber-200 hover:underline" };
              break;
          case 'error':
              statusConfig = { ...statusConfig, containerClasses: "bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-600 text-red-700 dark:text-red-300", title: "Errore" };
              break;
      }

      return (
          <div className={`${baseClasses} ${statusConfig.containerClasses}`}>
              <p className="font-bold">{statusConfig.title}</p>
              <p className="whitespace-pre-wrap text-sm">{formCreationState.message}</p>
              
              {formCreationState.urls && formCreationState.urls.length > 0 ? (
                  <div className="mt-4 bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-current/10">
                      <p className="text-xs mb-2 font-semibold">Moduli Google Creati (uno per ciascuna Fila):</p>
                      <div className="flex flex-wrap gap-2">
                        {formCreationState.urls.map((url, idx) => (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 dark:bg-purple-900/80 dark:text-purple-100 dark:hover:bg-purple-800 dark:border-purple-700 shadow-sm rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all hover:scale-105">
                            <svg className="w-4 h-4 text-purple-600 dark:text-purple-300" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2zm0-4H7V7h10v2zm0 8H7v-2h10v2z"/>
                            </svg>
                            Fila {String.fromCharCode(65 + idx)} &rarr;
                          </a>
                        ))}
                      </div>
                  </div>
              ) : formCreationState.url && (
                  <div className="mt-2">
                      <p className="text-xs mb-1">Link al file:</p>
                      <a href={formCreationState.url} target="_blank" rel="noopener noreferrer" className={`inline-block font-bold ${statusConfig.linkClasses}`}>
                        {statusConfig.linkText} &rarr;
                    </a>
                  </div>
              )}

              {formCreationState.status === 'partial_success' && formCreationState.failedItems && formCreationState.failedItems.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-amber-300 dark:border-amber-700/50">
                      <p className="font-bold text-amber-800 dark:text-amber-200">Dettaglio errori:</p>
                      <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                          {formCreationState.failedItems.map((item, index) => <li key={index}>{item.error}</li>)}
                      </ul>
                  </div>
              )}
          </div>
      );
  };
  
  const getDocCreationStateUI = () => {
      if (docCreationState.status === 'idle') return null;

      const baseClasses = "p-4 rounded-lg shadow-md mt-4 transition-colors border-l-4";
      let statusConfig = { containerClasses: '', title: '', linkClasses: '', linkText: 'Apri Primo Doc' };

      switch (docCreationState.status) {
          case 'loading':
              statusConfig = { ...statusConfig, containerClasses: "bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-300", title: "Creazione Documento in corso..." };
              break;
          case 'success':
              statusConfig = { ...statusConfig, containerClasses: "bg-green-50 dark:bg-green-900/20 border-green-500 dark:border-green-600 text-green-700 dark:text-green-300", title: "Successo!", linkClasses: "text-green-800 dark:text-green-200 hover:underline" };
              break;
          case 'error':
              statusConfig = { ...statusConfig, containerClasses: "bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-600 text-red-700 dark:text-red-300", title: "Errore" };
              break;
      }

      return (
          <div className={`${baseClasses} ${statusConfig.containerClasses}`}>
              <p className="font-bold">{statusConfig.title}</p>
              <p className="whitespace-pre-wrap text-sm">{docCreationState.message}</p>
              
              {docCreationState.urls && docCreationState.urls.length > 0 ? (
                  <div className="mt-4 bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-current/10">
                      <p className="text-xs mb-2 font-semibold">Documenti Google Creati (uno per ciascuna Fila):</p>
                      <div className="flex flex-wrap gap-2">
                        {docCreationState.urls.map((url, idx) => (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 dark:bg-blue-900/80 dark:text-blue-100 dark:hover:bg-blue-800 dark:border-blue-700 shadow-sm rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all hover:scale-105">
                            <svg className="w-4 h-4 text-blue-600 dark:text-blue-300" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                            </svg>
                            Fila {String.fromCharCode(65 + idx)} &rarr;
                          </a>
                        ))}
                      </div>
                  </div>
              ) : docCreationState.url && (
                   <div className="mt-2">
                        <p className="text-xs mb-1">Link al file:</p>
                        <a href={docCreationState.url} target="_blank" rel="noopener noreferrer" className={`inline-block font-bold ${statusConfig.linkClasses}`}>
                            {statusConfig.linkText} &rarr;
                        </a>
                   </div>
              )}
          </div>
      );
  };


  const handleUpdateQuiz = useCallback((index: number, updatedQuiz: Quiz) => {
    setQuizDraft(currentDraft => {
        if (!currentDraft) return null;
        const newDrafts = [...currentDraft];
        newDrafts[index] = updatedQuiz;
        
        // Sync with history if there's a match by title or if we want to be more proactive
        // In this app, the current quiz draft isn't strictly tied to one history ID in state,
        // but we can update the most recent history entry if it matches.
        setHistory(currentHistory => {
            if (currentHistory.length === 0) return currentHistory;
            const updatedHistory = [...currentHistory];
            // Usually the first item in history is the one currently being previewed
            // We check if the quizzes match the length and params roughly
            if (updatedHistory[0].quizzes.length === newDrafts.length) {
                updatedHistory[0] = { ...updatedHistory[0], quizzes: newDrafts };
                if (auth.currentUser) {
                    saveUserHistory(auth.currentUser.uid, updatedHistory).catch(console.error);
                }
            }
            return updatedHistory;
        });

        return newDrafts;
    });
  }, []);

  if (!authChecked) {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <LoadingSpinner message="Verifica credenziali..." />
        </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView onLogin={() => {}} />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <Sidebar 
        user={user || undefined}
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        theme={theme}
        toggleTheme={toggleTheme}
        onLogout={() => {
            import('./services/firebase').then(({ auth }) => {
                auth.signOut();
            });
        }}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenSupport={() => setIsSupportModalOpen(true)}
      />

      <main className="flex-1 ml-64 p-8">
        {currentView === 'welcome' && (
          <div className="max-w-4xl mx-auto w-full flex flex-col items-center justify-center min-h-[75vh] px-4 py-8">
            <div className="text-center mb-12 max-w-2xl">
              <div className="inline-flex items-center justify-center p-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-3xl mb-5 shadow-sm transition-transform hover:scale-105 duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4 bg-gradient-to-r from-emerald-600 to-indigo-600 dark:from-emerald-400 dark:to-indigo-400 bg-clip-text text-transparent">
                Sebastian AI
              </h1>
              <p className="text-slate-600 dark:text-slate-400 text-lg font-medium">
                Piattaforma intelligente per la progettazione e la generazione di verifiche linguistiche su misura, sicure e anti-copia.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">
              {/* Card 1: Libreria Test */}
              <button
                onClick={() => setCurrentView('dashboard')}
                className="flex flex-col items-center text-center p-8 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-[2rem] hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group shadow-sm"
              >
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl mb-5 group-hover:scale-110 transition-transform shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Libreria Test</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Esplora l'archivio dei compiti salvati, visualizza i dettagli delle varianti generate, duplica o esporta i test direttamente in Google Moduli e Documenti.
                </p>
              </button>

              {/* Card 2: Crea Nuovo Test */}
              <button
                onClick={() => { setQuizDraft(null); setCurrentView('create'); }}
                className="flex flex-col items-center text-center p-8 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-[2rem] hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group shadow-sm"
              >
                <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl mb-5 group-hover:scale-110 transition-transform shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Nuovo Quiz</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Configura gli argomenti grammaticali, imposta esercizi combinati (es. completa + traduci) e inserisci direttive personalizzate all'IA per lettura, ascolto e scrittura.
                </p>
              </button>
            </div>
          </div>
        )}

        {currentView === 'dashboard' && (
          <DashboardView
            history={history}
            onLoad={handleLoadFromHistory}
            onDelete={handleDeleteFromHistory}
            onUpdateTitle={handleUpdateHistoryTitle}
            onDuplicate={handleDuplicateHistory}
            onDuplicateAndRegenerate={handleDuplicateAndRegenerate}
            onCreateNew={() => { setQuizDraft(null); setCurrentView('create'); }}
          />
        )}

        {currentView === 'create' && (
          <div className="max-w-4xl mx-auto w-full">
            <div className="mb-8">
              <div className="flex items-center text-sm text-slate-500 mb-2">
                <span>Generatore</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mx-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
                <span className="font-medium text-emerald-600">Nuovo Quiz</span>
              </div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Crea Nuovo Quiz</h1>
              <p className="text-slate-600 mt-2">Configura i parametri per generare varianti uniche e anti-copia.</p>
            </div>
            
            {error && (() => {
              const details = getErrorDetails(error);
              return (
                <div className={`border-l-4 p-5 rounded-2xl shadow-sm mb-6 flex items-start space-x-3 transition-all duration-300 ${details.color}`} role="alert">
                  <div className={`mt-0.5 flex-shrink-0 ${details.iconColor}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-base leading-snug">{details.title}</h4>
                    <p className="mt-1 text-sm whitespace-pre-wrap leading-relaxed opacity-90">{details.desc}</p>
                  </div>
                </div>
              );
            })()}
            
            <QuizInputForm onGenerate={handleGenerateQuiz} isLoading={isLoading} />
            

            <AnimatePresence>
              {showFormatSelector && pendingParams && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
                >
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full"
                  >
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Conferma Creazione</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-6">
                      Stai per generare un quiz in <span className="font-semibold text-slate-900 dark:text-white">{pendingParams.language}</span> ({pendingParams.level}) con <span className="font-semibold text-slate-900 dark:text-white">{pendingParams.numVersions} varianti</span> (Fila A, B...).
                    </p>
                    
                    <div className="space-y-4 mb-8">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Scegli il formato del PDF:</p>
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          type="button"
                          onClick={() => setPdfFormat(PdfFormat.MODERN)}
                          className={`flex flex-col items-center p-4 rounded-2xl border-2 transition-all ${
                            pdfFormat === PdfFormat.MODERN 
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' 
                            : 'border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600 bg-slate-50 dark:bg-slate-800/50'
                          }`}
                        >
                          <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white">Moderno</span>
                          <span className="text-xs text-slate-500 text-center mt-1">Design pulito con icone e box colorati.</span>
                        </button>
                        
                        <button 
                          type="button"
                          onClick={() => setPdfFormat(PdfFormat.CLASSIC)}
                          className={`flex flex-col items-center p-4 rounded-2xl border-2 transition-all ${
                            pdfFormat === PdfFormat.CLASSIC 
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' 
                            : 'border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600 bg-slate-50 dark:bg-slate-800/50'
                          }`}
                        >
                          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white">Classico</span>
                          <span className="text-xs text-slate-500 text-center mt-1">Formato standard ad alta leggibilità.</span>
                        </button>
                      </div>

                      {/* Illustrative template image preview */}
                      <div className="mt-4 border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900/40 p-3 flex flex-col items-center shadow-inner">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
                          Anteprima Layout {pdfFormat === PdfFormat.MODERN ? 'Moderno' : 'Classico'}
                        </span>
                        <img 
                          src={pdfFormat === PdfFormat.MODERN ? '/template_modern.png' : '/template_classic.png'} 
                          alt="Layout Template Preview" 
                          className="h-44 object-contain rounded border border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-300"
                        />
                      </div>
                    </div>
                    
                    <div className="flex space-x-3">
                      <button 
                        onClick={() => setShowFormatSelector(false)}
                        className="flex-1 px-6 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                      >
                        Indietro
                      </button>
                      <button 
                        onClick={() => confirmGeneration()}
                        className="flex-[2] px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/20"
                      >
                        Inizia Creazione &rarr;
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            
          </div>
        )}

        {currentView === 'preview' && (
          <div className="max-w-5xl mx-auto w-full print:max-w-none print:m-0 print:p-0">
             {!quizDraft && !isLoading ? (
                 <div className="text-center py-20">Nessun quiz generato. Clicca su Crea Nuovo Quiz.</div>
             ) : quizDraft ? (
               <>
                 <QuizPreview 
                   quizzes={quizDraft} 
                   language={quizParams?.language || 'Lingua'}
                   onCreateForm={handleApproveAndCreateForm}
                   onCreateDoc={handleApproveAndCreateDoc} 
                   onRegenerate={handleFullRegenerate}
                   onRegenerateSection={handleRegenerateSection}
                   onRegenerateComplexSection={handleRegenerateComplexSection}
                   onRegenerateWritingPrompt={handleRegenerateWritingPrompt}
                   onUpdateQuiz={handleUpdateQuiz}
                   pdfFormat={pdfFormat}
                   isCreating={formCreationState.status === 'loading' || docCreationState.status === 'loading'}
                   isRegeneratingId={isRegenerating}
                   formCreationStateUI={getFormCreationStateUI()}
                   docCreationStateUI={getDocCreationStateUI()}
                 />
               </>
             ) : null}
          </div>
        )}
      </main>

      {isSettingsModalOpen && (
        <SettingsModal 
            currentUrl={webAppUrl}
            currentPdfFormat={pdfFormat}
            onClose={() => setIsSettingsModalOpen(false)}
            onSave={(url) => {
                setWebAppUrl(url);
                safeSetItem('googleWebAppUrl', url);
                setIsSettingsModalOpen(false);
            }}
            onSavePdfFormat={(format) => {
                setPdfFormat(format);
                safeSetItem('pdfFormat', format);
            }}
        />
      )}
      {isSupportModalOpen && (
        <SupportModal onClose={() => setIsSupportModalOpen(false)} />
      )}

      <AnimatePresence>
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white dark:bg-slate-800 p-10 rounded-3xl shadow-2xl border border-emerald-100 dark:border-emerald-900/30 max-w-md w-full flex flex-col items-center text-center"
            >
              <LoadingSpinner 
                className="text-emerald-500 mb-6" 
                dotClassName="w-4 h-4" 
                progress={Math.round(displayProgress)}
                message={generationProgress.message}
                versionStatus={generationProgress.currentVersion && generationProgress.totalVersions 
                  ? `${generationProgress.currentVersion}/${generationProgress.totalVersions}` 
                  : undefined}
              />
              
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  {generationProgress.step === 'audio' ? "Generazione Audio..." : "Creazione Quiz..."}
              </h3>
              
              <p className="text-slate-600 dark:text-slate-400 mb-8">
                {generationProgress.step === 'audio' 
                  ? "Sto trasformando i testi in audio di alta qualità per la prova di ascolto."
                  : "L'intelligenza artificiale sta scrivendo domande su misura per i tuoi studenti."}
              </p>

              {retryCount > 1 && (
                  <div className="mb-6 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-full text-xs font-medium border border-amber-100 dark:border-amber-800/30">
                      Tentativo di recupero {retryCount} di {MAX_RETRIES}
                  </div>
              )}
              
              <button
                  onClick={handleCancelGeneration}
                  className="px-6 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 transition-all text-sm border border-slate-200 dark:border-slate-600"
              >
                  Annulla Generazione
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
