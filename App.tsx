import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { onAuthStateChanged } from 'firebase/auth';
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
import { SunIcon, MoonIcon } from './components/icons';
import { generateQuiz, regenerateQuestions, regenerateComplexSection, type GenerationProgress } from './services/geminiService';
import { validateQuizDraft, validateRegeneratedQuestions, validateRegeneratedComplexSection } from './utils/validation';
import type { Quiz, QuizGenerationParams, Question, HistoryEntry, ReadingSection, ListeningSection } from './types';
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
    failedItems?: FailedQuestionInfo[];
}


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
  const [retryCount, setRetryCount] = useState(0);
  const [webAppUrl, setWebAppUrl] = useState<string | null>(null);
  const [formCreationState, setFormCreationState] = useState<CreationState>({ status: 'idle' });
  const [docCreationState, setDocCreationState] = useState<CreationState>({ status: 'idle' });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'create' | 'preview' | 'settings'>('dashboard');
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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsAuthenticated(!!user);
      if (user) {
          const userHistory = await getUserHistory(user.uid);
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
            setError(e.message || `Si è verificato un errore sconosciuto durante il tentativo ${attempt}.`);
            break; 
        }
    }
    
    setIsLoading(false);
    setIsGeneratingSpeech(false);
    if (!signal.aborted) {
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

            if (!response.ok) throw new Error(`Errore di rete file ${i+1}: ${response.status}`);
            const result = await response.json();
            
            if (result.status === 'success' || result.status === 'partial_success') {
                createdUrls.push(result.editUrl);
                if(result.errors) allErrors.push(...result.errors);
            } else {
                 throw new Error(`Errore creazione file ${i+1}: ${result.message}`);
            }
        }

        setFormCreationState({
            status: allErrors.length > 0 ? 'partial_success' : 'success',
            message: `Creati ${createdUrls.length} Google Forms con successo!`,
            url: createdUrls[0], // Only link the first one for now, or listing all would require UI change
            failedItems: allErrors
        });

    } catch (err: any) {
        setFormCreationState({ status: 'error', message: `Errore durante la creazione dei form. Dettagli: ${err.message}` });
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

            if (!response.ok) throw new Error(`Errore di rete file ${i+1}: ${response.status}`);
            const result = await response.json();
            
            if (result.status === 'success') {
                createdUrls.push(result.docUrl);
            } else {
                 throw new Error(`Errore creazione file ${i+1}: ${result.message}`);
            }
        }

        setDocCreationState({
            status: 'success',
            message: `Creati ${createdUrls.length} Google Docs con successo!`,
            url: createdUrls[0],
        });

    } catch (err: any) {
        setDocCreationState({ status: 'error', message: `Errore durante la creazione dei documenti. Dettagli: ${err.message}` });
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
              
              {formCreationState.url && (
                  <div className="mt-2">
                      <p className="text-xs mb-1">Link al primo file (controlla il tuo Google Drive per gli altri):</p>
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
              
              {docCreationState.url && (
                   <div className="mt-2">
                        <p className="text-xs mb-1">Link al primo file (controlla il tuo Google Drive per gli altri):</p>
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
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        onLogout={() => {
            import('./services/firebase').then(({ auth }) => {
                auth.signOut();
            });
        }}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      <main className="flex-1 ml-64 p-8">
        {currentView === 'dashboard' && (
          <DashboardView
            history={history}
            onLoad={handleLoadFromHistory}
            onDelete={handleDeleteFromHistory}
            onUpdateTitle={handleUpdateHistoryTitle}
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
            
            <QuizInputForm onGenerate={handleGenerateQuiz} isLoading={isLoading} />
            
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
                          onClick={() => confirmGeneration(PdfFormat.MODERN)}
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
                          onClick={() => confirmGeneration(PdfFormat.CLASSIC)}
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
            
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-lg shadow-md mt-6 transition-colors" role="alert">
                <p className="font-bold">Errore</p>
                <p className="whitespace-pre-wrap">{error}</p>
              </div>
            )}
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
                   onUpdateQuiz={handleUpdateQuiz}
                   pdfFormat={pdfFormat}
                   isCreating={formCreationState.status === 'loading' || docCreationState.status === 'loading'}
                   isRegeneratingId={isRegenerating}
                 />
                 {getFormCreationStateUI()}
                 {getDocCreationStateUI()}
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
    </div>
  );
};

export default App;
