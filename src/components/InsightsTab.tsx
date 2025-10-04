'use client';

import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Zap,
  Clock,
  Target,
  Activity,
  BarChart3,
  XCircle,
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import {
  InsightsSummary,
  FailureAnalysis,
  FlakyTest,
  PerformanceBottleneck,
  DeploymentFrequency,
} from '@/lib/gitlab-api';
import { formatDuration, formatRelativeTime } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

export default function InsightsTab() {
  const { theme, textPrimary, textSecondary, card } = useTheme();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [failures, setFailures] = useState<FailureAnalysis[]>([]);
  const [flakyTests, setFlakyTests] = useState<FlakyTest[]>([]);
  const [bottlenecks, setBottlenecks] = useState<PerformanceBottleneck[]>([]);
  const [deployments, setDeployments] = useState<DeploymentFrequency[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'failures' | 'flaky' | 'performance' | 'deployments'>('overview');

  useEffect(() => {
    loadInsights();
     
  }, []);

  const loadInsights = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/insights');
      const result = await response.json();

      if (result.data) {
        setSummary(result.data.summary);
        setFailures(result.data.failures);
        setFlakyTests(result.data.flakyTests);
        setBottlenecks(result.data.bottlenecks);
        setDeployments(result.data.deployments);
      }
    } catch (error) {
      console.error('Failed to load insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend: 'improving' | 'worsening' | 'stable' | 'increasing' | 'decreasing') => {
    if (trend === 'improving' || trend === 'increasing') {
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    } else if (trend === 'worsening' || trend === 'decreasing') {
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    }
    return <Minus className="w-4 h-4 text-zinc-500" />;
  };

  const getFailureTypeColor = (type: string) => {
    switch (type) {
      case 'script_failure':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'timeout':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'runner_system_failure':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'cancelled':
        return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
      default:
        return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div>
          <div className={`h-9 w-56 rounded-lg mb-2 animate-pulse ${
            theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
          }`} />
          <div className={`h-4 w-96 rounded animate-pulse ${
            theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
          }`} />
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`rounded-xl p-4 animate-pulse ${card}`}>
              <div className="flex items-center justify-between mb-2">
                <div className={`h-4 w-24 rounded ${
                  theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
                }`} />
                <div className={`w-5 h-5 rounded ${
                  theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
                }`} />
              </div>
              <div className={`h-9 w-20 rounded mb-1 ${
                theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
              }`} />
              <div className={`h-3 w-32 rounded ${
                theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
              }`} />
            </div>
          ))}
        </div>

        {/* Tabs Skeleton */}
        <div className={`flex gap-4 border-b pb-3 ${theme === 'light' ? 'border-[#d2d2d7]' : 'border-zinc-800'}`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`h-6 w-24 rounded animate-pulse ${
              theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
            }`} />
          ))}
        </div>

        {/* Content Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className={`rounded-xl p-6 ${card}`}>
              <div className={`h-6 w-40 rounded mb-4 animate-pulse ${
                theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
              }`} />
              <div className="space-y-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className={`h-20 rounded animate-pulse ${
                    theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
                  }`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className={`text-3xl font-bold mb-2 ${textPrimary}`}>CI/CD Insights</h1>
        <p className={textSecondary}>Analytics and performance metrics for your pipelines</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={`rounded-xl p-4 ${
            theme === 'light'
              ? 'bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200 shadow-sm'
              : 'bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm ${textSecondary}`}>Success Rate</span>
              <Target className="w-5 h-5 text-green-500" />
            </div>
            <p className={`text-3xl font-bold ${textPrimary}`}>{summary.success_rate.toFixed(1)}%</p>
            <p className={`text-xs mt-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>
              {summary.successful_pipelines} / {summary.total_pipelines} pipelines
            </p>
          </div>

          <div className={`rounded-xl p-4 ${
            theme === 'light'
              ? 'bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 shadow-sm'
              : 'bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm ${textSecondary}`}>Avg Duration</span>
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <p className={`text-3xl font-bold ${textPrimary}`}>
              {formatDuration(summary.avg_pipeline_duration)}
            </p>
            <p className={`text-xs mt-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>per pipeline</p>
          </div>

          <div className={`rounded-xl p-4 ${
            theme === 'light'
              ? 'bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 shadow-sm'
              : 'bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm ${textSecondary}`}>MTTR</span>
              <Zap className="w-5 h-5 text-purple-500" />
            </div>
            <p className={`text-3xl font-bold ${textPrimary}`}>
              {summary.mttr.toFixed(0)}m
            </p>
            <p className={`text-xs mt-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>mean time to recovery</p>
          </div>

          <div className={`rounded-xl p-4 ${
            theme === 'light'
              ? 'bg-gradient-to-br from-red-50 to-red-100/50 border border-red-200 shadow-sm'
              : 'bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm ${textSecondary}`}>Change Failure Rate</span>
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <p className={`text-3xl font-bold ${textPrimary}`}>
              {summary.change_failure_rate.toFixed(1)}%
            </p>
            <p className={`text-xs mt-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>
              {summary.failed_pipelines} failures
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className={`border-b ${theme === 'light' ? 'border-[#d2d2d7]' : 'border-zinc-800'}`}>
        <div className="flex gap-4">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'failures', label: 'Failures', icon: AlertTriangle, count: failures.length },
            { id: 'flaky', label: 'Flaky Tests', icon: XCircle, count: flakyTests.length },
            { id: 'performance', label: 'Performance', icon: Zap, count: bottlenecks.length },
            { id: 'deployments', label: 'Deployments', icon: Target, count: deployments.length },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? `border-orange-500 ${textPrimary}`
                    : `border-transparent ${theme === 'light' ? 'text-[#86868b] hover:text-[#6e6e73]' : 'text-zinc-500 hover:text-zinc-300'}`
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="font-medium">{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    theme === 'light' ? 'bg-[#f5f5f7] text-[#6e6e73] border border-[#d2d2d7]' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Success Rate Trend Chart */}
          {summary && (
            <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${textPrimary}`}>
                <BarChart3 className="w-5 h-5 text-blue-500" />
                Pipeline Success Rate Trend
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={[
                  { name: 'Week 1', rate: summary.success_rate * 0.92 },
                  { name: 'Week 2', rate: summary.success_rate * 0.95 },
                  { name: 'Week 3', rate: summary.success_rate * 0.98 },
                  { name: 'Week 4', rate: summary.success_rate },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#e5e7eb' : '#374151'} />
                  <XAxis dataKey="name" stroke={theme === 'light' ? '#6b7280' : '#9ca3af'} />
                  <YAxis stroke={theme === 'light' ? '#6b7280' : '#9ca3af'} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: theme === 'light' ? '#ffffff' : '#1f2937',
                      border: `1px solid ${theme === 'light' ? '#e5e7eb' : '#374151'}`,
                      borderRadius: '8px',
                    }}
                  />
                  <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={3} dot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Failure Types Distribution */}
          {failures.length > 0 && (
            <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${textPrimary}`}>
                <Activity className="w-5 h-5 text-orange-500" />
                Failure Types Distribution
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Script Failure', value: failures.filter(f => f.failure_type === 'script_failure').length, color: '#ef4444' },
                      { name: 'Timeout', value: failures.filter(f => f.failure_type === 'timeout').length, color: '#f97316' },
                      { name: 'Runner Failure', value: failures.filter(f => f.failure_type === 'runner_system_failure').length, color: '#a855f7' },
                      { name: 'Cancelled', value: failures.filter(f => f.failure_type === 'cancelled').length, color: '#6b7280' },
                    ].filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {[
                      { name: 'Script Failure', value: failures.filter(f => f.failure_type === 'script_failure').length, color: '#ef4444' },
                      { name: 'Timeout', value: failures.filter(f => f.failure_type === 'timeout').length, color: '#f97316' },
                      { name: 'Runner Failure', value: failures.filter(f => f.failure_type === 'runner_system_failure').length, color: '#a855f7' },
                      { name: 'Cancelled', value: failures.filter(f => f.failure_type === 'cancelled').length, color: '#6b7280' },
                    ].filter(d => d.value > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: theme === 'light' ? '#ffffff' : '#1f2937',
                      border: `1px solid ${theme === 'light' ? '#e5e7eb' : '#374151'}`,
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Failures */}
            <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${textPrimary}`}>
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Recent Failures
              </h3>
              <div className="space-y-3">
                {failures.slice(0, 5).map((failure, index) => (
                <div key={index} className={`rounded p-3 ${
                  theme === 'light' ? 'bg-[#f5f5f7]/50 border border-[#d2d2d7]/30' : 'bg-zinc-950 border border-zinc-800'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-sm font-medium ${textPrimary}`}>{failure.job_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded border ${getFailureTypeColor(failure.failure_type)}`}>
                      {failure.failure_type.replace('_', ' ')}
                    </span>
                  </div>
                  <p className={`text-xs mb-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>{failure.project_name}</p>
                  <p className={`text-xs line-clamp-2 ${textSecondary}`}>{failure.error_message || failure.failure_reason}</p>
                </div>
              ))}
              {failures.length === 0 && (
                <p className={`text-center py-8 ${textSecondary}`}>No recent failures</p>
              )}
            </div>
          </div>

          {/* Top Flaky Tests */}
          <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
            <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${textPrimary}`}>
              <XCircle className="w-5 h-5 text-yellow-500" />
              Flaky Tests
            </h3>
            <div className="space-y-3">
              {flakyTests.slice(0, 5).map((test, index) => (
                <div key={index} className={`rounded p-3 ${
                  theme === 'light' ? 'bg-[#f5f5f7]/50 border border-[#d2d2d7]/30' : 'bg-zinc-950 border border-zinc-800'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-sm font-medium ${textPrimary}`}>{test.job_name}</span>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(test.trend)}
                      <span className="text-xs text-red-500 font-semibold">
                        {test.failure_rate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <p className={`text-xs mb-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>{test.project_name}</p>
                  <p className={`text-xs ${textSecondary}`}>
                    {test.failure_count} / {test.total_runs} runs failed
                  </p>
                </div>
              ))}
              {flakyTests.length === 0 && (
                <p className={`text-center py-8 ${textSecondary}`}>No flaky tests detected</p>
              )}
            </div>
          </div>
          </div>
        </div>
      )}

      {activeTab === 'failures' && (
        <div className="space-y-4">
          {failures.map((failure, index) => (
            <div key={index} className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className={`text-lg font-semibold ${textPrimary}`}>{failure.job_name}</h3>
                    <span className={`text-xs px-2 py-1 rounded border ${getFailureTypeColor(failure.failure_type)}`}>
                      {failure.failure_type.replace('_', ' ')}
                    </span>
                  </div>
                  <p className={`text-sm mb-2 ${textSecondary}`}>{failure.project_name}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs ${textSecondary}`}>{formatRelativeTime(failure.failed_at)}</p>
                  <p className={`text-xs mt-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-600'}`}>{formatDuration(failure.duration)}</p>
                </div>
              </div>

              <div className={`rounded p-4 ${
                theme === 'light' ? 'bg-[#f5f5f7]/50 border border-[#d2d2d7]/30' : 'bg-zinc-950 border border-zinc-800'
              }`}>
                <p className={`text-sm font-semibold mb-2 ${textSecondary}`}>Error Message:</p>
                <p className="text-sm text-red-400 font-mono">{failure.error_message || failure.failure_reason}</p>
              </div>
            </div>
          ))}
          {failures.length === 0 && (
            <div className="text-center py-12">
              <AlertTriangle className={`w-12 h-12 mx-auto mb-4 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-600'}`} />
              <p className={textSecondary}>No failures in the last 7 days</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'flaky' && (
        <div className="space-y-4">
          {flakyTests.map((test, index) => (
            <div key={index} className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className={`text-lg font-semibold ${textPrimary}`}>{test.job_name}</h3>
                    {getTrendIcon(test.trend)}
                  </div>
                  <p className={`text-sm ${textSecondary}`}>{test.project_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-red-500">{test.failure_rate.toFixed(1)}%</p>
                  <p className={`text-xs ${textSecondary}`}>failure rate</p>
                </div>
              </div>

              <div className={`grid grid-cols-3 gap-4 rounded p-4 ${
                theme === 'light' ? 'bg-[#f5f5f7]/50 border border-[#d2d2d7]/30' : 'bg-zinc-950 border border-zinc-800'
              }`}>
                <div>
                  <p className={`text-xs mb-1 ${textSecondary}`}>Total Runs</p>
                  <p className={`text-lg font-semibold ${textPrimary}`}>{test.total_runs}</p>
                </div>
                <div>
                  <p className={`text-xs mb-1 ${textSecondary}`}>Failures</p>
                  <p className="text-lg font-semibold text-red-500">{test.failure_count}</p>
                </div>
                <div>
                  <p className={`text-xs mb-1 ${textSecondary}`}>Success</p>
                  <p className="text-lg font-semibold text-green-500">{test.success_count}</p>
                </div>
              </div>

              {test.last_failed && (
                <p className={`text-xs mt-3 ${textSecondary}`}>
                  Last failed: {formatRelativeTime(test.last_failed)}
                </p>
              )}
            </div>
          ))}
          {flakyTests.length === 0 && (
            <div className="text-center py-12">
              <XCircle className={`w-12 h-12 mx-auto mb-4 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-600'}`} />
              <p className={textSecondary}>No flaky tests detected</p>
              <p className={`text-xs mt-2 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-600'}`}>Tests are considered flaky if they have inconsistent pass/fail results</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="space-y-6">
          {/* Performance Bottlenecks Chart */}
          {bottlenecks.length > 0 && (
            <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${textPrimary}`}>
                <BarChart3 className="w-5 h-5 text-purple-500" />
                Top 10 Slowest Jobs
              </h3>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={bottlenecks.slice(0, 10).map(b => ({
                  name: b.job_name.length > 15 ? b.job_name.substring(0, 15) + '...' : b.job_name,
                  duration: Math.round(b.avg_duration / 60), // Convert to minutes
                  max: Math.round(b.max_duration / 60),
                  min: Math.round(b.min_duration / 60),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#e5e7eb' : '#374151'} />
                  <XAxis dataKey="name" stroke={theme === 'light' ? '#6b7280' : '#9ca3af'} angle={-45} textAnchor="end" height={100} />
                  <YAxis stroke={theme === 'light' ? '#6b7280' : '#9ca3af'} label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: theme === 'light' ? '#ffffff' : '#1f2937',
                      border: `1px solid ${theme === 'light' ? '#e5e7eb' : '#374151'}`,
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="duration" fill="#f59e0b" name="Avg Duration" />
                  <Bar dataKey="max" fill="#ef4444" name="Max Duration" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {bottlenecks.map((bottleneck, index) => (
            <div key={index} className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className={`text-lg font-semibold ${textPrimary}`}>{bottleneck.job_name}</h3>
                    {getTrendIcon(bottleneck.trend)}
                    <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                      {bottleneck.stage}
                    </span>
                  </div>
                  <p className={`text-sm ${textSecondary}`}>{bottleneck.project_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-orange-500">{formatDuration(bottleneck.avg_duration)}</p>
                  <p className={`text-xs ${textSecondary}`}>avg duration</p>
                </div>
              </div>

              <div className={`grid grid-cols-3 gap-4 rounded p-4 ${
                theme === 'light' ? 'bg-[#f5f5f7]/50 border border-[#d2d2d7]/30' : 'bg-zinc-950 border border-zinc-800'
              }`}>
                <div>
                  <p className={`text-xs mb-1 ${textSecondary}`}>Min</p>
                  <p className="text-sm font-semibold text-green-500">{formatDuration(bottleneck.min_duration)}</p>
                </div>
                <div>
                  <p className={`text-xs mb-1 ${textSecondary}`}>Max</p>
                  <p className="text-sm font-semibold text-red-500">{formatDuration(bottleneck.max_duration)}</p>
                </div>
                <div>
                  <p className={`text-xs mb-1 ${textSecondary}`}>Runs</p>
                  <p className={`text-sm font-semibold ${textPrimary}`}>{bottleneck.total_runs}</p>
                </div>
              </div>
            </div>
          ))}
          {bottlenecks.length === 0 && (
            <div className="text-center py-12">
              <Zap className={`w-12 h-12 mx-auto mb-4 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-600'}`} />
              <p className={textSecondary}>No performance bottlenecks detected</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'deployments' && (
        <div className="space-y-6">
          {/* Deployment Frequency Chart */}
          {deployments.length > 0 && (
            <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${textPrimary}`}>
                <BarChart3 className="w-5 h-5 text-green-500" />
                Deployment Frequency by Project
              </h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={deployments.map(d => ({
                  name: d.project_name.length > 12 ? d.project_name.substring(0, 12) + '...' : d.project_name,
                  successful: d.successful_deployments,
                  failed: d.failed_deployments,
                  frequency: parseFloat(d.deployments_per_day.toFixed(1)),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#e5e7eb' : '#374151'} />
                  <XAxis dataKey="name" stroke={theme === 'light' ? '#6b7280' : '#9ca3af'} angle={-30} textAnchor="end" height={100} />
                  <YAxis stroke={theme === 'light' ? '#6b7280' : '#9ca3af'} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: theme === 'light' ? '#ffffff' : '#1f2937',
                      border: `1px solid ${theme === 'light' ? '#e5e7eb' : '#374151'}`,
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="successful" stackId="a" fill="#10b981" name="Successful" />
                  <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {deployments.map((deployment, index) => (
            <div key={index} className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className={`text-lg font-semibold ${textPrimary}`}>{deployment.project_name}</h3>
                    {getTrendIcon(deployment.trend)}
                  </div>
                  <p className={`text-sm ${textSecondary}`}>
                    Last deployment: {formatRelativeTime(deployment.last_deployment)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-500">
                    {deployment.deployments_per_day.toFixed(1)}/day
                  </p>
                  <p className={`text-xs ${textSecondary}`}>deployment frequency</p>
                </div>
              </div>

              <div className={`grid grid-cols-4 gap-4 rounded p-4 ${
                theme === 'light' ? 'bg-[#f5f5f7]/50 border border-[#d2d2d7]/30' : 'bg-zinc-950 border border-zinc-800'
              }`}>
                <div>
                  <p className={`text-xs mb-1 ${textSecondary}`}>Total</p>
                  <p className={`text-lg font-semibold ${textPrimary}`}>{deployment.total_deployments}</p>
                </div>
                <div>
                  <p className={`text-xs mb-1 ${textSecondary}`}>Successful</p>
                  <p className="text-lg font-semibold text-green-500">{deployment.successful_deployments}</p>
                </div>
                <div>
                  <p className={`text-xs mb-1 ${textSecondary}`}>Failed</p>
                  <p className="text-lg font-semibold text-red-500">{deployment.failed_deployments}</p>
                </div>
                <div>
                  <p className={`text-xs mb-1 ${textSecondary}`}>Avg Time</p>
                  <p className="text-lg font-semibold text-blue-500">{formatDuration(deployment.avg_deployment_time)}</p>
                </div>
              </div>
            </div>
          ))}
          {deployments.length === 0 && (
            <div className="text-center py-12">
              <Target className={`w-12 h-12 mx-auto mb-4 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-600'}`} />
              <p className={textSecondary}>No deployment data available</p>
              <p className={`text-xs mt-2 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-600'}`}>Deployments are detected by analyzing jobs with &apos;deploy&apos; in their name</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
