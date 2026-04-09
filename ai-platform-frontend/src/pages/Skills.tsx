import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { SkillBuilderModal, type GeneratedSkill } from '../components/SkillBuilderModal'

// Types matching backend schema
interface SkillSummary {
  id: string
  name: string
  description: string | null
  actions: string[]
  is_default: boolean
  updated_at: string
}

interface SkillFull extends SkillSummary {
  content: string
  user_id: string | null
  created_at: string
}

const ALL_ACTIONS = [
  { id: 'image', label: 'Image Generation' },
  { id: 'text', label: 'Text / Captions' },
  { id: 'video', label: 'Video' },
  { id: 'frames', label: 'Video Frames' },
] as const

// ─── Helpers ────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ─── Sidebar ────────────────────────────────────────────────

interface SidebarProps {
  skill: SkillFull | null
  isNew: boolean
  open: boolean
  saving: boolean
  initialData?: { name: string; description: string; content: string; actions: string[] } | null
  onClose: () => void
  onSave: (data: { name: string; description: string; content: string; actions: string[] }) => void
  onDelete: () => void
}

function SkillSidebar({ skill, isNew, open, saving, initialData, onClose, onSave, onDelete }: SidebarProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [actions, setActions] = useState<string[]>([])

  const readOnly = !isNew && !!skill?.is_default

  useEffect(() => {
    if (isNew && initialData) {
      setName(initialData.name)
      setDescription(initialData.description)
      setContent(initialData.content)
      setActions(initialData.actions)
    } else if (isNew) {
      setName('')
      setDescription('')
      setContent('')
      setActions([])
    } else if (skill) {
      setName(skill.name)
      setDescription(skill.description || '')
      setContent(skill.content || '')
      setActions(skill.actions || [])
    }
  }, [skill, isNew, initialData])

  const toggleAction = (actionId: string) => {
    setActions((prev) =>
      prev.includes(actionId) ? prev.filter((a) => a !== actionId) : [...prev, actionId]
    )
  }

  const handleSave = () => {
    if (!name.trim() || !content.trim()) return
    onSave({ name: name.trim(), description: description.trim(), content: content.trim(), actions })
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            {isNew ? 'New Skill' : readOnly ? 'Default Skill' : 'Edit Skill'}
            {readOnly && (
              <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                Read-only
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              placeholder="e.g. blockchain-basics"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={readOnly}
              placeholder="Short description of what this skill provides"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Available Actions</label>
            <div className="flex flex-wrap gap-2">
              {ALL_ACTIONS.map((a) => {
                const checked = actions.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => !readOnly && toggleAction(a.id)}
                    disabled={readOnly}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:cursor-not-allowed ${
                      checked
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                    }`}
                  >
                    {a.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-1">Content (Markdown) *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={readOnly}
              placeholder={"# Skill Knowledge\n\nWrite the skill content in markdown..."}
              className="w-full flex-1 min-h-[400px] rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center gap-3">
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={saving || !name.trim() || !content.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : isNew ? 'Create' : 'Save Changes'}
            </button>
          )}

          {!isNew && !readOnly && (
            <button
              onClick={onDelete}
              disabled={saving}
              className="px-4 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              Delete
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors ml-auto"
          >
            {readOnly ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Main Page ──────────────────────────────────────────────

export default function Skills() {
  const { session } = useAuth()
  const token = session?.access_token

  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedSkill, setSelectedSkill] = useState<SkillFull | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)

  // Skill builder state
  const [showBuilder, setShowBuilder] = useState(false)
  const [generatedSkill, setGeneratedSkill] = useState<GeneratedSkill | null>(null)

  // Fetch skills list
  const fetchSkills = useCallback(async () => {
    if (!token) return
    try {
      setError(null)
      const data = await api<{ skills: SkillSummary[] }>('/skills', { token })
      setSkills(data.skills)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchSkills()
  }, [fetchSkills])

  // Open sidebar for new skill
  const handleNew = () => {
    setGeneratedSkill(null)
    setSelectedSkill(null)
    setIsNew(true)
    setSidebarOpen(true)
  }

  // Handle builder completion — open sidebar pre-populated
  const handleBuilderComplete = (data: GeneratedSkill) => {
    setShowBuilder(false)
    setGeneratedSkill(data)
    setSelectedSkill(null)
    setIsNew(true)
    setSidebarOpen(true)
  }

  // Open sidebar for existing skill (fetches full content)
  const handleCardClick = async (skill: SkillSummary) => {
    if (!token) return
    try {
      const data = await api<{ skill: SkillFull }>(`/skills/${skill.id}`, { token })
      setSelectedSkill(data.skill)
      setIsNew(false)
      setSidebarOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skill')
    }
  }

  // Close sidebar
  const handleClose = () => {
    setSidebarOpen(false)
    setTimeout(() => {
      setSelectedSkill(null)
      setIsNew(false)
    }, 300) // wait for slide-out animation
  }

  // Save (create or update)
  const handleSave = async (data: { name: string; description: string; content: string; actions: string[] }) => {
    if (!token) return
    setSaving(true)
    try {
      if (isNew) {
        await api('/skills', { method: 'POST', body: data, token })
      } else if (selectedSkill) {
        await api(`/skills/${selectedSkill.id}`, { method: 'PUT', body: data, token })
      }
      handleClose()
      await fetchSkills()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save skill')
    } finally {
      setSaving(false)
    }
  }

  // Delete
  const handleDelete = async () => {
    if (!selectedSkill || !token) return
    if (!window.confirm(`Delete "${selectedSkill.name}"? This cannot be undone.`)) return
    setSaving(true)
    try {
      await api(`/skills/${selectedSkill.id}`, { method: 'DELETE', token })
      handleClose()
      await fetchSkills()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete skill')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Skills</h1>
          <p className="mt-1 text-gray-500 text-sm">Manage your AI skills and capabilities.</p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">×</button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">Loading skills...</div>
      ) : (
        /* Cards grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map((skill) => (
            <button
              key={skill.id}
              onClick={() => handleCardClick(skill)}
              className={`text-left p-5 rounded-xl border transition-all group ${
                skill.is_default
                  ? 'border-amber-300 bg-amber-50/50 hover:border-amber-400 hover:shadow-md'
                  : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3
                  className={`font-semibold text-gray-900 transition-colors truncate ${
                    skill.is_default ? 'group-hover:text-amber-700' : 'group-hover:text-indigo-600'
                  }`}
                >
                  {skill.is_default && <span className="mr-1">★</span>}
                  {skill.name}
                </h3>
                {skill.is_default && (
                  <span className="shrink-0 text-[9px] font-semibold bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                    Default
                  </span>
                )}
              </div>
              {skill.description && (
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">{skill.description}</p>
              )}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {skill.actions.map((a) => (
                  <span
                    key={a}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      skill.is_default
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-indigo-50 text-indigo-600'
                    }`}
                  >
                    {a}
                  </span>
                ))}
                <span className="text-xs text-gray-400 ml-auto">{timeAgo(skill.updated_at)}</span>
              </div>
            </button>
          ))}

          {/* Generate with AI card */}
          <button
            onClick={() => setShowBuilder(true)}
            className="p-5 rounded-xl border-2 border-dashed border-purple-300 hover:border-purple-400 hover:bg-purple-50/50 transition-all flex flex-col items-center justify-center min-h-[120px] group"
          >
            <span className="text-2xl text-purple-300 group-hover:text-purple-500 transition-colors">&#9733;</span>
            <span className="mt-1 text-sm text-purple-400 group-hover:text-purple-600 font-medium transition-colors">Generate with AI</span>
          </button>

          {/* New skill card */}
          <button
            onClick={handleNew}
            className="p-5 rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all flex flex-col items-center justify-center min-h-[120px] group"
          >
            <span className="text-3xl text-gray-300 group-hover:text-indigo-400 transition-colors">+</span>
            <span className="mt-1 text-sm text-gray-400 group-hover:text-indigo-500 transition-colors">New Skill</span>
          </button>
        </div>
      )}

      {/* Sidebar */}
      <SkillSidebar
        skill={selectedSkill}
        isNew={isNew}
        open={sidebarOpen}
        saving={saving}
        initialData={generatedSkill}
        onClose={handleClose}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {/* Skill Builder Modal */}
      <SkillBuilderModal
        open={showBuilder}
        onClose={() => setShowBuilder(false)}
        onComplete={handleBuilderComplete}
      />
    </div>
  )
}
