'use client'

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { WORK_ITEM_TYPES } from '@/lib/work-items'
import { IssueSyncProgressPanel, type IssueSyncProgressState } from './issue-sync-progress'
import { streamIssueSync } from '@/lib/integrations/issue-sync-stream'
import { IssueSyncReviewDialog } from './issue-sync-review-dialog'
import type { IssueReviewCandidate, IssueReviewDecision, IssueReviewGroup } from '@/lib/integrations/issue-review'

type Config = { id: string; provider: 'gitlab' | 'github'; instanceUrl: string; sourceProject: string; externalProjectId: string; assignees: string[]; tokenEnvVar: string | null; enabled: boolean; approvedLabelMap: Record<string, string>; firstSyncApproved: boolean }
type Run = { id: string; status: string; startedAt: string; finishedAt: string | null; configSnapshot: { sourceProject: string; assignees: string[] }; counts: { created: number; updated: number; skipped: number; failed: number; pending?: number }; runError: { code: string; message: string } | null; results: Array<{ issueId: string | null; candidates?: IssueReviewCandidate[]; outcome: string; title: string; sourceUrl: string | null; reason: string; warnings: string[] }> }
type LegacyMapping = { id: string; provider: string; externalProjectId: string; instanceUrl: string }

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...options })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error?.message || 'คำขอไม่สำเร็จ')
  return payload as T
}
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const providerName = (provider: string) => provider === 'github' ? 'GitHub' : 'GitLab'
const reasonLabel: Record<string, string> = { confirmation_required: 'รอยืนยันว่าเป็น Issue เดียวกันหรือคนละ Issue', linked_existing_work_item: 'จับคู่และเติมข้อมูลใน Work Item เดิม', out_of_scope: 'อยู่นอก assignee filter — เก็บข้อมูลเดิมและหยุดอัปเดต', assignee_not_matched: 'Assignee ไม่ตรง filter', no_changes: 'ข้อมูลไม่เปลี่ยน', stale_source: 'ข้อมูลต้นทางเก่ากว่าที่บันทึก', pull_request_excluded: 'ข้าม Pull Request', created_from_source: 'สร้างจากต้นทาง', source_fields_changed: 'อัปเดตจากต้นทาง' }

export function ProjectIssueSync({ projectId, onSynced }: Readonly<{ projectId: string; onSynced: () => void }>) {
  const base = `/api/projects/${projectId}/issue-sync`
  const fieldId = useId()
  const [syncProgress, setSyncProgress] = useState<IssueSyncProgressState | null>(null)
  const syncGeneration = useRef(0)
  const syncAbort = useRef<AbortController | null>(null)
  const [configs, setConfigs] = useState<Config[]>([])
  const [legacy, setLegacy] = useState<LegacyMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Config | null>(null)
  const [provider, setProvider] = useState<'gitlab' | 'github'>('gitlab')
  const [instanceUrl, setInstanceUrl] = useState('https://gitlab.com')
  const [tokenEnvVar, setTokenEnvVar] = useState('GITLAB_TOKEN')
  const [sourceProject, setSourceProject] = useState('')
  const [assignees, setAssignees] = useState('')
  const [labels, setLabels] = useState<Array<{ label: string; type: string }>>([])
  const [reviewGroups, setReviewGroups] = useState<IssueReviewGroup[]>([])
  const [reviewError, setReviewError] = useState('')
  const [approval, setApproval] = useState<Config[] | null>(null)
  const [historyConfig, setHistoryConfig] = useState<string | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const historyRequest = useRef(0)

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    const payload = await api<{ configs: Config[]; legacyMappings: LegacyMapping[] }>(base)
    if (isCurrent()) { setConfigs(payload.configs); setLegacy(payload.legacyMappings) }
  }, [base])
  useEffect(() => { let active = true; const requests = historyRequest; const generation = syncGeneration; const abort = syncAbort; setLoading(true); setError(''); setReviewGroups([]); setReviewError(''); setSyncProgress(null); setBusy(false)
    load(() => active).catch((failure) => { if (active) setError(failure.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; requests.current++; generation.current++; abort.current?.abort() }
  }, [load])

  function openForm(config: Config | null) {
    setEditing(config); setProvider(config?.provider ?? 'gitlab'); setInstanceUrl(config?.instanceUrl ?? 'https://gitlab.com')
    setTokenEnvVar(config?.tokenEnvVar ?? (config?.provider === 'github' ? 'GITHUB_TOKEN' : 'GITLAB_TOKEN'))
    setSourceProject(config?.sourceProject ?? ''); setAssignees(config?.assignees.join(', ') ?? '')
    setLabels(Object.entries(config?.approvedLabelMap ?? {}).map(([label, type]) => ({ label, type })))
    setFormOpen(true); setError(''); setNotice('')
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const names = [...new Set(assignees.split(/[\s,]+/).filter(Boolean))]
      if (!names.length) throw new Error('กรุณาระบุ assignee อย่างน้อยหนึ่งคน')
      if (labels.some((row) => !row.label.trim()) || new Set(labels.map((row) => row.label)).size !== labels.length) throw new Error('Label ต้องไม่ว่างและไม่ซ้ำ')
      const common = { assignees: names, tokenEnvVar: tokenEnvVar.trim(), approvedLabelMap: Object.fromEntries(labels.map((row) => [row.label, row.type])) }
      if (editing) await api(`${base}/${editing.id}`, json('PATCH', common))
      else {
        await api(base, json('POST', { ...common, provider, instanceUrl: instanceUrl.trim(), sourceProject: sourceProject.trim() }))
      }
      setFormOpen(false); await load(); setNotice('บันทึก config แล้ว')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'บันทึกไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  async function history(configId: string, before?: string) {
    const requestId = ++historyRequest.current
    setHistoryConfig(configId); setHistoryLoading(true)
    if (!before) { setRuns([]); setNextBefore(null) }
    try {
      const payload = await api<{ runs: Run[]; nextBefore: string | null }>(`${base}/${configId}/runs${before ? `?before=${before}` : ''}`)
      if (requestId !== historyRequest.current) return
      setRuns((previous) => before ? [...previous, ...payload.runs] : payload.runs); setNextBefore(payload.nextBefore)
    } catch (failure) { if (requestId === historyRequest.current) setError(failure instanceof Error ? failure.message : 'โหลดประวัติไม่สำเร็จ') }
    finally { if (requestId === historyRequest.current) setHistoryLoading(false) }
  }

  function pendingGroup(configId: string, sourceProject: string, run: Run): IssueReviewGroup | null {
    const issues = run.results.flatMap((result) => result.outcome === 'pending' && result.issueId && result.sourceUrl && result.candidates?.length
      ? [{ issueId: result.issueId, title: result.title, sourceUrl: result.sourceUrl, candidates: result.candidates }] : [])
    return issues.length ? { configId, sourceProject, runId: run.id, issues } : null
  }

  async function sync(selected: Config[], approve = false) {
    if (!selected.length) return
    if (selected.some((config) => !config.firstSyncApproved) && !approve) { setApproval(selected); return }
    const generation = ++syncGeneration.current
    const controller = new AbortController()
    syncAbort.current = controller
    setBusy(true); setError(''); setNotice(''); setReviewError('')
    const pending: IssueReviewGroup[] = []
    let hadFailures = false, hadPending = false, allFailed = true
    try {
      const messages: string[] = []
      for (const [index, config] of selected.entries()) {
        setSyncProgress({ sourceProject: config.sourceProject, sourceIndex: index + 1, totalSources: selected.length,
          completedSources: index, status: 'running', progress: { phase: 'connecting', processed: 0,
            counts: { created: 0, updated: 0, skipped: 0, failed: 0, pending: 0 } } })
        const run = await streamIssueSync<Run>(`${base}/${config.id}/sync`, approve, (progress) => {
          if (syncGeneration.current === generation) setSyncProgress((current) => current ? { ...current, progress } : current)
        }, controller.signal)
        if (syncGeneration.current !== generation) return
        const group = pendingGroup(config.id, config.sourceProject, run)
        if (group) pending.push(group)
        hadFailures ||= run.status === 'failed' || run.counts.failed > 0 || Boolean(run.runError)
        allFailed &&= run.status === 'failed'
        hadPending ||= Boolean(group)
        setSyncProgress((current) => current ? { ...current, completedSources: index + 1,
          status: index + 1 < selected.length ? 'running' : hadFailures ? allFailed ? 'failed' : 'partial' : hadPending ? 'review' : 'success',
          progress: { phase: 'complete', processed: run.results.length, counts: { ...run.counts, pending: run.counts.pending ?? 0 } } } : current)
        messages.push(`${config.sourceProject}: เพิ่ม ${run.counts.created} · อัปเดต ${run.counts.updated} · ข้าม ${run.counts.skipped} · ผิดพลาด ${run.counts.failed} · รอยืนยัน ${run.counts.pending ?? 0}${run.runError ? ` · ${run.runError.message}` : ''}`)
        setNotice(messages.join('\n'))
        await history(config.id)
        if (syncGeneration.current !== generation) return
        onSynced()
      }
    } catch (failure) {
      if (syncGeneration.current === generation) {
        setError(failure instanceof Error ? failure.message : 'Sync ไม่สำเร็จ')
        setSyncProgress((current) => current ? { ...current, status: 'failed' } : current)
      }
    }
    finally {
      if (syncGeneration.current === generation) {
        if (pending.length) setReviewGroups(pending)
        await load(() => syncGeneration.current === generation).catch(() => { if (syncGeneration.current === generation) setError('โหลด config ล่าสุดไม่สำเร็จ กรุณาลองโหลดอีกครั้ง') })
        if (syncGeneration.current === generation) { setBusy(false); syncAbort.current = null }
      }
    }
  }

  async function confirmReviews(answers: Array<{ runId: string; decisions: IssueReviewDecision[] }>) {
    setBusy(true); setReviewError('')
    const completed = new Set<string>()
    try {
      for (const group of reviewGroups) {
        const answer = answers.find((entry) => entry.runId === group.runId)
        if (!answer) throw new Error('กรุณาเลือกคำตอบให้ครบทุกแหล่ง')
        await api(`${base}/${group.configId}/confirm`, json('POST', { runId: group.runId, decisions: answer.decisions }))
        completed.add(group.runId)
        onSynced()
        await history(group.configId)
      }
      setNotice('บันทึกคำยืนยันครบแล้ว: อัปเดตรายการเดิมหรือสร้างใหม่ตามที่เลือก')
    } catch (failure) { setReviewError(failure instanceof Error ? failure.message : 'ยืนยันไม่สำเร็จ') }
    finally {
      setReviewGroups((previous) => previous.filter((group) => !completed.has(group.runId)))
      setBusy(false)
    }
  }

  async function toggle(config: Config) {
    setBusy(true); setError('')
    try { await api(`${base}/${config.id}`, json('PATCH', { enabled: !config.enabled })); await load() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'เปลี่ยน config ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <Card id="integrations" className="min-w-0"><CardHeader className="gap-3"><div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><CardTitle>Integrations · Issue Sync</CardTitle><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={loading || busy} onClick={() => openForm(null)}>เพิ่มแหล่ง Issues</Button><Button type="button" disabled={loading || busy || !configs.some((config) => config.enabled)} onClick={() => sync(configs.filter((config) => config.enabled))}>{busy ? 'กำลังดำเนินการ…' : 'Sync ทั้ง Project'}</Button></div></div><p className="text-sm text-muted-foreground">ดึง GitHub / GitLab Issues เข้า Project นี้ เฉพาะ assignee ที่กำหนดอย่างน้อยหนึ่งคน รวม Open และ Closed</p></CardHeader>
    <CardContent className="min-w-0 space-y-4">
      {syncProgress && <IssueSyncProgressPanel state={syncProgress} />}
      {loading && <p role="status">กำลังโหลด Integrations…</p>}
      {error && !formOpen && <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-3 text-sm"><p>{error}</p><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setError(''); load().catch((failure) => setError(failure.message)) }}>โหลดอีกครั้ง</Button></div>}
      {notice && <p role="status" className="whitespace-pre-line rounded-lg border p-3 text-sm">{notice}</p>}
      {legacy.length > 0 && <div className="rounded-lg border border-warning/40 p-3 text-sm"><p>พบ mapping เดิมที่ยัง sync ไม่ได้ กรุณาเพิ่ม config พร้อม assignee โดยใช้ต้นทางเดิม ระบบจะเชื่อมประวัติเดิมให้</p><ul className="mt-2 list-inside list-disc">{legacy.map((mapping) => <li key={mapping.id} className="break-all">{providerName(mapping.provider)} · {mapping.instanceUrl} · Project ID {mapping.externalProjectId}</li>)}</ul></div>}
      {!loading && configs.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีแหล่ง Issues สำหรับ Project นี้</p>}
      {configs.map((config) => <section key={config.id} className="min-w-0 space-y-3 rounded-lg border p-4" aria-label={`${providerName(config.provider)} ${config.sourceProject}`}><div className="flex min-w-0 flex-wrap justify-between gap-3"><div className="min-w-0 space-y-1"><p className="break-all font-medium">{providerName(config.provider)} · {config.sourceProject}</p><p className="break-all text-xs text-muted-foreground">{config.instanceUrl} · Token env: {config.tokenEnvVar ?? 'ยังไม่กำหนด — แก้ไข config ก่อนเปิด sync'}</p><p className="break-words text-sm">Assignee: {config.assignees.join(', ')} · ตรงอย่างน้อยหนึ่งคน</p></div><Badge variant={config.enabled ? 'secondary' : 'outline'}>{config.enabled ? 'เปิดใช้งาน' : 'หยุด sync'}</Badge></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={busy || !config.enabled} onClick={() => sync([config])}>Sync Issues</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openForm(config)}>แก้ไข config</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => toggle(config)}>{config.enabled ? 'หยุด sync' : 'เปิด sync'}</Button><Button type="button" size="sm" variant="ghost" disabled={busy || historyLoading} onClick={() => history(config.id)}>ประวัติ sync</Button></div></section>)}

      {formOpen && <form onSubmit={save} className="space-y-4 rounded-lg border bg-muted/30 p-4"><h3 className="font-semibold">{editing ? 'แก้ไข config' : 'เพิ่มแหล่ง Issues'}</h3><div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="space-y-2"><label htmlFor={`${fieldId}-provider`} className="text-sm">Provider</label><Select value={provider} disabled={busy || Boolean(editing)} onValueChange={(value: 'gitlab' | 'github') => { setProvider(value); setInstanceUrl(value === 'github' ? 'https://github.com' : 'https://gitlab.com'); if (tokenEnvVar === 'GITLAB_TOKEN' || tokenEnvVar === 'GITHUB_TOKEN') setTokenEnvVar(value === 'github' ? 'GITHUB_TOKEN' : 'GITLAB_TOKEN') }}><SelectTrigger id={`${fieldId}-provider`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gitlab">GitLab</SelectItem><SelectItem value="github">GitHub</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><label htmlFor={`${fieldId}-instance`} className="text-sm">Instance URL</label><Input id={`${fieldId}-instance`} type="url" required maxLength={500} value={instanceUrl} onChange={(event) => setInstanceUrl(event.target.value)} disabled={busy || Boolean(editing) || provider === 'github'} placeholder="https://gitlab.example.com" /></div>
          <div className="space-y-2"><label htmlFor={`${fieldId}-source`} className="text-sm">{provider === 'github' ? 'GitHub owner/repository' : 'GitLab Project ID หรือ group/project'}</label><Input id={`${fieldId}-source`} required maxLength={500} value={sourceProject} onChange={(event) => setSourceProject(event.target.value)} disabled={busy || Boolean(editing)} placeholder="group/project" /></div>
          <div className="space-y-2"><label htmlFor={`${fieldId}-token-env`} className="text-sm">ชื่อตัวแปร token ใน .env *</label><Input id={`${fieldId}-token-env`} required maxLength={128} pattern="(?:GITLAB|GITHUB|ISSUE_SYNC)_[A-Z0-9_]*TOKEN(?:_[A-Z0-9]+)*" value={tokenEnvVar} onChange={(event) => setTokenEnvVar(event.target.value)} disabled={busy} placeholder="GITLAB_PROJECT_A_TOKEN" /><p className="text-xs text-muted-foreground">ใช้ชื่อขึ้นต้น GITLAB_, GITHUB_ หรือ ISSUE_SYNC_ และมี TOKEN เช่น GITHUB_TEAM_TOKEN · ใส่เฉพาะชื่อ ส่วน token จริงตั้งใน .env ของ app</p></div>
        </div><div className="space-y-2"><label htmlFor={`${fieldId}-assignees`} className="text-sm">Assignee usernames ที่อนุญาต *</label><Input id={`${fieldId}-assignees`} required maxLength={13000} value={assignees} onChange={(event) => setAssignees(event.target.value)} disabled={busy} placeholder="username1, username2" /><p className="text-xs text-muted-foreground">คั่นด้วย comma หรือช่องว่าง ไม่ใช้ display name · ไม่รับ issues ที่ไม่มี assignee</p></div>
        <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Label → Work Item type</p><Button type="button" size="sm" variant="outline" disabled={busy || labels.length >= 100} onClick={() => setLabels([...labels, { label: '', type: 'bug' }])}>เพิ่ม label mapping</Button></div>{labels.map((row, index) => <div key={index} className="flex flex-wrap gap-2"><Input className="min-w-0 flex-1 basis-40" aria-label={`Source label ${index + 1}`} value={row.label} maxLength={255} disabled={busy} onChange={(event) => setLabels(labels.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry))} /><Select value={row.type} disabled={busy} onValueChange={(type) => setLabels(labels.map((entry, i) => i === index ? { ...entry, type } : entry))}><SelectTrigger aria-label={`Work Item type ${index + 1}`} className="w-40"><SelectValue /></SelectTrigger><SelectContent>{WORK_ITEM_TYPES.map((type) => <SelectItem value={type} key={type}>{type}</SelectItem>)}</SelectContent></Select><Button type="button" variant="ghost" disabled={busy} aria-label={`ลบ label mapping ${index + 1}`} onClick={() => setLabels(labels.filter((_, i) => i !== index))}>ลบ</Button></div>)}</div><p className="text-xs text-muted-foreground">ต้นทางอัปเดตชื่อ รายละเอียด สถานะ labels และ due date ที่รองรับ รวม priority/role เมื่อมี label กำหนด ส่วน work date และ Daily Work คงข้อมูลใน PMS</p>{error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">{error}</p>}<div className="flex gap-2"><Button type="submit" disabled={busy || !tokenEnvVar.trim()}>{busy ? 'กำลังบันทึก…' : 'บันทึก config'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setFormOpen(false)}>ยกเลิก</Button></div></form>}

      {historyConfig && <section className="space-y-3" aria-label="ประวัติ Issue Sync"><h3 className="font-semibold">ประวัติ Sync · {configs.find((config) => config.id === historyConfig)?.sourceProject}</h3>{historyLoading && <p role="status" className="text-sm">กำลังโหลดประวัติ…</p>}{!historyLoading && runs.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีประวัติ sync</p>}{runs.map((run) => <details key={run.id} className="min-w-0 rounded-lg border p-3"><summary className="cursor-pointer break-words text-sm">{run.startedAt.replace('T', ' ')} · {run.status} · เพิ่ม {run.counts.created} / อัปเดต {run.counts.updated} / ข้าม {run.counts.skipped} / ผิดพลาด {run.counts.failed} · รอยืนยัน {run.counts.pending ?? 0}</summary><div className="mt-3 space-y-3 text-sm">{run.results.some((result) => result.outcome === 'pending') && <Button type="button" variant="outline" disabled={busy} onClick={() => { const group = pendingGroup(historyConfig, configs.find((config) => config.id === historyConfig)?.sourceProject ?? '', run); if (group) { setReviewGroups([group]); setReviewError('') } }}>ตรวจสอบรายการรอยืนยัน</Button>}<p className="break-words text-xs text-muted-foreground">Assignee ในรอบนี้: {run.configSnapshot.assignees.join(', ')}</p>{run.runError && <p role="alert">{run.runError.code}: {run.runError.message}</p>}<ul className="max-h-96 space-y-2 overflow-y-auto">{run.results.map((result, index) => <li key={index} className="min-w-0 border-t pt-2"><p className="break-words">{result.outcome} · {result.title || 'Issue'}</p><p className="break-words text-muted-foreground">{reasonLabel[result.reason] ?? result.reason}</p>{result.sourceUrl && <a className="text-link underline" href={result.sourceUrl} target="_blank" rel="noopener noreferrer">เปิด Issue ต้นทาง</a>}{result.warnings.map((warning, i) => <p key={i} className="break-words text-xs text-muted-foreground">{warning}</p>)}</li>)}</ul></div></details>)}{nextBefore && <Button type="button" variant="outline" disabled={busy || historyLoading} onClick={() => history(historyConfig, nextBefore)}>โหลดประวัติเพิ่ม</Button>}</section>}
    </CardContent>
    <AlertDialog open={Boolean(approval)} onOpenChange={(open) => { if (!open) setApproval(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ยืนยันการ sync ครั้งแรก</AlertDialogTitle><AlertDialogDescription>นำเข้า Issues เฉพาะ assignee ที่ตั้งไว้จาก {approval?.map((config) => config.sourceProject).join(', ')} และอัปเดต fields ที่ต้นทางควบคุม รายการที่ไม่ตรง assignee ภายหลังจะเก็บประวัติเดิมและหยุดอัปเดต</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>ยกเลิก</AlertDialogCancel><AlertDialogAction onClick={() => { const selected = approval; setApproval(null); if (selected) void sync(selected, true) }}>ยืนยัน Sync</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {reviewGroups.length > 0 && <IssueSyncReviewDialog groups={reviewGroups} busy={busy} error={reviewError} onClose={() => setReviewGroups([])} onConfirm={(answers) => void confirmReviews(answers)} />}
  </Card>
}
