import React from 'react';
import type { Quiz, Question, QuestionOption, ReadingSection, WritingPrompt, ListeningSection } from '../types';
import { QuestionType, PdfFormat } from '../types';

interface PrintableQuizProps {
  quiz: Quiz;
  language?: string;
  pdfFormat?: PdfFormat;
}

export const getQuestionTypeName = (type: QuestionType) => {
  switch (type) {
    case QuestionType.MULTIPLE_CHOICE: return 'Scelta Multipla';
    case QuestionType.FILL_IN_THE_BLANK: return 'Completa gli Spazi';
    case QuestionType.SHORT_ANSWER: return 'Risposta Breve';
    case QuestionType.TRANSLATION: return 'Traduzione';
    default: return 'Sconosciuto';
  }
}

export const getExerciseDescription = (type: string) => {
  if (type.includes('Listening')) return 'Ascolta l\'audio e rispondi alle domande seguenti.';
  if (type.includes('Reading')) return 'Leggi il testo e rispondi alle domande di comprensione.';
  if (type.includes('Writing')) return 'Produci un testo scritto seguendo le indicazioni fornite.';
  if (type.includes('Scelta Multipla')) return 'Scegli la risposta corretta tra quelle proposte.';
  if (type.includes('Completa gli Spazi')) return 'Riempi gli spazi vuoti con la forma corretta.';
  if (type.includes('Risposta Breve')) return 'Fornisci una risposta sintetica alle seguenti domande.';
  if (type.includes('Traduzione')) return 'Traduci correttamente le frasi o il testo fornito.';
  return 'Completa l\'esercizio seguendo le istruzioni.';
}

export const PrintableHeader: React.FC<{ quiz: Quiz; language?: string; pdfFormat: PdfFormat }> = ({ quiz, language, pdfFormat }) => {
  if (pdfFormat === PdfFormat.MODERN) {
    return (
      <div className="mb-8 border-b-2 border-indigo-600 pb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-indigo-700 font-sans">{quiz.title}</h1>
            <p className="text-slate-500 text-sm font-sans">Fila {quiz.versionLabel || 'A'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm font-sans">
          <div className="flex border-b border-slate-300 pb-1">
            <span className="font-semibold mr-2">Nome:</span>
            <div className="flex-1"></div>
          </div>
          <div className="flex border-b border-slate-300 pb-1">
            <span className="font-semibold mr-2">Data:</span>
            <div className="flex-1"></div>
          </div>
        </div>
      </div>
    );
  }

  if (pdfFormat === PdfFormat.CLASSIC) {
    return (
      <div className="mb-8">
        <div className="flex justify-between items-end mb-2">
          <div className="flex-1 pr-6 pb-2">
            <h1 className="text-2xl font-bold font-sans uppercase tracking-tight">{quiz.title}</h1>
            {language && <p className="text-slate-600 font-sans text-xs font-semibold lowercase italic">Worksheet • {language}</p>}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-72 text-[10px] font-sans">
            <div className="flex items-end gap-1 border-b border-black pb-0.5">
              <span className="font-bold">Name:</span>
              <div className="flex-1 min-w-[50px]"></div>
            </div>
            <div className="flex items-end gap-1 border-b border-black pb-0.5">
              <span className="font-bold">Surname:</span>
              <div className="flex-1 min-w-[50px]"></div>
            </div>
            <div className="flex items-end gap-1 border-b border-black pb-0.5">
              <span className="font-bold">Class:</span>
              <div className="flex-1 min-w-[50px]"></div>
            </div>
            <div className="flex items-end gap-1 border-b border-black pb-0.5">
              <span className="font-bold">Date:</span>
              <div className="flex-1 min-w-[50px]"></div>
            </div>
          </div>
        </div>
        <div className="h-[1.5px] bg-black w-full mb-8"></div>
      </div>
    );
  }

  if (pdfFormat === PdfFormat.FORMAL) {
    return (
      <div className="mb-8 border-b-2 border-black pb-6">
        <div className="flex justify-center mb-8">
          <h1 className="text-3xl font-bold uppercase tracking-widest text-center">
            {language ? `Compito di ${language}` : quiz.title}
          </h1>
        </div>
        <div className="space-y-6 text-lg">
          <div className="flex items-end w-full">
            <span className="font-semibold whitespace-nowrap pb-1">Nome e Cognome:</span>
            <div className="flex-grow border-b border-black ml-2 mb-1"></div>
          </div>
          <div className="flex items-end justify-start w-full gap-x-16">
            <div className="flex items-end">
              <span className="font-semibold whitespace-nowrap pb-1">Classe:</span>
              <div className="w-32 border-b border-black ml-2 mb-1"></div>
            </div>
            <div className="flex items-end">
              <span className="font-semibold whitespace-nowrap pb-1">Data:</span>
              <div className="w-48 border-b border-black ml-2 mb-1"></div>
            </div>
            <div className="flex items-end">
              <span className="font-semibold whitespace-nowrap pb-1">Fila:</span>
              <span className="ml-2 pb-1 font-bold">{quiz.versionLabel || 'A'}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export const PrintableExHeader: React.FC<{ title: string; descKey: string; displayNum: number; pdfFormat: PdfFormat }> = ({ title, descKey, displayNum, pdfFormat }) => {
  if (pdfFormat === PdfFormat.CLASSIC) {
    return (
      <div className="mb-4">
        <div className="flex items-baseline gap-2 mb-1">
          <h2 className="text-base font-bold font-sans uppercase">
            {displayNum} {title}
          </h2>
        </div>
        <p className="text-[11px] font-sans italic text-slate-700 leading-tight">
          {getExerciseDescription(descKey)}
        </p>
      </div>
    );
  }
  if (pdfFormat === PdfFormat.FORMAL) {
    return (
      <div className="border-b border-black mb-4 pb-1">
        <div className="flex justify-between items-end">
          <h2 className="text-xl font-bold uppercase tracking-tight font-serif">Esercizio {displayNum}</h2>
          <span className="text-sm pb-0.5 font-semibold font-serif">Punti: ______ / ______</span>
        </div>
        <div className="mt-1">
          <p className="text-lg font-bold font-serif">{title}</p>
          <p className="text-sm italic text-gray-700 font-serif">{getExerciseDescription(descKey)}</p>
        </div>
      </div>
    );
  }
  // MODERN (Default)
  return (
    <div className="mb-4 bg-indigo-50 p-3 rounded-lg border-l-4 border-indigo-500 font-sans">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-lg font-bold text-indigo-900">Esercizio {displayNum}: {title}</h2>
        <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">Score: ____</span>
      </div>
      <p className="text-sm text-indigo-800/80 italic">{getExerciseDescription(descKey)}</p>
    </div>
  );
};

export const PrintableReadingText: React.FC<{ text: string; pdfFormat: PdfFormat }> = ({ text, pdfFormat }) => {
  const isClassic = pdfFormat === PdfFormat.CLASSIC;
  return (
    <div className={`mb-4 p-3 border border-gray-300 bg-gray-50 text-justify italic text-[11px] leading-relaxed ${isClassic ? 'ml-0' : 'ml-4'}`}>
      <p>{text}</p>
    </div>
  );
};

export const PrintableListeningText: React.FC<{ text: string; pdfFormat: PdfFormat }> = ({ text, pdfFormat }) => {
  const isClassic = pdfFormat === PdfFormat.CLASSIC;
  return (
    <div className={`mb-4 p-3 border border-gray-300 bg-gray-50 italic text-[11px] ${isClassic ? 'ml-0' : 'ml-4'}`}>
      <p className="font-semibold mb-1">Trascrizione:</p>
      <p>{text}</p>
    </div>
  );
};

export const PrintableQuestionItem: React.FC<{ question: Question; qIdx: number; pdfFormat: PdfFormat }> = ({ question, qIdx, pdfFormat }) => {
  const isClassic = pdfFormat === PdfFormat.CLASSIC;
  return (
    <div className="break-inside-avoid text-[13px] mb-4 w-full">
      <p className="font-semibold mb-1">{qIdx + 1}. {question.questionText}</p>
      {question.questionType === QuestionType.MULTIPLE_CHOICE && question.options && (
        <div className="space-y-1 pl-4">
          {question.options.map((opt: QuestionOption, oIdx: number) => (
            <div key={oIdx} className="flex items-start">
              {isClassic ? (
                <span className="font-bold font-sans text-[11px] mr-2 w-4">{String.fromCharCode(65 + oIdx)})</span>
              ) : (
                <div className="w-4 h-4 border border-black rounded-full mr-3 mt-1 flex-shrink-0"></div>
              )}
              <span>{opt.text}</span>
            </div>
          ))}
        </div>
      )}
      {(question.questionType === QuestionType.FILL_IN_THE_BLANK || question.questionType === QuestionType.SHORT_ANSWER || question.questionType === QuestionType.TRANSLATION) && (
        <div className="mt-2 border-b border-black border-dashed w-full h-4"></div>
      )}
    </div>
  );
};

export const PrintableExerciseItem: React.FC<{ item: any; pdfFormat: PdfFormat }> = ({ item, pdfFormat }) => {
  const isClassic = pdfFormat === PdfFormat.CLASSIC;

  if (item.kind === 'listening') {
    const section = item.data as ListeningSection;
    return (
      <div className={`mb-8 ${isClassic ? 'pt-2' : 'break-inside-avoid'}`}>
        <PrintableExHeader title={`Listening Comprehension (${section.topic})`} descKey="Listening" displayNum={item.displayNum} pdfFormat={pdfFormat} />
        <PrintableListeningText text={section.text} pdfFormat={pdfFormat} />
        <div className={`space-y-6 ${isClassic ? 'pl-2' : 'pl-4'}`}>
          {section.questions.map((q: Question, qIdx: number) => (
            <PrintableQuestionItem key={qIdx} question={q} qIdx={qIdx} pdfFormat={pdfFormat} />
          ))}
        </div>
      </div>
    );
  }

  if (item.kind === 'reading') {
    const section = item.data as ReadingSection;
    return (
      <div className={`mb-8 ${isClassic ? 'pt-2' : 'break-inside-avoid'}`}>
        <PrintableExHeader title={`Reading Comprehension (${section.topic})`} descKey="Reading" displayNum={item.displayNum} pdfFormat={pdfFormat} />
        <PrintableReadingText text={section.text} pdfFormat={pdfFormat} />
        <div className={`space-y-6 ${isClassic ? 'pl-2' : 'pl-4'}`}>
          {section.questions.map((q: Question, qIdx: number) => (
            <PrintableQuestionItem key={qIdx} question={q} qIdx={qIdx} pdfFormat={pdfFormat} />
          ))}
        </div>
      </div>
    );
  }

  if (item.kind === 'standard') {
    const section = item.data;
    return (
      <div className={`mb-8 ${isClassic ? 'pt-2' : 'break-inside-avoid'}`}>
        <PrintableExHeader title={`${section.type} (${section.topic})`} descKey={section.type} displayNum={item.displayNum} pdfFormat={pdfFormat} />
        <div className={`space-y-6 ${isClassic ? 'pl-2' : 'pl-4'}`}>
          {section.questions.map((q: Question, qIdx: number) => (
            <PrintableQuestionItem key={qIdx} question={q} qIdx={qIdx} pdfFormat={pdfFormat} />
          ))}
        </div>
      </div>
    );
  }

  return null;
};

export const PrintableWritingItem: React.FC<{ prompt: WritingPrompt; idx: number; displayNum: number; pdfFormat: PdfFormat }> = ({ prompt, idx, displayNum, pdfFormat }) => {
  const isClassic = pdfFormat === PdfFormat.CLASSIC;
  return (
    <div key={`writing-${idx}`} className={`mb-8 break-inside-avoid pt-6 mt-10 ${isClassic ? 'border-t border-slate-300' : 'border-t border-slate-100'}`}>
      <PrintableExHeader title={`Writing (${prompt.topic})`} descKey="Writing" displayNum={displayNum} pdfFormat={pdfFormat} />
      <div className="mb-4">
        <p className="font-semibold italic text-[15px]">{prompt.promptText}</p>
        <p className="text-[10px] mt-1 font-sans opacity-70 italic">(Limite: {prompt.wordLimit} parole)</p>
      </div>
      <div className={`space-y-8 mt-8 ${isClassic ? 'px-0' : 'pl-4'}`}>
        {[...Array(isClassic ? 8 : 10)].map((_, i) => (
          <div key={i} className="border-b border-black border-dashed w-full h-6 opacity-30"></div>
        ))}
      </div>
    </div>
  );
};

const PrintableQuiz: React.FC<PrintableQuizProps> = ({ quiz, language, pdfFormat = PdfFormat.MODERN }) => {
  // Raggruppa le domande per argomento e tipo come nel preview
  const groupedQuestions = quiz.questions.reduce((acc, question) => {
    const topic = question.topic || 'Senza Argomento';
    const type = getQuestionTypeName(question.questionType);
    const key = `${topic} - ${type}`;
    if (!acc[key]) {
      acc[key] = { topic, type, questions: [] };
    }
    acc[key].questions.push(question);
    return acc;
  }, {} as Record<string, { topic: string; type: string; questions: Question[] }>);

  const sections = Object.values(groupedQuestions);

  const isClassic = pdfFormat === PdfFormat.CLASSIC;
  const bodyFont = isClassic ? 'font-serif' : (pdfFormat === PdfFormat.MODERN ? 'font-sans' : 'font-serif');

  const rawItems = [
    ...(quiz.listeningSections || []).map((s, idx) => ({ kind: 'listening' as const, data: s, idx })),
    ...(quiz.readingSections || []).map((s, idx) => ({ kind: 'reading' as const, data: s, idx })),
    ...sections.map((s: any, idx) => ({ kind: 'standard' as const, data: s, idx }))
  ];

  const allItems = rawItems.map((item, i) => ({
    ...item,
    displayNum: i + 1
  }));

  const writingStartNum = allItems.length + 1;

  let mainContent;
  if (isClassic) {
    // DISTRIBUZIONE ALTERNATA (0 Sx, 1 Dx, 2 Sx, 3 Dx)
    const leftCol = allItems.filter((_: any, i: number) => i % 2 === 0);
    const rightCol = allItems.filter((_: any, i: number) => i % 2 === 1);
    
    mainContent = (
      <div style={{ display: 'flex', gap: '2.5rem', width: '100%', alignItems: 'flex-start', overflow: 'visible' }}>
        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
          {leftCol.map((item, idx) => <PrintableExerciseItem key={`l-${idx}`} item={item} pdfFormat={pdfFormat} />)}
        </div>
        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
          {rightCol.map((item, idx) => <PrintableExerciseItem key={`r-${idx}`} item={item} pdfFormat={pdfFormat} />)}
        </div>
      </div>
    );
  } else {
    mainContent = (
      <div className="space-y-8">
        {allItems.map((item, idx) => <PrintableExerciseItem key={idx} item={item} pdfFormat={pdfFormat} />)}
      </div>
    );
  }

  return (
    <div className={`p-12 bg-white text-black ${bodyFont}`} style={{ width: '190mm', minHeight: '277mm', boxSizing: 'border-box' }}>
      <PrintableHeader quiz={quiz} language={language} pdfFormat={pdfFormat} />
      <div>
        {mainContent}
        {/* Writing Prompts */}
        {quiz.writingPrompts?.map((prompt, idx) => (
          <PrintableWritingItem key={idx} prompt={prompt} idx={idx} displayNum={writingStartNum + idx} pdfFormat={pdfFormat} />
        ))}
      </div>

      {/* Footer con solo indicazione della pagina */}
      <div className="mt-8 pt-4 border-t border-slate-300 text-[10px] text-slate-500 font-sans flex justify-end uppercase tracking-wider">
        <span>Pagina 1 / 1</span>
      </div>
    </div>
  );
};

export default PrintableQuiz;
