'use client';

import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { Pipeline } from '@/lib/gitlab-api';
import { getGitLabAPIAsync } from '@/lib/gitlab-api';
import { useDashboardStore } from '@/store/dashboard-store';
import { useTheme } from '@/hooks/useTheme';
import PipelineCard from './PipelineCard';
import PipelineDetailsModal from './PipelineDetailsModal';

interface PipelineListModalProps {
  title: string;
  status?: string;
  onClose: () => void;
}

export default function PipelineListModal({ title, status, onClose }: PipelineListModalProps) {
  const { projects } = useDashboardStore();
  const { theme, textPrimary, textSecondary } = useTheme();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [filteredPipelines, setFilteredPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadPipelines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchTerm) {
      setFilteredPipelines(
        pipelines.filter(p =>
          p.ref.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.sha.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.id.toString().includes(searchTerm)
        )
      );
    } else {
      setFilteredPipelines(pipelines);
    }
  }, [searchTerm, pipelines]);

  const loadPipelines = async () => {
    try {
      setLoading(true);
      const api = await getGitLabAPIAsync();

      const pipelinePromises = projects.map(project =>
        api.getPipelines(project.id, 1, 20).catch(() => [])
      );

      const allPipelines = await Promise.all(pipelinePromises);
      let result = allPipelines.flat();

      // Filter by status if provided
      if (status) {
        result = result.filter(p => p.status === status);
      }

      // Sort by updated_at
      result.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      setPipelines(result);
      setFilteredPipelines(result);
    } catch (error) {
      console.error('Failed to load pipelines:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePipelineClick = (pipeline: Pipeline) => {
    setSelectedPipeline(pipeline);
    setSelectedProjectId(pipeline.project_id);
  };

  return (
    <>
      <div className={`fixed inset-0 backdrop-blur-sm z-40 flex items-center justify-center p-4 ${
        theme === 'light' ? 'bg-black/20' : 'bg-black/80'
      }`}>
        <div className={`rounded-xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col ${
          theme === 'light' ? 'bg-white border border-[#d2d2d7] shadow-2xl' : 'bg-zinc-900 border border-zinc-800'
        }`}>
          {/* Header */}
          <div className={`p-6 border-b flex items-center justify-between ${
            theme === 'light' ? 'border-[#d2d2d7]/50' : 'border-zinc-800'
          }`}>
            <div>
              <h2 className={`text-2xl font-bold ${textPrimary}`}>{title}</h2>
              <p className={`text-sm mt-1 ${textSecondary}`}>
                {loading ? 'Loading...' : `${filteredPipelines.length} pipelines`}
              </p>
            </div>
            <button
              onClick={onClose}
              className={`p-2 transition-colors ${
                theme === 'light' ? 'text-[#86868b] hover:text-[#1d1d1f]' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className={`p-6 border-b ${theme === 'light' ? 'border-[#d2d2d7]/50' : 'border-zinc-800'}`}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search by ID, branch, or commit..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 ${
                  theme === 'light' ? 'bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] placeholder-[#86868b]' : 'bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500'
                }`}
              />
            </div>
          </div>

          {/* Pipelines List */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
                <p className="text-zinc-500 mt-4">Loading pipelines...</p>
              </div>
            ) : filteredPipelines.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-zinc-500 text-lg">No pipelines found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredPipelines.map((pipeline, index) => {
                  const project = projects.find(p => p.id === pipeline.project_id);
                  return (
                    <PipelineCard
                      key={pipeline.id}
                      pipeline={pipeline}
                      projectName={project?.name}
                      onClick={() => handlePipelineClick(pipeline)}
                      index={index}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedPipeline && selectedProjectId && (
        <PipelineDetailsModal
          pipeline={selectedPipeline}
          projectId={selectedProjectId}
          onClose={() => {
            setSelectedPipeline(null);
            setSelectedProjectId(null);
          }}
        />
      )}
    </>
  );
}
