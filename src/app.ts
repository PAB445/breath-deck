import { AudioEngine } from './engine/AudioEngine'
import { OutputRouter } from './engine/OutputRouter'
import { LocalTakeRepository } from './samples/repo'
import { SampleLibrary } from './samples/SampleLibrary'

export const library = new SampleLibrary(new LocalTakeRepository())
export const engine = new AudioEngine(library)
export const router = new OutputRouter(engine)

if (import.meta.env.DEV) Object.assign(window, { bd: { library, engine, router } })
