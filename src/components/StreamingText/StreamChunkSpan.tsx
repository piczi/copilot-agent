import React from 'react'

interface StreamChunkSpanProps {
  chunkId: string
  text: string
  onCommit: (id: string) => void
}

const StreamChunkSpan: React.FC<StreamChunkSpanProps> = ({ chunkId, text, onCommit }) => {
  return (
    <span
      onAnimationEnd={(event) => {
        if (event.currentTarget === event.target) {
          onCommit(chunkId)
        }
      }}
      className="stream-chunk stream-chunk-fade"
    >
      {text}
    </span>
  )
}

export default StreamChunkSpan
