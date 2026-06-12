import React from 'react'
import { Sparkles } from 'lucide-react'
import { visualRegistry } from './index'
import { VisualBlock } from '@/types'

interface VisualRendererProps {
  blocks: VisualBlock[]
}

const VisualRenderer: React.FC<VisualRendererProps> = ({ blocks }) => {
  return (
    <div className="visual-container space-y-3">
      {blocks.map((block, index) => {
        const Component = visualRegistry[block.type]
        if (!Component) {
          return (
            <div
              key={index}
              className="rendered-surface rounded-md p-4 text-sm text-muted-foreground"
            >
              <div className="mb-2 flex items-center gap-2">
                <Sparkles size={16} className="text-primary" />
                <span className="font-medium">可视化卡片</span>
              </div>
              <p className="text-xs text-muted-foreground">正在加载 {block.type} 组件...</p>
            </div>
          )
        }
        return (
          <div key={index}>
            <Component {...block.data} />
          </div>
        )
      })}
    </div>
  )
}

export default VisualRenderer
