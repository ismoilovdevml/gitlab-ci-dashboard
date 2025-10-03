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
import { useDashboardStore } from '@/store/dashboard-store';
import {
  getGitLabAPI,
  InsightsSummary,
  FailureAnalysis,
  FlakyTest,
  PerformanceBottleneck,
  DeploymentFrequency,
} from '@/lib/gitlab-api';
import { formatDuration, formatRelativeTime } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

export default function InsightsTab() {
  const { gitlabUrl, gitlabToken } = useDashboardStore();
  const { theme, textPrimary, textSecondary, card } = useTheme();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [failures, setFailures] = useState<FailureAnalysis[]>([]);
  const [flakyTests, setFlakyTests] = useState<FlakyTest[]>([]);
  const [bottlenecks, setBottlenecks] = useState<PerformanceBottleneck[]>([]);
  const [deployments, setDeployments] = useState<DeploymentFrequency[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'failures' | 'flaky' | 'performance' | 'deployments'>('overview');

  useEffect(() => {
    if (gitlabToken) {
      loadInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitlabToken, gitlabUrl]);

  const loadInsights = async () => {
    setLoading(true);
    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken);

      const [summaryData, failuresData, flakyData, bottlenecksData, deploymentsData] =
        await Promise.all([
          api.getInsightsSummary(30),
          api.getFailureAnalysis(7),
          api.getFlakyTests(30),
          api.getPerformanceBottlenecks(30),
          api.getDeploymentFrequency(30),
        ]);

      setSummary(summaryData);
      setFailures(failuresData);
      setFlakyTests(flakyData);
      setBottlenecks(bottlenecksData);
      setDeployments(deploymentsData);
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Activity className="w-12 h-12 text-orange-500 mx-auto mb-4 animate-pulse" />
          <p className="text-zinc-400">Analyzing CI/CD pipelines...</p>
          <p className="text-xs text-zinc-600 mt-2">This may take a moment</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">CI/CD Insights</h1>
        <p className="text-zinc-400">Analytics and performance metrics for your pipelines</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">Success Rate</span>
              <Target className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-3xl font-bold text-white">{summary.success_rate.toFixed(1)}%</p>
            <p className="text-xs text-zinc-500 mt-1">
              {summary.successful_pipelines} / {summary.total_pipelines} pipelines
            </p>
          </div>

          <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">Avg Duration</span>
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-3xl font-bold text-white">
              {formatDuration(summary.avg_pipeline_duration)}
            </p>
            <p className="text-xs text-zinc-500 mt-1">per pipeline</p>
          </div>

          <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">MTTR</span>
              <Zap className="w-5 h-5 text-purple-500" />
            </div>
            <p className="text-3xl font-bold text-white">
              {summary.mttr.toFixed(0)}m
            </p>
            <p className="text-xs text-zinc-500 mt-1">mean time to recovery</p>
          </div>

          <div className="bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">Change Failure Rate</span>
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-3xl font-bold text-white">
              {summary.change_failure_rate.toFixed(1)}%
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {summary.failed_pipelines} failures
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-zinc-800">
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
                    ? 'border-orange-500 text-white'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="font-medium">{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="px-2 py-0.5 text-xs bg-zinc-800 text-zinc-400 rounded-full">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Failures */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Recent Failures
            </h3>
            <div className="space-y-3">
              {failures.slice(0, 5).map((failure, index) => (
                <div key={index} className="bg-zinc-950 border border-zinc-800 rounded p-3">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-sm font-medium text-white">{failure.job_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded border ${getFailureTypeColor(failure.failure_type)}`}>
                      {failure.failure_type.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mb-1">{failure.project_name}</p>
                  <p className="text-xs text-zinc-400 line-clamp-2">{failure.error_message || failure.failure_reason}</p>
                </div>
              ))}
              {failures.length === 0 && (
                <p className="text-center text-zinc-500 py-8">No recent failures</p>
              )}
            </div>
          </div>

          {/* Top Flaky Tests */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-yellow-500" />
              Flaky Tests
            </h3>
            <div className="space-y-3">
              {flakyTests.slice(0, 5).map((test, index) => (
                <div key={index} className="bg-zinc-950 border border-zinc-800 rounded p-3">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-sm font-medium text-white">{test.job_name}</span>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(test.trend)}
                      <span className="text-xs text-red-500 font-semibold">
                        {test.failure_rate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 mb-1">{test.project_name}</p>
                  <p className="text-xs text-zinc-400">
                    {test.failure_count} / {test.total_runs} runs failed
                  </p>
                </div>
              ))}
              {flakyTests.length === 0 && (
                <p className="text-center text-zinc-500 py-8">No flaky tests detected</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'failures' && (
        <div className="space-y-4">
          {failures.map((failure, index) => (
            <div key={index} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{failure.job_name}</h3>
                    <span className={`text-xs px-2 py-1 rounded border ${getFailureTypeColor(failure.failure_type)}`}>
                      {failure.failure_type.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 mb-2">{failure.project_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500">{formatRelativeTime(failure.failed_at)}</p>
                  <p className="text-xs text-zinc-600 mt-1">{formatDuration(failure.duration)}</p>
                </div>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 rounded p-4">
                <p className="text-sm text-zinc-300 font-semibold mb-2">Error Message:</p>
                <p className="text-sm text-red-400 font-mono">{failure.error_message || failure.failure_reason}</p>
              </div>
            </div>
          ))}
          {failures.length === 0 && (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-500">No failures in the last 7 days</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'flaky' && (
        <div className="space-y-4">
          {flakyTests.map((test, index) => (
            <div key={index} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{test.job_name}</h3>
                    {getTrendIcon(test.trend)}
                  </div>
                  <p className="text-sm text-zinc-400">{test.project_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-red-500">{test.failure_rate.toFixed(1)}%</p>
                  <p className="text-xs text-zinc-500">failure rate</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 bg-zinc-950 border border-zinc-800 rounded p-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Total Runs</p>
                  <p className="text-lg font-semibold text-white">{test.total_runs}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Failures</p>
                  <p className="text-lg font-semibold text-red-500">{test.failure_count}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Success</p>
                  <p className="text-lg font-semibold text-green-500">{test.success_count}</p>
                </div>
              </div>

              {test.last_failed && (
                <p className="text-xs text-zinc-500 mt-3">
                  Last failed: {formatRelativeTime(test.last_failed)}
                </p>
              )}
            </div>
          ))}
          {flakyTests.length === 0 && (
            <div className="text-center py-12">
              <XCircle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-500">No flaky tests detected</p>
              <p className="text-xs text-zinc-600 mt-2">Tests are considered flaky if they have inconsistent pass/fail results</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="space-y-4">
          {bottlenecks.map((bottleneck, index) => (
            <div key={index} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{bottleneck.job_name}</h3>
                    {getTrendIcon(bottleneck.trend)}
                    <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                      {bottleneck.stage}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400">{bottleneck.project_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-orange-500">{formatDuration(bottleneck.avg_duration)}</p>
                  <p className="text-xs text-zinc-500">avg duration</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 bg-zinc-950 border border-zinc-800 rounded p-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Min</p>
                  <p className="text-sm font-semibold text-green-500">{formatDuration(bottleneck.min_duration)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Max</p>
                  <p className="text-sm font-semibold text-red-500">{formatDuration(bottleneck.max_duration)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Runs</p>
                  <p className="text-sm font-semibold text-white">{bottleneck.total_runs}</p>
                </div>
              </div>
            </div>
          ))}
          {bottlenecks.length === 0 && (
            <div className="text-center py-12">
              <Zap className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-500">No performance bottlenecks detected</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'deployments' && (
        <div className="space-y-4">
          {deployments.map((deployment, index) => (
            <div key={index} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{deployment.project_name}</h3>
                    {getTrendIcon(deployment.trend)}
                  </div>
                  <p className="text-sm text-zinc-400">
                    Last deployment: {formatRelativeTime(deployment.last_deployment)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-500">
                    {deployment.deployments_per_day.toFixed(1)}/day
                  </p>
                  <p className="text-xs text-zinc-500">deployment frequency</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 bg-zinc-950 border border-zinc-800 rounded p-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Total</p>
                  <p className="text-lg font-semibold text-white">{deployment.total_deployments}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Successful</p>
                  <p className="text-lg font-semibold text-green-500">{deployment.successful_deployments}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Failed</p>
                  <p className="text-lg font-semibold text-red-500">{deployment.failed_deployments}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Avg Time</p>
                  <p className="text-lg font-semibold text-blue-500">{formatDuration(deployment.avg_deployment_time)}</p>
                </div>
              </div>
            </div>
          ))}
          {deployments.length === 0 && (
            <div className="text-center py-12">
              <Target className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-500">No deployment data available</p>
              <p className="text-xs text-zinc-600 mt-2">Deployments are detected by analyzing jobs with &apos;deploy&apos; in their name</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
