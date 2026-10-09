export type Mood = 'idle' | 'working' | 'happy' | 'oops' | 'sleepy' | 'loved' | 'reading' | 'wince' | 'shocked'

export type ContextMeter = { percent?: number; tokens?: number; window?: number; usd?: number; limit?: number }

export type PetView = {
  mood: Mood
  line: string
  name: string
  color: string
  isHidden: boolean
  meter: ContextMeter
}

declare module 'claude-code' {
  interface PluginState {
    'pixel-pet': { view: PetView }
  }
}
