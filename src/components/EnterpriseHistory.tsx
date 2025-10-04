'use client';

import { useState, useEffect } from 'react';
import {
  History,
  Search,
  Filter,
  Download,
  Trash2,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  BarChart3,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useDashboardStore } from '@/store/dashboard-store';

interface AlertHistory {
  id: string;
  projectName: string;
  pipelineId: number;
  status: string;
  channel: string;
  message: string;
  sent: boolean;
  error?: string | null;
  createdAt: string;
}

interface Analytics {
  summary: {
    totalAlerts: number;
    successfulAlerts: number;
    failedAlerts: number;
    successRate: number;
  };
  channelStats: Record<string, { total: number; success: number; failed: number }>;
  statusStats: Record<string, number>;
  projectStats: Array<{ name: string; total: number; success: number; failed: number }>;
  timeSeries: Array<{ date: string; total: number; success: number; failed: number }>;
}

export default function EnterpriseHistory() {
  const { card, textPrimary, textSecondary, input } = useTheme();
  const { addNotification } = useDashboardStore();

  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
    loadAnalytics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, channelFilter, startDate, endDate]);

  const loadHistory = async (cursor?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('limit', '50');
      if (cursor) params.append('cursor', cursor);
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (channelFilter !== 'all') params.append('channel', channelFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`/api/history?${params.toString()}`);
      const data = await res.json();

      setHistory(prevHistory => cursor ? [...prevHistory, ...data.data] : data.data);
      setHasMore(data.pagination.hasMore);
      setNextCursor(data.pagination.nextCursor);
    } catch (error) {
      console.error('Failed to load history:', error);
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: 'Failed to load history',
        timestamp: Date.now()
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const res = await fetch('/api/history/analytics?days=30');
      const data = await res.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const params = new URLSearchParams();
      params.append('format', format);
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (channelFilter !== 'all') params.append('channel', channelFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`/api/history/export?${params.toString()}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alert-history-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Success',
        message: `Exported ${history.length} records as ${format.toUpperCase()}`,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to export:', error);
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: 'Failed to export history',
        timestamp: Date.now()
      });
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear all history? This cannot be undone.')) return;

    try {
      await fetch('/api/history', { method: 'DELETE' });
      setHistory([]);
      loadAnalytics();
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Success',
        message: 'History cleared successfully',
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to clear history:', error);
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: 'Failed to clear history',
        timestamp: Date.now()
      });
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await fetch(`/api/history?id=${id}`, { method: 'DELETE' });
      setHistory(history.filter(h => h.id !== id));
      loadAnalytics();
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Success',
        message: 'Item deleted successfully',
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to delete item:', error);
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: 'Failed to delete item',
        timestamp: Date.now()
      });
    }
  };

  const getStatusColor = (status: string) => {
    if (status.includes('success')) return 'text-green-500';
    if (status.includes('failed')) return 'text-red-500';
    if (status.includes('running')) return 'text-blue-500';
    return textSecondary;
  };

  const getChannelColor = (channel: string) => {
    const colors: Record<string, string> = {
      telegram: 'bg-blue-500',
      slack: 'bg-purple-500',
      discord: 'bg-indigo-500',
      email: 'bg-green-500',
      webhook: 'bg-orange-500',
    };
    return colors[channel] || 'bg-gray-500';
  };

  return (
    <div className="space-y-6">
      {/* Analytics Cards */}
      {!analyticsLoading && analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={`${card} p-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${textSecondary}`}>Total Alerts</p>
                <p className={`text-2xl font-bold ${textPrimary}`}>
                  {analytics.summary.totalAlerts.toLocaleString()}
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          <div className={`${card} p-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${textSecondary}`}>Success Rate</p>
                <p className={`text-2xl font-bold text-green-500`}>
                  {analytics.summary.successRate.toFixed(1)}%
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className={`${card} p-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${textSecondary}`}>Successful</p>
                <p className={`text-2xl font-bold text-green-500`}>
                  {analytics.summary.successfulAlerts.toLocaleString()}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className={`${card} p-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${textSecondary}`}>Failed</p>
                <p className={`text-2xl font-bold text-red-500`}>
                  {analytics.summary.failedAlerts.toLocaleString()}
                </p>
              </div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </div>
        </div>
      )}

      {/* Channel Statistics */}
      {!analyticsLoading && analytics && Object.keys(analytics.channelStats).length > 0 && (
        <div className={`${card} p-6`}>
          <h3 className={`text-lg font-semibold ${textPrimary} mb-4`}>Channel Statistics</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Object.entries(analytics.channelStats).map(([channel, stats]) => (
              <div key={channel} className="bg-gray-700/30 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-3 h-3 rounded-full ${getChannelColor(channel)}`} />
                  <span className={`font-medium ${textPrimary} capitalize`}>{channel}</span>
                </div>
                <p className={`text-sm ${textSecondary}`}>Total: {stats.total}</p>
                <p className="text-sm text-green-500">Success: {stats.success}</p>
                <p className="text-sm text-red-500">Failed: {stats.failed}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Projects */}
      {!analyticsLoading && analytics && analytics.projectStats.length > 0 && (
        <div className={`${card} p-6`}>
          <h3 className={`text-lg font-semibold ${textPrimary} mb-4`}>Top 5 Projects</h3>
          <div className="space-y-3">
            {analytics.projectStats.map((project, idx) => (
              <div key={project.name} className="flex items-center gap-4">
                <span className={`text-2xl font-bold ${textSecondary}`}>#{idx + 1}</span>
                <div className="flex-1">
                  <p className={`font-medium ${textPrimary}`}>{project.name}</p>
                  <div className="flex gap-4 text-sm">
                    <span className={textSecondary}>Total: {project.total}</span>
                    <span className="text-green-500">Success: {project.success}</span>
                    <span className="text-red-500">Failed: {project.failed}</span>
                  </div>
                </div>
                <div className="w-32 bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${(project.success / project.total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className={`${card} p-6`}>
        <div className="flex flex-col lg:flex-row gap-4 mb-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
            <input
              type="text"
              placeholder="Search by project name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${input} pl-10 w-full`}
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
              showFilters ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>

          {/* Refresh */}
          <button
            onClick={() => { loadHistory(); loadAnalytics(); }}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-600"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>

          {/* Export */}
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('csv')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg flex items-center gap-2 hover:bg-green-700"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700"
            >
              <Download className="w-4 h-4" />
              JSON
            </button>
          </div>

          {/* Clear All */}
          <button
            onClick={handleClearHistory}
            className="px-4 py-2 bg-red-600 text-white rounded-lg flex items-center gap-2 hover:bg-red-700"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-700/30 rounded-lg">
            <div>
              <label className={`block text-sm font-medium ${textSecondary} mb-2`}>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={input}
              >
                <option value="all">All Status</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium ${textSecondary} mb-2`}>Channel</label>
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className={input}
              >
                <option value="all">All Channels</option>
                <option value="telegram">Telegram</option>
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
                <option value="email">Email</option>
                <option value="webhook">Webhook</option>
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium ${textSecondary} mb-2`}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={input}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium ${textSecondary} mb-2`}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={input}
              />
            </div>
          </div>
        )}
      </div>

      {/* History List */}
      <div className={`${card} p-6`}>
        {loading && history.length === 0 ? (
          <div className="text-center py-12">
            <RefreshCw className={`w-16 h-16 mx-auto ${textSecondary} mb-4 animate-spin`} />
            <p className={textSecondary}>Loading history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12">
            <History className={`w-16 h-16 mx-auto ${textSecondary} mb-4`} />
            <h3 className={`text-lg font-semibold ${textPrimary} mb-2`}>No Alert History</h3>
            <p className={textSecondary}>
              No alerts found matching your filters
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {history.map((alert) => (
                <div key={alert.id} className="p-4 bg-gray-700/50 rounded-lg flex items-start justify-between group hover:bg-gray-700/70 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`font-medium ${textPrimary}`}>{alert.projectName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${getChannelColor(alert.channel)} text-white`}>
                        {alert.channel}
                      </span>
                      <span className={`text-xs ${textSecondary}`}>
                        #{alert.pipelineId}
                      </span>
                      <span className={`text-xs font-medium ${getStatusColor(alert.status)}`}>
                        {alert.status}
                      </span>
                      {alert.sent ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                    <p className={`text-sm ${textSecondary} mb-1`}>{alert.message}</p>
                    {alert.error && (
                      <p className="text-xs text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {alert.error}
                      </p>
                    )}
                    <span className={`text-xs ${textSecondary}`}>
                      <Calendar className="w-3 h-3 inline mr-1" />
                      {new Date(alert.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteItem(alert.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:text-red-300 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <button
                onClick={() => loadHistory(nextCursor || undefined)}
                disabled={loading}
                className="mt-4 w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
