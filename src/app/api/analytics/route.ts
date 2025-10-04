import { NextResponse } from 'next/server';
import { getCachedAnalytics, setCachedAnalytics } from '@/lib/analytics-cache';
import { getGitLabAPIAsync, Pipeline } from '@/lib/gitlab-api';

interface TimeSeriesData {
  date: string;
  success: number;
  failed: number;
  total: number;
  avgDuration: number;
}

interface ProjectActivity {
  project: { id: number; name: string };
  pipelineCount: number;
  successCount: number;
  failureCount: number;
  avgDuration: number;
}

export async function GET() {
  try {
    // Try cache first
    const cached = await getCachedAnalytics();
    if (cached) {
      return NextResponse.json({ cached: true, data: cached });
    }

    const api = await getGitLabAPIAsync();

    // Get projects from GitLab API
    const projects = await api.getProjects(1, 10);

    if (projects.length === 0) {
      return NextResponse.json({ cached: false, data: null });
    }

    // Load last 7 days data
    const days = 7;
    const timeData: TimeSeriesData[] = [];
    const projectActivityMap = new Map<number, ProjectActivity>();

    // Get pipelines
    const pipelinePromises = projects.slice(0, 10).map((project: { id: number; name: string }) =>
      api.getPipelines(project.id, 1, 50).catch(() => [])
    );
    const allPipelinesData = await Promise.all(pipelinePromises);

    // Process data
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

      allPipelinesData.forEach((pipelines: Pipeline[], projectIndex: number) => {
        const project = projects[projectIndex];

        pipelines.forEach((pipeline: Pipeline) => {
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
    allPipelinesData.forEach((pipelines: Pipeline[], projectIndex: number) => {
      const project = projects[projectIndex];
      if (!project) return;

      const activity = projectActivityMap.get(project.id);
      if (activity && activity.pipelineCount > 0) {
        const durations = pipelines
          .filter((p: Pipeline) => p.duration)
          .map((p: Pipeline) => p.duration || 0);

        activity.avgDuration = durations.length > 0
          ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
          : 0;

        projectActivities.push(activity);
      }
    });

    projectActivities.sort((a, b) => b.pipelineCount - a.pipelineCount);

    // Load runners
    const runners = await api.getRunners(1, 50).catch(() => []);

    const successRate = timeData.length > 0
      ? (timeData.reduce((acc, d) => acc + d.success, 0) /
         timeData.reduce((acc, d) => acc + d.total, 0) * 100) || 0
      : 0;

    const avgDuration = timeData.length > 0
      ? timeData.reduce((acc, d) => acc + d.avgDuration, 0) / timeData.length
      : 0;

    const activeRunners = runners.filter(r => r.active && r.online).length;
    const totalRunners = runners.length;
    const runnerUtilization = totalRunners > 0 ? (activeRunners / totalRunners) * 100 : 0;

    const analyticsData = {
      timeSeriesData: timeData,
      activeProjects: projectActivities,
      runners,
      successRate,
      avgDuration,
      runnerUtilization,
      activeRunners,
      totalRunners,
    };

    // Cache it
    await setCachedAnalytics(analyticsData);

    return NextResponse.json({ cached: false, data: analyticsData });
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { error: 'Failed to load analytics' },
      { status: 500 }
    );
  }
}
