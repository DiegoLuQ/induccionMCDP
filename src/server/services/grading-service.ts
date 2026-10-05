import "server-only";

import { QuestionType, SubmissionStatus, type Question } from "@prisma/client";
import { LIKERT_LABELS } from "@/lib/constants";
import { parseQuestionOptions } from "@/lib/validations/evaluation";

export interface AnswerInput {
  questionId: string;
  answer: string;
}

export interface GradedAnswer {
  questionId: string;
  /** Id de alternativa, valor de escala (1-5) o texto libre. */
  answer: string;
  /** Texto legible de la respuesta, para la revisión y los informes. */
  answerLabel: string;
  /** null para preguntas abiertas y de escala (no se corrigen solas). */
  isCorrect: boolean | null;
  points: number;
  earned: number;
}

export interface GradingResult {
  answers: GradedAnswer[];
  /** Porcentaje 0-100 sobre el puntaje auto-corregible. */
  score: number;
  hasOpenQuestions: boolean;
  status: SubmissionStatus;
}

/**
 * Corrige una entrega:
 *  - MULTIPLE_CHOICE: automática, comparando el id de la alternativa.
 *  - OPEN_TEXT: no puntúa; deja la entrega en PENDING_REVIEW.
 *  - LIKERT: no puntúa ni bloquea; es percepción, no comprensión.
 *
 * El puntaje se calcula sólo sobre las preguntas auto-corregibles.
 */
export function gradeSubmission(
  questions: Question[],
  answers: AnswerInput[],
  passingScore: number,
): GradingResult {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.answer]));

  let totalAutoPoints = 0;
  let earnedAutoPoints = 0;
  let hasOpenQuestions = false;
  let hasAutoQuestions = false;

  const graded: GradedAnswer[] = questions.map((question) => {
    const answer = answerMap.get(question.id) ?? "";

    if (question.type === QuestionType.OPEN_TEXT) {
      hasOpenQuestions = true;
      return {
        questionId: question.id,
        answer,
        answerLabel: answer,
        isCorrect: null,
        points: question.points,
        earned: 0,
      };
    }

    if (question.type === QuestionType.LIKERT) {
      return {
        questionId: question.id,
        answer,
        answerLabel: LIKERT_LABELS[answer] ?? answer,
        isCorrect: null,
        points: 0,
        earned: 0,
      };
    }

    // MULTIPLE_CHOICE: se compara por id de alternativa, no por texto.
    hasAutoQuestions = true;
    const options = parseQuestionOptions(question.options);
    const chosen = options.find((option) => option.id === answer);
    const isCorrect =
      Boolean(question.correctAnswer) && answer === question.correctAnswer;

    totalAutoPoints += question.points;
    if (isCorrect) earnedAutoPoints += question.points;

    return {
      questionId: question.id,
      answer,
      answerLabel: chosen?.text || chosen?.imageUrl || answer,
      isCorrect,
      points: question.points,
      earned: isCorrect ? question.points : 0,
    };
  });

  const score =
    totalAutoPoints > 0
      ? Math.round((earnedAutoPoints / totalAutoPoints) * 100)
      : 100; // Sin preguntas puntuables no hay nada que reprobar.

  let status: SubmissionStatus;
  if (hasOpenQuestions) {
    status = SubmissionStatus.PENDING_REVIEW;
  } else if (!hasAutoQuestions) {
    // Evaluación sólo de escala: se aprueba por haberla respondido.
    status = SubmissionStatus.PASSED;
  } else {
    status =
      score >= passingScore ? SubmissionStatus.PASSED : SubmissionStatus.FAILED;
  }

  return { answers: graded, score, hasOpenQuestions, status };
}
