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
}

export type Project = {
  id: string
  name: string
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
  status: string
}

export const workLogStatuses = ["To Do", "In Progress", "Review", "Completed", "Blocked"]
