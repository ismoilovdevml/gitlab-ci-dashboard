'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Star, GitFork, Clock, Lock, Globe, Eye } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPI } from '@/lib/gitlab-api';
import { formatRelativeTime } from '@/lib/utils';
import { Project } from '@/lib/gitlab-api';
import ProjectDetailsModal from './ProjectDetailsModal';

export default function ProjectsTab() {
  const { projects, setProjects, gitlabUrl, gitlabToken } = useDashboardStore();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [starringProjects, setStarringProjects] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (gitlabToken) {
      loadProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitlabToken, gitlabUrl]);

  const loadProjects = async () => {
    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
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
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Projects</h1>
        <p className="text-zinc-400">All your GitLab projects</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() => setSelectedProject(project)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-zinc-700 transition-all group cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {project.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={project.avatar_url}
                    alt={project.name}
                    className="w-12 h-12 rounded-lg"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                    <span className="text-white font-bold text-lg">
                      {project.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-semibold group-hover:text-orange-500 transition-colors">
                      {project.name}
                    </h3>
                    {getVisibilityIcon(project.visibility)}
                  </div>
                  <p className="text-xs text-zinc-500">{project.namespace.name}</p>
                </div>
              </div>
              <a
                href={project.web_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {project.description && (
              <p className="text-zinc-400 text-sm mb-4 line-clamp-2">
                {project.description}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-zinc-500 mb-4">
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
