import { useState } from 'react';
import axios from 'axios';
import { getErrorMessage } from '@/shared/types';
import { documentsApi } from '../api/documents.api';

export function useSingleFileUpload() {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = async (documentId: string, file: File) => {
    setProgress(0);
    setError(null);

    try {
      // Step 1: Request presigned URL
      const presignedResponse = await documentsApi.requestPresignedUrl(documentId, {
        filename: file.name,
        filesize: file.size,
        contentType: file.type,
      });

      // Step 2: Upload file directly to MinIO using presigned URL
      await axios.put(presignedResponse.presignedUrl, file, {
        headers: {
          'Content-Type': file.type,
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setProgress(percentCompleted);
          }
        },
      });

      // Step 3: Confirm upload to backend
      await documentsApi.confirmUpload(presignedResponse.fileId);

      setProgress(100);
    } catch (err) {
      const errorMessage = getErrorMessage(err) || 'Upload failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  return { uploadFile, progress, error };
}
