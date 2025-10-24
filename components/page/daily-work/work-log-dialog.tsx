"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Check, ChevronsUpDown, Clock, Edit, Trash2, Eye } from "lucide-react"
import { useState, useMemo } from "react"
import { formatDate } from "@/lib/utils"
import { Project, Task, WorkLogFormData, WorkLog, taskStatuses } from "./types"

// Helper function for null/empty styling
const getNullStyle = (value: any) => {
  return !value || value === "" ? "text-amber-700/70 dark:text-amber-600/70 italic" : ""
}

const getDisplayValue = (value: any, placeholder: string) => {
  return !value || value === "" ? placeholder : value
}

type WorkLogDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "add" | "edit" | "view"
  isLoading?: boolean
  formData?: WorkLogFormData
  workLog?: WorkLog | null
  onFormDataChange?: (data: WorkLogFormData) => void
  projects?: Project[]
  tasks?: Task[]
  onSubmit?: () => void
  onEdit?: (workLog: WorkLog) => void
  onDelete?: (id: string) => void
  onViewDetails?: () => void
}

// Sub-component for dialog footer buttons
function DialogActions({
  isViewMode,
  isEditMode,
  isLoading,
  workLog,
  onOpenChange,
  onEdit,
  onDelete,
  onViewDetails,
  onSubmit
}: Readonly<{
  isViewMode: boolean
  isEditMode: boolean
  isLoading: boolean
  workLog?: WorkLog | null
  onOpenChange: (open: boolean) => void
  onEdit?: (workLog: WorkLog) => void
  onDelete?: (id: string) => void
  onViewDetails?: () => void
  onSubmit?: () => void
}>) {
  if (isViewMode && workLog) {
    return (
      <>
        <Button
          className="bg-blue-500 text-white hover:bg-blue-600"
          onClick={() => {
            onOpenChange(false)
            onEdit?.(workLog)
          }}
        >
          <Edit className="h-4 w-4 mr-2 text-white" />
          Edit
        </Button>
        <Button
          variant="destructive"
          onClick={() => onDelete?.(workLog.id)}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </>
    )
  }

  let submitButtonText = "Save"
  if (isLoading) submitButtonText = "Saving..."
  else if (isEditMode) submitButtonText = "Update"

  return (
    <>
      {isEditMode && onViewDetails && (
        // button color : blue and text color : white and hover color : blue-600
        <Button className="bg-blue-500 text-white hover:bg-blue-600" onClick={onViewDetails} disabled={isLoading}>
          <Eye className="h-4 w-4 mr-2 text-white" />
          View Details
        </Button>
      )}
      <div className="space-x-2"> : </div>
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
        Cancel
      </Button>
      <Button onClick={onSubmit} disabled={isLoading}>
        {submitButtonText}
      </Button>
    </>
  )
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function WorkLogDialog({
  open,
  onOpenChange,
  mode,
  isLoading = false,
  formData,
  workLog,
  onFormDataChange,
  projects = [],
  tasks = [],
  onSubmit,
  onEdit,
  onDelete,
  onViewDetails,
}: Readonly<WorkLogDialogProps>) {
  const [projectOpen, setProjectOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [projectSearch, setProjectSearch] = useState("")
  const [taskSearch, setTaskSearch] = useState("")

  const isViewMode = mode === "view"
  const isEditMode = mode === "edit"

  // For view mode, derive data from workLog
  const project = workLog?.project || workLog?.task?.project

  // Filter tasks based on selected project
  const filteredTasks = useMemo(() => {
    if (formData?.projectId) {
      return tasks.filter(task => task.projectId === formData.projectId)
    }
    return tasks
  }, [formData?.projectId, tasks])

  // Filter projects based on search
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects
    return projects.filter(project =>
      project.name.toLowerCase().includes(projectSearch.toLowerCase())
    )
  }, [projects, projectSearch])

  // Filter tasks based on search
  const searchFilteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return filteredTasks
    return filteredTasks.filter(task =>
      task.title.toLowerCase().includes(taskSearch.toLowerCase())
    )
  }, [filteredTasks, taskSearch])

  const handleProjectSelect = (projectId: string) => {
    if (onFormDataChange && formData) {
      onFormDataChange({ ...formData, projectId, taskId: "" })
    }
    setProjectOpen(false)
    setProjectSearch("")
  }

  const handleTaskSelect = (taskId: string) => {
    if (onFormDataChange && formData) {
      onFormDataChange({ ...formData, taskId })
    }
    setTaskOpen(false)
    setTaskSearch("")
  }

  const handleTaskNone = () => {
    if (onFormDataChange && formData) {
      onFormDataChange({ ...formData, taskId: "" })
    }
    setTaskOpen(false)
    setTaskSearch("")
  }

  if (isViewMode && !workLog) return null

  const dialogWidth = "!max-w-[80vw] w-full"

  let dialogTitle = "Add New Work Log"
  if (isViewMode) {
    dialogTitle = "Work Log Details"
  } else if (isEditMode) {
    dialogTitle = "Edit Work Log"
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogWidth}>
        <DialogHeader>
          <DialogTitle>
            {dialogTitle}
          </DialogTitle>
          {!isViewMode && (
            <DialogDescription>
              Record your daily work activities and hours
            </DialogDescription>
          )}
          {isViewMode && workLog && (
            <DialogDescription>
              Work Log Details for : <span className="font-bold text-blue-500">{workLog.project?.name}</span>
              {' '}Date : [ <span className="font-bold">{formatDate(workLog.date)}</span> ]
              {' '}This work detail used [<span className="font-bold">{workLog.hours} hours</span>]
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* User Info - Only show in view mode */}
          {isViewMode && workLog && (
            <div className="flex items-center gap-3 pb-4 border-b">
              <Avatar className="h-12 w-12 border-2 border-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {workLog.user.name.split(" ").map(n => n[0]).join("").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{workLog.user.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(workLog.date)}
                </p>
              </div>
              <Badge variant="outline" className="ml-auto gap-1">
                <Clock className="h-3 w-3" />
                {workLog.hours}h
              </Badge>
            </div>
          )}

          {/* Two Column Layout */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Date and Hours */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date <span className="text-destructive">*</span></Label>
                  {isViewMode && workLog ? (
                    <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                      <p className="text-sm">{formatDate(workLog.date)}</p>
                    </div>
                  ) : (
                    <Input
                      id="date"
                      type="date"
                      value={formData?.date || ""}
                      onChange={(e) => onFormDataChange?.({ ...formData!, date: e.target.value })}
                      disabled={isLoading}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hours">Hours <span className="text-destructive">*</span></Label>
                  {isViewMode && workLog ? (
                    <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                      <p className="text-sm">{workLog.hours}h</p>
                    </div>
                  ) : (
                    <Input
                      id="hours"
                      type="number"
                      min="0.5"
                      max="24"
                      step="0.5"
                      value={formData?.hours || ""}
                      onChange={(e) => onFormDataChange?.({ ...formData!, hours: e.target.value })}
                      disabled={isLoading}
                    />
                  )}
                </div>
              </div>

              {/* Project */}
              <div className="space-y-2">
                <Label htmlFor="project">Project <span className="text-destructive">*</span></Label>
                {isViewMode && workLog ? (
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                    <p className={`text-sm font-medium ${getNullStyle(project)}`}>
                      {getDisplayValue(project?.name, "No project")}
                    </p>
                  </div>
                ) : (
                  <Popover open={projectOpen} onOpenChange={setProjectOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        aria-expanded={projectOpen}
                        className="w-full justify-between"
                        disabled={isLoading}
                      >
                        {formData?.projectId
                          ? projects.find((project) => project.id === formData.projectId)?.name
                          : "Select project..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <div className="border-b p-3">
                        <Input
                          placeholder="Search projects..."
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div
                        className="max-h-[250px] overflow-y-auto"
                        style={{
                          scrollbarWidth: 'thin',
                          scrollbarColor: '#cbd5e1 #f1f5f9'
                        }}
                        onWheel={(e) => {
                          e.preventDefault()
                          const container = e.currentTarget
                          container.scrollTop += e.deltaY
                        }}
                      >
                        {filteredProjects.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            No project found.
                          </div>
                        ) : (
                          filteredProjects.map((project) => (
                            <button
                              key={project.id}
                              className="flex items-center gap-2 p-2 hover:bg-accent cursor-pointer w-full text-left"
                              onClick={() => handleProjectSelect(project.id)}
                            >
                              <Check
                                className={`h-4 w-4 ${formData?.projectId === project.id ? "opacity-100" : "opacity-0"
                                  }`}
                              />
                              {project.name}
                            </button>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* Task */}
              <div className="space-y-2">
                <Label htmlFor="task">Task</Label>
                {isViewMode && workLog ? (
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                    {workLog.task ? (
                      <div>
                        <p className="text-sm font-medium">{workLog.task.title}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <p className="text-xs text-muted-foreground">{workLog.task.project.name}</p>
                          <Badge variant="secondary" className="text-xs">
                            {workLog.task.status}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-sm ${getNullStyle(null)}`}>
                        {getDisplayValue(null, "No task")}
                      </p>
                    )}
                  </div>
                ) : (
                  <Popover open={taskOpen} onOpenChange={setTaskOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        aria-expanded={taskOpen}
                        className="w-full justify-between"
                        disabled={!formData?.projectId || isLoading}
                      >
                        {formData?.taskId
                          ? filteredTasks.find((task) => task.id === formData.taskId)?.title
                          : "Select task or leave empty..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <div className="border-b p-3">
                        <Input
                          placeholder="Search tasks..."
                          value={taskSearch}
                          onChange={(e) => setTaskSearch(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div
                        className="max-h-[250px] overflow-y-auto"
                        style={{
                          scrollbarWidth: 'thin',
                          scrollbarColor: '#cbd5e1 #f1f5f9'
                        }}
                        onWheel={(e) => {
                          e.preventDefault()
                          const container = e.currentTarget
                          container.scrollTop += e.deltaY
                        }}
                      >
                        <button
                          className="flex items-center gap-2 p-2 hover:bg-accent cursor-pointer w-full text-left"
                          onClick={handleTaskNone}
                        >
                          <Check
                            className={`h-4 w-4 ${formData?.taskId === "" ? "opacity-100" : "opacity-0"
                              }`}
                          />
                          None
                        </button>
                        {searchFilteredTasks.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            No task found.
                          </div>
                        ) : (
                          searchFilteredTasks.map((task) => (
                            <button
                              key={task.id}
                              className="flex items-center gap-2 p-2 hover:bg-accent cursor-pointer w-full text-left"
                              onClick={() => handleTaskSelect(task.id)}
                            >
                              <Check
                                className={`h-4 w-4 ${formData?.taskId === task.id ? "opacity-100" : "opacity-0"
                                  }`}
                              />
                              {task.title}
                            </button>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="status">Status <span className="text-destructive">*</span></Label>
                {isViewMode && workLog ? (
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={`text-xs ${getNullStyle(workLog.status)}`}>
                        {getDisplayValue(workLog.status, "No status")}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <Select
                    value={formData?.status || ""}
                    onValueChange={(value) => onFormDataChange?.({ ...formData!, status: value })}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {taskStatuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Tasks / Description <span className="text-destructive">*</span></Label>
                {isViewMode && workLog ? (
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 min-h-[120px]">
                    <p className={`text-sm whitespace-pre-wrap ${getNullStyle(workLog.description)}`}>
                      {getDisplayValue(workLog.description, "No description")}
                    </p>
                  </div>
                ) : (
                  <Textarea
                    id="description"
                    placeholder="Describe the work you completed..."
                    value={formData?.description || ""}
                    onChange={(e) => onFormDataChange?.({ ...formData!, description: e.target.value })}
                    className="min-h-[120px] resize-none"
                    disabled={isLoading}
                  />
                )}
              </div>

              {/* Remarks */}
              <div className="space-y-2">
                <Label htmlFor="remarks">Remarks</Label>
                {isViewMode && workLog ? (
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 min-h-[120px]">
                    <p className={`text-sm whitespace-pre-wrap ${getNullStyle(workLog.remarks)}`}>
                      {getDisplayValue(workLog.remarks, "No remarks")}
                    </p>
                  </div>
                ) : (
                  <Textarea
                    id="remarks"
                    placeholder="Any additional notes or observations..."
                    value={formData?.remarks || ""}
                    onChange={(e) => onFormDataChange?.({ ...formData!, remarks: e.target.value })}
                    className="min-h-[120px] resize-none"
                    disabled={isLoading}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <DialogActions
            isViewMode={isViewMode}
            isEditMode={isEditMode}
            isLoading={isLoading}
            workLog={workLog}
            onOpenChange={onOpenChange}
            onEdit={onEdit}
            onDelete={onDelete}
            onViewDetails={onViewDetails}
            onSubmit={onSubmit}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

