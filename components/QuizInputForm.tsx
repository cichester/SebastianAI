import React, { useState } from 'react';
import { CEFR_LEVELS, SUPPORTED_LANGUAGES, SUGGESTED_EXERCISE_TYPES } from '../constants';
import type { TopicRequest, QuizGenerationParams } from '../types';
import LoadingSpinner from './LoadingSpinner';

interface QuizInputFormProps {
  onGenerate: (params: QuizGenerationParams) => void;
  isLoading: boolean;
}

const createNewTopic = (): TopicRequest => ({
  id: `topic-${Date.now()}`,
  name: '',
  exercises: {
    'Scelta Multipla (es. A, B, C, D)': 0,
    'Completa gli Spazi': 0,
    'Vero/Falso': 0,
    'Risposta Breve': 0,
    'Traduzione': 0,
  },
  reading: { enabled: false, mode: 'generate', customText: '', wordCount: 150, exercises: { 'Scelta Multipla': 5 } },
  writing: { enabled: false, wordLimit: 100 },
  listening: { enabled: false, durationSeconds: 60, exercises: { 'Scelta Multipla': 5 } },
});

const QuizInputForm: React.FC<QuizInputFormProps> = ({ onGenerate, isLoading }) => {
  const [language, setLanguage] = useState(SUPPORTED_LANGUAGES[0]);
  const [level, setLevel] = useState(CEFR_LEVELS[2]);
  const [numVersions, setNumVersions] = useState<number>(2);
  const [topic, setTopic] = useState<TopicRequest>(createNewTopic());

  const handleRandomFill = () => {
    const randomTopics = [
      "Present Perfect vs Past Simple", 
      "First Conditional and Modals", 
      "Vocabulary: Travel and Tourism", 
      "Food, Drink, and Health", 
      "Technology and Social Media"
    ];
    const randomTopic = randomTopics[Math.floor(Math.random() * randomTopics.length)];
    
    setLanguage("Inglese");
    setLevel("B1 - Intermedio");
    setNumVersions(2);
    
    setTopic({
      id: `topic-${Date.now()}`,
      name: randomTopic,
      exercises: {
        'Scelta Multipla (es. A, B, C, D)': 5,
        'Completa gli Spazi': 5,
        'Vero/Falso': 5,
        'Risposta Breve': 0,
        'Traduzione': 0,
      },
      reading: { enabled: true, mode: 'generate', customText: '', wordCount: 150, exercises: { 'Scelta Multipla': 3 } },
      listening: { enabled: false, durationSeconds: 60, exercises: { 'Scelta Multipla': 5 } },
      writing: { enabled: true, wordLimit: 100 }
    });
  };

  const handleExerciseChange = (type: string, value: number) => {
    setTopic(prev => ({
      ...prev,
      exercises: { ...prev.exercises, [type]: Math.max(0, value) }
    }));
  };

  const isFormValid = () => {
    if (topic.name.trim() === '') return false;
    const hasExercises = Object.values(topic.exercises).some(count => (count as number) > 0);
    const hasExtra = topic.reading.enabled || topic.listening.enabled || topic.writing.enabled;
    return hasExercises || hasExtra;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isFormValid()) {
      onGenerate({ language, level, topics: [topic], numVersions });
    }
  };

  // Setup the main exercise types for the grid
  const mainExTypes = [
    { key: 'Scelta Multipla (es. A, B, C, D)', label: 'Scelta Multipla', icon: <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /> },
    { key: 'Completa gli Spazi', label: 'Completa gli spazi', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /> },
    { key: 'Vero/Falso', label: 'Vero / Falso', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /> },
    { key: 'Risposta Breve', label: 'Risposta Breve', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" /> },
    { key: 'Traduzione', label: 'Traduzione', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" /> }
  ];

  const totalExercises = Object.values(topic.exercises).reduce((a: number, b) => a + (b as number), 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-8 pb-20">
      
      {/* Box 1: Impostazioni di Base */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm transition-colors">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-6 tracking-tight transition-colors">
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
          </svg>
          Impostazioni di Base
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium transition-colors">Lingua</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 transition-colors"
            >
              {SUPPORTED_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium transition-colors">Livello CEFR</label>
             <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 transition-colors"
            >
              {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium transition-colors">Numero di File (Varianti)</label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="4"
                value={numVersions}
                onChange={(e) => setNumVersions(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 transition-colors"
              />
               <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                  </svg>
               </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Massimo 4 varianti</p>
          </div>
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium transition-colors">Argomento Principale</label>
            <input
              type="text"
              value={topic.name}
              onChange={(e) => setTopic(prev => ({ ...prev, name: e.target.value }))}
              placeholder="es. Present Perfect vs Past Simple..."
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 transition-colors placeholder-slate-400 dark:placeholder-slate-600"
              required
            />
          </div>
        </div>
      </div>

      {/* Box 2: Tipologia Esercizi */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm transition-colors">
         <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 tracking-tight transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-emerald-600 dark:text-emerald-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
              Tipologia Esercizi
            </h3>
            <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-1 px-3 rounded-full text-xs font-semibold transition-colors">Totale: {totalExercises} items</span>
         </div>
         
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           {mainExTypes.map(type => {
             const count = topic.exercises[type.key] || 0;
             const isSelected = count > 0;
             
             return (
               <div key={type.key} className={`border rounded-lg p-5 transition-all duration-200 ${isSelected ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/10 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                 <div className="flex flex-col h-full">
                    <div className="flex items-start justify-between mb-4">
                       <div className={`p-2 rounded-md transition-colors ${isSelected ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            {type.icon}
                          </svg>
                       </div>
                       <input 
                         type="checkbox" 
                         checked={isSelected}
                         onChange={(e) => handleExerciseChange(type.key, e.target.checked ? 5 : 0)}
                         className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-600 bg-white dark:bg-slate-900 cursor-pointer"
                       />
                    </div>
                    <div className="font-bold text-slate-800 dark:text-slate-100 mb-6 transition-colors">{type.label}</div>
                    
                    <div className="mt-auto flex items-center justify-between border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 overflow-hidden transition-colors">
                      <button 
                        type="button" 
                        onClick={() => handleExerciseChange(type.key, count - 1)}
                        className="px-3 py-2 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                        disabled={!isSelected}
                      >&minus;</button>
                      <input 
                        type="number" 
                        value={count} 
                        onChange={(e) => handleExerciseChange(type.key, parseInt(e.target.value) || 0)}
                        className="w-12 text-center text-sm font-bold border-none focus:ring-0 text-slate-800 dark:text-slate-100 bg-transparent p-0"
                        disabled={!isSelected}
                      />
                      <button 
                        type="button" 
                        onClick={() => handleExerciseChange(type.key, count + 1)}
                        className="px-3 py-2 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                        disabled={!isSelected}
                      >&#43;</button>
                    </div>
                 </div>
               </div>
             )
           })}
         </div>
      </div>

      {/* Box 3: Competenze Extra */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm transition-colors">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-6 tracking-tight transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-rose-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
          </svg>
          Competenze Extra
        </h3>

        <div className="space-y-4">
          {/* Reading */}
          <label className={`block border rounded-lg p-4 cursor-pointer transition-all duration-200 ${topic.reading.enabled ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/10' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-transparent'}`}>
             <div className="flex items-start gap-4">
               <div className="pt-0.5">
                  <input 
                    type="checkbox" 
                    checked={topic.reading.enabled} 
                    onChange={(e) => setTopic(prev => ({...prev, reading: {...prev.reading, enabled: e.target.checked}}))}
                    className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-600 bg-white dark:bg-slate-900" 
                  />
               </div>
               <div>
                  <div className="flex items-center gap-2">
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-500 dark:text-slate-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                     </svg>
                     <span className="font-bold text-slate-800 dark:text-slate-100 transition-colors">Aggiungi Lettura (Reading Comprehension)</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 transition-colors">Genera un testo originale con 5 domande di comprensione associate.</p>
               </div>
             </div>
          </label>

          {/* Listening */}
           <label className={`block border rounded-lg p-4 cursor-pointer transition-all duration-200 ${topic.listening.enabled ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/10' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-transparent'}`}>
             <div className="flex items-start gap-4">
               <div className="pt-0.5">
                  <input 
                    type="checkbox" 
                    checked={topic.listening.enabled} 
                    onChange={(e) => setTopic(prev => ({...prev, listening: {...prev.listening, enabled: e.target.checked}}))}
                    className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-600 bg-white dark:bg-slate-900" 
                  />
               </div>
               <div>
                  <div className="flex items-center gap-2">
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-500 dark:text-slate-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                     </svg>
                     <span className="font-bold text-slate-800 dark:text-slate-100 transition-colors">Aggiungi Ascolto (Listening Script)</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 transition-colors">Genera uno script per l'insegnante con domande di ascolto collegate.</p>
               </div>
             </div>
          </label>

          {/* Writing */}
           <label className={`block border rounded-lg p-4 cursor-pointer transition-all duration-200 ${topic.writing.enabled ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/10' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-transparent'}`}>
             <div className="flex items-start gap-4">
               <div className="pt-0.5">
                  <input 
                    type="checkbox" 
                    checked={topic.writing.enabled} 
                    onChange={(e) => setTopic(prev => ({...prev, writing: {...prev.writing, enabled: e.target.checked}}))}
                    className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-600 bg-white dark:bg-slate-900" 
                  />
               </div>
               <div>
                  <div className="flex items-center gap-2">
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-500 dark:text-slate-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                     </svg>
                     <span className="font-bold text-slate-800 dark:text-slate-100 transition-colors">Aggiungi Scrittura (Writing Task)</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 transition-colors">Includi un prompt di produzione scritta basato sull'argomento principale.</p>
               </div>
             </div>
          </label>
        </div>
      </div>
      
      {/* Spacer to prevent bottom fixed bar from overlapping content */}
      <div className="h-28 flex-shrink-0"></div>

      {/* Action Bar - Fixed Bottom or inline */}
      <div className="fixed bottom-0 left-64 right-0 p-6 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex justify-between items-center z-10 print:hidden transition-colors">
         <span className="text-sm text-slate-600 dark:text-slate-400 font-medium transition-colors">Pronto per generare le varianti?</span>
         <div className="flex gap-4">
            <button 
              type="button" 
              onClick={() => {
                setTopic(createNewTopic());
                setNumVersions(2);
              }}
              className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
              title="Svuota il modulo per creare un quiz personalizzato"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Svuota
            </button>
            <button 
              type="button" 
              onClick={handleRandomFill}
              className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
              title="Autocompila il form con parametri casuali per testare la generazione"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
              </svg>
              Random
            </button>
            <button 
              type="submit"
              disabled={!isFormValid() || isLoading}
              className={`px-6 py-2.5 rounded-lg font-bold text-white flex items-center gap-2 transition-all ${
                isFormValid() && !isLoading 
                ? 'bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-md shadow-emerald-900/20 border border-emerald-800 dark:border-emerald-500' 
                : 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-500 cursor-not-allowed'
              }`}
              title={!isFormValid() ? "Inserisci un argomento e seleziona almeno un esercizio" : "Genera il quiz"}
            >
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09l2.846.813-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                </svg>
              Genera Test
            </button>
         </div>
      </div>
    </form>
  );
};

export default QuizInputForm;
