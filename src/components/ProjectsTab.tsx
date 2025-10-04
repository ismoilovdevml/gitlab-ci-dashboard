'use client';

import { useEffect, useState, useMemo } from 'react';
import { ExternalLink, Star, GitFork, Clock, Lock, Globe, Eye, Search, Filter, FolderGit2 } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPIAsync } from '@/lib/gitlab-api';
import { formatRelativeTime } from '@/lib/utils';
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
        return <Lock className="w-4 h-4 text-red-500" />;
      case 'internal':
        return <Eye className="w-4 h-4 text-yellow-500" />;
      case 'public':
        return <Globe className="w-4 h-4 text-green-500" />;
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
            className={`rounded-xl p-6 transition-all group cursor-pointer ${card} ${
              theme === 'light' ? 'shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]' : 'hover:border-zinc-700'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {project.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={project.avatar_url}
                    alt={project.name}
                    className="w-12 h-12 rounded-lg object-cover border border-zinc-700"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.nextElementSibling) {
                        (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div
                  className="w-12 h-12 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg"
                  style={{ display: project.avatar_url ? 'none' : 'flex' }}
                >
                  <span className="text-white font-bold text-lg">
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold group-hover:text-orange-500 transition-colors ${textPrimary}`}>
                      {project.name}
                    </h3>
                    {getVisibilityIcon(project.visibility)}
                  </div>
                  <p className={`text-xs ${textSecondary}`}>{project.namespace.name}</p>
                </div>
              </div>
              <a
                href={project.web_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`transition-colors ${
                  theme === 'light' ? 'text-[#86868b] hover:text-[#1d1d1f]' : 'text-zinc-500 hover:text-white'
                }`}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {project.description && (
              <p className={`text-sm mb-4 line-clamp-2 ${textSecondary}`}>
                {project.description}
              </p>
            )}

            <div className={`flex items-center gap-4 text-xs mb-4 ${textSecondary}`}>
              <button
                onClick={(e) => handleToggleStar(e, project)}
                disabled={starringProjects.has(project.id)}
                className="flex items-center gap-1 hover:text-yellow-500 transition-colors disabled:opacity-50"
              >
                <Star
                  className={`w-3 h-3 ${project.star_count > 0 ? 'fill-yellow-500 text-yellow-500' : ''}`}
                />
                <span>{project.star_count}</span>
              </button>
              <div className="flex items-center gap-1">
                <GitFork className="w-3 h-3" />
                <span>{project.forks_count}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{formatRelativeTime(project.last_activity_at)}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800">
              <span className="text-xs text-zinc-600 font-mono">
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
