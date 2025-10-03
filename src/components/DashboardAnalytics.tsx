'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, DollarSign, Zap, Users, Activity } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPI, Project, Runner } from '@/lib/gitlab-api';
import { formatDuration } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface TimeSeriesData {
  date: string;
  success: number;
  failed: number;
  total: number;
  avgDuration: number;
}

interface ProjectActivity {
  project: Project;
  pipelineCount: number;
  successCount: number;
  failureCount: number;
  avgDuration: number;
}

export default function DashboardAnalytics() {
  const { gitlabUrl, gitlabToken, projects } = useDashboardStore();
  const { theme, textPrimary, textSecondary, card } = useTheme();
  const [loading, setLoading] = useState(true);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [activeProjects, setActiveProjects] = useState<ProjectActivity[]>([]);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [totalCost, setTotalCost] = useState(0);

  useEffect(() => {
    if (gitlabToken && projects.length > 0) {
      loadAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitlabToken, projects]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken);

      // Load last 30 days data
      const days = 30;
      const timeData: TimeSeriesData[] = [];
      const projectActivityMap = new Map<number, ProjectActivity>();

      // Get pipelines for all projects
      const pipelinePromises = projects.slice(0, 20).map(project =>
        api.getPipelines(project.id, 1, 100).catch(() => [])
      );
      const allPipelinesData = await Promise.all(pipelinePromises);

      // Process data day by day
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const dayData: TimeSeriesData = {
          date: dateStr,
          success: 0,
          failed: 0,
          total: 0,
          avgDuration: 0,
        };

        let totalDuration = 0;
        let durationCount = 0;

        allPipelinesData.forEach((pipelines, projectIndex) => {
          const project = projects[projectIndex];

          pipelines.forEach(pipeline => {
            const pipelineDate = new Date(pipeline.created_at).toISOString().split('T')[0];

            if (pipelineDate === dateStr) {
              dayData.total++;
              if (pipeline.status === 'success') dayData.success++;
              if (pipeline.status === 'failed') dayData.failed++;

              if (pipeline.duration) {
                totalDuration += pipeline.duration;
                durationCount++;
              }

              // Track project activity
              if (project) {
                const activity = projectActivityMap.get(project.id) || {
                  project,
                  pipelineCount: 0,
                  successCount: 0,
                  failureCount: 0,
                  avgDuration: 0,
                };

                activity.pipelineCount++;
                if (pipeline.status === 'success') activity.successCount++;
                if (pipeline.status === 'failed') activity.failureCount++;

                projectActivityMap.set(project.id, activity);
              }
            }
          });
        });

        dayData.avgDuration = durationCount > 0 ? totalDuration / durationCount : 0;
        timeData.push(dayData);
      }

      // Calculate project averages
      const projectActivities: ProjectActivity[] = [];
      allPipelinesData.forEach((pipelines, projectIndex) => {
        const project = projects[projectIndex];
        if (!project) return;

        const activity = projectActivityMap.get(project.id);
        if (activity && activity.pipelineCount > 0) {
          const durations = pipelines
            .filter(p => p.duration)
            .map(p => p.duration || 0);

          activity.avgDuration = durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : 0;

          projectActivities.push(activity);
        }
      });

      projectActivities.sort((a, b) => b.pipelineCount - a.pipelineCount);

      // Load runners
      try {
        const runnerData = await api.getRunners(1, 50);
        setRunners(runnerData);
      } catch (error) {
        console.error('Failed to load runners:', error);
      }

      // Calculate cost (assuming $0.01 per minute)
      const totalMinutes = allPipelinesData
        .flat()
        .filter(p => p.duration)
        .reduce((acc, p) => acc + (p.duration || 0), 0) / 60;
      setTotalCost(totalMinutes * 0.01);

      setTimeSeriesData(timeData);
      setActiveProjects(projectActivities);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const successRate = timeSeriesData.length > 0
    ? (timeSeriesData.reduce((acc, d) => acc + d.success, 0) /
       timeSeriesData.reduce((acc, d) => acc + d.total, 0) * 100) || 0
    : 0;

  const avgDuration = timeSeriesData.length > 0
    ? timeSeriesData.reduce((acc, d) => acc + d.avgDuration, 0) / timeSeriesData.length
    : 0;

  const activeRunners = runners.filter(r => r.active && r.online).length;
  const totalRunners = runners.length;

  const runnerUtilization = totalRunners > 0 ? (activeRunners / totalRunners) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Activity className="w-12 h-12 text-orange-500 mx-auto mb-4 animate-pulse" />
          <p className={textSecondary}>Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Analytics Header */}
      <div>
        <h2 className={`text-2xl font-bold mb-2 ${textPrimary}`}>Analytics & Metrics</h2>
        <p className={textSecondary}>Last 30 days performance insights</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`rounded-xl p-4 ${
          theme === 'light'
            ? 'bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200 shadow-sm'
            : 'bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${textSecondary}`}>Success Rate</span>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <p className={`text-3xl font-bold ${textPrimary}`}>{successRate.toFixed(1)}%</p>
          <p className={`text-xs mt-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>30-day average</p>
        </div>

        <div className={`rounded-xl p-4 ${
          theme === 'light'
            ? 'bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 shadow-sm'
            : 'bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${textSecondary}`}>Avg Build Time</span>
            <Zap className="w-5 h-5 text-blue-500" />
          </div>
          <p className={`text-3xl font-bold ${textPrimary}`}>{formatDuration(avgDuration)}</p>
          <p className={`text-xs mt-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>per pipeline</p>
        </div>

        <div className={`rounded-xl p-4 ${
          theme === 'light'
            ? 'bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 shadow-sm'
            : 'bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${textSecondary}`}>Runner Utilization</span>
            <Users className="w-5 h-5 text-purple-500" />
          </div>
          <p className={`text-3xl font-bold ${textPrimary}`}>{runnerUtilization.toFixed(0)}%</p>
          <p className={`text-xs mt-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>{activeRunners} of {totalRunners} active</p>
        </div>

        <div className={`rounded-xl p-4 ${
          theme === 'light'
            ? 'bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-200 shadow-sm'
            : 'bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${textSecondary}`}>Est. Monthly Cost</span>
            <DollarSign className="w-5 h-5 text-orange-500" />
          </div>
          <p className={`text-3xl font-bold ${textPrimary}`}>${totalCost.toFixed(2)}</p>
          <p className={`text-xs mt-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>based on runtime</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Success Rate Trend */}
        <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
          <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Pipeline Success Rate</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                stroke="#71717a"
                fontSize={12}
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis stroke="#71717a" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="success"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: '#22c55e', r: 3 }}
                name="Success"
              />
              <Line
                type="monotone"
                dataKey="failed"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: '#ef4444', r: 3 }}
                name="Failed"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Build Time Trends */}
        <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
          <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Build Time Trends</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={timeSeriesData.slice(-14)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                stroke="#71717a"
                fontSize={12}
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis
                stroke="#71717a"
                fontSize={12}
                tickFormatter={(value) => `${Math.round(value / 60)}m`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                formatter={(value: number) => [formatDuration(value), 'Duration']}
              />
              <Bar dataKey="avgDuration" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Most Active Projects */}
      <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
        <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Most Active Projects</h3>
        <div className="space-y-3">
          {activeProjects.slice(0, 10).map((activity, index) => {
            const successRate = activity.pipelineCount > 0
              ? (activity.successCount / activity.pipelineCount) * 100
              : 0;

            return (
              <div key={activity.project.id} className={`flex items-center gap-4 p-3 rounded-lg ${
                theme === 'light' ? 'bg-[#f5f5f7]/50 border border-[#d2d2d7]/30' : 'bg-zinc-950 border border-zinc-800'
              }`}>
                <div className="flex items-center justify-center w-8 h-8 bg-orange-500/10 rounded-lg text-orange-500 font-bold text-sm">
                  #{index + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${textPrimary}`}>{activity.project.name}</p>
                  <div className={`flex items-center gap-3 text-xs ${textSecondary}`}>
                    <span>{activity.pipelineCount} pipelines</span>
                    <span>•</span>
                    <span className="text-green-500">{activity.successCount} success</span>
                    <span>•</span>
                    <span className="text-red-500">{activity.failureCount} failed</span>
                  </div>
                </div>

                <div className="text-right">
                  <p className={`text-lg font-bold ${textPrimary}`}>{successRate.toFixed(0)}%</p>
                  <p className={`text-xs ${textSecondary}`}>{formatDuration(activity.avgDuration)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Runner Status */}
      <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
        <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Runner Utilization</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Active', value: activeRunners },
                    { name: 'Idle', value: totalRunners - activeRunners },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {[
                    { name: 'Active', value: activeRunners },
                    { name: 'Idle', value: totalRunners - activeRunners },
                  ].map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#22c55e' : '#3f3f46'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-3">
            {runners.slice(0, 5).map((runner) => (
              <div key={runner.id} className={`flex items-center justify-between p-3 rounded-lg ${
                theme === 'light' ? 'bg-[#f5f5f7]/50 border border-[#d2d2d7]/30' : 'bg-zinc-950 border border-zinc-800'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${runner.online ? 'bg-green-500' : 'bg-zinc-600'}`} />
                  <div>
                    <p className={`text-sm font-medium truncate max-w-[200px] ${textPrimary}`}>
                      {runner.description || runner.name || `Runner #${runner.id}`}
                    </p>
                    <p className={`text-xs ${textSecondary}`}>{runner.platform} • {runner.architecture}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  runner.status === 'online' ? 'bg-green-500/10 text-green-500' :
                  theme === 'light' ? 'bg-[#f5f5f7] text-[#6e6e73] border border-[#d2d2d7]' : 'bg-zinc-700 text-zinc-400'
                }`}>
                  {runner.status}
                </span>
              </div>
            ))}
            {runners.length === 0 && (
              <p className={`text-center py-8 ${textSecondary}`}>No runners available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
