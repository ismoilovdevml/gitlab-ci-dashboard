import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '0s';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatRelativeTime(date: string): string {
  const now = new Date();
  const target = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - target.getTime()) / 1000);

  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return target.toLocaleDateString();
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'success':
      return 'text-green-500 bg-green-500/10 border-green-500/20';
    case 'failed':
      return 'text-red-500 bg-red-500/10 border-red-500/20';
    case 'running':
      return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    case 'pending':
    case 'created':
      return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    case 'canceled':
    case 'skipped':
      return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    case 'manual':
      return 'text-purple-500 bg-purple-500/10 border-purple-500/20';
    default:
      return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
  }
}

export function getStatusIcon(status: string): string {
  switch (status) {
    case 'success':
      return '✓';
    case 'failed':
      return '✗';
    case 'running':
      return '⟳';
    case 'pending':
    case 'created':
      return '○';
    case 'canceled':
      return '⊘';
    case 'skipped':
      return '⊗';
    case 'manual':
      return '⊙';
    default:
      return '?';
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
