'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { ProductIcon } from '@/components/ui/product-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { WORK_ITEM_TYPES } from '@/lib/work-items'
import type { ProjectOption } from './types'

type Mapping = {
  id: string
  instanceUrl: string
  gitLabProjectId: string
  projectId: string
  approvedLabelMap: Record<string, string>
  firstSyncApprovedAt: string | null
  project: { id: string; name: string; company: { name: string; displayName: string | null } }
}

type ResultItem = {
  outcome: 'created' | 'updated' | 'skipped' | 'failed'
  issueId: string
  iid: string
  title: string
  sourceUrl: string
  workItemId: string | null
  reason?: string
  warnings?: string[]
  error?: { code: string; message: string; retryable: boolean }
}

type SyncResult = {
  mappingId: string
  counts: { created: number; updated: number; skipped: number; failed: number }
  results: ResultItem[]
  runError?: { code: string; message: string; retryable: boolean; nextPage: string | null }
}

type LabelRow = { id: number; label: string; type: string }

async function responseBody(response: Response) {
  try { return await response.json() as Record<string, unknown> } catch { return {} }
}

function messageFrom(data: Record<string, unknown>, fallback: string) {
  const error = data.error
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message
  return fallback
}

function countLabel(counts: SyncResult['counts']) {
  return `สร้าง ${counts.created} · อัปเดต ${counts.updated} · ข้าม ${counts.skipped} · ล้มเหลว ${counts.failed}`
}

function reasonLabel(reason: string | undefined) {
  if (reason === 'created_from_gitlab') return 'นำเข้าจาก GitLab'
  if (reason === 'source_fields_changed') return 'ข้อมูลจาก GitLab เปลี่ยนแปลง'
  if (reason === 'stale_source') return 'ข้ามข้อมูลเก่ากว่าในระบบ'
  if (reason === 'no_changes') return 'ไม่มีการเปลี่ยนแปลง'
  return reason?.replaceAll('_', ' ')
}

function warningLabel(warning: string) {
  const prefix = 'Unmapped GitLab label: '
  return warning.startsWith(prefix) ? `ไม่พบ mapping สำหรับ GitLab label: ${warning.slice(prefix.length)}` : warning
}

function errorLabel(code: string, message: string) {
  const messages: Record<string, string> = {
    INVALID_REMOTE_ISSUE: 'ข้อมูล Issue จาก GitLab ไม่ถูกต้อง',
    SOURCE_IDENTITY_CONFLICT: 'GitLab Issue นี้เชื่อมกับ Work Item อื่นอยู่',
    MAPPING_CHANGED: 'Project mapping เปลี่ยนระหว่าง sync กรุณาโหลดแล้วลองอีกครั้ง',
    PERSISTENCE_CONFLICT: 'ข้อมูลเปลี่ยนระหว่าง sync กรุณาลองอีกครั้ง',
    PERSISTENCE_FAILED: 'บันทึก Work Item ไม่สำเร็จ',
    RATE_LIMITED: 'GitLab จำกัดจำนวนคำขอ กรุณาลองใหม่ภายหลัง',
    PROVIDER_UNAVAILABLE: 'เชื่อมต่อ GitLab ไม่สำเร็จ',
  }
  return messages[code] ?? message
}

export function GitLabImportPanel({ projects, onSynced }: Readonly<{
  projects: ProjectOption[]
  onSynced: () => Promise<void>
}>) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [firstSyncId, setFirstSyncId] = useState<string | null>(null)
  const [gitLabProjectId, setGitLabProjectId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [labelRows, setLabelRows] = useState<LabelRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const labelRowId = useRef(0)

  const nextLabelRowId = () => {
    labelRowId.current += 1
    return labelRowId.current
  }

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [statusResponse, mappingsResponse] = await Promise.all([
        fetch('/api/integrations/gitlab/status', { cache: 'no-store' }),
        fetch('/api/integrations/gitlab/projects', { cache: 'no-store' }),
      ])
      const [statusData, mappingsData] = await Promise.all([responseBody(statusResponse), responseBody(mappingsResponse)])
      if (!statusResponse.ok) throw new Error(messageFrom(statusData, 'โหลดสถานะ GitLab ไม่สำเร็จ'))
      if (!mappingsResponse.ok) throw new Error(messageFrom(mappingsData, 'โหลด mappings ของ GitLab ไม่สำเร็จ'))
      setConfigured(statusData.configured === true)
      setMappings(Array.isArray(mappingsData.mappings) ? mappingsData.mappings as Mapping[] : [])
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'โหลดการเชื่อมต่อ GitLab ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload().catch(() => setError('โหลดการเชื่อมต่อ GitLab ไม่สำเร็จ'))
  }, [reload])

  const resetForm = () => {
    setEditingId(null)
    setGitLabProjectId('')
    setProjectId('')
    setLabelRows([])
  }

  const startEdit = (mapping: Mapping) => {
    setEditingId(mapping.id)
    setGitLabProjectId(mapping.gitLabProjectId)
    setProjectId(mapping.projectId)
    setLabelRows(Object.entries(mapping.approvedLabelMap ?? {}).map(([label, type]) => ({ id: nextLabelRowId(), label, type })))
    setError(null)
  }

  const saveMapping = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Preserve special GitLab labels such as "__proto__" as ordinary mapping keys.
    const normalizedLabels: Record<string, string> = Object.create(null)
    for (const row of labelRows) {
      const label = row.label.trim()
      if (!label || label in normalizedLabels || !row.type) {
        setError('กรุณาระบุ GitLab label ที่ไม่ซ้ำและเลือก Work Item type ทุกแถว')
        return
      }
      normalizedLabels[label] = row.type
    }
    if (!projectId) {
      setError('กรุณาเลือก PMS Project')
      return
    }
    if (!editingId && !/^[1-9]\d*$/.test(gitLabProjectId)) {
      setError('GitLab Project ID ต้องเป็นเลขจำนวนเต็มบวก')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(editingId ? `/api/integrations/gitlab/projects/${editingId}` : '/api/integrations/gitlab/projects', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId
          ? { projectId, approvedLabelMap: normalizedLabels }
          : { gitLabProjectId: gitLabProjectId.trim(), projectId, approvedLabelMap: normalizedLabels }),
      })
      const data = await responseBody(response)
      if (!response.ok) throw new Error(messageFrom(data, 'บันทึก GitLab mapping ไม่สำเร็จ'))
      resetForm()
      await reload()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'บันทึก GitLab mapping ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const sync = async (mappingId: string, approveFirstSync = false) => {
    setSyncingId(mappingId)
    setFirstSyncId(null)
    setError(null)
    try {
      const response = await fetch('/api/integrations/gitlab/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappingId, ...(approveFirstSync ? { approveFirstSync: true } : {}) }),
      })
      const data = await responseBody(response)
      if (!response.ok) throw new Error(messageFrom(data, 'ซิงก์ GitLab ไม่สำเร็จ'))
      const result = data as unknown as SyncResult
      setSyncResult(result)
      await reload()
      if (result.counts.created + result.counts.updated > 0) await onSynced()
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'ซิงก์ GitLab ไม่สำเร็จ')
    } finally {
      setSyncingId(null)
    }
  }

  const removeMapping = async () => {
    if (!deleteId) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/integrations/gitlab/projects/${deleteId}`, { method: 'DELETE' })
      const data = await responseBody(response)
      if (!response.ok) throw new Error(messageFrom(data, 'ลบ GitLab mapping ไม่สำเร็จ'))
      setDeleteId(null)
      if (syncResult?.mappingId === deleteId) setSyncResult(null)
      await reload()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'ลบ GitLab mapping ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="gitlab-import-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="gitlab-import-title" className="type-section content-wrap">นำเข้า GitLab Issue</h2>
          <p className="mt-1 text-sm text-muted-foreground">นำเข้าด้วยตนเองทางเดียว ข้อมูล Work Item ที่จัดการใน PMS และ Daily Work จะคงเดิม</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
          <ProductIcon icon={RefreshCw} category="action" intent={loading ? 'refresh' : 'idle'} className="mr-2" /> รีเฟรช
        </Button>
      </div>

      {configured === false && (
        <output className="block rounded-md border border-warning/40 bg-warning-subtle text-warning px-3 py-2 text-sm" aria-live="polite">
          ยังไม่ได้ตั้งค่า GitLab ฝั่ง server (GITLAB_BASE_URL และ GITLAB_TOKEN) จึงยังสร้าง mapping หรือ sync ไม่ได้
        </output>
      )}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {loading && <output className="text-sm text-muted-foreground" aria-live="polite">กำลังโหลด GitLab mappings...</output>}

      {!loading && (
        <div className="space-y-3">
          {mappings.length === 0
            ? <p className="text-sm text-muted-foreground">ยังไม่มี mapping ของ GitLab Project</p>
            : mappings.map((mapping) => (
              <div key={mapping.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/60 p-3">
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-medium">GitLab Project {mapping.gitLabProjectId} → PMS Project {mapping.project.name}</p>
                  <p className="break-all text-xs text-muted-foreground">{mapping.instanceUrl}</p>
                  <p className="text-xs text-muted-foreground">
                    {Object.keys(mapping.approvedLabelMap ?? {}).length} label mappings · {mapping.firstSyncApprovedAt ? 'อนุมัติ sync แรกแล้ว' : 'ต้องอนุมัติ sync แรก'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={configured !== true || Boolean(syncingId) || saving} onClick={() => {
                    if (!mapping.firstSyncApprovedAt) setFirstSyncId(mapping.id)
                    else sync(mapping.id)
                  }}>
                    {syncingId === mapping.id ? 'กำลังซิงก์…' : 'ซิงก์ Issues'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={saving || Boolean(syncingId)} onClick={() => startEdit(mapping)}>แก้ไข mapping</Button>
                  <Button type="button" size="icon" variant="ghost" aria-label={`ลบ mapping ของ GitLab Project ${mapping.gitLabProjectId}`} disabled={saving || Boolean(syncingId)} onClick={() => setDeleteId(mapping.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
        </div>
      )}

      <form className="space-y-3 rounded-lg border bg-muted/20 p-3" onSubmit={saveMapping}>
        <h3 className="text-sm font-semibold">{editingId ? 'แก้ไข Project mapping' : 'เพิ่ม Project mapping'}</h3>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {!editingId && (
            <label className="min-w-0 space-y-1 text-sm">
              <span>GitLab Project ID</span>
              <Input inputMode="numeric" pattern="[1-9][0-9]*" value={gitLabProjectId} onChange={(event) => setGitLabProjectId(event.target.value)} disabled={configured !== true || saving} required />
            </label>
          )}
          <label className="min-w-0 space-y-1 text-sm">
            <span id="gitlab-pms-project-label">PMS Project</span>
            <Select value={projectId} onValueChange={setProjectId} disabled={saving || projects.length === 0}>
              <SelectTrigger id="gitlab-pms-project" aria-labelledby="gitlab-pms-project-label" aria-required="true" className="w-full min-w-0">
                <SelectValue placeholder="เลือก Project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-medium">กำหนด label mapping ที่อนุมัติ</h4>
              <p className="text-xs text-muted-foreground">จับคู่ GitLab label แบบตรงตัว → Work Item type ที่รองรับ</p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={saving || labelRows.length >= 100} onClick={() => setLabelRows((rows) => [...rows, { id: nextLabelRowId(), label: '', type: WORK_ITEM_TYPES[0] }])}>
              <Plus className="mr-1 h-4 w-4" /> เพิ่ม label
            </Button>
          </div>
          {labelRows.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่ได้จับคู่ label; Issues ที่มี label อื่นจะยังถูกนำเข้า พร้อมคำเตือน</p>}
          {labelRows.map((row, index) => (
            <div key={row.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(7rem,0.7fr)_auto] gap-2">
              <Input aria-label={`GitLab label ${index + 1}`} value={row.label} maxLength={255} onChange={(event) => setLabelRows((rows) => rows.map((entry, entryIndex) => entryIndex === index ? { ...entry, label: event.target.value } : entry))} disabled={saving} placeholder="GitLab label" />
              <Select value={row.type} onValueChange={(value) => setLabelRows((rows) => rows.map((entry, entryIndex) => entryIndex === index ? { ...entry, type: value } : entry))} disabled={saving}>
                <SelectTrigger aria-label={`Work Item type ของ label ${index + 1}`} className="h-10 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_ITEM_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="icon" aria-label={`ลบ GitLab label mapping ${index + 1}`} disabled={saving} onClick={() => setLabelRows((rows) => rows.filter((_, entryIndex) => entryIndex !== index))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || configured !== true || loading}>{saving ? 'กำลังบันทึก…' : editingId ? 'บันทึก mapping' : 'เพิ่ม mapping'}</Button>
          {editingId && <Button type="button" variant="outline" disabled={saving} onClick={resetForm}>ยกเลิก</Button>}
        </div>
      </form>

      {syncResult && (
        <section className="space-y-3 rounded-lg border bg-background/60 p-3" aria-live="polite" aria-label="ผลการซิงก์ GitLab">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">ผลการซิงก์</h3>
            <p className="text-sm tabular-nums">{countLabel(syncResult.counts)}</p>
          </div>
          {syncResult.runError && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-danger" role="alert">
              <span>{errorLabel(syncResult.runError.code, syncResult.runError.message)}</span>
              {syncResult.runError.retryable && (
                <Button type="button" size="sm" variant="outline" disabled={Boolean(syncingId)} onClick={() => sync(syncResult.mappingId)}>
                  ลอง sync อีกครั้ง
                </Button>
              )}
            </div>
          )}
          {(['created', 'updated', 'skipped', 'failed'] as const).map((outcome) => {
            const items = syncResult.results.filter((result) => result.outcome === outcome)
            if (items.length === 0) return null
            return (
              <div key={outcome} className="space-y-1">
                <h4 className="text-sm font-medium">{{ created: 'สร้างแล้ว', updated: 'อัปเดตแล้ว', skipped: 'ข้าม', failed: 'ล้มเหลว' }[outcome]} ({items.length})</h4>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                  {items.map((item) => (
                    <li key={`${item.issueId}-${item.outcome}`} className="break-words">
                      <span>{item.title}</span>
                      {item.sourceUrl && <a className="ml-2 inline-flex items-center gap-1 text-link underline-offset-4 hover:underline" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">#{item.iid}<ExternalLink className="h-3 w-3" /></a>}
                      {(item.error || item.reason) && <span className="ml-2 text-muted-foreground">{item.error ? errorLabel(item.error.code, item.error.message) : reasonLabel(item.reason)}</span>}
                      {item.warnings?.map((warning) => <span className="ml-2 block text-warning" key={warning}>{warningLabel(warning)}</span>)}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </section>
      )}

      <AlertDialog open={firstSyncId !== null} onOpenChange={(open) => { if (!open) setFirstSyncId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning" />อนุมัติการซิงก์ GitLab ครั้งแรก</AlertDialogTitle>
            <AlertDialogDescription>
              ระบบจะสร้าง Work Item สำหรับ Issue ที่ยังไม่มี GitLab identity ตรงกัน โดย GitLab จะเป็นแหล่งข้อมูลของ title, description, status, mapped types, due date และ source URL ส่วน role, priority, work date, owner และ Daily Work ยังคงจัดการใน PMS
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => {
              event.preventDefault()
              if (firstSyncId) return sync(firstSyncId, true)
            }}>อนุมัติและซิงก์</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open && !saving) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบ GitLab Project mapping หรือไม่?</AlertDialogTitle>
            <AlertDialogDescription>
              การลบ mapping จะเก็บ Work Item ที่นำเข้า, source reference และ Daily Work ไว้ และหยุด sync ผ่าน mapping นี้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction disabled={saving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => {
              event.preventDefault()
              return removeMapping()
            }}>{saving ? 'กำลังลบ…' : 'ลบ mapping'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
