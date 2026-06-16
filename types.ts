
export enum PdfFormat {
  MODERN = 'MODERN',
  CLASSIC = 'CLASSIC',
  FORMAL = 'FORMAL',
}

export enum QuestionType {
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  FILL_IN_THE_BLANK = 'FILL_IN_THE_BLANK',
  SHORT_ANSWER = 'SHORT_ANSWER',
  TRANSLATION = 'TRANSLATION',
}

export interface QuestionOption {
  text: string;
  isCorrect: boolean;
}

export interface Question {
  questionText: string;
  questionType: QuestionType;
  topic: string;
  options?: QuestionOption[];
  correctAnswer?: string;
}

export interface ReadingSection {
  topic: string;
  text: string;
  questions: Question[];
}

export interface WritingPrompt {
  topic: string;
  promptText: string;
  wordLimit: number;
}

export interface ListeningSection {
  topic: string;
  text: string; // Transcript
  questions: Question[];
  audioBase64?: string; // Base64 encoded PCM audio data
}

export interface Quiz {
  title: string;
  versionLabel?: string; // e.g., "A", "B", "C"
  questions: Question[];
  readingSections?: ReadingSection[];
  writingPrompts?: WritingPrompt[];
  listeningSections?: ListeningSection[];
}

export interface TopicRequest {
  id: string; // Per le chiavi di React
  name: string;
  exercises: Record<string, number>;
  reading: {
    enabled: boolean;
    mode: 'generate' | 'custom';
    customText: string;
    wordCount: number;
    exercises: Record<string, number>;
    directives?: string; // Direttive speciali per l'IA
  };
  writing: {
    enabled: boolean;
    wordLimit: number;
    numQuestions?: number;
    directives?: string; // Direttive speciali per l'IA
  };
  listening: {
    enabled: boolean;
    durationSeconds: number;
    exercises: Record<string, number>;
    directives?: string; // Direttive speciali per l'IA
  };
}

export interface QuizGenerationParams {
  language: string;
  level: string;
  topics: TopicRequest[];
  numVersions: number; // Changed from version?: string
  failedQuestions?: Question[];
  editUrl?: string;
}

export interface HistoryEntry {
  id: number; // Date.now()
  createdAt: string;
  title: string;
  quizzes: Quiz[]; // Changed from quiz: Quiz to support multiple versions
  params: QuizGenerationParams;
}

export interface AddExerciseParams {
  topic: string;
  kind: 'standard' | 'reading' | 'listening' | 'writing';
  mode: 'manual' | 'ai';
  standardType?: string; // 'Scelta Multipla', 'Completa gli Spazi', etc.
  standardCount?: number;
  readingWordCount?: number;
  readingExerciseType?: string;
  readingQuestionCount?: number;
  writingWordLimit?: number;
  writingDirectives?: string;
  listeningDurationSeconds?: number;
  listeningExerciseType?: string;
  listeningQuestionCount?: number;
  listeningDirectives?: string;
}

