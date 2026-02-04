'use client';

import { useState, useRef } from 'react';
import { uploadFile, deleteFile } from '@/lib/files';
import type { FileUploadResponse } from '@/types/files';

interface UploadedFile {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  size: number;
}

export default function ApiTestPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const uploadPromises = Array.from(files).map((file) => uploadFile(file));
      const results = await Promise.all(uploadPromises);

      const successfulUploads: UploadedFile[] = [];
      const errors: string[] = [];

      results.forEach((result: FileUploadResponse, index) => {
        if (result.success && result.file) {
          successfulUploads.push(result.file);
        } else {
          errors.push(`${files[index].name}: ${result.error || 'Upload failed'}`);
        }
      });

      if (successfulUploads.length > 0) {
        setUploadedFiles((prev) => [...successfulUploads, ...prev]);
        setSuccessMessage(`${successfulUploads.length}개 파일 업로드 성공`);
      }

      if (errors.length > 0) {
        setError(errors.join('\n'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const result = await deleteFile(fileId);
      if (result.success) {
        setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
        setSuccessMessage('파일 삭제 성공');
      } else {
        setError(result.error || 'Delete failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-[#1B1612] text-[#F3E9E7] p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">API Test Page</h1>
        <p className="text-[#E2D4C4] mb-8">Supabase + R2 파일 업로드/삭제 테스트</p>

        {/* Upload Section */}
        <div className="bg-[#2a211c] rounded-lg p-6 mb-8 border border-[#3a312c]">
          <h2 className="text-xl font-semibold mb-4 text-[#FC712B]">파일 업로드</h2>

          <label className="block">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              disabled={isUploading}
              className="hidden"
            />
            <div className="border-2 border-dashed border-[#FC712B] rounded-lg p-8 text-center cursor-pointer hover:bg-[#3a312c] transition-colors">
              {isUploading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-[#FC712B] border-t-transparent rounded-full animate-spin" />
                  <span>업로드 중...</span>
                </div>
              ) : (
                <>
                  <p className="text-lg mb-2">클릭하여 파일 선택</p>
                  <p className="text-sm text-[#E2D4C4]">또는 파일을 드래그 앤 드롭</p>
                </>
              )}
            </div>
          </label>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-4">
            <p className="text-red-300 whitespace-pre-line">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-900/50 border border-green-500 rounded-lg p-4 mb-4">
            <p className="text-green-300">{successMessage}</p>
          </div>
        )}

        {/* Uploaded Files */}
        <div className="bg-[#2a211c] rounded-lg p-6 border border-[#3a312c]">
          <h2 className="text-xl font-semibold mb-4 text-[#FD9319]">
            업로드된 파일 ({uploadedFiles.length})
          </h2>

          {uploadedFiles.length === 0 ? (
            <p className="text-[#E2D4C4] text-center py-8">업로드된 파일이 없습니다</p>
          ) : (
            <div className="grid gap-4">
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-4 bg-[#1B1612] rounded-lg p-4 border border-[#3a312c]"
                >
                  {/* Thumbnail */}
                  {file.contentType.startsWith('image/') && (
                    <img
                      src={file.url}
                      alt={file.originalFilename}
                      className="w-20 h-20 object-cover rounded-lg"
                    />
                  )}

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file.originalFilename}</p>
                    <p className="text-sm text-[#E2D4C4]">
                      {formatFileSize(file.size)} • {file.contentType}
                    </p>
                    <p className="text-xs text-[#E2D4C4] truncate mt-1">ID: {file.id}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-[#FC712B] hover:bg-[#FD9319] rounded-lg text-sm font-medium transition-colors"
                    >
                      보기
                    </a>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-8 text-center">
          <a
            href="/admin"
            className="text-[#FC712B] hover:text-[#FD9319] underline"
          >
            Admin 페이지로 이동 →
          </a>
        </div>
      </div>
    </div>
  );
}
