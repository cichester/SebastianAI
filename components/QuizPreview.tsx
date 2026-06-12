
import React, { useMemo, useState, useRef, useCallback } from 'react';
import html2pdf from 'html2pdf.js';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { Quiz, Question, QuestionOption, ReadingSection, WritingPrompt, ListeningSection, AddExerciseParams } from '../types';
import { QuestionType, PdfFormat } from '../types';
import { CheckIcon, SparklesIcon, SpeakerWaveIcon, PrinterIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import PrintableQuiz, { PrintableHeader, PrintableExerciseItem, PrintableWritingItem, PrintableExHeader, PrintableReadingText, PrintableListeningText, PrintableQuestionItem } from './PrintableQuiz';
import { generateDocx } from '../utils/docxGenerator';

interface QuizPreviewProps {
  quizzes: Quiz[]; // Changed to array
  language: string;
  onCreateForm: () => void;
  onCreateDoc: () => void;
  onRegenerate: () => void;
  onRegenerateSection: (quizIndex: number, topic: string, questionType: string, count: number) => void;
  onRegenerateComplexSection: (quizIndex: number, sectionType: 'reading' | 'listening', topic: string) => void;
  onRegenerateWritingPrompt: (quizIndex: number, topic: string) => void;
  onUpdateQuiz: (quizIndex: number, updatedQuiz: Quiz) => void;
  onRemoveExercise: (topic: string, exerciseType: 'standard' | 'reading' | 'listening' | 'writing', questionSubtype?: string) => void;
  onAddExercise: (params: AddExerciseParams) => Promise<void>;

  isCreating: boolean;
  isRegeneratingId: string | null;
  formCreationStateUI?: React.ReactNode;
  docCreationStateUI?: React.ReactNode;
}

const getQuestionTypeName = (type: QuestionType) => {
    switch (type) {
        case QuestionType.MULTIPLE_CHOICE: return 'Scelta Multipla';
        case QuestionType.FILL_IN_THE_BLANK: return 'Completa gli Spazi';
        case QuestionType.SHORT_ANSWER: return 'Risposta Breve';
        case QuestionType.TRANSLATION: return 'Traduzione';
        default: return 'Sconosciuto';
    }
}

// Funzione helper per creare un file WAV da dati PCM grezzi
const createWavUrlFromPcm = (base64Pcm: string): string => {
    try {
        const binaryString = atob(base64Pcm);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const pcmData = new Int16Array(bytes.buffer);

        const sampleRate = 24000;
        const numChannels = 1;
        const bitsPerSample = 16;
        const dataSize = pcmData.length * (bitsPerSample / 8);
        const blockAlign = (numChannels * bitsPerSample) / 8;
        const byteRate = sampleRate * blockAlign;
        
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);

        const writeString = (view: DataView, offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        const wavBlob = new Blob([view, pcmData], { type: 'audio/wav' });
        return URL.createObjectURL(wavBlob);
    } catch (error) {
        console.error("Errore nella creazione dell'URL WAV:", error);
        return "";
    }
};

const OptionItem: React.FC<{ option: QuestionOption; isEditing: boolean; onUpdate?: (text: string, isCorrect: boolean) => void }> = ({ option, isEditing, onUpdate }) => (
    <div className={`flex items-start p-3 rounded-lg border transition-colors ${option.isCorrect ? 'bg-green-100/80 dark:bg-green-900/40 border-green-400 dark:border-green-800 print:bg-white print:border-slate-300' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 print:bg-white print:border-slate-300'}`}>
        <div 
            onClick={() => isEditing && onUpdate && onUpdate(option.text, !option.isCorrect)}
            className={`w-5 h-5 flex-shrink-0 rounded-full mr-3 mt-0.5 transition-colors ${isEditing ? 'cursor-pointer' : ''} ${option.isCorrect ? 'bg-green-500 print:bg-transparent print:border-2 print:border-slate-300' : 'border-2 border-slate-300 dark:border-slate-500 print:border-slate-300'}`}
        >
            {option.isCorrect && <CheckIcon className="w-5 h-5 text-white print:hidden" />}
        </div>
        {isEditing ? (
            <input 
                type="text" 
                value={option.text} 
                onChange={(e) => onUpdate && onUpdate(e.target.value, option.isCorrect)}
                className="w-full bg-transparent border-none focus:ring-0 text-slate-700 dark:text-slate-300"
            />
        ) : (
            <span className={`transition-colors ${option.isCorrect ? 'text-green-900 dark:text-green-300 font-bold print:text-black print:font-normal' : 'text-slate-700 dark:text-slate-300 print:text-black'}`}>{option.text}</span>
        )}
    </div>
);

const QuestionCard: React.FC<{ question: Question; index: number; isEditing: boolean; onUpdate: (updatedQuestion: Question) => void }> = ({ question, index, isEditing, onUpdate }) => {
    const handleOptionUpdate = (optIndex: number, text: string, isCorrect: boolean) => {
        if (!question.options) return;
        const newOptions = [...question.options];
        newOptions[optIndex] = { ...newOptions[optIndex], text, isCorrect };
        
        // If we just set one to correct in multiple choice, unset others?
        // Actually the model might want multiple correct but usually it's one.
        // Let's keep it simple: just update the one.
        
        onUpdate({ ...question, options: newOptions });
    };

    return (
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors print:border-slate-300 print:bg-white print:break-inside-avoid">
            <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-100 print:text-black">Domanda {index + 1}</h4>
                <span className="text-xs font-medium bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-full print:bg-transparent print:border print:border-slate-300 print:text-black">{getQuestionTypeName(question.questionType)}</span>
            </div>
            
            {isEditing ? (
                <textarea 
                    value={question.questionText}
                    onChange={(e) => onUpdate({ ...question, questionText: e.target.value })}
                    className="w-full p-2 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg mb-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    rows={2}
                />
            ) : (
                <p className="text-slate-700 dark:text-slate-300 mb-4 print:text-black">{question.questionText}</p>
            )}
            
            {question.questionType === QuestionType.MULTIPLE_CHOICE && question.options && (
                <div className="space-y-2">
                    {question.options.map((opt, i) => (
                        <OptionItem 
                            key={i} 
                            option={opt} 
                            isEditing={isEditing} 
                            onUpdate={(text, isCorrect) => handleOptionUpdate(i, text, isCorrect)} 
                        />
                    ))}
                </div>
            )}

            {(question.questionType === QuestionType.FILL_IN_THE_BLANK || question.questionType === QuestionType.SHORT_ANSWER || question.questionType === QuestionType.TRANSLATION) && (
                <div className="mt-3 p-3 bg-green-100/80 dark:bg-green-900/40 border border-green-400 dark:border-green-800 rounded-lg transition-colors print:hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                         <span className="text-sm text-green-800 dark:text-green-300 font-bold shrink-0">Risposta corretta:</span>
                         {isEditing ? (
                            <input 
                                type="text"
                                value={question.correctAnswer || ''}
                                onChange={(e) => onUpdate({ ...question, correctAnswer: e.target.value })}
                                className="flex-1 text-sm font-bold text-green-900 dark:text-green-200 bg-white/70 dark:bg-black/20 border border-green-400 dark:border-green-700 rounded px-2 py-1"
                            />
                         ) : (
                            <span className="font-bold text-green-900 dark:text-green-200">{question.correctAnswer}</span>
                         )}
                    </div>
                </div>
            )}
        </div>
    );
};

const ReadingSectionCard: React.FC<{ section: ReadingSection; onRegenerate: () => void; isRegenerating: boolean; isAnyActionInProgress: boolean; isEditing: boolean; onUpdate: (updatedSection: ReadingSection) => void }> = ({ section, onRegenerate, isRegenerating, isAnyActionInProgress, isEditing, onUpdate }) => {
    const handleQuestionUpdate = (qIndex: number, updatedQ: Question) => {
        const newQuestions = [...section.questions];
        newQuestions[qIndex] = updatedQ;
        onUpdate({ ...section, questions: newQuestions });
    };

    return (
        <div className="p-5 rounded-xl border border-amber-400 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/30 shadow-sm transition-colors print:border-slate-300 print:bg-white">
            <div className="flex justify-between items-center mb-2">
                <h4 className="text-lg font-bold text-amber-900 dark:text-amber-300 print:text-black">Reading Comprehension</h4>
                {!isEditing && (
                    <button 
                        onClick={onRegenerate}
                        disabled={isAnyActionInProgress}
                        title="Rigenera solo questa sezione di lettura, il resto del compito rimarrà invariato."
                        className="flex items-center text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition print:hidden"
                    >
                        {isRegenerating ? (
                            <LoadingSpinner className="mr-2" dotClassName="w-1 h-1" />
                        ) : (
                            <SparklesIcon className="w-4 h-4 mr-1" />
                        )}
                        <span>{isRegenerating ? 'Rigenero...' : 'Rigenera solo questa sezione'}</span>
                    </button>
                )}
            </div>
            
            {isEditing ? (
                <textarea 
                    value={section.text}
                    onChange={(e) => onUpdate({ ...section, text: e.target.value })}
                    className="w-full p-4 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md mb-4 focus:ring-2 focus:ring-amber-500"
                    rows={6}
                />
            ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none p-4 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 mb-4">
                    <p>{section.text}</p>
                </div>
            )}
            
            <div className="space-y-4">
                {section.questions.map((q, i) => (
                    <QuestionCard 
                        key={`read-${i}`} 
                        question={q} 
                        index={i} 
                        isEditing={isEditing} 
                        onUpdate={(updatedQ) => handleQuestionUpdate(i, updatedQ)} 
                    />
                ))}
            </div>
        </div>
    );
};

const WritingPromptCard: React.FC<{
    prompt: WritingPrompt;
    onRegenerate: () => void;
    isRegenerating: boolean;
    isAnyActionInProgress: boolean;
    isEditing: boolean;
    onUpdate: (updatedPrompt: WritingPrompt) => void;
}> = ({ prompt, onRegenerate, isRegenerating, isAnyActionInProgress, isEditing, onUpdate }) => (
     <div className="p-5 rounded-xl border border-sky-400 dark:border-sky-800 bg-sky-100/50 dark:bg-sky-900/30 shadow-sm transition-colors print:border-slate-300 print:bg-white print:break-inside-avoid">
        <div className="flex justify-between items-center mb-2">
            <h4 className="text-lg font-bold text-sky-900 dark:text-sky-300 print:text-black">Writing Prompt</h4>
            {!isEditing && (
                 <button 
                     onClick={onRegenerate}
                     disabled={isAnyActionInProgress}
                     title="Rigenera solo questa traccia di scrittura, il resto del compito rimarrà invariato."
                     className="flex items-center text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transition print:hidden bg-sky-100 dark:bg-sky-900/30 px-3 py-1.5 rounded-full"
                 >
                     {isRegenerating ? (
                         <LoadingSpinner className="mr-2" dotClassName="w-1 h-1" />
                     ) : (
                         <SparklesIcon className="w-4 h-4 mr-1" />
                     )}
                     <span>{isRegenerating ? 'Rigenero...' : 'Rigenera solo questa sezione'}</span>
                 </button>
             )}
        </div>
        <div className="p-4 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 print:border-slate-300 print:bg-white">
            {isEditing ? (
                <textarea 
                    value={prompt.promptText}
                    onChange={(e) => onUpdate({ ...prompt, promptText: e.target.value })}
                    className="w-full p-2 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-sky-500"
                    rows={3}
                />
            ) : (
                <p className="text-slate-700 dark:text-slate-300 print:text-black">{prompt.promptText}</p>
            )}
            
            <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-slate-500 dark:text-slate-400 print:text-slate-600">Limite:</span>
                {isEditing ? (
                    <input 
                        type="number"
                        value={prompt.wordLimit}
                        onChange={(e) => onUpdate({ ...prompt, wordLimit: parseInt(e.target.value) || 0 })}
                        className="w-20 text-sm p-1 border rounded"
                    />
                ) : (
                    <span className="text-sm text-slate-500 dark:text-slate-400 print:text-slate-600">{prompt.wordLimit} parole</span>
                )}
            </div>
        </div>
    </div>
);

const ListeningSectionCard: React.FC<{ section: ListeningSection; onRegenerate: () => void; isRegenerating: boolean; isAnyActionInProgress: boolean; isEditing: boolean; onUpdate: (updatedSection: ListeningSection) => void }> = ({ section, onRegenerate, isRegenerating, isAnyActionInProgress, isEditing, onUpdate }) => {
    const audioUrl = useMemo(() => {
        if (!section.audioBase64) return '';
        return createWavUrlFromPcm(section.audioBase64);
    }, [section.audioBase64]);

    const handleQuestionUpdate = (qIndex: number, updatedQ: Question) => {
        const newQuestions = [...section.questions];
        newQuestions[qIndex] = updatedQ;
        onUpdate({ ...section, questions: newQuestions });
    };

    return (
        <div className="p-5 rounded-xl border border-purple-400 dark:border-purple-800 bg-purple-100/50 dark:bg-purple-900/30 shadow-sm transition-colors print:border-slate-300 print:bg-white">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                    <SpeakerWaveIcon className="w-6 h-6 text-purple-900 dark:text-purple-300 print:text-black" />
                    <h4 className="text-lg font-bold text-purple-900 dark:text-purple-300 print:text-black">Listening Exercise</h4>
                </div>
                 {!isEditing && (
                    <button 
                        onClick={onRegenerate}
                        disabled={isAnyActionInProgress}
                        title="Rigenera solo questa sezione di ascolto, il resto del compito rimarrà invariato."
                        className="flex items-center text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition print:hidden"
                    >
                        {isRegenerating ? (
                            <LoadingSpinner className="mr-2" dotClassName="w-1 h-1" />
                        ) : (
                            <SparklesIcon className="w-4 h-4 mr-1" />
                        )}
                        <span>{isRegenerating ? 'Rigenero...' : 'Rigenera solo questa sezione'}</span>
                    </button>
                 )}
            </div>

            {audioUrl ? (
                <div className="mb-4">
                     {isEditing && (
                        <p className="text-xs text-purple-700 mb-2 italic">NB: Modificando le domande l'audio rimarrà quello originale. Per un nuovo audio è necessario rigenerare l'intera sezione.</p>
                     )}
                    <audio controls src={audioUrl} className="w-full print:hidden">
                        Il tuo browser non supporta l'elemento audio.
                    </audio>
                </div>
            ) : (
                <div className="w-full h-14 flex items-center justify-center bg-slate-200 dark:bg-slate-700 rounded-lg mb-4 print:hidden">
                    <p className="text-sm text-slate-500">Audio non disponibile.</p>
                </div>
            )}
            
            <div className="space-y-4">
                {section.questions.map((q, i) => (
                    <QuestionCard 
                        key={`listen-${i}`} 
                        question={q} 
                        index={i} 
                        isEditing={isEditing} 
                        onUpdate={(updatedQ) => handleQuestionUpdate(i, updatedQ)} 
                    />
                ))}
            </div>
        </div>
    );
};

const QuizPreview: React.FC<QuizPreviewProps> = ({ quizzes, language, onCreateForm, onCreateDoc, onRegenerate, onRegenerateSection, onRegenerateComplexSection, onRegenerateWritingPrompt, onUpdateQuiz, onRemoveExercise, onAddExercise, isCreating, isRegeneratingId, formCreationStateUI, docCreationStateUI }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [pdfFormat, setPdfFormat] = useState<PdfFormat>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pdfFormat');
      if (saved && Object.values(PdfFormat).includes(saved as PdfFormat)) {
        return saved as PdfFormat;
      }
    }
    return PdfFormat.MODERN;
  });

  // Refs per la composizione manuale del PDF (Approccio 1)
  const manualHeaderRef = useRef<HTMLDivElement>(null);
  const manualItemsRefs = useRef<(HTMLDivElement | null)[]>([]);
  const manualWritingRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Refs per la composizione manuale del PDF Docente
  const manualHeaderTeacherRef = useRef<HTMLDivElement>(null);
  const manualItemsTeacherRefs = useRef<(HTMLDivElement | null)[]>([]);
  const manualWritingTeacherRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Stato per l'aggiunta di un esercizio
  const [showAddForm, setShowAddForm] = useState(false);
  const [addParams, setAddParams] = useState<AddExerciseParams>({
    topic: '',
    kind: 'standard',
    mode: 'ai',
    standardType: 'Scelta Multipla',
    standardCount: 5,
    readingWordCount: 150,
    readingExerciseType: 'Scelta Multipla',
    readingQuestionCount: 3,
    writingWordLimit: 100,
    writingDirectives: '',
    listeningDurationSeconds: 60,
    listeningExerciseType: 'Scelta Multipla',
    listeningQuestionCount: 3,
    listeningDirectives: '',
  });
  const [isAddingExercise, setIsAddingExercise] = useState(false);

  const generateSingleClassicPDF = async (quiz: Quiz, isTeacher: boolean) => {
      // Misure esatte per A4 @ 96 DPI (1px ≈ 1/96 pollice)
      // A4: 210mm x 297mm -> 794px x 1123px
      const A4_WIDTH = 794;
      const A4_HEIGHT = 1123;
      const MARGIN = 40;
      const COL_WIDTH = 340;
      const GAP = 34;
      const FOOTER_SPACE = 35;
      const PAGE_BOTTOM_THRESHOLD = A4_HEIGHT - MARGIN - FOOTER_SPACE;
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [A4_WIDTH, A4_HEIGHT],
        hotfixes: ["px_scaling"]
      });
      
      let currentPage = 1;
      let currentYLeft = MARGIN;
      let currentYRight = MARGIN;
      let currentActiveCol: 'left' | 'right' = 'left';
      
      const x_left = MARGIN;
      const x_right = MARGIN + COL_WIDTH + GAP;


      // 1. RENDERIZZA L'INTESTAZIONE
      const headerEl = (isTeacher ? manualHeaderTeacherRef : manualHeaderRef).current;
      if (headerEl) {
        const canvas = await html2canvas(headerEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const headerH = headerEl.offsetHeight;
        doc.addImage(imgData, 'JPEG', MARGIN, MARGIN, 714, headerH);
        currentYLeft = MARGIN + headerH + 25;
        currentYRight = MARGIN + headerH + 25;
      }

      const itemsRefsArray = (isTeacher ? manualItemsTeacherRefs : manualItemsRefs).current;
      // 2. RENDERIZZA GLI ELEMENTI GRANULARI UNO PER UNO
      for (let i = 0; i < itemsRefsArray.length; i++) {
        const el = itemsRefsArray[i];
        if (!el) continue;

        const unit = pdfUnits[i];
        const isHeader = unit?.type === 'header';
        // Aggiunge un po' di respiro solo prima dei nuovi esercizi
        const verticalGap = isHeader ? 12 : 0; 

        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const elH = el.offsetHeight;
        
        let targetX = x_left;
        let targetY = currentYLeft;

        if (currentActiveCol === 'left') {
          // Aggiunge il gap verticale PRIMA del calcolo per l'header
          if (isHeader) currentYLeft += verticalGap;

          // Se l'elemento non entra in colonna sinistra (e non siamo a inizio pagina vuota)
          if (currentYLeft + elH > PAGE_BOTTOM_THRESHOLD && currentYLeft > MARGIN + 10) {
             // Passa alla colonna destra
             currentActiveCol = 'right';
             targetX = x_right;
             // Allinea il top della colonna destra con quello della sinistra se stiamo partendo dalla prima pagina post-header
             targetY = currentYRight + (isHeader ? verticalGap : 0);
             
             if (targetY + elH > PAGE_BOTTOM_THRESHOLD && targetY > MARGIN + 10) {
                // Non ci sta neanche a destra -> Nuova Pagina
                doc.addPage();
                currentPage++;
                currentActiveCol = 'left';
                currentYLeft = MARGIN;
                currentYRight = MARGIN;
                targetX = x_left;
                targetY = currentYLeft;
                currentYLeft += elH;
             } else {
                // Entra a destra
                currentYRight = targetY + elH;
                targetY = targetY; // maintain coordinate
             }
          } else {
            // Entra a sinistra
            targetX = x_left;
            targetY = currentYLeft;
            currentYLeft += elH;
          }
        } else {
          // Colonna destra attiva
          if (isHeader) currentYRight += verticalGap;

          if (currentYRight + elH > PAGE_BOTTOM_THRESHOLD && currentYRight > MARGIN + 10) {
            // Nuova Pagina
            doc.addPage();
            currentPage++;
            currentActiveCol = 'left';
            currentYLeft = MARGIN;
            currentYRight = MARGIN;
            targetX = x_left;
            targetY = currentYLeft;
            currentYLeft += elH;
          } else {
            targetX = x_right;
            targetY = currentYRight;
            currentYRight += elH;
          }
        }
        
        doc.addImage(imgData, 'JPEG', targetX, targetY, COL_WIDTH, elH);
      }

      // 3. WRITING PROMPTS (A tutta larghezza sul fondo)
      // Determina Y di partenza come il MASSIMO delle due colonne
      let currentYFull = Math.max(currentYLeft, currentYRight);

      const writingRefsArray = (isTeacher ? manualWritingTeacherRefs : manualWritingRefs).current;
      for (let i = 0; i < writingRefsArray.length; i++) {
        const el = writingRefsArray[i];
        if (!el) continue;
        
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const elH = el.offsetHeight;
        
        // Se non ci sta a tutta larghezza, nuova pagina
        if (currentYFull + elH > PAGE_BOTTOM_THRESHOLD && currentYFull > MARGIN + 50) {
          doc.addPage();
          currentPage++;
          currentYFull = MARGIN;
        }
        
        doc.addImage(imgData, 'JPEG', MARGIN, currentYFull, 714, elH);
        currentYFull += (elH + 25);
      }
      


      // Post-produzione: Aggiunge i numeri di pagina in fondo a destra
      const totalPages = doc.getNumberOfPages();
      for(let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(`Pagina ${i} / ${totalPages}`, A4_WIDTH - MARGIN - 60, A4_HEIGHT - 20);
      }

      const label = quiz.versionLabel || 'A';
      const suffix = isTeacher ? '_Soluzioni' : '';
      const cleanTitle = (quiz.title || 'Quiz').replace(/\s*-\s*Fila\s+[A-Z]/i, '').trim();
      doc.save(`${cleanTitle}_Fila_${label}${suffix}.pdf`);
  };

  const handlePrintClassicManual = async () => {
    if (!activeQuiz) return;
    setIsPrinting(true);
    try {
      await generateSingleClassicPDF(activeQuiz, false);
      await generateSingleClassicPDF(activeQuiz, true);
    } catch (err) {
      console.error("Error processing manual PDF composition:", err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrint = async (formatOverride?: PdfFormat) => {
    const format = formatOverride || pdfFormat;
    setIsPrinting(true);
    try {
      if (format === PdfFormat.CLASSIC) {
         const originalTab = activeTab;
         for (let i = 0; i < quizzes.length; i++) {
           setActiveTab(i);
           // Aspetta che React aggiorni lo stato e i ref del DOM
           await new Promise(resolve => setTimeout(resolve, 650));
           await generateSingleClassicPDF(quizzes[i], false);
           await generateSingleClassicPDF(quizzes[i], true);
         }
         setActiveTab(originalTab);
      } else {
         // MODERNO / FORMALE: Stampa tutti i PDF usando i container pre-renderizzati
         for (let i = 0; i < quizzes.length; i++) {
           const cleanTitle = (quizzes[i].title || 'Quiz').replace(/\s*-\s*Fila\s+[A-Z]/i, '').trim();
           const label = quizzes[i].versionLabel || String.fromCharCode(65 + i);

           // Versione Studente
           const studentElement = document.getElementById(`pdf-container-student-${i}`);
           if (studentElement) {
             const opt = {
               margin:       10,
               filename:     `${cleanTitle}_Fila_${label}.pdf`,
               image:        { type: 'jpeg' as const, quality: 0.98 },
               html2canvas:  { scale: 2, useCORS: true, windowWidth: 1024 },
               jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
             };
             await html2pdf().set(opt).from(studentElement).save();
             await new Promise(resolve => setTimeout(resolve, 500));
           }

           // Versione Docente
           const teacherElement = document.getElementById(`pdf-container-teacher-${i}`);
           if (teacherElement) {
             const opt = {
               margin:       10,
               filename:     `${cleanTitle}_Fila_${label}_Soluzioni.pdf`,
               image:        { type: 'jpeg' as const, quality: 0.98 },
               html2canvas:  { scale: 2, useCORS: true, windowWidth: 1024 },
               jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
             };
             await html2pdf().set(opt).from(teacherElement).save();
             await new Promise(resolve => setTimeout(resolve, 500));
           }
         }
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsPrinting(false);
    }
  };

  const confirmFormatAndDownload = (selectedFormat: PdfFormat) => {
    setPdfFormat(selectedFormat);
    localStorage.setItem('pdfFormat', selectedFormat);
    setShowFormatPicker(false);
    // Pass format directly to avoid stale closure
    handlePrint(selectedFormat);
  };

  const handleDownloadDocx = async () => {
    setIsGeneratingDocx(true);
    try {
      for (let i = 0; i < quizzes.length; i++) {
        await generateDocx(quizzes[i]);
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    } catch (error) {
      console.error("Error generating Word documents:", error);
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  const activeQuiz = quizzes[activeTab];

  const groupedQuestions = useMemo(() => {
    if (!activeQuiz) return {} as Record<string, { topic: string; type: string; questions: { q: Question; originalIndex: number }[] }>;
    return activeQuiz.questions.reduce((acc, question, index) => {
      const topic = question.topic || 'Senza Argomento';
      const type = getQuestionTypeName(question.questionType);
      const key = `${topic} - ${type}`;
      if (!acc[key]) {
        acc[key] = { topic, type, questions: [] };
      }
      acc[key].questions.push({ q: question, originalIndex: index });
      return acc;
    }, {} as Record<string, { topic: string; type: string; questions: { q: Question; originalIndex: number }[] }>);
  }, [activeQuiz]);

  if (!activeQuiz) return null;

  const sections: { topic: string; type: string; questions: { q: Question; originalIndex: number }[] }[] = Object.values(groupedQuestions);

  const allItems = useMemo(() => {
    if (!activeQuiz) return [];
    const rawSections = sections.map(sec => ({
        ...sec,
        questions: sec.questions.map(qData => qData.q)
    }));
    const rawItems = [
      ...(activeQuiz.listeningSections || []).map((s, idx) => ({ kind: 'listening' as const, data: s, idx })),
      ...(activeQuiz.readingSections || []).map((s, idx) => ({ kind: 'reading' as const, data: s, idx })),
      ...rawSections.map((s: any, idx) => ({ kind: 'standard' as const, data: s, idx }))
    ];
    return rawItems.map((item, i) => ({
      ...item,
      displayNum: i + 1
    }));
  }, [activeQuiz, sections]);
  const pdfUnits = useMemo(() => {
    const units: any[] = [];
    allItems.forEach((item: any) => {
      // 1. Aggiunge Header Esercizio
      let title = "";
      let descKey = "";
      if (item.kind === 'listening') { title = `Listening Comprehension (${item.data.topic})`; descKey = "Listening"; }
      else if (item.kind === 'reading') { title = `Reading Comprehension (${item.data.topic})`; descKey = "Reading"; }
      else { title = `${item.data.type} (${item.data.topic})`; descKey = item.data.type; }

      units.push({ type: 'header', data: { title, descKey, displayNum: item.displayNum } });
      
      // 2. Aggiunge il Testo (Reading o Listening)
      if (item.kind === 'listening') {
        units.push({ type: 'listening_text', text: item.data.text });
      } else if (item.kind === 'reading') {
        units.push({ type: 'reading_text', text: item.data.text });
      }

      // 3. Aggiunge ogni singola domanda
      if (item.data && item.data.questions) {
        item.data.questions.forEach((q: any, qIdx: number) => {
          units.push({ type: 'question', data: { question: q, qIdx } });
        });
      }
    });
    return units;
  }, [allItems]);

  const writingStartNum = allItems.length + 1;

  const isAnyActionInProgress = isCreating || !!isRegeneratingId;

  const handleQuestionUpdate = (qIndex: number, updatedQ: Question) => {
    const newQuestions = [...activeQuiz.questions];
    newQuestions[qIndex] = updatedQ;
    onUpdateQuiz(activeTab, { ...activeQuiz, questions: newQuestions });
  };

  const handleReadingSectionUpdate = (sIndex: number, updatedS: ReadingSection) => {
    if (!activeQuiz.readingSections) return;
    const newSections = [...activeQuiz.readingSections];
    newSections[sIndex] = updatedS;
    onUpdateQuiz(activeTab, { ...activeQuiz, readingSections: newSections });
  };

  const handleListeningSectionUpdate = (sIndex: number, updatedS: ListeningSection) => {
    if (!activeQuiz.listeningSections) return;
    const newSections = [...activeQuiz.listeningSections];
    newSections[sIndex] = updatedS;
    onUpdateQuiz(activeTab, { ...activeQuiz, listeningSections: newSections });
  };

  const handleWritingPromptUpdate = (pIndex: number, updatedP: WritingPrompt) => {
    if (!activeQuiz.writingPrompts) return;
    const newPrompts = [...activeQuiz.writingPrompts];
    newPrompts[pIndex] = updatedP;
    onUpdateQuiz(activeTab, { ...activeQuiz, writingPrompts: newPrompts });
  };

  const handleTitleUpdate = (newTitle: string) => {
    onUpdateQuiz(activeTab, { ...activeQuiz, title: newTitle });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full">
      {/* Left Navigation pane for Variants */}
      <div className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-2">
         <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 transition-colors mb-2 pl-2">Varianti Generate</h2>
         {quizzes.map((quiz, index) => {
            const isSelected = activeTab === index;
            return (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all text-left border ${
                  isSelected 
                    ? 'bg-indigo-50 dark:bg-indigo-900/40 border-indigo-200 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200 shadow-sm' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-200 dark:hover:border-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-700/80'
                }`}
              >
                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-indigo-100 dark:bg-indigo-800/80 text-indigo-700 dark:text-indigo-100' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                  </div>
                  <div>
                      <div className="text-slate-900 dark:text-white font-bold transition-colors">{quiz.versionLabel ? `Fila ${quiz.versionLabel}` : `Versione ${index + 1}`}</div>
                      <div className={`text-xs transition-colors ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>Quiz Pronto</div>
                  </div>
              </button>
            )
         })}
      </div>

      {/* Right Content pane */}
      <div className="flex-1 flex flex-col min-w-0">
          <div className="mb-4">
              <div className="mb-6 -mt-4">
                {formCreationStateUI}
                {docCreationStateUI}
              </div>
              <p className="text-slate-500 mb-4">Visualizza in anteprima e modifica le varianti generate prima dell'esportazione.</p>
                      <div className="flex flex-wrap gap-3 pb-4">
                <button
                    onClick={() => setShowFormatPicker(true)}
                    disabled={isPrinting || isAnyActionInProgress}
                    className="flex items-center px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors disabled:opacity-50 text-sm shadow-sm"
                >
                    {isPrinting ? <LoadingSpinner className="mr-2" dotClassName="w-1 h-1" /> : <PrinterIcon className="w-4 h-4 mr-2 text-slate-500 dark:text-slate-400" />}
                    Stampa / Scarica tutti i PDF
                </button>
                <button
                    onClick={handleDownloadDocx}
                    disabled={isGeneratingDocx || isAnyActionInProgress}
                    className="flex items-center px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors disabled:opacity-50 text-sm shadow-sm"
                >
                    {isGeneratingDocx ? (
                        <LoadingSpinner className="mr-2" dotClassName="w-1 h-1" />
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400">
                           <path d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM12.986 18h2.264v-1.125h-2.264V18zM12.986 16.125h2.264V15h-2.264v1.125zM15.25 14.25v-1.125h-2.264v1.125h2.264zM10.714 18h2.271v-1.125H10.714V18zM10.714 16.125h2.271V15h-2.271v1.125zM12.985 14.25v-1.125h-2.271v1.125h2.271zM8.471 18h2.243v-1.125H8.471V18zM8.471 16.125h2.243V15H8.471v1.125zM10.714 14.25v-1.125H8.471v1.125h2.243z" />
                        </svg>
                    )}
                    Scarica tutte le file (.docx)
                </button>
                <button
                  onClick={onCreateDoc}
                  disabled={isAnyActionInProgress}
                  className="flex items-center px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors disabled:opacity-50 text-sm shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-2 text-blue-500"><path d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z"/></svg>
                  Google Docs
                </button>
                 <button
                  onClick={onCreateForm}
                  disabled={isAnyActionInProgress}
                  className="flex items-center px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors disabled:opacity-50 text-sm shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-2 text-purple-600"><path d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z"/></svg>
                  Google Moduli
                </button>
              </div>
          </div>

          <div ref={printRef} className="bg-white dark:bg-slate-800 border text-left border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm w-full animate-in fade-in transition-colors">
           <div className="p-8 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center transition-colors">
                {isEditing ? (
                    <input 
                        type="text"
                        value={activeQuiz.title}
                        onChange={(e) => handleTitleUpdate(e.target.value)}
                        className="text-2xl font-bold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded px-3 py-1 w-full max-w-2xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                ) : (
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 transition-colors">{activeQuiz.title}</h3>
                )}
                <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${
                        isEditing 
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700' 
                        : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                >
                    {isEditing ? (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                            Salva Modifiche
                        </>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                            </svg>
                            Modifica Fila
                        </>
                    )}
                </button>
             </div>
                     <div className="p-8 space-y-8">
               {/* Sections mapped below */}
               {activeQuiz.listeningSections?.map((section, i) => {
                    const regenId = `complex-listening-${section.topic}`;
                    const isCurrentRegen = isRegeneratingId === regenId;
                     return (
                          <div key={`listen-sec-${i}`}>
                             <div className="flex justify-between items-center mb-4 border-b-2 border-indigo-200 dark:border-indigo-800 pb-2">
                               <h3 className="text-xl font-bold text-indigo-700 dark:text-indigo-400 print:text-black print:border-slate-300">{section.topic} - Esercizio di Ascolto</h3>
                               {isEditing && (
                                 <button 
                                     onClick={() => onRemoveExercise(section.topic, 'listening')}
                                     className="flex items-center text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition print:hidden bg-red-100/50 dark:bg-red-900/30 px-3 py-1.5 rounded-full ml-4"
                                 >
                                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mr-1">
                                         <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.72 0-.34-9m9.96-3-3.2 3.2m-7.24 0L6.76 6M21 6H3m3.76-3h10.48M19 6V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
                                     </svg>
                                     <span>Elimina Esercizio</span>
                                 </button>
                               )}
                             </div>
                             <ListeningSectionCard 
                                 section={section}
                                 onRegenerate={() => onRegenerateComplexSection(activeTab, 'listening', section.topic)}
                                 isRegenerating={isCurrentRegen}
                                 isAnyActionInProgress={isAnyActionInProgress}
                                 isEditing={isEditing}
                                 onUpdate={(updatedS) => handleListeningSectionUpdate(i, updatedS)}
                             />
                         </div>
                     )
                })}

                {activeQuiz.readingSections?.map((section, i) => {
                    const regenId = `complex-reading-${section.topic}`;
                    const isCurrentRegen = isRegeneratingId === regenId;
                    return (
                        <div key={`read-sec-${i}`}>
                            <div className="flex justify-between items-center mb-4 border-b-2 border-indigo-200 dark:border-indigo-800 pb-2">
                              <h3 className="text-xl font-bold text-indigo-700 dark:text-indigo-400 print:text-black print:border-slate-300">{section.topic} - Comprensione del Testo</h3>
                              {isEditing && (
                                <button 
                                    onClick={() => onRemoveExercise(section.topic, 'reading')}
                                    className="flex items-center text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition print:hidden bg-red-100/50 dark:bg-red-900/30 px-3 py-1.5 rounded-full ml-4"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mr-1">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.72 0-.34-9m9.96-3-3.2 3.2m-7.24 0L6.76 6M21 6H3m3.76-3h10.48M19 6V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
                                    </svg>
                                    <span>Elimina Esercizio</span>
                                </button>
                              )}
                            </div>
                            <ReadingSectionCard
                                section={section}
                                onRegenerate={() => onRegenerateComplexSection(activeTab, 'reading', section.topic)}
                                isRegenerating={isCurrentRegen}
                                isAnyActionInProgress={isAnyActionInProgress}
                                  isEditing={isEditing}
                                onUpdate={(updatedS) => handleReadingSectionUpdate(i, updatedS)}
                            />
                        </div>
                    )
                })}

                {sections.map(({topic, type, questions}, secIdx) => {
                    const regenId = `${topic}-${type}`;
                    const isCurrentRegen = isRegeneratingId === regenId;
                    return (
                      <section key={regenId}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 pb-2 transition-colors print:text-black print:border-slate-300">{topic} - {type}</h3>
                            <div className="flex gap-2">
                              {isEditing && (
                                <button 
                                    onClick={() => onRemoveExercise(topic, 'standard', type)}
                                    className="flex items-center text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition print:hidden bg-red-100/50 dark:bg-red-900/30 px-3 py-1.5 rounded-full"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mr-1">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.72 0-.34-9m9.96-3-3.2 3.2m-7.24 0L6.76 6M21 6H3m3.76-3h10.48M19 6V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
                                    </svg>
                                    <span>Elimina Esercizio</span>
                                </button>
                              )}
                              {!isEditing && (
                                  <button 
                                      onClick={() => onRegenerateSection(activeTab, topic, type.replace(' (Multiple Choice)', ''), questions.length)}
                                      disabled={isAnyActionInProgress}
                                      title="Rigenera solo questo esercizio, il resto del compito rimarrà invariato."
                                      className="flex items-center text-xs font-semibold text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed transition print:hidden bg-indigo-100/50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-full"
                                  >
                                       {isCurrentRegen ? (
                                           <LoadingSpinner className="mr-2" dotClassName="w-1 h-1" />
                                       ) : (
                                           <SparklesIcon className="w-4 h-4 mr-1" />
                                       )}
                                      <span>{isCurrentRegen ? 'Rigenero...' : 'Rigenera solo questa sezione'}</span>
                                  </button>
                              )}
                            </div>
                        </div>
                        <div className="space-y-6 flex flex-col max-w-full overflow-hidden">
                          {questions.map(({q, originalIndex}, i) => {
                              return (
                                <QuestionCard 
                                    key={`${regenId}-${i}`} 
                                    question={q} 
                                    index={i} 
                                    isEditing={isEditing}
                                    onUpdate={(updatedQ) => handleQuestionUpdate(originalIndex, updatedQ)}
                                />
                              );
                          })}
                        </div>
                      </section>
                    )
                })}

                {activeQuiz.writingPrompts?.map((prompt, i) => {
                    const regenId = `writing-${prompt.topic}`;
                    const isCurrentRegen = isRegeneratingId === regenId;
                    return (
                        <div key={`write-sec-${i}`}>
                            <div className="flex justify-between items-center mb-4 border-b-2 border-indigo-200 dark:border-indigo-800 pb-2">
                              <h3 className="text-xl font-bold text-indigo-700 dark:text-indigo-400 print:text-black print:border-slate-300">{prompt.topic} - Produzione Scritta</h3>
                              {isEditing && (
                                <button 
                                    onClick={() => onRemoveExercise(prompt.topic, 'writing')}
                                    className="flex items-center text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition print:hidden bg-red-100/50 dark:bg-red-900/30 px-3 py-1.5 rounded-full ml-4"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mr-1">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.72 0-.34-9m9.96-3-3.2 3.2m-7.24 0L6.76 6M21 6H3m3.76-3h10.48M19 6V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
                                    </svg>
                                    <span>Elimina Esercizio</span>
                                </button>
                              )}
                            </div>
                            <WritingPromptCard 
                                prompt={prompt} 
                                onRegenerate={() => onRegenerateWritingPrompt(activeTab, prompt.topic)}
                                isRegenerating={isCurrentRegen}
                                isAnyActionInProgress={isAnyActionInProgress}
                                isEditing={isEditing}
                                onUpdate={(updatedP) => handleWritingPromptUpdate(i, updatedP)}
                            />
                        </div>
                    );
                })}

                {/* Form per l'aggiunta dinamica di un esercizio */}
                {isEditing && (
                  <div className="pt-6 border-t border-slate-100 dark:border-slate-700">
                    {!showAddForm ? (
                      <button
                        onClick={() => setShowAddForm(true)}
                        className="flex items-center justify-center w-full py-4 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10 rounded-2xl text-slate-500 hover:text-emerald-600 font-bold transition-all text-sm shadow-sm"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 mr-2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Aggiungi Nuovo Esercizio al Compito
                      </button>
                    ) : (
                      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 p-6 rounded-2xl shadow-inner space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3 mb-2">
                          <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <span className="p-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-lg">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                            </span>
                            Nuovo Esercizio
                          </h4>
                          <button onClick={() => setShowAddForm(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Annulla</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Argomento */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Argomento (Topic)</label>
                            <input
                              type="text"
                              required
                              value={addParams.topic}
                              placeholder="es. Past Simple, Reading..."
                              onChange={e => setAddParams(prev => ({ ...prev, topic: e.target.value }))}
                              className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                          </div>

                          {/* Tipo di Esercizio */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Tipo Esercizio</label>
                            <select
                              value={addParams.kind}
                              onChange={e => setAddParams(prev => ({ ...prev, kind: e.target.value as any }))}
                              className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                            >
                              <option value="standard">Domande Standard (Grammatica/Vocabolario)</option>
                              <option value="reading">Lettura (Reading Comprehension)</option>
                              <option value="listening">Ascolto (Listening Script + Audio)</option>
                              <option value="writing">Scrittura (Writing Prompt)</option>
                            </select>
                          </div>

                          {/* Modalità */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Modalità Generazione</label>
                            <div className="flex gap-2 text-sm bg-white dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 rounded-xl">
                              <button
                                type="button"
                                onClick={() => setAddParams(prev => ({ ...prev, mode: 'ai' }))}
                                className={`flex-1 py-1.5 px-3 rounded-lg font-semibold transition-all ${addParams.mode === 'ai' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                              >
                                Genera con IA
                              </button>
                              <button
                                type="button"
                                onClick={() => setAddParams(prev => ({ ...prev, mode: 'manual' }))}
                                className={`flex-1 py-1.5 px-3 rounded-lg font-semibold transition-all ${addParams.mode === 'manual' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                              >
                                Manuale
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Config specifica per standard */}
                        {addParams.kind === 'standard' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Sottotipo Domande</label>
                              <select
                                value={addParams.standardType}
                                onChange={e => setAddParams(prev => ({ ...prev, standardType: e.target.value }))}
                                className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                              >
                                <option value="Scelta Multipla">Scelta Multipla</option>
                                <option value="Completa gli Spazi">Completa gli Spazi</option>
                                <option value="Risposta Breve">Risposta Breve</option>
                                <option value="Traduzione">Traduzione</option>
                              </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Numero Domande</label>
                              <input
                                type="number"
                                min={1}
                                max={15}
                                value={addParams.standardCount}
                                onChange={e => setAddParams(prev => ({ ...prev, standardCount: parseInt(e.target.value) || 5 }))}
                                className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                              />
                            </div>
                          </div>
                        )}

                        {/* Config specifica per reading */}
                        {addParams.kind === 'reading' && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                            {addParams.mode === 'ai' && (
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Lunghezza Testo (Parole)</label>
                                <input
                                  type="number"
                                  min={50}
                                  max={500}
                                  value={addParams.readingWordCount}
                                  onChange={e => setAddParams(prev => ({ ...prev, readingWordCount: parseInt(e.target.value) || 150 }))}
                                  className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                              </div>
                            )}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Sottotipo Domande di Comprensione</label>
                              <select
                                value={addParams.readingExerciseType}
                                onChange={e => setAddParams(prev => ({ ...prev, readingExerciseType: e.target.value }))}
                                className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                              >
                                <option value="Scelta Multipla">Scelta Multipla</option>
                                <option value="Risposta Breve">Risposta Breve</option>
                              </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Numero Domande</label>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={addParams.readingQuestionCount}
                                onChange={e => setAddParams(prev => ({ ...prev, readingQuestionCount: parseInt(e.target.value) || 3 }))}
                                className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                              />
                            </div>
                          </div>
                        )}

                        {/* Config specifica per writing */}
                        {addParams.kind === 'writing' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Limite Parole Risposta</label>
                              <input
                                type="number"
                                min={10}
                                max={1000}
                                value={addParams.writingWordLimit}
                                onChange={e => setAddParams(prev => ({ ...prev, writingWordLimit: parseInt(e.target.value) || 100 }))}
                                className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                              />
                            </div>
                            {addParams.mode === 'ai' && (
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Direttive / Istruzioni IA</label>
                                <input
                                  type="text"
                                  value={addParams.writingDirectives}
                                  placeholder="es. chiedi di scrivere una email formale..."
                                  onChange={e => setAddParams(prev => ({ ...prev, writingDirectives: e.target.value }))}
                                  className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Config specifica per listening */}
                        {addParams.kind === 'listening' && (
                          <div className="space-y-4 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Durata Audio (Secondi)</label>
                                <input
                                  type="number"
                                  min={15}
                                  max={300}
                                  value={addParams.listeningDurationSeconds}
                                  onChange={e => setAddParams(prev => ({ ...prev, listeningDurationSeconds: parseInt(e.target.value) || 60 }))}
                                  className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Sottotipo Domande di Ascolto</label>
                                <select
                                  value={addParams.listeningExerciseType}
                                  onChange={e => setAddParams(prev => ({ ...prev, listeningExerciseType: e.target.value }))}
                                  className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                >
                                  <option value="Scelta Multipla">Scelta Multipla</option>
                                  <option value="Risposta Breve">Risposta Breve</option>
                                </select>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Numero Domande</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={addParams.listeningQuestionCount}
                                  onChange={e => setAddParams(prev => ({ ...prev, listeningQuestionCount: parseInt(e.target.value) || 3 }))}
                                  className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                              </div>
                            </div>
                            {addParams.mode === 'ai' && (
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Direttive / Istruzioni Audio</label>
                                <input
                                  type="text"
                                  value={addParams.listeningDirectives}
                                  placeholder="es. parla di una ricetta di cucina, usa accento britannico..."
                                  onChange={e => setAddParams(prev => ({ ...prev, listeningDirectives: e.target.value }))}
                                  className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex justify-end gap-3 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                          <button
                            type="button"
                            onClick={() => setShowAddForm(false)}
                            className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850 transition text-sm font-semibold"
                          >
                            Annulla
                          </button>
                          <button
                            type="button"
                            disabled={!addParams.topic.trim() || isAddingExercise}
                            onClick={async () => {
                              if (!addParams.topic.trim()) return;
                              setIsAddingExercise(true);
                              try {
                                await onAddExercise(addParams);
                                setShowAddForm(false);
                                // reset topic
                                setAddParams(prev => ({ ...prev, topic: '' }));
                              } catch (err) {
                                console.error(err);
                              } finally {
                                setIsAddingExercise(false);
                              }
                            }}
                            className="px-5 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition text-sm font-bold shadow-md shadow-emerald-600/10 flex items-center gap-1.5"
                          >
                            {isAddingExercise && <LoadingSpinner className="w-3.5 h-3.5 border-white" dotClassName="w-0.5 h-0.5" />}
                            Aggiungi Esercizio
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
             </div>
          </div>
      </div>
      
      {/* Hidden container for PDF generation */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        {quizzes.map((quiz, idx) => (
          <React.Fragment key={idx}>
            <div id={`pdf-container-student-${idx}`}>
              <PrintableQuiz quiz={quiz} language={language} pdfFormat={pdfFormat} isTeacher={false} />
            </div>
            <div id={`pdf-container-teacher-${idx}`}>
              <PrintableQuiz quiz={quiz} language={language} pdfFormat={pdfFormat} isTeacher={true} />
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* DOM hidden specific for manual PDF measurement (Approach 1) - STUDENT */}
      {/* Usiamo box-sizing border-box e larghezza fissa per garantire misurazioni accurate */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '794px', backgroundColor: '#ffffff', color: '#000000' }}>
        <div ref={manualHeaderRef} style={{ width: '714px', boxSizing: 'border-box', padding: '10px' }}>
           <PrintableHeader quiz={activeQuiz} language={language} pdfFormat={pdfFormat} isTeacher={false} />
        </div>
        
        {pdfUnits.map((unit: any, idx: number) => (
          <div 
            key={`m-unit-${idx}`} 
            ref={el => { if(el) manualItemsRefs.current[idx] = el; }}
            style={{ width: '340px', boxSizing: 'border-box', padding: '2px 8px', backgroundColor: '#ffffff' }} 
            className={pdfFormat === PdfFormat.CLASSIC ? 'font-serif' : 'font-sans'}
          >
            {unit.type === 'header' && <div className="mt-2"><PrintableExHeader title={unit.data.title} descKey={unit.data.descKey} displayNum={unit.data.displayNum} pdfFormat={pdfFormat} /></div>}
            {unit.type === 'reading_text' && <PrintableReadingText text={unit.text} pdfFormat={pdfFormat} />}
            {unit.type === 'listening_text' && <PrintableListeningText text={unit.text} pdfFormat={pdfFormat} isTeacher={false} />}
            {unit.type === 'question' && <PrintableQuestionItem question={unit.data.question} qIdx={unit.data.qIdx} pdfFormat={pdfFormat} isTeacher={false} />}
          </div>
        ))}

        {activeQuiz.writingPrompts?.map((prompt, idx) => (
          <div 
            key={`m-write-${idx}`}
            ref={el => { if(el) manualWritingRefs.current[idx] = el; }}
            style={{ width: '714px', boxSizing: 'border-box', padding: '8px', backgroundColor: '#ffffff' }}
            className={pdfFormat === PdfFormat.CLASSIC ? 'font-serif' : 'font-sans'}
          >
             <PrintableWritingItem prompt={prompt} idx={idx} displayNum={writingStartNum + idx} pdfFormat={pdfFormat} />
          </div>
        ))}
      </div>

      {/* DOM hidden specific for manual PDF measurement (Approach 1) - TEACHER */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '794px', backgroundColor: '#ffffff', color: '#000000' }}>
        <div ref={manualHeaderTeacherRef} style={{ width: '714px', boxSizing: 'border-box', padding: '10px' }}>
           <PrintableHeader quiz={activeQuiz} language={language} pdfFormat={pdfFormat} isTeacher={true} />
        </div>
        
        {pdfUnits.map((unit: any, idx: number) => (
          <div 
            key={`m-unit-t-${idx}`} 
            ref={el => { if(el) manualItemsTeacherRefs.current[idx] = el; }}
            style={{ width: '340px', boxSizing: 'border-box', padding: '2px 8px', backgroundColor: '#ffffff' }} 
            className={pdfFormat === PdfFormat.CLASSIC ? 'font-serif' : 'font-sans'}
          >
            {unit.type === 'header' && <div className="mt-2"><PrintableExHeader title={unit.data.title} descKey={unit.data.descKey} displayNum={unit.data.displayNum} pdfFormat={pdfFormat} /></div>}
            {unit.type === 'reading_text' && <PrintableReadingText text={unit.text} pdfFormat={pdfFormat} />}
            {unit.type === 'listening_text' && <PrintableListeningText text={unit.text} pdfFormat={pdfFormat} isTeacher={true} />}
            {unit.type === 'question' && <PrintableQuestionItem question={unit.data.question} qIdx={unit.data.qIdx} pdfFormat={pdfFormat} isTeacher={true} />}
          </div>
        ))}

        {activeQuiz.writingPrompts?.map((prompt, idx) => (
          <div 
            key={`m-write-t-${idx}`}
            ref={el => { if(el) manualWritingTeacherRefs.current[idx] = el; }}
            style={{ width: '714px', boxSizing: 'border-box', padding: '8px', backgroundColor: '#ffffff' }}
            className={pdfFormat === PdfFormat.CLASSIC ? 'font-serif' : 'font-sans'}
          >
             <PrintableWritingItem prompt={prompt} idx={idx} displayNum={writingStartNum + idx} pdfFormat={pdfFormat} />
          </div>
        ))}
      </div>
      
      {/* Hidden container for PDF generation */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        {quizzes.map((quiz, idx) => (
          <React.Fragment key={idx}>
            <div id={`pdf-container-student-${idx}`}>
              <PrintableQuiz quiz={quiz} language={language} pdfFormat={pdfFormat} isTeacher={false} />
            </div>
            <div id={`pdf-container-teacher-${idx}`}>
              <PrintableQuiz quiz={quiz} language={language} pdfFormat={pdfFormat} isTeacher={true} />
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* DOM hidden specific for manual PDF measurement (Approach 1) - STUDENT */}
      {/* Usiamo box-sizing border-box e larghezza fissa per garantire misurazioni accurate */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '794px', backgroundColor: '#ffffff', color: '#000000' }}>
        <div ref={manualHeaderRef} style={{ width: '714px', boxSizing: 'border-box', padding: '10px' }}>
           <PrintableHeader quiz={activeQuiz} language={language} pdfFormat={pdfFormat} isTeacher={false} />
        </div>
        
        {pdfUnits.map((unit: any, idx: number) => (
          <div 
            key={`m-unit-${idx}`} 
            ref={el => { if(el) manualItemsRefs.current[idx] = el; }}
            style={{ width: '340px', boxSizing: 'border-box', padding: '2px 8px', backgroundColor: '#ffffff' }} 
            className={pdfFormat === PdfFormat.CLASSIC ? 'font-serif' : 'font-sans'}
          >
            {unit.type === 'header' && <div className="mt-2"><PrintableExHeader title={unit.data.title} descKey={unit.data.descKey} displayNum={unit.data.displayNum} pdfFormat={pdfFormat} /></div>}
            {unit.type === 'reading_text' && <PrintableReadingText text={unit.text} pdfFormat={pdfFormat} />}
            {unit.type === 'listening_text' && <PrintableListeningText text={unit.text} pdfFormat={pdfFormat} isTeacher={false} />}
            {unit.type === 'question' && <PrintableQuestionItem question={unit.data.question} qIdx={unit.data.qIdx} pdfFormat={pdfFormat} isTeacher={false} />}
          </div>
        ))}

        {activeQuiz.writingPrompts?.map((prompt, idx) => (
          <div 
            key={`m-write-${idx}`}
            ref={el => { if(el) manualWritingRefs.current[idx] = el; }}
            style={{ width: '714px', boxSizing: 'border-box', padding: '8px', backgroundColor: '#ffffff' }}
            className={pdfFormat === PdfFormat.CLASSIC ? 'font-serif' : 'font-sans'}
          >
             <PrintableWritingItem prompt={prompt} idx={idx} displayNum={writingStartNum + idx} pdfFormat={pdfFormat} />
          </div>
        ))}
      </div>

      {/* DOM hidden specific for manual PDF measurement (Approach 1) - TEACHER */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '794px', backgroundColor: '#ffffff', color: '#000000' }}>
        <div ref={manualHeaderTeacherRef} style={{ width: '714px', boxSizing: 'border-box', padding: '10px' }}>
           <PrintableHeader quiz={activeQuiz} language={language} pdfFormat={pdfFormat} isTeacher={true} />
        </div>
        
        {pdfUnits.map((unit: any, idx: number) => (
          <div 
            key={`m-unit-t-${idx}`} 
            ref={el => { if(el) manualItemsTeacherRefs.current[idx] = el; }}
            style={{ width: '340px', boxSizing: 'border-box', padding: '2px 8px', backgroundColor: '#ffffff' }} 
            className={pdfFormat === PdfFormat.CLASSIC ? 'font-serif' : 'font-sans'}
          >
            {unit.type === 'header' && <div className="mt-2"><PrintableExHeader title={unit.data.title} descKey={unit.data.descKey} displayNum={unit.data.displayNum} pdfFormat={pdfFormat} /></div>}
            {unit.type === 'reading_text' && <PrintableReadingText text={unit.text} pdfFormat={pdfFormat} />}
            {unit.type === 'listening_text' && <PrintableListeningText text={unit.text} pdfFormat={pdfFormat} isTeacher={true} />}
            {unit.type === 'question' && <PrintableQuestionItem question={unit.data.question} qIdx={unit.data.qIdx} pdfFormat={pdfFormat} isTeacher={true} />}
          </div>
        ))}

        {activeQuiz.writingPrompts?.map((prompt, idx) => (
          <div 
            key={`m-write-t-${idx}`}
            ref={el => { if(el) manualWritingTeacherRefs.current[idx] = el; }}
            style={{ width: '714px', boxSizing: 'border-box', padding: '8px', backgroundColor: '#ffffff' }}
            className={pdfFormat === PdfFormat.CLASSIC ? 'font-serif' : 'font-sans'}
          >
             <PrintableWritingItem prompt={prompt} idx={idx} displayNum={writingStartNum + idx} pdfFormat={pdfFormat} />
          </div>
        ))}
      </div>

      {/* PDF Format Picker Popup */}
      {showFormatPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full animate-in fade-in zoom-in-95">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Scegli il formato del PDF</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Seleziona il layout con cui vuoi scaricare i compiti.</p>
            
            <div className="space-y-4 mb-8">
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

              {/* Template preview */}
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
                onClick={() => setShowFormatPicker(false)}
                className="flex-1 px-6 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-600 transition"
              >
                Annulla
              </button>
              <button 
                onClick={() => confirmFormatAndDownload(pdfFormat)}
                className="flex-[2] px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/20"
              >
                Scarica PDF &darr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizPreview;
