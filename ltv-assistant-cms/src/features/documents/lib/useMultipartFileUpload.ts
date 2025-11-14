import { useState } from 'react';
import axios from 'axios';
import { getErrorMessage } from '@/shared/types';
import { documentsApi } from '../api/documents.api';

const PART_SIZE_MB = 5;
const PART_SIZE_BYTES = PART_SIZE_MB * 1024 * 1024;
const MAX_CONCURRENT_UPLOADS = 5;

interface PartUploadResult {
  partNumber: number;
  etag: string;
}

export function useMultipartFileUpload() {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = async (documentId: string, file: File) => {
    setProgress(0);
    setError(null);

    try {
      // Step 1: Calculate number of parts
      const partsCount = Math.ceil(file.size / PART_SIZE_BYTES);

      // Step 2: Initialize multipart upload
      const initResponse = await documentsApi.initMultipartUpload(documentId, {
        filename: file.name,
        filesize: file.size,
        contentType: file.type,
        partsCount,
      });

      // Step 3: Upload parts in parallel (with concurrency limit)
      const uploadedParts: PartUploadResult[] = [];
      const partProgress = new Map<number, number>();

      const uploadPart = async (partNumber: number, url: string) => {
        const start = (partNumber - 1) * PART_SIZE_BYTES;
        const end = Math.min(start + PART_SIZE_BYTES, file.size);
        const partBlob = file.slice(start, end);

        const response = await axios.put(url, partBlob, {
          headers: {
            'Content-Type': file.type,
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const partPercent = (progressEvent.loaded / progressEvent.total) * 100;
              partProgress.set(partNumber, partPercent);

              // Calculate overall progress
              const totalProgress =
                Array.from(partProgress.values()).reduce((sum, val) => sum + val, 0) / partsCount;
              setProgress(Math.round(totalProgress));
            }
          },
        });

        const etag = response.headers.etag?.replace(/"/g, '');
        if (!etag) {
          throw new Error(`Failed to get ETag for part ${partNumber}`);
        }

        return {
          partNumber,
          etag,
        };
      };

      // Upload parts with concurrency control
      const urls = initResponse.presignedUrls;
      for (let i = 0; i < urls.length; i += MAX_CONCURRENT_UPLOADS) {
        const batch = urls.slice(i, i + MAX_CONCURRENT_UPLOADS);
        const batchResults = await Promise.all(
          batch.map((urlInfo) => uploadPart(urlInfo.partNumber, urlInfo.url))
        );
        uploadedParts.push(...batchResults);
      }

      // Step 4: Complete multipart upload
      const sortedParts = uploadedParts.sort((a, b) => a.partNumber - b.partNumber);
      await documentsApi.completeMultipartUpload(initResponse.fileId, sortedParts);

      setProgress(100);
    } catch (err) {
      const errorMessage = getErrorMessage(err) || 'Multipart upload failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  return { uploadFile, progress, error };
}
