'use client';

import { useEffect, useState } from 'react';
import { Download, Trash2, Package, Clock, HardDrive, FileArchive } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPI, JobArtifact } from '@/lib/gitlab-api';
import { formatRelativeTime, formatBytes } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

export default function ArtifactsTab() {
  const { gitlabUrl, gitlabToken } = useDashboardStore();
  const { theme, textPrimary, textSecondary, card } = useTheme();
  const [artifacts, setArtifacts] = useState<JobArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (gitlabToken) {
      loadArtifacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitlabToken, gitlabUrl]);

  const loadArtifacts = async () => {
    setLoading(true);
    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
      const artifactsList = await api.getAllArtifacts();
      setArtifacts(artifactsList);
    } catch (error) {
      console.error('Failed to load artifacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (artifact: JobArtifact) => {
    if (downloadingIds.has(artifact.id)) return;

    setDownloadingIds(prev => new Set(prev).add(artifact.id));

    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
      const blob = await api.downloadArtifact(artifact.project.id, artifact.id);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = artifact.artifacts_file?.filename || `artifacts-${artifact.id}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download artifact:', error);
      alert('Failed to download artifact');
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(artifact.id);
        return next;
      });
    }
  };

  const handleDelete = async (artifact: JobArtifact) => {
    if (deletingIds.has(artifact.id)) return;

    if (!confirm(`Are you sure you want to delete artifacts from job "${artifact.name}"?`)) {
      return;
    }

    setDeletingIds(prev => new Set(prev).add(artifact.id));

    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
      await api.deleteArtifacts(artifact.project.id, artifact.id);
      setArtifacts(artifacts.filter(a => a.id !== artifact.id));
    } catch (error) {
      console.error('Failed to delete artifact:', error);
      alert('Failed to delete artifact');
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(artifact.id);
        return next;
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'failed':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'running':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default:
        return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className={textSecondary}>Loading artifacts...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-bold mb-2 ${textPrimary}`}>Artifacts</h1>
        <p className={textSecondary}>Job artifacts from all projects</p>
      </div>

      {artifacts.length === 0 ? (
        <div className={`rounded-xl p-12 text-center ${card} ${
          theme === 'light' ? 'shadow-sm' : ''
        }`}>
          <FileArchive className={`w-12 h-12 mx-auto mb-4 ${
            theme === 'light' ? 'text-[#86868b]' : 'text-zinc-600'
          }`} />
          <h3 className={`font-semibold mb-2 ${textPrimary}`}>No Artifacts Found</h3>
          <p className={textSecondary}>No job artifacts available across your projects</p>
        </div>
      ) : (
        <div className="space-y-4">
          {artifacts.map((artifact) => (
            <div
              key={artifact.id}
              className={`rounded-xl p-6 transition-all ${card} ${
                theme === 'light' ? 'shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]' : 'hover:border-zinc-700'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Package className="w-5 h-5 text-orange-500" />
                    <h3 className={`font-semibold ${textPrimary}`}>{artifact.name}</h3>
                    <span
                      className={`px-2 py-1 rounded text-xs border ${getStatusColor(
                        artifact.status
                      )}`}
                    >
                      {artifact.status}
                    </span>
                  </div>
                  <p className={`text-sm mb-2 ${textSecondary}`}>
                    {artifact.project.name_with_namespace}
                  </p>
                  <div className={`flex items-center gap-4 text-xs ${textSecondary}`}>
                    <div className="flex items-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      <span>{formatBytes(artifact.artifacts_file?.size || 0)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatRelativeTime(artifact.created_at)}</span>
                    </div>
                    <span className="font-mono">{artifact.ref}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownload(artifact)}
                    disabled={downloadingIds.has(artifact.id)}
                    className={`p-2 text-blue-500 rounded-lg transition-colors disabled:opacity-50 ${
                      theme === 'light' ? 'hover:bg-blue-50' : 'hover:bg-blue-500/10'
                    }`}
                    title="Download artifacts"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(artifact)}
                    disabled={deletingIds.has(artifact.id)}
                    className={`p-2 text-red-500 rounded-lg transition-colors disabled:opacity-50 ${
                      theme === 'light' ? 'hover:bg-red-50' : 'hover:bg-red-500/10'
                    }`}
                    title="Delete artifacts"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {artifact.commit && (
                <div className={`pt-4 border-t ${
                  theme === 'light' ? 'border-[#d2d2d7]/50' : 'border-zinc-800'
                }`}>
                  <p className={`text-xs line-clamp-1 ${textSecondary}`}>
                    <span className={`font-mono ${
                      theme === 'light' ? 'text-[#86868b]' : 'text-zinc-600'
                    }`}>{artifact.commit.short_id}</span>{' '}
                    {artifact.commit.title}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
