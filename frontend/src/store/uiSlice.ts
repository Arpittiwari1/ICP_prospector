import { createSlice } from '@reduxjs/toolkit'

const KEY = 'icp-theme'

const initialDark = (): boolean => {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return saved === 'dark'
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export const persistTheme = (dark: boolean) => {
  try {
    localStorage.setItem(KEY, dark ? 'dark' : 'light')
  } catch {
    /* ignore */
  }
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: { dark: initialDark() },
  reducers: {
    toggleTheme(state) {
      state.dark = !state.dark
    },
  },
})

export const { toggleTheme } = uiSlice.actions
export default uiSlice.reducer
