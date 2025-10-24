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
  task: {
    id: string
    title: string
    status: string
    project: {
      id: string
      name: string
      colorProject: string | null
    }
  } | null
}

export type Project = {
  id: string
  name: string
}

export type Task = {
  id: string
  title: string
  status: string
  projectId: string
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
  taskId: string
  status: string
}

export const taskStatuses = ["To Do", "In Progress", "Review", "Completed", "Blocked"]

