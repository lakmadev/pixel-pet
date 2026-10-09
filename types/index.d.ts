export type Mood = 'idle' | 'working' | 'happy' | 'oops' | 'sleepy' | 'loved' | 'reading' | 'wince' | 'shocked' | 'dozing' | 'waking'

// A subagent's little helper beside the pet: here while its agent works, waving bye when it's done.
export type Mini = { id: string; name: string; color: string; state: 'here' | 'bye'; at: number }

export type ContextMeter = {
  percent?: number
  tokens?: number
  window?: number
  usd?: number
  limits?: { kind: string; percent: number; resetsAt?: string }[]
  source?: 'plan' | 'api' | 'bedrock' | 'vertex' | 'foundry' | 'gateway'
}

export type PetView = {
  mood: Mood
  line: string
  name: string
  color: string
  isHidden: boolean
  meter: ContextMeter
  minis: Mini[]
}

declare module 'claude-code' {
  interface PluginState {
    'pixel-pet': { view: PetView }
  }
}
