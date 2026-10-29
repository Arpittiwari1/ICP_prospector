import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import icp from './icpSlice'
import templates, { persistTemplates } from './templatesSlice'
import ui, { persistTheme } from './uiSlice'

export const store = configureStore({ reducer: { icp, ui, templates } })

let lastDark = store.getState().ui.dark
let lastTemplates = store.getState().templates.items
store.subscribe(() => {
  const { ui: u, templates: t } = store.getState()
  if (u.dark !== lastDark) {
    lastDark = u.dark
    persistTheme(u.dark)
  }
  if (t.items !== lastTemplates) {
    lastTemplates = t.items
    persistTemplates(t.items)
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
