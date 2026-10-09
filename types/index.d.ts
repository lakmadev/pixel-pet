export type Mood = 'idle' | 'working' | 'happy' | 'oops' | 'sleepy' | 'loved' | 'reading' | 'wince' | 'shocked'

export type PetView = {
  mood: Mood
  line: string
  name: string
  level: number
  xp: number
  levelXp: number
  nextXp: number
  form: string
  isHidden: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'pixel-pet': { view: PetView }
  }
}
