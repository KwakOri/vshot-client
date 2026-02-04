'use client';

import { useState, useEffect, useCallback } from 'react';
import { deleteFile } from '@/lib/files';

interface FileInfo {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  size: number;
  createdAt: string;
  uploadedAt: string | null;
}

interface FilesResponse {
  success: boolean;
  files?: FileInfo[];
  total?: number;
  limit?: number;
  offset?: number;
  error?: string;
}

export default function AdminPage() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const limit = 20;

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/files?limit=${limit}&offset=${offset}&status=uploaded`);
      const data: FilesResponse = await response.json();

      if (data.success && data.files) {
        setFiles(data.files);
        setTotal(data.total || 0);
      } else {
        setError(data.error || 'Failed to fetch files');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch files');
    } finally {
      setIsLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleDownload = async (file: FileInfo) => {
    console.log('[Download] Starting download for:', {
      id: file.id,
      filename: file.originalFilename,
    });

    // API 라우트를 통해 다운로드 (서버에서 처리)
    const downloadUrl = `/api/files/${file.id}/download`;

    // a 태그로 다운로드 트리거 (서버가 리다이렉트 처리)
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = file.originalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    console.log('[Download] Download triggered via API route');
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const result = await deleteFile(fileId);
      if (result.success) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        setSelectedFiles((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
        setTotal((prev) => prev - 1);
      } else {
        alert(result.error || 'Delete failed');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedFiles.size === 0) return;
    if (!confirm(`${selectedFiles.size}개 파일을 삭제하시겠습니까?`)) return;

    const deletePromises = Array.from(selectedFiles).map((id) => deleteFile(id));
    const results = await Promise.all(deletePromises);

    const successCount = results.filter((r) => r.success).length;
    if (successCount > 0) {
      setFiles((prev) => prev.filter((f) => !selectedFiles.has(f.id)));
      setTotal((prev) => prev - successCount);
      setSelectedFiles(new Set());
    }

    if (successCount < selectedFiles.size) {
      alert(`${successCount}개 삭제 성공, ${selectedFiles.size - successCount}개 실패`);
    }
  };

  const handleBulkDownload = async () => {
    if (selectedFiles.size === 0) return;

    const filesToDownload = files.filter((f) => selectedFiles.has(f.id));
    for (const file of filesToDownload) {
      await handleDownload(file);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ko-KR');
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="min-h-screen bg-[#1B1612] text-[#F3E9E7] p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Admin - 파일 관리</h1>
            <p className="text-[#E2D4C4] mt-1">총 {total}개 파일</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[#FC712B] text-white'
                  : 'bg-[#2a211c] text-[#E2D4C4] hover:bg-[#3a312c]'
              }`}
            >
              그리드
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-[#FC712B] text-white'
                  : 'bg-[#2a211c] text-[#E2D4C4] hover:bg-[#3a312c]'
              }`}
            >
              리스트
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedFiles.size > 0 && (
          <div className="bg-[#2a211c] rounded-lg p-4 mb-6 flex items-center justify-between border border-[#FC712B]">
            <span className="text-[#FC712B] font-medium">
              {selectedFiles.size}개 선택됨
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleBulkDownload}
                className="px-4 py-2 bg-[#FC712B] hover:bg-[#FD9319] rounded-lg text-sm font-medium transition-colors"
              >
                선택 다운로드
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
              >
                선택 삭제
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#FC712B] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[#E2D4C4] text-lg">업로드된 파일이 없습니다</p>
            <a
              href="/api-test"
              className="inline-block mt-4 text-[#FC712B] hover:text-[#FD9319] underline"
            >
              파일 업로드하러 가기 →
            </a>
          </div>
        ) : (
          <>
            {/* Select All */}
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedFiles.size === files.length}
                  onChange={toggleSelectAll}
                  className="w-5 h-5 rounded border-[#3a312c] bg-[#2a211c] text-[#FC712B] focus:ring-[#FC712B]"
                />
                <span className="text-[#E2D4C4]">전체 선택</span>
              </label>
            </div>

            {/* Grid View */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className={`bg-[#2a211c] rounded-lg overflow-hidden border transition-colors ${
                      selectedFiles.has(file.id)
                        ? 'border-[#FC712B]'
                        : 'border-[#3a312c] hover:border-[#FD9319]'
                    }`}
                  >
                    {/* Checkbox */}
                    <div className="absolute z-10 p-2">
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.id)}
                        onChange={() => toggleSelect(file.id)}
                        className="w-5 h-5 rounded border-[#3a312c] bg-[#2a211c] text-[#FC712B] focus:ring-[#FC712B]"
                      />
                    </div>

                    {/* Thumbnail */}
                    <div className="relative aspect-square bg-[#1B1612]">
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.id)}
                        onChange={() => toggleSelect(file.id)}
                        className="absolute top-2 left-2 z-10 w-5 h-5 rounded border-[#3a312c] bg-[#2a211c] text-[#FC712B] focus:ring-[#FC712B]"
                      />
                      {file.contentType.startsWith('image/') ? (
                        <img
                          src={file.url}
                          alt={file.originalFilename}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#E2D4C4]">
                          <span className="text-4xl">📄</span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <p className="text-sm font-medium truncate" title={file.originalFilename}>
                        {file.originalFilename}
                      </p>
                      <p className="text-xs text-[#E2D4C4] mt-1">
                        {formatFileSize(file.size)}
                      </p>

                      {/* Actions */}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleDownload(file)}
                          className="flex-1 px-2 py-1.5 bg-[#FC712B] hover:bg-[#FD9319] rounded text-xs font-medium transition-colors"
                        >
                          다운로드
                        </button>
                        <button
                          onClick={() => handleDelete(file.id)}
                          className="px-2 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* List View */
              <div className="bg-[#2a211c] rounded-lg border border-[#3a312c] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#3a312c] text-left text-[#E2D4C4]">
                      <th className="p-4 w-12"></th>
                      <th className="p-4 w-16">미리보기</th>
                      <th className="p-4">파일명</th>
                      <th className="p-4 w-24">크기</th>
                      <th className="p-4 w-44">업로드 날짜</th>
                      <th className="p-4 w-36">액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr
                        key={file.id}
                        className={`border-b border-[#3a312c] last:border-b-0 ${
                          selectedFiles.has(file.id) ? 'bg-[#3a312c]' : ''
                        }`}
                      >
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(file.id)}
                            onChange={() => toggleSelect(file.id)}
                            className="w-5 h-5 rounded border-[#3a312c] bg-[#1B1612] text-[#FC712B] focus:ring-[#FC712B]"
                          />
                        </td>
                        <td className="p-4">
                          {file.contentType.startsWith('image/') ? (
                            <img
                              src={file.url}
                              alt={file.originalFilename}
                              className="w-12 h-12 object-cover rounded"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-[#1B1612] rounded flex items-center justify-center">
                              📄
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <p className="truncate max-w-xs" title={file.originalFilename}>
                            {file.originalFilename}
                          </p>
                          <p className="text-xs text-[#E2D4C4] truncate" title={file.id}>
                            {file.id}
                          </p>
                        </td>
                        <td className="p-4 text-[#E2D4C4]">{formatFileSize(file.size)}</td>
                        <td className="p-4 text-[#E2D4C4] text-sm">
                          {formatDate(file.uploadedAt || file.createdAt)}
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDownload(file)}
                              className="px-3 py-1.5 bg-[#FC712B] hover:bg-[#FD9319] rounded text-xs font-medium transition-colors"
                            >
                              다운로드
                            </button>
                            <button
                              onClick={() => handleDelete(file.id)}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition-colors"
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-4 py-2 bg-[#2a211c] hover:bg-[#3a312c] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  이전
                </button>
                <span className="px-4 text-[#E2D4C4]">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total}
                  className="px-4 py-2 bg-[#2a211c] hover:bg-[#3a312c] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}

        {/* Navigation */}
        <div className="mt-8 text-center">
          <a
            href="/api-test"
            className="text-[#FC712B] hover:text-[#FD9319] underline"
          >
            ← API Test 페이지로 이동
          </a>
        </div>
      </div>
    </div>
  );
}
