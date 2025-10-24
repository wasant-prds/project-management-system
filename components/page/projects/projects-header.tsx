'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { ProjectCreateModal } from './project-create-modal'

export function ProjectsHeader() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage and track all your projects in one place</p>
        </div>
        <Button className="gap-2" onClick={() => setIsModalOpen(true)}>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      <ProjectCreateModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  )
}

