export type WorkLogWorkItem = {
  id: string
  title: string
  kind: string
  status: string
}

export type WorkLog = {
  id: string
  description: string | null
  remarks: string | null
  hours: number
  date: Date
  status: string | null
  user: {
    id: string
    name: string
    email: string
    avatar: string | null
  }
  project: {
    id: string
    name: string
    colorProject: string | null
  } | null
  workItem: WorkLogWorkItem | null
}

export type Project = {
  id: string
  name: string
  colorProject?: string | null
}

export type User = {
  id: string
  name: string
  email: string
  role: string
}

export type WorkLogFormData = {
  description: string
  remarks: string
  hours: string
  date: string
  projectId: string
  workItemId: string
  status: string
}

export const workLogStatuses = ["To Do", "In Progress", "Review", "Completed", "Blocked"]

export const emptyWorkLogForm = (date = ""): WorkLogFormData => ({
  description: "",
  remarks: "",
  hours: "8",
  date,
  projectId: "",
  workItemId: "",
  status: "To Do",
})
