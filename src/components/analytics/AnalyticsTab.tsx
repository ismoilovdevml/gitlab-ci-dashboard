'use client';

import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useDoraMetrics, type DoraPeriod, type DoraProjectSummary, type TrendPoint } from '@/hooks/useDoraMetrics';
import DoraMetricsCard from './DoraMetricsCard';
import TrendChart from './TrendChart';
import { BarChart3, Calendar, AlertCircle, FolderGit2 } from 'lucide-react';

const SOURCE_LABEL: Record<DoraProjectSummary['source'], string> = {
  deployments: 'Production deployments',
  pipelines: 'Default-branch pipelines',
  none: 'No default branch',
  error: 'Not readable',
};

export default function AnalyticsTab() {
  const { theme, textPrimary, textSecondary, card } = useTheme();
  const [period, setPeriod] = useState<DoraPeriod>('30d');
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const [knownProjects, setKnownProjects] = useState<DoraProjectSummary[]>([]);

  const { loading, error, metrics, summary, trendData, hasData } = useDoraMetrics(projectId, period);

  // The all-projects report lists the analysed projects; keep them for the project selector
  // while a single project is shown.
  if (summary?.scope === 'all' && summary.projects !== knownProjects) {
    setKnownProjects(summary.projects);
  }

  const selectClass = `px-4 py-2 rounded-lg border ${
    theme === 'light'
      ? 'bg-white border-gray-300 text-gray-900'
      : 'bg-zinc-800 border-zinc-700 text-white'
  } focus:outline-hidden focus:ring-2 focus:ring-orange-500`;

  const bucketLabel = period === '90d' ? 'per week' : 'per day';

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className={`text-2xl font-bold ${textPrimary} flex items-center gap-2`}>
          <BarChart3 className="w-7 h-7" />
          Advanced Analytics
        </h2>
        <p className={`${textSecondary} mt-1`}>
          DORA metrics and trends computed from your GitLab deployments and pipelines
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <FolderGit2 className={`w-5 h-5 ${textSecondary}`} />
          <select
            aria-label="Project"
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : undefined)}
            className={selectClass}
          >
            <option value="">All projects</option>
            {knownProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className={`w-5 h-5 ${textSecondary}`} />
          <select
            aria-label="Period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as DoraPeriod)}
            className={selectClass}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <AlertCircle className={`w-12 h-12 ${theme === 'light' ? 'text-red-600' : 'text-red-400'}`} />
          <div className="text-center">
            <h3 className={`text-lg font-semibold ${textPrimary} mb-2`}>Failed to Load Analytics</h3>
            <p className={`${textSecondary}`}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
        </div>
      </div>
    );
  }

  const trendCard = (data: TrendPoint[] | undefined, title: string, yAxisLabel: string, color: string) =>
    data && data.length > 0 ? (
      <TrendChart data={data} title={title} yAxisLabel={yAxisLabel} color={color} />
    ) : (
      <div className={`${card} p-6 rounded-lg`}>
        <h3 className={`text-lg font-semibold ${textPrimary} mb-6`}>{title}</h3>
        <div className={`flex items-center justify-center h-[300px] ${textSecondary}`}>No data</div>
      </div>
    );

  const projectRows = summary?.scope === 'all' ? summary.projects : [];
  const bySource = (source: DoraProjectSummary['source']) => projectRows.filter((p) => p.source === source).length;

  return (
    <div className="space-y-6">
      {header}

      {hasData ? (
        <DoraMetricsCard metrics={metrics} />
      ) : (
        <div className={`${card} p-8 text-center`}>
          <p className={`${textPrimary} font-medium`}>No data</p>
          <p className={`text-sm ${textSecondary} mt-2`}>
            No production deployments or default-branch pipelines finished in this period.
          </p>
        </div>
      )}

      {summary?.scope === 'all' && projectRows.length > 0 && (
        <p className={`text-sm ${textSecondary}`}>
          Based on {projectRows.length} recently active project{projectRows.length === 1 ? '' : 's'}:{' '}
          {bySource('deployments')} with production environments, {bySource('pipelines')} measured by
          default-branch pipelines.
          {summary.truncated && ' Only the most recently active projects and deliveries are included.'}
        </p>
      )}

      {hasData && trendData && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {trendCard(trendData.deploymentFrequency, `Deployments (${bucketLabel})`, 'Deployments', '#10b981')}
            {trendCard(trendData.leadTime, 'Lead Time (median)', 'Hours', '#3b82f6')}
          </div>
          <div className="grid grid-cols-1">
            {trendCard(trendData.successRate, 'Deployment Success Rate', 'Success %', '#f59e0b')}
          </div>
        </>
      )}

      {projectRows.length > 0 && (
        <div className={`${card} p-6 rounded-lg`}>
          <h3 className={`text-lg font-semibold ${textPrimary} mb-4`}>Projects</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`text-left ${textSecondary}`}>
                  <th className="py-2 pr-4 font-medium">Project</th>
                  <th className="py-2 pr-4 font-medium">Measured by</th>
                  <th className="py-2 pr-4 font-medium text-right">Successful</th>
                  <th className="py-2 font-medium text-right">Failed</th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-t ${theme === 'light' ? 'border-gray-200' : 'border-zinc-800'}`}
                  >
                    <td className={`py-2 pr-4 ${textPrimary}`}>
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => setProjectId(p.id)}
                      >
                        {p.name}
                      </button>
                    </td>
                    <td className={`py-2 pr-4 ${textSecondary}`}>{SOURCE_LABEL[p.source]}</td>
                    <td className={`py-2 pr-4 text-right ${textPrimary}`}>{p.successCount}</td>
                    <td className={`py-2 text-right ${textPrimary}`}>{p.failedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
