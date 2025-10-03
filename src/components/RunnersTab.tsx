'use client';

import { useEffect, useState, useMemo } from 'react';
import { Server, Circle, Search, Filter, Activity, CheckCircle, XCircle, Pause, Play, TrendingUp, Clock, Cpu, HardDrive } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPIAsync, Runner } from '@/lib/gitlab-api';
import { formatRelativeTime, cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import RunnerDetailsModal from '@/components/RunnerDetailsModal';

export default function RunnersTab() {
  const { runners, setRunners } = useDashboardStore();
  const { theme, textPrimary, textSecondary, card, input, inputFocus } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleRunnerClick = (runner: Runner) => {
    setSelectedRunner(runner);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRunner(null);
  };

  useEffect(() => {
    loadRunners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRunners = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const api = await getGitLabAPIAsync();
      const runnersList = await api.getRunners(1, 100);
      setRunners(runnersList);

      if (runnersList.length === 0) {
        console.log('No runners found. This might be because:');
        console.log('1. You have no runners configured');
        console.log('2. You lack admin permissions (trying project runners fallback)');
      }
    } catch (error) {
      console.error('Failed to load runners:', error);
      setError(error instanceof Error ? error.message : 'Failed to load runners');
    } finally {
      setIsLoading(false);
    }
  };

  const getRunnerStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'offline':
        return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'paused':
        return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      default:
        return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    }
  };

  // Filter runners
  const filteredRunners = useMemo(() => {
    return runners.filter(runner => {
      const matchesSearch =
        (runner.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (runner.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        runner.id.toString().includes(searchTerm);

      const matchesStatus = statusFilter === 'all' || runner.status === statusFilter;
      const matchesType = typeFilter === 'all' || runner.runner_type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [runners, searchTerm, statusFilter, typeFilter]);

  // Calculate statistics
  const stats = useMemo(() => {
    const online = runners.filter(r => r.status === 'online').length;
    const offline = runners.filter(r => r.status === 'offline').length;
    const paused = runners.filter(r => r.status === 'paused').length;
    const shared = runners.filter(r => r.is_shared).length;

    return {
      total: runners.length,
      online,
      offline,
      paused,
      shared,
      dedicated: runners.length - shared,
    };
  }, [runners]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-3xl font-bold mb-2 ${textPrimary}`}>Runners</h1>
          <p className={textSecondary}>Monitor and manage GitLab CI/CD runners</p>
        </div>
        <button
          onClick={loadRunners}
          disabled={isLoading}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Server className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className={`rounded-xl p-4 border ${
          theme === 'light'
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          <p className="font-semibold">Error loading runners:</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <button
          onClick={() => {
            setStatusFilter('all');
            setTypeFilter('all');
          }}
          className={`rounded-xl p-4 text-left transition-all cursor-pointer border ${
            theme === 'light'
              ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:from-blue-100 hover:to-blue-200 shadow-sm hover:shadow-md hover:scale-[1.02]'
              : 'bg-gradient-to-br from-blue-500/10 to-blue-600/20 border-blue-500/30 hover:from-blue-500/20 hover:to-blue-600/30 hover:border-blue-500/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              theme === 'light' ? 'bg-blue-500/20' : 'bg-blue-500/10'
            }`}>
              <Server className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className={`text-xs ${theme === 'light' ? 'text-blue-700' : 'text-blue-400'}`}>Total</p>
              <p className={`text-2xl font-bold ${textPrimary}`}>{stats.total}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setStatusFilter('online')}
          className={`rounded-xl p-4 text-left transition-all cursor-pointer border ${
            theme === 'light'
              ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200 hover:from-green-100 hover:to-green-200 shadow-sm hover:shadow-md hover:scale-[1.02]'
              : 'bg-gradient-to-br from-green-500/10 to-green-600/20 border-green-500/30 hover:from-green-500/20 hover:to-green-600/30 hover:border-green-500/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              theme === 'light' ? 'bg-green-500/20' : 'bg-green-500/10'
            }`}>
              <CheckCircle className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className={`text-xs ${theme === 'light' ? 'text-green-700' : 'text-green-400'}`}>Online</p>
              <p className={`text-2xl font-bold ${theme === 'light' ? 'text-green-600' : 'text-green-500'}`}>{stats.online}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setStatusFilter('offline')}
          className={`rounded-xl p-4 text-left transition-all cursor-pointer border ${
            theme === 'light'
              ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200 hover:from-red-100 hover:to-red-200 shadow-sm hover:shadow-md hover:scale-[1.02]'
              : 'bg-gradient-to-br from-red-500/10 to-red-600/20 border-red-500/30 hover:from-red-500/20 hover:to-red-600/30 hover:border-red-500/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              theme === 'light' ? 'bg-red-500/20' : 'bg-red-500/10'
            }`}>
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className={`text-xs ${theme === 'light' ? 'text-red-700' : 'text-red-400'}`}>Offline</p>
              <p className={`text-2xl font-bold ${theme === 'light' ? 'text-red-600' : 'text-red-500'}`}>{stats.offline}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setStatusFilter('paused')}
          className={`rounded-xl p-4 text-left transition-all cursor-pointer border ${
            theme === 'light'
              ? 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200 hover:from-yellow-100 hover:to-yellow-200 shadow-sm hover:shadow-md hover:scale-[1.02]'
              : 'bg-gradient-to-br from-yellow-500/10 to-yellow-600/20 border-yellow-500/30 hover:from-yellow-500/20 hover:to-yellow-600/30 hover:border-yellow-500/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              theme === 'light' ? 'bg-yellow-500/20' : 'bg-yellow-500/10'
            }`}>
              <Pause className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <p className={`text-xs ${theme === 'light' ? 'text-yellow-700' : 'text-yellow-400'}`}>Paused</p>
              <p className={`text-2xl font-bold ${theme === 'light' ? 'text-yellow-600' : 'text-yellow-500'}`}>{stats.paused}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => {
            setTypeFilter('all');
            const sharedRunners = runners.filter(r => r.is_shared);
            if (sharedRunners.length > 0) {
              handleRunnerClick(sharedRunners[0]);
            }
          }}
          className={`rounded-xl p-4 text-left transition-all cursor-pointer border ${
            theme === 'light'
              ? 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 hover:from-purple-100 hover:to-purple-200 shadow-sm hover:shadow-md hover:scale-[1.02]'
              : 'bg-gradient-to-br from-purple-500/10 to-purple-600/20 border-purple-500/30 hover:from-purple-500/20 hover:to-purple-600/30 hover:border-purple-500/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              theme === 'light' ? 'bg-purple-500/20' : 'bg-purple-500/10'
            }`}>
              <TrendingUp className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className={`text-xs ${theme === 'light' ? 'text-purple-700' : 'text-purple-400'}`}>Shared</p>
              <p className={`text-2xl font-bold ${theme === 'light' ? 'text-purple-600' : textPrimary}`}>{stats.shared}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => {
            setTypeFilter('all');
            const dedicatedRunners = runners.filter(r => !r.is_shared);
            if (dedicatedRunners.length > 0) {
              handleRunnerClick(dedicatedRunners[0]);
            }
          }}
          className={`rounded-xl p-4 text-left transition-all cursor-pointer border ${
            theme === 'light'
              ? 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 hover:from-orange-100 hover:to-orange-200 shadow-sm hover:shadow-md hover:scale-[1.02]'
              : 'bg-gradient-to-br from-orange-500/10 to-orange-600/20 border-orange-500/30 hover:from-orange-500/20 hover:to-orange-600/30 hover:border-orange-500/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              theme === 'light' ? 'bg-orange-500/20' : 'bg-orange-500/10'
            }`}>
              <Activity className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className={`text-xs ${theme === 'light' ? 'text-orange-700' : 'text-orange-400'}`}>Dedicated</p>
              <p className={`text-2xl font-bold ${theme === 'light' ? 'text-orange-600' : textPrimary}`}>{stats.dedicated}</p>
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
            placeholder="Search runners..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-orange-500 ${input} ${inputFocus}`}
          />
        </div>

        <div className="relative">
          <Filter className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-orange-500 ${input} ${inputFocus}`}
          >
            <option value="all">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="paused">Paused</option>
          </select>
        </div>

        <div className="relative">
          <Server className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={`pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-orange-500 ${input} ${inputFocus}`}
          >
            <option value="all">All Types</option>
            <option value="instance_type">Instance</option>
            <option value="group_type">Group</option>
            <option value="project_type">Project</option>
          </select>
        </div>

        <div className={`px-3 py-2 rounded-lg ${card} border ${theme === 'light' ? 'border-[#d2d2d7]' : 'border-zinc-800'}`}>
          <span className={`text-sm ${textSecondary}`}>
            Showing <span className={`font-semibold ${textPrimary}`}>{filteredRunners.length}</span> of <span className={`font-semibold ${textPrimary}`}>{runners.length}</span>
          </span>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && runners.length === 0 ? (
        <div className={`rounded-xl p-12 text-center ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className={textSecondary}>Loading runners...</p>
        </div>
      ) : runners.length === 0 ? (
        /* Empty State */
        <div className={`rounded-xl p-12 text-center ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
          <Server className={`w-16 h-16 mx-auto mb-4 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-700'}`} />
          <p className={`text-lg ${textSecondary}`}>No runners found</p>
          <p className={`text-sm mt-2 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-600'}`}>
            This might happen if:
          </p>
          <ul className={`text-sm mt-2 ${textSecondary} text-left max-w-md mx-auto`}>
            <li>• No runners are configured for your projects</li>
            <li>• You don&apos;t have admin access to view all runners</li>
            <li>• Your projects use shared runners only</li>
          </ul>
          <button
            onClick={loadRunners}
            className="mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : filteredRunners.length === 0 ? (
        /* No Results */
        <div className={`rounded-xl p-12 text-center ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
          <Search className={`w-16 h-16 mx-auto mb-4 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-700'}`} />
          <p className={`text-lg ${textSecondary}`}>No runners match your filters</p>
          <button
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('all');
              setTypeFilter('all');
            }}
            className="mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        /* Runners Grid */
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRunners.map((runner) => (
            <button
              key={runner.id}
              onClick={() => handleRunnerClick(runner)}
              className={`rounded-xl p-5 text-left transition-all cursor-pointer ${card} ${
                theme === 'light'
                  ? 'shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:scale-[1.02]'
                  : 'hover:border-zinc-700 hover:bg-zinc-800/50'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                    runner.status === 'online'
                      ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                      : runner.status === 'paused'
                      ? 'bg-gradient-to-br from-yellow-500 to-orange-600'
                      : 'bg-gradient-to-br from-gray-500 to-gray-600'
                  )}>
                    <Server className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold text-sm truncate ${textPrimary}`}>
                      {runner.description || runner.name || `Runner #${runner.id}`}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs ${textSecondary}`}>
                        {runner.runner_type}
                      </span>
                      {runner.is_shared && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          theme === 'light' ? 'bg-blue-50 text-blue-600' : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          Shared
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className={cn(
                  'px-2 py-1 rounded-md border text-xs font-semibold uppercase flex items-center gap-1.5 flex-shrink-0',
                  getRunnerStatusColor(runner.status)
                )}>
                  <Circle className={cn('w-1.5 h-1.5 fill-current', runner.online && 'animate-pulse')} />
                  <span>{runner.status}</span>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className={`rounded-lg p-2 ${theme === 'light' ? 'bg-[#f5f5f7]' : 'bg-zinc-800/50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu className={`w-3.5 h-3.5 ${textSecondary}`} />
                    <span className={`text-xs ${textSecondary}`}>Platform</span>
                  </div>
                  <p className={`text-sm font-medium truncate ${textPrimary}`}>
                    {runner.platform || 'N/A'}
                  </p>
                </div>

                <div className={`rounded-lg p-2 ${theme === 'light' ? 'bg-[#f5f5f7]' : 'bg-zinc-800/50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive className={`w-3.5 h-3.5 ${textSecondary}`} />
                    <span className={`text-xs ${textSecondary}`}>Arch</span>
                  </div>
                  <p className={`text-sm font-medium truncate ${textPrimary}`}>
                    {runner.architecture || 'N/A'}
                  </p>
                </div>

                <div className={`rounded-lg p-2 ${theme === 'light' ? 'bg-[#f5f5f7]' : 'bg-zinc-800/50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className={`w-3.5 h-3.5 ${textSecondary}`} />
                    <span className={`text-xs ${textSecondary}`}>IP Address</span>
                  </div>
                  <p className={`text-sm font-mono truncate ${textPrimary}`}>
                    {runner.ip_address || 'N/A'}
                  </p>
                </div>

                <div className={`rounded-lg p-2 ${theme === 'light' ? 'bg-[#f5f5f7]' : 'bg-zinc-800/50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className={`w-3.5 h-3.5 ${textSecondary}`} />
                    <span className={`text-xs ${textSecondary}`}>Last Contact</span>
                  </div>
                  <p className={`text-sm font-medium truncate ${textPrimary}`}>
                    {runner.contacted_at ? formatRelativeTime(runner.contacted_at) : 'Never'}
                  </p>
                </div>
              </div>

              {/* Projects */}
              {runner.projects && runner.projects.length > 0 && (
                <div className={`pt-3 border-t ${theme === 'light' ? 'border-[#d2d2d7]' : 'border-zinc-800'}`}>
                  <p className={`text-xs mb-2 ${textSecondary}`}>
                    Projects ({runner.projects.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {runner.projects.slice(0, 2).map((project) => (
                      <span
                        key={project.id}
                        className={`text-xs px-2 py-1 rounded truncate max-w-[120px] ${
                          theme === 'light'
                            ? 'bg-[#f5f5f7] text-[#6e6e73] border border-[#d2d2d7]'
                            : 'bg-zinc-800 text-zinc-300'
                        }`}
                        title={project.name}
                      >
                        {project.name}
                      </span>
                    ))}
                    {runner.projects.length > 2 && (
                      <span className={`text-xs px-2 py-1 rounded ${
                        theme === 'light' ? 'bg-[#f5f5f7] text-[#6e6e73]' : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        +{runner.projects.length - 2}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Runner Details Modal */}
      <RunnerDetailsModal
        runner={selectedRunner}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}
