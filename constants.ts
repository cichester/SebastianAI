export const HISTORY_KEY = 'quizHistory';

export const SUPPORTED_LANGUAGES = [
  'Inglese',
  'Spagnolo',
  'Francese',
  'Tedesco',
];

export const CEFR_LEVELS = [
  'A1 - Principiante',
  'A2 - Elementare',
  'B1 - Intermedio',
  'B1+ - Intermedio Plus',
  'B2 - Intermedio Superiore',
  'B2+ - Post-Intermedio',
  'C1 - Avanzato',
  'C2 - Padronanza',
];

export const SUGGESTED_EXERCISE_TYPES = [
  'Scelta Multipla (Multiple Choice)',
  'Completa gli spazi (Fill in the Blank)',
  'Risposta Breve (Short Answer)',
  'Traduzione (Translation)',
  'Reading Comprehension',
  'Writing Prompt',
];

export const SUGGESTED_TOPICS: Record<string, string[]> = {
  'Inglese': [
    'Present Simple vs Present Continuous',
    'Past Simple (regular and irregular verbs)',
    'Present Perfect Simple',
    'Future Tenses (will, be going to)',
    'Modal Verbs (can, could, should, must)',
    'First Conditional',
    'Passive Voice',
    'Reported Speech',
    'William Shakespeare',
    'The Victorian Age',
    'Modernism in English Literature'
  ],
  'Spagnolo': [
    'Ser vs Estar',
    'Pretérito Indefinido vs Imperfecto',
    'Subjuntivo Presente',
    'Por vs Para',
    'Pronombres de Objeto Directo e Indirecto',
    'Futuro Simple',
    'Condicional Simple',
    'Cultura Española: El Siglo de Oro',
    'Literatura: Gabriel García Márquez',
    'Diferencias entre Español de España y Latinoamérica'
  ],
  'Francese': [
    'Passé Composé vs Imparfait',
    'Subjonctif Présent',
    'Pronoms Relatifs (qui, que, où, dont)',
    'Pronoms Personnels (le, la, les, lui, leur, y, en)',
    'Futur Simple vs Futur Proche',
    'Conditionnel Présent',
    'La Révolution Française',
    'Littérature: Victor Hugo',
    'La Francophonie'
  ],
  'Tedesco': [
    'Akkusativ vs Dativ',
    'Perfekt vs Präteritum',
    'Wechselpräpositionen',
    'Nebensätze (weil, dass, wenn)',
    'Adjektivdeklination',
    'Passiv',
    'Konjunktiv II',
    'Die Weimarer Republik',
    'Literatur: Johann Wolfgang von Goethe',
    'Deutsche Kultur und Traditionen'
  ]
};