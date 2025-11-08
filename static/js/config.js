// Global dashboard configuration
export const CHART_CONFIG = {
  margin: { 
    top: 20, 
    right: 120, 
    bottom: 50, 
    left: 60 
  },
  width: null, // Calculated dynamically
  height: 280,
  scatterMargin: { 
    top: 20, 
    right: 50, 
    bottom: 70, 
    left: 80 
  }
};

// Color scales for different chart types
export const COLOR_SCALES = {
  scatter: null, // Initialized in utils.js
  correlation: null,
  histogram: null,
  isin: null
};

// Global application state
export const APP_STATE = {
  selectedIsin: 'Portfolio',
  currentSort: { 
    column: null, 
    direction: null 
  }
};
