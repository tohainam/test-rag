import { useState } from 'react';
import { IconAlertCircle, IconFile, IconUpload, IconX } from '@tabler/icons-react';
import { Alert, Button, Group, Paper, Progress, Stack, Text } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { getErrorMessage } from '@/shared/types';
import { useMultipartFileUpload } from '../lib/useMultipartFileUpload';
import { useSingleFileUpload } from '../lib/useSingleFileUpload';

interface FileUploadZoneProps {
  documentId: string;
  onUploadComplete: () => void;
  onClose: () => void;
}

const MAX_SINGLE_UPLOAD_MB = 20;
const MAX_FILE_SIZE_MB = 1000;

export function FileUploadZone({ documentId, onUploadComplete, onClose }: FileUploadZoneProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [_uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const { uploadFile: uploadSingle } = useSingleFileUpload();
  const { uploadFile: uploadMultipart } = useMultipartFileUpload();

  const handleDrop = (files: File[]) => {
    const validFiles = files.filter((file) => {
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > MAX_FILE_SIZE_MB) {
        notifications.show({
          title: 'File too large',
          message: `${file.name} exceeds maximum allowed (${MAX_FILE_SIZE_MB}MB)`,
          color: 'red',
        });
        return false;
      }
      return true;
    });

    setSelectedFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      return;
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      // Upload all files in parallel
      await Promise.all(
        selectedFiles.map(async (file, index) => {
          try {
            const fileSizeMB = file.size / (1024 * 1024);
            const fileKey = `file-${index}`;

            if (fileSizeMB <= MAX_SINGLE_UPLOAD_MB) {
              await uploadSingle(documentId, file);
            } else {
              await uploadMultipart(documentId, file);
            }

            setUploadProgress((prev) => ({ ...prev, [fileKey]: 100 }));
            successCount++;
          } catch (error) {
            // Log error silently - notification will be shown to user
            if (error instanceof Error) {
              // Error handled by notification system
            }
            failCount++;
          }
        })
      );

      if (successCount > 0) {
        notifications.show({
          title: 'Upload Complete',
          message: `${successCount} file(s) uploaded successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
          color: successCount === selectedFiles.length ? 'green' : 'yellow',
        });
      }

      if (successCount > 0) {
        onUploadComplete();
      }
    } catch (error) {
      notifications.show({
        title: 'Upload failed',
        message: getErrorMessage(error) || 'Failed to upload files',
        color: 'red',
      });
    } finally {
      setUploading(false);
      setSelectedFiles([]);
      setUploadProgress({});
    }
  };

  const handleCancel = () => {
    setSelectedFiles([]);
    setUploading(false);
    setUploadProgress({});
    onClose();
  };

  return (
    <Paper p="md" mb="md" withBorder>
      <Stack gap="md">
        <Dropzone
          onDrop={handleDrop}
          maxSize={MAX_FILE_SIZE_MB * 1024 * 1024}
          accept={[
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/markdown',
          ]}
          disabled={uploading}
        >
          <Group justify="center" gap="xl" style={{ minHeight: 120, pointerEvents: 'none' }}>
            <Dropzone.Accept>
              <IconUpload size={42} stroke={1.5} />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX size={42} stroke={1.5} />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <IconFile size={42} stroke={1.5} />
            </Dropzone.Idle>

            <div>
              <Text size="lg" inline>
                Drag files here or click to select multiple files
              </Text>
              <Text size="sm" c="dimmed" inline mt={7}>
                Files up to {MAX_SINGLE_UPLOAD_MB}MB will be uploaded directly. Larger files (up to{' '}
                {MAX_FILE_SIZE_MB}MB) will be split and uploaded in parts.
              </Text>
            </div>
          </Group>
        </Dropzone>

        {selectedFiles.length > 0 && (
          <>
            <Alert
              icon={<IconAlertCircle size={16} />}
              title={`${selectedFiles.length} File(s) Selected`}
              color="blue"
            >
              <Stack gap="xs">
                {selectedFiles.map((file, index) => {
                  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
                  const isMultipart = file.size / (1024 * 1024) > MAX_SINGLE_UPLOAD_MB;

                  return (
                    <Group key={index} justify="space-between">
                      <div>
                        <Text size="sm">
                          <strong>{file.name}</strong> ({fileSizeMB} MB) -{' '}
                          {isMultipart ? 'Multipart' : 'Single'} upload
                        </Text>
                      </div>
                      {!uploading && (
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() => removeFile(index)}
                        >
                          Remove
                        </Button>
                      )}
                    </Group>
                  );
                })}
              </Stack>
            </Alert>

            {uploading && (
              <Stack gap="xs">
                <Text size="sm">Uploading {selectedFiles.length} file(s)...</Text>
                <Progress value={100} animated />
              </Stack>
            )}
          </>
        )}

        <Group justify="flex-end">
          <Button variant="outline" onClick={handleCancel} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} loading={uploading} disabled={selectedFiles.length === 0}>
            Upload {selectedFiles.length > 0 ? `${selectedFiles.length} File(s)` : ''}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
