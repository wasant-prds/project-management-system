'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { PAGE_HEADING, PAGE_LEAD, PAGE_TOOLBAR } from '@/components/layout/page-layout'
import { ProjectCreateModal } from './project-create-modal'

export function ProjectsHeader() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <div className={PAGE_TOOLBAR}>
        <div className="min-w-0">
          <h1 className={PAGE_HEADING}>Projects</h1>
          <p className={PAGE_LEAD}>Manage and track all your projects in one place</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">New Project</span>
        </Button>
      </div>

      <ProjectCreateModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  )
}

