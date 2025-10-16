'use client';

import { X, AlertTriangle } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useEffect } from 'react';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  jobName: string;
  isDeleting?: boolean;
}

export default function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  jobName,
  isDeleting = false,
}: DeleteConfirmDialogProps) {
  const { theme, textPrimary, textSecondary } = useTheme();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={!isDeleting ? onClose : undefined}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md rounded-2xl shadow-2xl transform transition-all ${
          theme === 'light'
            ? 'bg-white'
            : 'bg-zinc-900 border border-zinc-800'
        }`}
      >
        {/* Close button */}
        {!isDeleting && (
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 p-2 rounded-lg transition-colors ${
              theme === 'light'
                ? 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                : 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Content */}
        <div className="p-6">
          {/* Icon */}
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
              theme === 'light' ? 'bg-red-100' : 'bg-red-500/20'
            }`}
          >
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>

          {/* Title */}
          <h2 className={`text-xl font-semibold mb-2 ${textPrimary}`}>
            {title}
          </h2>

          {/* Description */}
          <p className={`text-sm mb-4 ${textSecondary}`}>
            {description}
          </p>

          {/* Job name highlight */}
          <div
            className={`px-4 py-3 rounded-lg mb-6 font-mono text-sm ${
              theme === 'light'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}
          >
            {jobName}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                isDeleting
                  ? 'opacity-50 cursor-not-allowed'
                  : theme === 'light'
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                isDeleting
                  ? 'bg-red-500/50 text-white cursor-not-allowed'
                  : 'bg-red-500 text-white hover:bg-red-600'
              }`}
            >
              {isDeleting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Deleting...
                </span>
              ) : (
                'Delete'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
