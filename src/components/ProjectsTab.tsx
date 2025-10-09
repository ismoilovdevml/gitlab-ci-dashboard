'use client';

import { useEffect, useState, useMemo } from 'react';
import { ExternalLink, Star, GitFork, Lock, Globe, Eye, Search, Filter, FolderGit2, GitBranch, Tag, GitCommit } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPIAsync } from '@/lib/gitlab-api';
import { Project } from '@/lib/gitlab-api';
import { useTheme } from '@/hooks/useTheme';
import ProjectDetailsModal from './ProjectDetailsModal';

export default function ProjectsTab() {
  const { projects, setProjects } = useDashboardStore();
  const { theme, textPrimary, textSecondary, card, input, inputFocus } = useTheme();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [starringProjects, setStarringProjects] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all');

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProjects = async () => {
    try {
      const api = await getGitLabAPIAsync();
      const projectsList = await api.getProjects(1, 50);
      setProjects(projectsList);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleToggleStar = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();

    if (starringProjects.has(project.id)) return;

    setStarringProjects(prev => new Set(prev).add(project.id));

    try {
      const api = await getGitLabAPIAsync();
      const updatedProject = project.star_count > 0 && project.star_count
        ? await api.unstarProject(project.id)
        : await api.starProject(project.id);

      setProjects(projects.map(p => p.id === project.id ? updatedProject : p));
    } catch (error) {
      console.error('Failed to toggle star:', error);
    } finally {
      setStarringProjects(prev => {
        const next = new Set(prev);
        next.delete(project.id);
        return next;
      });
    }
  };

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'private':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20">
            <Lock className="w-3 h-3 text-red-500" />
          </div>
        );
      case 'internal':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20">
            <Eye className="w-3 h-3 text-yellow-500" />
          </div>
        );
      case 'public':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20">
            <Globe className="w-3 h-3 text-green-500" />
          </div>
        );
      default:
        return null;
    }
  };

  // Filter projects
  const filteredProjects = useMemo(() => {
    return projects.filter(project => {
      const matchesSearch =
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.namespace.name.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesVisibility = visibilityFilter === 'all' || project.visibility === visibilityFilter;

      return matchesSearch && matchesVisibility;
    });
  }, [projects, searchTerm, visibilityFilter]);

  // Calculate statistics
  const stats = useMemo(() => {
    const privateProjects = projects.filter(p => p.visibility === 'private').length;
    const publicProjects = projects.filter(p => p.visibility === 'public').length;

    return {
      total: projects.length,
      private: privateProjects,
      public: publicProjects,
    };
  }, [projects]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-bold mb-2 ${textPrimary}`}>Projects</h1>
        <p className={textSecondary}>All your GitLab projects</p>
      </div>

      {/* Statistics Cards - Only Essential */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => {
            setVisibilityFilter('all');
            setSearchTerm('');
          }}
          className={`rounded-xl p-4 text-left border transition-all ${
            theme === 'light'
              ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:from-blue-100 hover:to-blue-200 shadow-sm hover:shadow-md'
              : 'bg-gradient-to-br from-blue-500/10 to-blue-600/20 border-blue-500/30 hover:from-blue-500/20 hover:to-blue-600/30'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              theme === 'light' ? 'bg-blue-500/20' : 'bg-blue-500/10'
            }`}>
              <FolderGit2 className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className={`text-xs ${theme === 'light' ? 'text-blue-700' : 'text-blue-400'}`}>Total</p>
              <p className={`text-2xl font-bold ${textPrimary}`}>{stats.total}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setVisibilityFilter('public')}
          className={`rounded-xl p-4 text-left border transition-all ${
            theme === 'light'
              ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200 hover:from-green-100 hover:to-green-200 shadow-sm hover:shadow-md'
              : 'bg-gradient-to-br from-green-500/10 to-green-600/20 border-green-500/30 hover:from-green-500/20 hover:to-green-600/30'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              theme === 'light' ? 'bg-green-500/20' : 'bg-green-500/10'
            }`}>
              <Globe className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className={`text-xs ${theme === 'light' ? 'text-green-700' : 'text-green-400'}`}>Public</p>
              <p className={`text-2xl font-bold ${theme === 'light' ? 'text-green-600' : textPrimary}`}>{stats.public}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setVisibilityFilter('private')}
          className={`rounded-xl p-4 text-left border transition-all ${
            theme === 'light'
              ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200 hover:from-red-100 hover:to-red-200 shadow-sm hover:shadow-md'
              : 'bg-gradient-to-br from-red-500/10 to-red-600/20 border-red-500/30 hover:from-red-500/20 hover:to-red-600/30'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              theme === 'light' ? 'bg-red-500/20' : 'bg-red-500/10'
            }`}>
              <Lock className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className={`text-xs ${theme === 'light' ? 'text-red-700' : 'text-red-400'}`}>Private</p>
              <p className={`text-2xl font-bold ${theme === 'light' ? 'text-red-600' : textPrimary}`}>{stats.private}</p>
            </div>
          </div>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-orange-500 ${input} ${inputFocus}`}
          />
        </div>

        <div className="relative">
          <Filter className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
          <select
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value)}
            className={`pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-orange-500 ${input} ${inputFocus}`}
          >
            <option value="all">All Visibility</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="internal">Internal</option>
          </select>
        </div>

        <div className={`px-3 py-2 rounded-lg ${card} border ${theme === 'light' ? 'border-[#d2d2d7]' : 'border-zinc-800'}`}>
          <span className={`text-sm ${textSecondary}`}>
            Showing <span className={`font-semibold ${textPrimary}`}>{filteredProjects.length}</span> of <span className={`font-semibold ${textPrimary}`}>{projects.length}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredProjects.map((project) => (
          <div
            key={project.id}
            onClick={() => setSelectedProject(project)}
            className={`rounded-2xl p-4 transition-all group cursor-pointer border-2 ${
              theme === 'light'
                ? 'bg-white border-gray-200 hover:border-orange-400 shadow-sm hover:shadow-lg'
                : 'bg-zinc-900/50 border-zinc-800 hover:border-orange-500/50 backdrop-blur-sm'
            }`}
          >
            {/* Header with Avatar and Name */}
            <div className="flex items-start gap-3 mb-3">
              {project.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={project.avatar_url}
                  alt={project.name}
                  className="w-12 h-12 rounded-xl object-cover border-2 border-orange-500/30 shadow-lg shadow-orange-500/20 group-hover:shadow-orange-500/40 transition-shadow"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    if (e.currentTarget.nextElementSibling) {
                      (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                    }
                  }}
                />
              ) : null}
              <div
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30 group-hover:shadow-orange-500/50 transition-shadow"
                style={{ display: project.avatar_url ? 'none' : 'flex' }}
              >
                <span className="text-white font-bold text-lg">
                  {project.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={`font-bold text-lg group-hover:text-orange-500 transition-colors truncate ${textPrimary}`}>
                    {project.name}
                  </h3>
                  <div className="flex-shrink-0">
                    {getVisibilityIcon(project.visibility)}
                  </div>
                </div>
                <p className={`text-sm truncate ${textSecondary}`}>{project.namespace.name}</p>
              </div>
              <a
                href={project.web_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`p-2 rounded-lg transition-all hover:bg-orange-500/10 hover:scale-110 ${
                  theme === 'light' ? 'text-gray-600 hover:text-orange-600' : 'text-zinc-500 hover:text-orange-400'
                }`}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* Statistics Row */}
            <div className={`flex items-center justify-between px-3 py-2.5 mb-2.5 rounded-xl border ${
              theme === 'light'
                ? 'bg-gradient-to-r from-gray-50 to-gray-100/50 border-gray-200'
                : 'bg-gradient-to-r from-zinc-800/40 to-zinc-800/20 border-zinc-700/50'
            }`}>
              {/* Stars */}
              <button
                onClick={(e) => handleToggleStar(e, project)}
                disabled={starringProjects.has(project.id)}
                className="flex items-center gap-1.5 hover:scale-110 transition-all disabled:opacity-50"
              >
                <Star
                  className="w-4 h-4 fill-yellow-500 text-yellow-500"
                />
                <span className={`text-sm font-semibold ${textPrimary}`}>{project.star_count}</span>
              </button>

              {/* Forks */}
              <div className="flex items-center gap-1.5 hover:scale-105 transition-transform">
                <GitFork className="w-4 h-4 text-blue-400" />
                <span className={`text-sm font-semibold ${textPrimary}`}>{project.forks_count}</span>
              </div>

              {/* Commits */}
              <div className="flex items-center gap-1.5 hover:scale-105 transition-transform">
                <GitCommit className="w-4 h-4 text-blue-500" />
                <span className={`text-xs ${textSecondary}`}>Commits</span>
                <span className="text-sm font-bold text-blue-500">
                  {project.statistics?.commit_count || 0}
                </span>
              </div>

              {/* Branches */}
              <div className="flex items-center gap-1.5 hover:scale-105 transition-transform">
                <GitBranch className="w-4 h-4 text-green-500" />
                <span className={`text-xs ${textSecondary}`}>Branches</span>
                <span className="text-sm font-bold text-green-500">0</span>
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5 hover:scale-105 transition-transform">
                <Tag className="w-4 h-4 text-purple-500" />
                <span className={`text-xs ${textSecondary}`}>Tags</span>
                <span className="text-sm font-bold text-purple-500">0</span>
              </div>
            </div>

            {/* Project Path */}
            <div className={`pt-2 border-t ${theme === 'light' ? 'border-gray-200' : 'border-zinc-800'}`}>
              <span className={`text-xs font-mono ${textSecondary}`}>
                {project.path_with_namespace}
              </span>
            </div>
          </div>
        ))}
      </div>

      {selectedProject && (
        <ProjectDetailsModal
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      )}
    </div>
  );
}
