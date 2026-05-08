import { EXPORT_PHASE } from './constants.js';

const DEFAULT_STATE = {
  phase: EXPORT_PHASE.IDLE,
  current: 0,
  total: 0,
  currentNote: '',
  successCount: 0,
  failedCount: 0,
  skippedCount: 0,
  errors: [],
};

let state = { ...DEFAULT_STATE };

export function getState() {
  return { ...state };
}

export function updateState(partial) {
  Object.assign(state, partial);
  // Persist to storage for SW recovery
  chrome.storage.local.set({ exportState: state });
}

export function resetState() {
  state = { ...DEFAULT_STATE };
  chrome.storage.local.set({ exportState: state });
}

export async function restoreState() {
  const result = await chrome.storage.local.get('exportState');
  if (result.exportState) {
    state = result.exportState;
  }
  return state;
}
