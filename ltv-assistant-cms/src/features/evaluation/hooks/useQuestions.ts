/**
 * Questions React Hooks
 * Hooks for managing dataset questions with axios (no React Query)
 */

import { useCallback, useState } from 'react';
import { evaluationApi } from '../api/evaluation.api';
import type {
  QuestionBulkAddRequest,
  QuestionInput,
  QuestionReorderRequest,
  QuestionResponse,
} from '../types/evaluation.types';

/**
 * Hook to bulk add questions to a dataset
 */
export const useQuestionsBulkAdd = () => {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const bulkAdd = useCallback(async (datasetId: string, questions: QuestionInput[]) => {
    setAdding(true);
    setError(null);
    try {
      const request: QuestionBulkAddRequest = { questions };
      const response = await evaluationApi.questions.bulkAdd(datasetId, request);
      return response;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setAdding(false);
    }
  }, []);

  return { bulkAdd, adding, error };
};

/**
 * Hook to update a question
 */
export const useQuestionUpdate = () => {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateQuestion = useCallback(
    async (questionId: string, data: Partial<QuestionInput>): Promise<QuestionResponse | null> => {
      setUpdating(true);
      setError(null);
      try {
        const response = await evaluationApi.questions.update(questionId, data);
        return response;
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      } finally {
        setUpdating(false);
      }
    },
    []
  );

  return { updateQuestion, updating, error };
};

/**
 * Hook to delete a question
 */
export const useQuestionDelete = () => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteQuestion = useCallback(async (questionId: string): Promise<boolean> => {
    setDeleting(true);
    setError(null);
    try {
      await evaluationApi.questions.delete(questionId);
      return true;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setDeleting(false);
    }
  }, []);

  return { deleteQuestion, deleting, error };
};

/**
 * Hook to reorder questions
 */
export const useQuestionsReorder = () => {
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reorderQuestions = useCallback(
    async (
      datasetId: string,
      questionOrders: Array<{ question_id: string; order_index: number }>
    ) => {
      setReordering(true);
      setError(null);
      try {
        const request: QuestionReorderRequest = { question_orders: questionOrders };
        await evaluationApi.questions.reorder(datasetId, request);
        return true;
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      } finally {
        setReordering(false);
      }
    },
    []
  );

  return { reorderQuestions, reordering, error };
};
