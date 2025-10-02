'use client';

import { useEffect, useState } from 'react';
import { Trash2, Package, Clock, HardDrive, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPI, ContainerRepository, ContainerTag } from '@/lib/gitlab-api';
import { formatRelativeTime, formatBytes } from '@/lib/utils';

export default function ContainerRegistryTab() {
  const { gitlabUrl, gitlabToken } = useDashboardStore();
  const [repositories, setRepositories] = useState<ContainerRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRepos, setExpandedRepos] = useState<Set<number>>(new Set());
  const [loadingTags, setLoadingTags] = useState<Set<number>>(new Set());
  const [deletingRepoIds, setDeletingRepoIds] = useState<Set<number>>(new Set());
  const [deletingTags, setDeletingTags] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (gitlabToken) {
      loadRepositories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitlabToken, gitlabUrl]);

  const loadRepositories = async () => {
    setLoading(true);
    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
      const reposList = await api.getAllContainerRepositories();
      setRepositories(reposList);
    } catch (error) {
      console.error('Failed to load container repositories:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRepository = async (repo: ContainerRepository) => {
    const isExpanded = expandedRepos.has(repo.id);

    if (isExpanded) {
      setExpandedRepos(prev => {
        const next = new Set(prev);
        next.delete(repo.id);
        return next;
      });
      return;
    }

    if (!repo.tags || repo.tags.length === 0) {
      setLoadingTags(prev => new Set(prev).add(repo.id));
      try {
        const api = getGitLabAPI(gitlabUrl, gitlabToken);
        const tags = await api.getContainerTags(repo.project_id, repo.id);
        setRepositories(
          repositories.map(r => (r.id === repo.id ? { ...r, tags } : r))
        );
      } catch (error) {
        console.error('Failed to load tags:', error);
      } finally {
        setLoadingTags(prev => {
          const next = new Set(prev);
          next.delete(repo.id);
          return next;
        });
      }
    }

    setExpandedRepos(prev => new Set(prev).add(repo.id));
  };

  const handleDeleteRepository = async (repo: ContainerRepository) => {
    if (deletingRepoIds.has(repo.id)) return;

    if (!confirm(`Are you sure you want to delete repository "${repo.name}"?`)) {
      return;
    }

    setDeletingRepoIds(prev => new Set(prev).add(repo.id));

    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
      await api.deleteContainerRepository(repo.project_id, repo.id);
      setRepositories(repositories.filter(r => r.id !== repo.id));
    } catch (error) {
      console.error('Failed to delete repository:', error);
      alert('Failed to delete repository');
    } finally {
      setDeletingRepoIds(prev => {
        const next = new Set(prev);
        next.delete(repo.id);
        return next;
      });
    }
  };

  const handleDeleteTag = async (repo: ContainerRepository, tag: ContainerTag) => {
    const tagKey = `${repo.id}-${tag.name}`;
    if (deletingTags.has(tagKey)) return;

    if (!confirm(`Are you sure you want to delete tag "${tag.name}"?`)) {
      return;
    }

    setDeletingTags(prev => new Set(prev).add(tagKey));

    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
      await api.deleteContainerTag(repo.project_id, repo.id, tag.name);

      setRepositories(
        repositories.map(r =>
          r.id === repo.id
            ? {
                ...r,
                tags: r.tags?.filter(t => t.name !== tag.name),
                tags_count: r.tags_count - 1,
              }
            : r
        )
      );
    } catch (error) {
      console.error('Failed to delete tag:', error);
      alert('Failed to delete tag');
    } finally {
      setDeletingTags(prev => {
        const next = new Set(prev);
        next.delete(tagKey);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-zinc-400">Loading container registries...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Container Registry</h1>
        <p className="text-zinc-400">Docker container images from all projects</p>
      </div>

      {repositories.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <Package className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-white font-semibold mb-2">No Container Registries Found</h3>
          <p className="text-zinc-500">No container images available across your projects</p>
        </div>
      ) : (
        <div className="space-y-4">
          {repositories.map((repo) => (
            <div
              key={repo.id}
              className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
            >
              <div className="p-6 hover:border-zinc-700 transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <button
                        onClick={() => toggleRepository(repo)}
                        className="text-zinc-400 hover:text-white transition-colors"
                      >
                        {expandedRepos.has(repo.id) ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </button>
                      <Package className="w-5 h-5 text-blue-500" />
                      <h3 className="text-white font-semibold">{repo.name}</h3>
                      <span className="px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {repo.tags_count} {repo.tags_count === 1 ? 'tag' : 'tags'}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 mb-2 ml-8 font-mono">{repo.path}</p>
                    <div className="flex items-center gap-4 text-xs text-zinc-500 ml-8">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatRelativeTime(repo.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteRepository(repo)}
                    disabled={deletingRepoIds.has(repo.id)}
                    className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete repository"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {expandedRepos.has(repo.id) && (
                <div className="border-t border-zinc-800 bg-zinc-950/50">
                  {loadingTags.has(repo.id) ? (
                    <div className="p-6 text-center text-zinc-500">Loading tags...</div>
                  ) : repo.tags && repo.tags.length > 0 ? (
                    <div className="divide-y divide-zinc-800">
                      {repo.tags.map((tag) => (
                        <div
                          key={tag.name}
                          className="p-4 flex items-center justify-between hover:bg-zinc-900/50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Tag className="w-4 h-4 text-green-500" />
                              <span className="text-white font-mono">{tag.name}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-zinc-500 ml-7">
                              <div className="flex items-center gap-1">
                                <HardDrive className="w-3 h-3" />
                                <span>{formatBytes(tag.total_size)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{formatRelativeTime(tag.created_at)}</span>
                              </div>
                              <span className="font-mono text-zinc-600">
                                {tag.short_revision}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteTag(repo, tag)}
                            disabled={deletingTags.has(`${repo.id}-${tag.name}`)}
                            className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete tag"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-zinc-500">No tags found</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
