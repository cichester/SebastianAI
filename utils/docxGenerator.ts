
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, SectionType } from 'docx';
import { saveAs } from 'file-saver';
import { Quiz, Question, QuestionType, ReadingSection, ListeningSection, WritingPrompt } from '../types';

const getQuestionTypeName = (type: QuestionType) => {
    switch (type) {
        case QuestionType.MULTIPLE_CHOICE: return 'Scelta Multipla';
        case QuestionType.FILL_IN_THE_BLANK: return 'Completa gli Spazi';
        case QuestionType.SHORT_ANSWER: return 'Risposta Breve';
        case QuestionType.TRANSLATION: return 'Traduzione';
        default: return 'Sconosciuto';
    }
}

export const generateDocx = async (quiz: Quiz) => {
  const children: any[] = [];

  // Title
  children.push(
    new Paragraph({
      text: quiz.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  if (quiz.versionLabel) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Versione: ${quiz.versionLabel}`,
            bold: true,
            size: 28,
          }),
        ],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 400 },
      })
    );
  }

  // Listening Sections
  if (quiz.listeningSections && quiz.listeningSections.length > 0) {
    quiz.listeningSections.forEach((section) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: section.topic, bold: true, size: 32, color: '4338ca' })],
          spacing: { before: 400, after: 200 },
          heading: HeadingLevel.HEADING_1,
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Listening Exercise', bold: true, size: 28 })],
          spacing: { after: 200 },
        })
      );
      
      // Questions
      section.questions.forEach((q, i) => {
        addQuestionToDoc(children, q, i + 1);
      });
    });
  }

  // Reading Sections
  if (quiz.readingSections && quiz.readingSections.length > 0) {
    quiz.readingSections.forEach((section) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: section.topic, bold: true, size: 32, color: '4338ca' })],
          spacing: { before: 400, after: 200 },
          heading: HeadingLevel.HEADING_1,
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Reading Comprehension', bold: true, size: 28 })],
          spacing: { after: 200 },
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: section.text, size: 24 })],
          spacing: { after: 300, line: 360 },
          alignment: AlignmentType.JUSTIFIED,
        })
      );
      
      section.questions.forEach((q, i) => {
        addQuestionToDoc(children, q, i + 1);
      });
    });
  }

  // Grouped standard questions
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

  Object.values(groupedQuestions).forEach(({ topic, type, questions }) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${topic} - ${type}`, bold: true, size: 28 }),
        ],
        spacing: { before: 400, after: 200 },
        heading: HeadingLevel.HEADING_2,
      })
    );

    questions.forEach((q, i) => {
      addQuestionToDoc(children, q, i + 1);
    });
  });

  // Writing Prompts
  if (quiz.writingPrompts && quiz.writingPrompts.length > 0) {
    quiz.writingPrompts.forEach((prompt) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: prompt.topic, bold: true, size: 32, color: '4338ca' })],
          spacing: { before: 400, after: 200 },
          heading: HeadingLevel.HEADING_1,
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Writing Prompt', bold: true, size: 28 })],
          spacing: { after: 200 },
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: prompt.promptText, size: 24 })],
          spacing: { after: 100 },
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `(Limite: ${prompt.wordLimit} parole)`, italics: true, size: 20, color: '64748b' })],
          spacing: { after: 300 },
        })
      );
    });
  }

  const doc = new Document({
    sections: [{
      properties: { type: SectionType.NEXT_PAGE },
      children: children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${quiz.title || 'Quiz'}.docx`);
};

function addQuestionToDoc(children: any[], q: Question, index: number) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Domanda ${index}: `, bold: true, size: 24 }),
          new TextRun({ text: q.questionText, size: 24 }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    if (q.questionType === QuestionType.MULTIPLE_CHOICE && q.options) {
      q.options.forEach((opt, optIndex) => {
          const letter = String.fromCharCode(65 + optIndex); // A, B, C...
          children.push(
                new Paragraph({
                    children: [
                        new TextRun({ text: `${letter}) ${opt.text}`, size: 22 })
                    ],
                    indent: { left: 720 }, // 0.5 inch indent (1440 twips = 1 inch, but docx uses twips)
                    spacing: { after: 50 },
                })
          );
      });
    } else {
        // Space for response
        children.push(
            new Paragraph({
                text: "__________________________________________________________________________",
                spacing: { after: 200 }
            })
        );
    }
}
