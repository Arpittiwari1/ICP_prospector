import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { IcpForm } from '../lib/icp'

export interface Template {
  id: string
  name: string
  filters: IcpForm
  goal: number
  createdAt: number
}

const KEY = 'icp-templates'

const load = (): Template[] => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Template[]) : []
  } catch {
    return []
  }
}

export const persistTemplates = (items: Template[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* ignore */
  }
}

const templatesSlice = createSlice({
  name: 'templates',
  initialState: { items: load() },
  reducers: {
    addTemplate(state, action: PayloadAction<Omit<Template, 'id' | 'createdAt'>>) {
      state.items.unshift({ ...action.payload, id: crypto.randomUUID(), createdAt: Date.now() })
    },
    removeTemplate(state, action: PayloadAction<string>) {
      state.items = state.items.filter((t) => t.id !== action.payload)
    },
  },
})

export const { addTemplate, removeTemplate } = templatesSlice.actions
export default templatesSlice.reducer
