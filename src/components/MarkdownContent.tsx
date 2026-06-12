import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { PluggableList } from 'unified'
import type { Components } from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check } from 'lucide-react'

interface MarkdownContentProps {
  content: string
  className?: string
  remarkPlugins?: PluggableList
  components?: Components
}

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const displayLanguage = language || 'text'

  return (
    <div className="my-3 overflow-hidden rounded-md border border-border bg-[#111827] shadow-sm dark:border-slate-700 dark:shadow-[0_12px_30px_-24px_rgba(0,0,0,0.9)]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2">
        <span className="font-mono text-xs text-slate-300">{displayLanguage}</span>
        <button
          onClick={handleCopy}
          className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      {/* Code */}
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={displayLanguage}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '12px 16px',
            background: 'transparent',
            fontSize: '13px',
            lineHeight: '1.6',
          }}
          showLineNumbers={code.split('\n').length > 5}
          lineNumberStyle={{
            color: '#6e7681',
            fontSize: '12px',
            minWidth: '2.5em',
            paddingRight: '1em',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  className = '',
  remarkPlugins = [],
  components = {}
}) => {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, ...remarkPlugins]}
        components={{
          // 段落
          p: ({ children }) => <p className="mb-2 text-sm leading-relaxed text-foreground last:mb-0">{children}</p>,

          // 标题
          h1: ({ children }) => <h1 className="mb-2 mt-4 text-lg font-bold text-foreground">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-base font-bold text-foreground">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-bold text-foreground">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-1 mt-2 text-sm font-semibold text-foreground">{children}</h4>,
          h5: ({ children }) => <h5 className="mb-1 mt-2 text-xs font-semibold text-foreground">{children}</h5>,
          h6: ({ children }) => <h6 className="mb-1 mt-2 text-xs font-medium text-muted-foreground">{children}</h6>,

          // 粗体/斜体
          strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic text-muted-foreground">{children}</em>,
          del: ({ children }) => <del className="text-muted-foreground line-through">{children}</del>,

          // 列表
          ul: ({ children }) => <ul className="my-2 list-inside list-disc space-y-1 text-sm text-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-inside list-decimal space-y-1 text-sm text-foreground">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,

          // 引用块
          blockquote: ({ children }) => (
            <blockquote className="my-2 rounded-r-md border-l-4 border-primary/40 bg-muted/60 py-2 pl-3 text-muted-foreground italic">
              {children}
            </blockquote>
          ),

          // 链接
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="cursor-pointer text-primary underline-offset-4 transition-colors hover:underline">
              {children}
            </a>
          ),

          // 行内代码
          code: ({ children, className: codeClassName }) => {
            const isInline = !codeClassName
            if (isInline) {
              return (
                <code className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  {children}
                </code>
              )
            }
            // 代码块在 pre 中处理
            return <code className="font-mono text-xs text-slate-300">{children}</code>
          },

          // 代码块
          pre: ({ children }) => {
            const childrenArray = React.Children.toArray(children)
            const codeElement = childrenArray.find(
              (child): child is React.ReactElement => React.isValidElement(child)
            )

            if (!codeElement) {
              return <pre>{children}</pre>
            }

            const codeProps = codeElement.props as { className?: string; children?: React.ReactNode }
            const match = /language-(\w+)/.exec(codeProps?.className || '')
            const language = match ? match[1] : ''

            let code: string
            const rawChildren = codeProps?.children
            if (typeof rawChildren === 'string') {
              code = rawChildren.replace(/\n$/, '')
            } else if (Array.isArray(rawChildren)) {
              code = rawChildren.map((c) => (typeof c === 'string' ? c : '')).join('').replace(/\n$/, '')
            } else {
              code = String(rawChildren || '').replace(/\n$/, '')
            }

            return <CodeBlock language={language} code={code} />
          },

          // 表格
          table: ({ children }) => (
            <div className="rendered-surface my-3 overflow-x-auto rounded-md">
              <table className="w-full overflow-hidden text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/70">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-foreground">{children}</th>
          ),
          tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
          tr: ({ children }) => <tr className="transition-colors hover:bg-muted/50">{children}</tr>,
          td: ({ children }) => <td className="px-3 py-2 text-foreground">{children}</td>,

          // 分隔线
          hr: () => <hr className="my-4 border-border" />,

          // 图片
          img: ({ src, alt }) => (
            <img src={src} alt={alt || ''} className="my-2 max-w-full rounded-md border border-border" loading="lazy" />
          ),
          ...components
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownContent
