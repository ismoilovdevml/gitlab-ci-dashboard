'use client';

import React, { useState, useEffect } from 'react';
import { Runner, Job, getGitLabAPIAsync } from '@/lib/gitlab-api';
import { formatDistanceToNow } from 'date-fns';
import {
  X as XMarkIcon,
  CheckCircle as CheckCircleIcon,
  XCircle as XCircleIcon,
  Clock as ClockIcon,
  PlayCircle as PlayCircleIcon,
  PauseCircle as PauseCircleIcon,
  Cpu as CpuChipIcon,
  Server as ServerIcon,
  Zap as BoltIcon,
  BarChart3 as ChartBarIcon,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { formatPercentage } from '@/lib/utils';

interface RunnerDetailsModalProps {
  runner: Runner | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function RunnerDetailsModal({
  runner,
  isOpen,
  onClose,
}: RunnerDetailsModalProps) {
  const { theme, textPrimary, textSecondary, card } = useTheme();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'jobs' | 'stats'>('overview');

  useEffect(() => {
    if (isOpen && runner) {
      loadRunnerJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, runner]);

  const loadRunnerJobs = async () => {
    if (!runner) return;

    setLoading(true);
    try {
      const api = await getGitLabAPIAsync();
      const runnerJobs = await api.getRunnerJobs(runner.id, 1, 50);
      setJobs(runnerJobs);
    } catch (error) {
      console.error('Failed to load runner jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !runner) return null;

  const jobStats = {
    total: jobs.length,
    success: jobs.filter(j => j.status === 'success').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    running: jobs.filter(j => j.status === 'running').length,
    pending: jobs.filter(j => j.status === 'pending').length,
    canceled: jobs.filter(j => j.status === 'canceled').length,
  };

  const avgDuration = jobs.length > 0
    ? jobs.reduce((sum, j) => sum + (j.duration || 0), 0) / jobs.length
    : 0;

  const successRate = jobStats.total > 0
    ? formatPercentage((jobStats.success / jobStats.total) * 100)
    : '0';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-400 bg-green-500/10';
      case 'failed':
        return 'text-red-400 bg-red-500/10';
      case 'running':
        return 'text-blue-400 bg-blue-500/10';
      case 'pending':
        return 'text-yellow-400 bg-yellow-500/10';
      case 'canceled':
        return 'text-gray-400 bg-gray-500/10';
      default:
        return 'text-gray-400 bg-gray-500/10';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="w-4 h-4" />;
      case 'failed':
        return <XCircleIcon className="w-4 h-4" />;
      case 'running':
        return <PlayCircleIcon className="w-4 h-4" />;
      case 'pending':
        return <ClockIcon className="w-4 h-4" />;
      case 'canceled':
        return <PauseCircleIcon className="w-4 h-4" />;
      default:
        return <ClockIcon className="w-4 h-4" />;
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`${card} rounded-xl w-full max-w-6xl max-h-[90vh] overflow-hidden ${
        theme === 'light' ? 'shadow-2xl' : 'border border-gray-800'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          theme === 'light'
            ? 'border-[#d2d2d7] bg-gradient-to-r from-blue-50 to-purple-50'
            : 'border-gray-800 bg-gradient-to-r from-blue-600/10 to-purple-600/10'
        }`}>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
              <ServerIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className={`text-2xl font-bold ${textPrimary}`}>
                {runner.description || `Runner #${runner.id}`}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  runner.status === 'online'
                    ? theme === 'light' ? 'bg-green-100 text-green-700' : 'bg-green-500/20 text-green-400'
                    : theme === 'light' ? 'bg-red-100 text-red-700' : 'bg-red-500/20 text-red-400'
                }`}>
                  {runner.status}
                </span>
                <span className={`text-sm ${textSecondary}`}>
                  {runner.is_shared ? '🌐 Shared' : '🔒 Dedicated'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              theme === 'light' ? 'hover:bg-gray-100' : 'hover:bg-gray-800'
            }`}
          >
            <XMarkIcon className={`w-6 h-6 ${textSecondary}`} />
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex gap-1 px-6 pt-4 border-b ${
          theme === 'light' ? 'border-[#d2d2d7]' : 'border-gray-800'
        }`}>
          {[
            { id: 'overview', label: 'Overview', icon: ServerIcon },
            { id: 'jobs', label: 'Job History', icon: ChartBarIcon },
            { id: 'stats', label: 'Statistics', icon: BoltIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'overview' | 'jobs' | 'stats')}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-all ${
                activeTab === tab.id
                  ? theme === 'light'
                    ? 'bg-gray-100 text-blue-600 border-b-2 border-blue-500'
                    : 'bg-gray-800 text-white border-b-2 border-blue-500'
                  : theme === 'light'
                    ? 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="p-6 space-y-6">
              {/* Runner Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className={`rounded-lg p-4 border ${
                  theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/50 border-gray-700'
                }`}>
                  <div className="flex items-center gap-3">
                    <CpuChipIcon className="w-6 h-6 text-blue-400" />
                    <div>
                      <p className={`text-xs ${textSecondary}`}>Architecture</p>
                      <p className={`text-lg font-semibold ${textPrimary}`}>{runner.architecture || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg p-4 border ${
                  theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/50 border-gray-700'
                }`}>
                  <div className="flex items-center gap-3">
                    <ServerIcon className="w-6 h-6 text-purple-400" />
                    <div>
                      <p className={`text-xs ${textSecondary}`}>Platform</p>
                      <p className={`text-lg font-semibold ${textPrimary}`}>{runner.platform || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg p-4 border ${
                  theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/50 border-gray-700'
                }`}>
                  <div className="flex items-center gap-3">
                    <ClockIcon className="w-6 h-6 text-green-400" />
                    <div>
                      <p className={`text-xs ${textSecondary}`}>Last Contact</p>
                      <p className={`text-lg font-semibold ${textPrimary}`}>
                        {runner.contacted_at
                          ? formatDistanceToNow(new Date(runner.contacted_at), { addSuffix: true })
                          : 'Never'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg p-4 border ${
                  theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/50 border-gray-700'
                }`}>
                  <div className="flex items-center gap-3">
                    <BoltIcon className="w-6 h-6 text-yellow-400" />
                    <div>
                      <p className={`text-xs ${textSecondary}`}>IP Address</p>
                      <p className={`text-lg font-semibold ${textPrimary}`}>{runner.ip_address || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg p-4 border ${
                  theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/50 border-gray-700'
                }`}>
                  <div className="flex items-center gap-3">
                    <ChartBarIcon className="w-6 h-6 text-indigo-400" />
                    <div>
                      <p className={`text-xs ${textSecondary}`}>Type</p>
                      <p className={`text-lg font-semibold ${textPrimary} capitalize`}>{runner.runner_type || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg p-4 border ${
                  theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/50 border-gray-700'
                }`}>
                  <div className="flex items-center gap-3">
                    <CheckCircleIcon className="w-6 h-6 text-teal-400" />
                    <div>
                      <p className={`text-xs ${textSecondary}`}>Status</p>
                      <p className={`text-lg font-semibold ${textPrimary} capitalize`}>{runner.active ? 'Active' : 'Inactive'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Projects */}
              {runner.projects && runner.projects.length > 0 && (
                <div className={`rounded-lg p-4 border ${
                  theme === 'light' ? 'bg-blue-50 border-blue-200' : 'bg-gray-800/30 border-gray-700'
                }`}>
                  <h3 className={`text-lg font-semibold ${textPrimary} mb-3 flex items-center gap-2`}>
                    <ServerIcon className="w-5 h-5 text-blue-400" />
                    Assigned Projects ({runner.projects.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {runner.projects.map((project) => (
                      <div
                        key={project.id}
                        className={`rounded-lg p-3 border transition-colors ${
                          theme === 'light'
                            ? 'bg-white border-gray-200 hover:border-blue-500'
                            : 'bg-gray-800/50 border-gray-700 hover:border-blue-500'
                        }`}
                      >
                        <p className={`font-medium ${textPrimary}`}>{project.name}</p>
                        <p className={`text-xs ${textSecondary}`}>ID: {project.id}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Jobs Tab */}
          {activeTab === 'jobs' && (
            <div className="p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-12">
                  <ServerIcon className={`w-16 h-16 mx-auto mb-4 ${textSecondary}`} />
                  <p className={textSecondary}>No jobs found for this runner</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-lg font-semibold ${textPrimary}`}>
                      Recent Jobs ({jobs.length})
                    </h3>
                  </div>

                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {jobs.map((job) => (
                      <div
                        key={job.id}
                        className={`rounded-lg p-4 border transition-colors ${
                          theme === 'light'
                            ? 'bg-gray-50 border-gray-200 hover:border-blue-500'
                            : 'bg-gray-800/50 border-gray-700 hover:border-blue-500'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                                {getStatusIcon(job.status)}
                                {job.status}
                              </span>
                              <span className={`font-semibold ${textPrimary}`}>{job.name}</span>
                              <span className={`text-sm ${textSecondary}`}>#{job.id}</span>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <p className={`text-xs ${textSecondary}`}>Project</p>
                                <p className={`font-medium ${textPrimary}`}>{job.project?.name || 'N/A'}</p>
                              </div>
                              <div>
                                <p className={`text-xs ${textSecondary}`}>Stage</p>
                                <p className={`font-medium ${textPrimary}`}>{job.stage}</p>
                              </div>
                              <div>
                                <p className={`text-xs ${textSecondary}`}>Duration</p>
                                <p className={`font-medium ${textPrimary}`}>{formatDuration(job.duration)}</p>
                              </div>
                              <div>
                                <p className={`text-xs ${textSecondary}`}>Created</p>
                                <p className={`font-medium ${textPrimary}`}>
                                  {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                                </p>
                              </div>
                            </div>

                            {job.commit && (
                              <div className={`mt-3 rounded p-2 ${
                                theme === 'light' ? 'bg-gray-100' : 'bg-gray-900/50'
                              }`}>
                                <p className={`text-xs ${textSecondary}`}>Commit</p>
                                <p className={`text-sm font-mono ${textPrimary}`}>{job.commit.short_id}</p>
                                <p className={`text-xs truncate ${textSecondary}`}>{job.commit.title}</p>
                              </div>
                            )}
                          </div>

                          <a
                            href={job.web_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-4 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                          >
                            View
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
            <div className="p-6 space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div className={`bg-gradient-to-br rounded-lg p-4 border ${
                  theme === 'light' ? 'from-blue-100 to-blue-200 border-blue-300' : 'from-blue-500/10 to-blue-600/10 border-blue-500/30'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ChartBarIcon className="w-5 h-5 text-blue-500" />
                    <p className={`text-xs font-medium ${theme === 'light' ? 'text-blue-700' : 'text-blue-400'}`}>Total Jobs</p>
                  </div>
                  <p className={`text-3xl font-bold ${textPrimary}`}>{jobStats.total}</p>
                </div>

                <div className={`bg-gradient-to-br rounded-lg p-4 border ${
                  theme === 'light' ? 'from-green-100 to-green-200 border-green-300' : 'from-green-500/10 to-green-600/10 border-green-500/30'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                    <p className={`text-xs font-medium ${theme === 'light' ? 'text-green-700' : 'text-green-400'}`}>Successful</p>
                  </div>
                  <p className={`text-3xl font-bold ${textPrimary}`}>{jobStats.success}</p>
                </div>

                <div className={`bg-gradient-to-br rounded-lg p-4 border ${
                  theme === 'light' ? 'from-red-100 to-red-200 border-red-300' : 'from-red-500/10 to-red-600/10 border-red-500/30'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <XCircleIcon className="w-5 h-5 text-red-500" />
                    <p className={`text-xs font-medium ${theme === 'light' ? 'text-red-700' : 'text-red-400'}`}>Failed</p>
                  </div>
                  <p className={`text-3xl font-bold ${textPrimary}`}>{jobStats.failed}</p>
                </div>

                <div className={`bg-gradient-to-br rounded-lg p-4 border ${
                  theme === 'light' ? 'from-purple-100 to-purple-200 border-purple-300' : 'from-purple-500/10 to-purple-600/10 border-purple-500/30'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <BoltIcon className="w-5 h-5 text-purple-500" />
                    <p className={`text-xs font-medium ${theme === 'light' ? 'text-purple-700' : 'text-purple-400'}`}>Success Rate</p>
                  </div>
                  <p className={`text-3xl font-bold ${textPrimary}`}>{successRate}%</p>
                </div>

                <div className={`bg-gradient-to-br rounded-lg p-4 border ${
                  theme === 'light' ? 'from-yellow-100 to-yellow-200 border-yellow-300' : 'from-yellow-500/10 to-yellow-600/10 border-yellow-500/30'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ClockIcon className="w-5 h-5 text-yellow-500" />
                    <p className={`text-xs font-medium ${theme === 'light' ? 'text-yellow-700' : 'text-yellow-400'}`}>Avg Duration</p>
                  </div>
                  <p className={`text-3xl font-bold ${textPrimary}`}>{formatDuration(avgDuration)}</p>
                </div>

                <div className={`bg-gradient-to-br rounded-lg p-4 border ${
                  theme === 'light' ? 'from-indigo-100 to-indigo-200 border-indigo-300' : 'from-indigo-500/10 to-indigo-600/10 border-indigo-500/30'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <PlayCircleIcon className="w-5 h-5 text-indigo-500" />
                    <p className={`text-xs font-medium ${theme === 'light' ? 'text-indigo-700' : 'text-indigo-400'}`}>Running</p>
                  </div>
                  <p className={`text-3xl font-bold ${textPrimary}`}>{jobStats.running}</p>
                </div>

                <div className={`bg-gradient-to-br rounded-lg p-4 border ${
                  theme === 'light' ? 'from-orange-100 to-orange-200 border-orange-300' : 'from-orange-500/10 to-orange-600/10 border-orange-500/30'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ClockIcon className="w-5 h-5 text-orange-500" />
                    <p className={`text-xs font-medium ${theme === 'light' ? 'text-orange-700' : 'text-orange-400'}`}>Pending</p>
                  </div>
                  <p className={`text-3xl font-bold ${textPrimary}`}>{jobStats.pending}</p>
                </div>

                <div className={`bg-gradient-to-br rounded-lg p-4 border ${
                  theme === 'light' ? 'from-gray-100 to-gray-200 border-gray-300' : 'from-gray-500/10 to-gray-600/10 border-gray-500/30'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <PauseCircleIcon className="w-5 h-5 text-gray-500" />
                    <p className={`text-xs font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-400'}`}>Canceled</p>
                  </div>
                  <p className={`text-3xl font-bold ${textPrimary}`}>{jobStats.canceled}</p>
                </div>
              </div>

              {/* Performance Chart Placeholder */}
              <div className={`rounded-lg p-6 border ${
                theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/30 border-gray-700'
              }`}>
                <h3 className={`text-lg font-semibold ${textPrimary} mb-4`}>Performance Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className={`text-sm ${textSecondary} mb-2`}>Job Status Distribution</h4>
                    <div className="space-y-2">
                      {[
                        { label: 'Success', count: jobStats.success, color: 'bg-green-500' },
                        { label: 'Failed', count: jobStats.failed, color: 'bg-red-500' },
                        { label: 'Running', count: jobStats.running, color: 'bg-blue-500' },
                        { label: 'Pending', count: jobStats.pending, color: 'bg-yellow-500' },
                        { label: 'Canceled', count: jobStats.canceled, color: 'bg-gray-500' },
                      ].map((item) => {
                        const percentage = jobStats.total > 0 ? (item.count / jobStats.total) * 100 : 0;
                        return (
                          <div key={item.label}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className={textSecondary}>{item.label}</span>
                              <span className={`font-medium ${textPrimary}`}>{item.count} ({formatPercentage(percentage)}%)</span>
                            </div>
                            <div className={`w-full rounded-full h-2 ${
                              theme === 'light' ? 'bg-gray-200' : 'bg-gray-700'
                            }`}>
                              <div
                                className={`${item.color} h-2 rounded-full transition-all`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h4 className={`text-sm ${textSecondary} mb-2`}>Recent Activity</h4>
                    <div className="space-y-3">
                      <div className={`rounded-lg p-3 ${
                        theme === 'light' ? 'bg-white border border-gray-200' : 'bg-gray-800/50'
                      }`}>
                        <p className={`text-xs ${textSecondary}`}>Last 10 Jobs</p>
                        <div className="flex gap-1 mt-2">
                          {jobs.slice(0, 10).map((job, i) => (
                            <div
                              key={i}
                              className={`h-8 flex-1 rounded ${
                                job.status === 'success' ? 'bg-green-500' :
                                job.status === 'failed' ? 'bg-red-500' :
                                job.status === 'running' ? 'bg-blue-500' :
                                job.status === 'pending' ? 'bg-yellow-500' :
                                'bg-gray-500'
                              }`}
                              title={`${job.name} - ${job.status}`}
                            />
                          ))}
                        </div>
                      </div>

                      {runner.contacted_at && (
                        <div className={`rounded-lg p-3 ${
                          theme === 'light' ? 'bg-white border border-gray-200' : 'bg-gray-800/50'
                        }`}>
                          <p className={`text-xs ${textSecondary}`}>Last Active</p>
                          <p className={`font-medium mt-1 ${textPrimary}`}>
                            {formatDistanceToNow(new Date(runner.contacted_at), { addSuffix: true })}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
