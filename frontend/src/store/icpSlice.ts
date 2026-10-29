import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { DEFAULT_ICP, type IcpForm } from '../lib/icp'

interface IcpState {
  filters: IcpForm
  goal: number
}

const initialState: IcpState = { filters: DEFAULT_ICP, goal: 25 }

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
    resetFilters(state) {
      state.filters = DEFAULT_ICP
    },
  },
})

export const { patchFilters, setGoal, setFilters, resetFilters } = icpSlice.actions
export default icpSlice.reducer
