'use client'

import { useState, useEffect } from 'react'
import { Search, Filter, Save, X, Calendar, User, GitBranch, CheckCircle, XCircle, Clock, Loader2, ExternalLink } from 'lucide-react'
import { useDashboardStore } from '@/store/dashboard-store'
import { getGitLabAPI } from '@/lib/gitlab-api'
import type { Pipeline, Job } from '@/lib/gitlab-api'

interface SavedFilter {
  id: string
  name: string
  searchQuery: string
  status: string
  dateRange: string
  customDateFrom: string
  customDateTo: string
  selectedProject: string
  selectedUser: string
}

interface SearchResult {
  type: 'project' | 'pipeline' | 'job'
  id: number
  name: string
  status?: string
  project?: string
  projectId?: number
  branch?: string
  author?: string
  created_at?: string
  duration?: number
  relevance: number
  web_url?: string
}

interface SearchTabProps {
  onNavigate: (tab: string) => void
}

export default function SearchTab({ onNavigate }: SearchTabProps) {
  const { gitlabUrl, gitlabToken, projects, setSelectedProject: setStoreProject, setSelectedPipeline } = useDashboardStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateRange, setDateRange] = useState('all')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('all')
  const [selectedUser, setSelectedUser] = useState('')

  // Saved filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [filterName, setFilterName] = useState('')

  // Load saved filters from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('gitlab-saved-filters')
    if (saved) {
      setSavedFilters(JSON.parse(saved))
    }
  }, [])

  const handleSearch = async () => {
    if (!searchQuery.trim() && statusFilter === 'all' && dateRange === 'all') {
      return
    }

    setIsSearching(true)
    const results: SearchResult[] = []

    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken)

      // Calculate date filter
      let createdAfter: string | undefined
      if (dateRange === '7days') {
        const date = new Date()
        date.setDate(date.getDate() - 7)
        createdAfter = date.toISOString()
      } else if (dateRange === '30days') {
        const date = new Date()
        date.setDate(date.getDate() - 30)
        createdAfter = date.toISOString()
      } else if (dateRange === 'custom' && customDateFrom) {
        createdAfter = new Date(customDateFrom).toISOString()
      }

      const projectsToSearch = selectedProjectFilter === 'all'
        ? projects.slice(0, 20) // Limit to 20 projects for performance
        : projects.filter(p => p.id.toString() === selectedProjectFilter)

      // Search in projects
      if (searchQuery.trim()) {
        projects.forEach(project => {
          const queryLower = searchQuery.toLowerCase()
          const nameLower = project.name.toLowerCase()
          const descLower = (project.description || '').toLowerCase()

          if (nameLower.includes(queryLower) || descLower.includes(queryLower)) {
            const relevance = nameLower.indexOf(queryLower) === 0 ? 3 :
                            nameLower.includes(queryLower) ? 2 : 1
            results.push({
              type: 'project',
              id: project.id,
              name: project.name,
              relevance,
              web_url: project.web_url
            })
          }
        })
      }

      // Search in pipelines
      for (const project of projectsToSearch) {
        try {
          const pipelines = await api.getPipelines(project.id)

          pipelines.forEach((pipeline: Pipeline) => {
            let matches = true

            // Status filter
            if (statusFilter !== 'all' && pipeline.status !== statusFilter) {
              matches = false
            }

            // Date filter
            if (createdAfter && new Date(pipeline.created_at) < new Date(createdAfter)) {
              matches = false
            }

            if (dateRange === 'custom' && customDateTo) {
              if (new Date(pipeline.created_at) > new Date(customDateTo)) {
                matches = false
              }
            }

            // User filter
            if (selectedUser && !pipeline.user?.username.toLowerCase().includes(selectedUser.toLowerCase())) {
              matches = false
            }

            // Search query
            if (searchQuery.trim()) {
              const queryLower = searchQuery.toLowerCase()
              const refLower = pipeline.ref.toLowerCase()
              const shaLower = pipeline.sha.toLowerCase()

              if (!refLower.includes(queryLower) && !shaLower.includes(queryLower)) {
                matches = false
              }
            }

            if (matches) {
              results.push({
                type: 'pipeline',
                id: pipeline.id,
                name: `Pipeline #${pipeline.id}`,
                status: pipeline.status,
                project: project.name,
                projectId: project.id,
                branch: pipeline.ref,
                author: pipeline.user?.username,
                created_at: pipeline.created_at,
                duration: pipeline.duration,
                relevance: 2,
                web_url: pipeline.web_url
              })
            }
          })
        } catch (error) {
          console.error(`Error fetching pipelines for project ${project.id}:`, error)
        }
      }

      // Search in jobs (limited to first 5 projects for performance)
      for (const project of projectsToSearch.slice(0, 5)) {
        try {
          const pipelines = await api.getPipelines(project.id)

          for (const pipeline of pipelines.slice(0, 3)) { // Limit to 3 recent pipelines per project
            try {
              const jobs = await api.getPipelineJobs(project.id, pipeline.id)

              jobs.forEach((job: Job) => {
                let matches = true

                // Status filter
                if (statusFilter !== 'all' && job.status !== statusFilter) {
                  matches = false
                }

                // Date filter
                if (createdAfter && new Date(job.created_at) < new Date(createdAfter)) {
                  matches = false
                }

                if (dateRange === 'custom' && customDateTo) {
                  if (new Date(job.created_at) > new Date(customDateTo)) {
                    matches = false
                  }
                }

                // User filter
                if (selectedUser && !job.user?.username.toLowerCase().includes(selectedUser.toLowerCase())) {
                  matches = false
                }

                // Search query
                if (searchQuery.trim()) {
                  const queryLower = searchQuery.toLowerCase()
                  const nameLower = job.name.toLowerCase()

                  if (!nameLower.includes(queryLower)) {
                    matches = false
                  }
                }

                if (matches) {
                  results.push({
                    type: 'job',
                    id: job.id,
                    name: job.name,
                    status: job.status,
                    project: project.name,
                    projectId: project.id,
                    branch: pipeline.ref,
                    author: job.user?.username,
                    created_at: job.created_at,
                    duration: job.duration,
                    relevance: 1,
                    web_url: job.web_url
                  })
                }
              })
            } catch (error) {
              console.error(`Error fetching jobs for pipeline ${pipeline.id}:`, error)
            }
          }
        } catch (error) {
          console.error(`Error fetching pipelines for jobs in project ${project.id}:`, error)
        }
      }

      // Sort by relevance and date
      results.sort((a, b) => {
        if (a.relevance !== b.relevance) {
          return b.relevance - a.relevance
        }
        if (a.created_at && b.created_at) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        }
        return 0
      })

      setSearchResults(results)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsSearching(false)
    }
  }

  const handleSaveFilter = () => {
    if (!filterName.trim()) return

    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name: filterName,
      searchQuery,
      status: statusFilter,
      dateRange,
      customDateFrom,
      customDateTo,
      selectedProject: selectedProjectFilter,
      selectedUser
    }

    const updated = [...savedFilters, newFilter]
    setSavedFilters(updated)
    localStorage.setItem('gitlab-saved-filters', JSON.stringify(updated))
    setFilterName('')
    setShowSaveDialog(false)
  }

  const handleLoadFilter = (filter: SavedFilter) => {
    setSearchQuery(filter.searchQuery)
    setStatusFilter(filter.status)
    setDateRange(filter.dateRange)
    setCustomDateFrom(filter.customDateFrom)
    setCustomDateTo(filter.customDateTo)
    setSelectedProjectFilter(filter.selectedProject)
    setSelectedUser(filter.selectedUser)
  }

  const handleDeleteFilter = (id: string) => {
    const updated = savedFilters.filter(f => f.id !== id)
    setSavedFilters(updated)
    localStorage.setItem('gitlab-saved-filters', JSON.stringify(updated))
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      default:
        return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return 'N/A'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const handleResultClick = async (result: SearchResult) => {
    // Navigate to appropriate tab and set the selected item
    if (result.type === 'project') {
      const project = projects.find(p => p.id === result.id)
      if (project) {
        setStoreProject(project)
        onNavigate('projects')
      }
    } else if (result.type === 'pipeline' && result.projectId) {
      try {
        const api = getGitLabAPI(gitlabUrl, gitlabToken)
        const pipeline = await api.getPipeline(result.projectId, result.id)
        setSelectedPipeline(pipeline)
        onNavigate('pipelines')
      } catch (error) {
        console.error('Error fetching pipeline details:', error)
      }
    } else if (result.type === 'job') {
      // For jobs, open in GitLab since we don't have a dedicated jobs tab
      if (result.web_url) {
        window.open(result.web_url, '_blank')
      }
    }
  }

  const handleViewDetails = (result: SearchResult) => {
    setSelectedResult(result)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Global Search</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Search across all projects, pipelines, and jobs
          </p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Filter className="w-4 h-4" />
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search projects, pipelines, jobs..."
            className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSearching ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              Search
            </>
          )}
        </button>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Advanced Filters</h3>
            <button
              onClick={() => setShowSaveDialog(true)}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Filter
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="all">All Statuses</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
                <option value="pending">Pending</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>

            {/* Date Range Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Date Range
              </label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="all">All Time</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {/* Project Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Project
              </label>
              <select
                value={selectedProjectFilter}
                onChange={(e) => setSelectedProjectFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="all">All Projects</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id.toString()}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* User Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                User/Author
              </label>
              <input
                type="text"
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                placeholder="Username..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Custom Date Range */}
          {dateRange === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  From Date
                </label>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  To Date
                </label>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Saved Filters */}
      {savedFilters.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Saved Filters</h3>
          <div className="flex flex-wrap gap-2">
            {savedFilters.map(filter => (
              <div
                key={filter.id}
                className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2 group"
              >
                <button
                  onClick={() => handleLoadFilter(filter)}
                  className="text-sm text-blue-700 dark:text-blue-300 hover:underline"
                >
                  {filter.name}
                </button>
                <button
                  onClick={() => handleDeleteFilter(filter.id)}
                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result Detail Modal */}
      {selectedResult && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded uppercase font-medium">
                    {selectedResult.type}
                  </span>
                  {selectedResult.status && (
                    <div className="flex items-center gap-1">
                      {getStatusIcon(selectedResult.status)}
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {selectedResult.status}
                      </span>
                    </div>
                  )}
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {selectedResult.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedResult(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {selectedResult.project && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Project</p>
                  <p className="text-lg text-gray-900 dark:text-white">{selectedResult.project}</p>
                </div>
              )}
              {selectedResult.branch && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Branch</p>
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4" />
                    <p className="text-lg text-gray-900 dark:text-white">{selectedResult.branch}</p>
                  </div>
                </div>
              )}
              {selectedResult.author && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Author</p>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <p className="text-lg text-gray-900 dark:text-white">{selectedResult.author}</p>
                  </div>
                </div>
              )}
              {selectedResult.created_at && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <p className="text-lg text-gray-900 dark:text-white">
                      {new Date(selectedResult.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
              {selectedResult.duration !== undefined && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Duration</p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <p className="text-lg text-gray-900 dark:text-white">
                      {formatDuration(selectedResult.duration)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setSelectedResult(null)
                  handleResultClick(selectedResult)
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                View in Dashboard
              </button>
              {selectedResult.web_url && (
                <button
                  onClick={() => window.open(selectedResult.web_url, '_blank')}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in GitLab
                </button>
              )}
              <button
                onClick={() => setSelectedResult(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Filter Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Save Filter</h3>
            <input
              type="text"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveFilter()}
              placeholder="Filter name..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={handleSaveFilter}
                disabled={!filterName.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Results */}
      <div className="space-y-3">
        {isSearching ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : searchResults.length > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Found {searchResults.length} results
              </p>
            </div>
            {searchResults.map((result, index) => (
              <div
                key={`${result.type}-${result.id}-${index}`}
                onClick={() => handleResultClick(result)}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded uppercase font-medium">
                        {result.type}
                      </span>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {result.name}
                      </h3>
                      {result.status && (
                        <div className="flex items-center gap-1">
                          {getStatusIcon(result.status)}
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {result.status}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      {result.project && (
                        <div className="flex items-center gap-1">
                          <GitBranch className="w-4 h-4" />
                          {result.project}
                        </div>
                      )}
                      {result.branch && (
                        <div className="flex items-center gap-1">
                          <GitBranch className="w-4 h-4" />
                          {result.branch}
                        </div>
                      )}
                      {result.author && (
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {result.author}
                        </div>
                      )}
                      {result.created_at && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(result.created_at).toLocaleString()}
                        </div>
                      )}
                      {result.duration !== undefined && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatDuration(result.duration)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleViewDetails(result)
                      }}
                      className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 flex items-center gap-2"
                      title="View details"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : searchQuery || statusFilter !== 'all' || dateRange !== 'all' ? (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400">No results found</p>
          </div>
        ) : (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400">
              Start searching or apply filters to find projects, pipelines, and jobs
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
