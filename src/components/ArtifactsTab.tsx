'use client';

import { useEffect, useState, useMemo } from 'react';
import { Download, Trash2, Package, Clock, HardDrive, FileArchive, ChevronDown, ChevronRight, File, ExternalLink, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPIAsync, JobArtifact } from '@/lib/gitlab-api';
import { formatRelativeTime, formatBytes } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useNotifications } from '@/hooks/useNotifications';

interface GroupedArtifact {
  jobName: string;
  jobId: number;
  projectName: string;
  projectId: number;
  status: string;
  ref: string;
  createdAt: string;
  commit: any;
  artifacts: {
    filename: string;
    size: number;
  }[];
  totalSize: number;
}

export default function ArtifactsTab() {
  const { } = useDashboardStore();
  const { theme, textPrimary, textSecondary, card } = useTheme();
  const { notifySuccess, notifyError } = useNotifications();
  const [artifacts, setArtifacts] = useState<JobArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadArtifacts();
  }, []);

  const loadArtifacts = async () => {
    setLoading(true);
    try {
      const api = await getGitLabAPIAsync();
      const artifactsList = await api.getAllArtifacts();
      setArtifacts(artifactsList);
    } catch (error) {
      console.error('Failed to load artifacts:', error);
      notifyError('Load Failed', 'Failed to load artifacts');
    } finally {
      setLoading(false);
    }
  };

  // Group artifacts by job
  const groupedArtifacts = useMemo(() => {
    const groups = new Map<number, GroupedArtifact>();

    artifacts.forEach(artifact => {
      if (!groups.has(artifact.id)) {
        const artifactFiles = artifact.artifacts_file ? [{
          filename: artifact.artifacts_file.filename || 'artifacts.zip',
          size: artifact.artifacts_file.size || 0
        }] : [];

        groups.set(artifact.id, {
          jobName: artifact.name,
          jobId: artifact.id,
          projectName: artifact.project.name_with_namespace,
          projectId: artifact.project.id,
          status: artifact.status,
          ref: artifact.ref,
          createdAt: artifact.created_at,
          commit: artifact.commit,
          artifacts: artifactFiles,
          totalSize: artifactFiles.reduce((sum, f) => sum + f.size, 0)
        });
      }
    });

    return Array.from(groups.values()).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [artifacts]);

  const toggleExpand = (jobId: number) => {
    setExpandedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const handleDownload = async (group: GroupedArtifact) => {
    if (downloadingIds.has(group.jobId)) return;

    setDownloadingIds(prev => new Set(prev).add(group.jobId));

    try {
      const api = await getGitLabAPIAsync();
      const blob = await api.downloadArtifact(group.projectId, group.jobId);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = group.artifacts[0]?.filename || `artifacts-${group.jobId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      notifySuccess('Download Started', `Downloading artifacts from ${group.jobName}`);
    } catch (error: any) {
      console.error('Failed to download artifact:', error);
      const errorMsg = error?.response?.data?.message || error?.message || 'Failed to download artifact';
      notifyError('Download Failed', errorMsg);
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(group.jobId);
        return next;
      });
    }
  };

  const handleDelete = async (group: GroupedArtifact) => {
    if (deletingIds.has(group.jobId)) return;

    if (!confirm(`Are you sure you want to delete artifacts from job "${group.jobName}"?`)) {
      return;
    }

    setDeletingIds(prev => new Set(prev).add(group.jobId));

    try {
      const api = await getGitLabAPIAsync();
      await api.deleteArtifacts(group.projectId, group.jobId);
      setArtifacts(artifacts.filter(a => a.id !== group.jobId));
      notifySuccess('Deleted', `Artifacts from ${group.jobName} deleted`);
    } catch (error: any) {
      console.error('Failed to delete artifact:', error);
      const errorMsg = error?.response?.data?.message || error?.message || 'Failed to delete artifact';
      notifyError('Delete Failed', errorMsg);
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(group.jobId);
        return next;
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-zinc-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      case 'running':
        return 'text-blue-500';
      default:
        return 'text-zinc-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          <div className={textSecondary}>Loading artifacts...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-3xl font-bold mb-2 ${textPrimary}`}>Artifacts</h1>
          <p className={textSecondary}>
            {groupedArtifacts.length} job{groupedArtifacts.length !== 1 ? 's' : ''} with artifacts
          </p>
        </div>
      </div>

      {groupedArtifacts.length === 0 ? (
        <div className={`rounded-xl p-12 text-center ${card} ${
          theme === 'light' ? 'shadow-sm' : ''
        }`}>
          <FileArchive className={`w-16 h-16 mx-auto mb-4 ${
            theme === 'light' ? 'text-[#86868b]' : 'text-zinc-600'
          }`} />
          <h3 className={`text-lg font-semibold mb-2 ${textPrimary}`}>No Artifacts Found</h3>
          <p className={textSecondary}>No job artifacts available across your projects</p>
        </div>
      ) : (
        <div className={`rounded-xl overflow-hidden ${card} ${
          theme === 'light' ? 'shadow-sm' : 'border border-zinc-800'
        }`}>
          {/* Table Header */}
          <div className={`grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium ${textSecondary} ${
            theme === 'light' ? 'bg-gray-50 border-b border-gray-200' : 'bg-zinc-900/50 border-b border-zinc-800'
          }`}>
            <div className="col-span-1"></div>
            <div className="col-span-4">Job</div>
            <div className="col-span-2 text-center">Size</div>
            <div className="col-span-2 text-center">Created</div>
            <div className="col-span-3 text-right">Actions</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-zinc-800">
            {groupedArtifacts.map((group, index) => {
              const isExpanded = expandedJobs.has(group.jobId);
              const isDownloading = downloadingIds.has(group.jobId);
              const isDeleting = deletingIds.has(group.jobId);

              return (
                <div key={group.jobId}>
                  {/* Job Row */}
                  <div className={`grid grid-cols-12 gap-4 px-6 py-4 items-center transition-colors ${
                    theme === 'light' ? 'hover:bg-gray-50' : 'hover:bg-zinc-900/30'
                  }`}>
                    {/* Expand Button */}
                    <div className="col-span-1">
                      <button
                        onClick={() => toggleExpand(group.jobId)}
                        className={`p-1 rounded transition-colors ${
                          theme === 'light' ? 'hover:bg-gray-200' : 'hover:bg-zinc-800'
                        }`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <span className={`ml-2 text-xs ${textSecondary}`}>
                        {group.artifacts.length} file{group.artifacts.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Job Info */}
                    <div className="col-span-4">
                      <div className="flex items-start gap-3">
                        {getStatusIcon(group.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`font-medium ${textPrimary}`}>{group.jobName}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                              theme === 'light' ? 'bg-gray-100 text-gray-600' : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              #{group.jobId}
                            </span>
                          </div>
                          <div className={`text-xs ${textSecondary} truncate`}>
                            {group.projectName}
                          </div>
                          <div className={`text-xs ${textSecondary} font-mono mt-1`}>
                            {group.ref}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Size */}
                    <div className="col-span-2 text-center">
                      <div className={`flex items-center justify-center gap-1 ${textPrimary}`}>
                        <HardDrive className="w-3 h-3" />
                        <span className="text-sm font-medium">{formatBytes(group.totalSize)}</span>
                      </div>
                    </div>

                    {/* Created */}
                    <div className="col-span-2 text-center">
                      <div className={`flex items-center justify-center gap-1 ${textSecondary}`}>
                        <Clock className="w-3 h-3" />
                        <span className="text-sm">{formatRelativeTime(group.createdAt)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="col-span-3 flex items-center justify-end gap-2">
                      <button
                        onClick={() => window.open(`https://gitlab.com/${group.projectName}/-/jobs/${group.jobId}`, '_blank')}
                        className={`p-2 rounded-lg transition-colors ${
                          theme === 'light' ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-zinc-800 text-zinc-400'
                        }`}
                        title="Open in GitLab"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownload(group)}
                        disabled={isDownloading || isDeleting}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                          isDownloading
                            ? 'bg-blue-500/20 text-blue-400 cursor-not-allowed'
                            : theme === 'light'
                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                            : 'bg-blue-500 text-white hover:bg-blue-600'
                        }`}
                        title="Download artifacts"
                      >
                        <Download className="w-4 h-4" />
                        {isDownloading ? 'Downloading...' : 'Download'}
                      </button>
                      <button
                        onClick={() => handleDelete(group)}
                        disabled={isDeleting || isDownloading}
                        className={`p-2 rounded-lg transition-colors ${
                          isDeleting
                            ? 'text-red-500 opacity-50 cursor-not-allowed'
                            : theme === 'light'
                            ? 'hover:bg-red-50 text-red-500'
                            : 'hover:bg-red-500/10 text-red-500'
                        }`}
                        title="Delete artifacts"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Artifact Files */}
                  {isExpanded && (
                    <div className={`px-6 py-3 ${
                      theme === 'light' ? 'bg-gray-50/50' : 'bg-zinc-900/20'
                    }`}>
                      <div className="ml-6 space-y-2">
                        {group.artifacts.map((artifact, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 px-4 py-2 rounded-lg ${
                              theme === 'light' ? 'bg-white border border-gray-200' : 'bg-zinc-900 border border-zinc-800'
                            }`}
                          >
                            <File className="w-4 h-4 text-orange-500" />
                            <span className={`flex-1 text-sm font-mono ${textPrimary}`}>
                              {artifact.filename}
                            </span>
                            <span className={`text-xs ${textSecondary}`}>
                              {formatBytes(artifact.size)}
                            </span>
                          </div>
                        ))}

                        {/* Commit Info */}
                        {group.commit && (
                          <div className={`px-4 py-3 rounded-lg border-l-2 border-orange-500 ${
                            theme === 'light' ? 'bg-orange-50/50' : 'bg-orange-500/5'
                          }`}>
                            <div className={`text-xs ${textSecondary}`}>
                              <span className={`font-mono ${textPrimary}`}>
                                {group.commit.short_id}
                              </span>{' '}
                              {group.commit.title}
                            </div>
                            {group.commit.author_name && (
                              <div className={`text-xs mt-1 ${textSecondary}`}>
                                by {group.commit.author_name}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
