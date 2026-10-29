import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { DEFAULT_ICP, type IcpForm, type SectionKey } from '../lib/icp'

interface IcpState {
  filters: IcpForm
  goal: number
  /** Which filter sections are expanded on the search page. */
  open: SectionKey[]
}

const initialState: IcpState = { filters: DEFAULT_ICP, goal: 25, open: ['person'] }

const icpSlice = createSlice({
  name: 'icp',
  initialState,
  reducers: {
    patchFilters(state, action: PayloadAction<Partial<IcpForm>>) {
      Object.assign(state.filters, action.payload)
    },
    setGoal(state, action: PayloadAction<number>) {
      state.goal = action.payload
    },
    setFilters(state, action: PayloadAction<{ filters: IcpForm; goal: number }>) {
      state.filters = action.payload.filters
      state.goal = action.payload.goal
    },
    setOpenSections(state, action: PayloadAction<SectionKey[]>) {
      state.open = action.payload
    },
    resetFilters(state) {
      state.filters = DEFAULT_ICP
    },
  },
})

export const { patchFilters, setGoal, setFilters, setOpenSections, resetFilters } = icpSlice.actions
export default icpSlice.reducer
