import type { Transition, Variants } from 'motion/react'

export const softSpring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.8
}

export const gentleSpring: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
  mass: 0.9
}

export const quickFade: Transition = {
  duration: 0.16,
  ease: [0.16, 1, 0.3, 1]
}

export const panelReveal: Transition = {
  duration: 0.22,
  ease: [0.2, 0, 0, 1]
}

export const streamChunkFade: Transition = {
  duration: 0.5,
  ease: [0.16, 1, 0.3, 1]
}

export const pressable = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.97 },
  transition: quickFade
}

export const fadeScale: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.98 }
}

export const panelVariants: Variants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: { height: 'auto', opacity: 1 }
}
