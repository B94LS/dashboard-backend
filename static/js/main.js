import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { COLOR_SCALES, APP_STATE } from './config.js';
import { initializeColorScales } from './utils/helpers.js';
import {
  prepareData,
  initializeWeights,
  recalculatePortfolio,
  filterByDateRange,
  calculateCumulativeReturns,
  minDate,
  maxDate,
  filteredData
} from './utils/data-processor.js';
import { drawLineChart } from './charts/line-chart.js';
import { createVolatilityScatterPlot, createSharpeScatterPlot } from './charts/scatter-chart.js';
import { updateSummaryTable, setupTableSorting } from './summary-table.js';
import { createCorrelationMatrix } from './charts/correlation-chart.js';

// Global variables
window.dashboardIsins = [];
window.dashboardCumulativeData = {};

// Initialize dashboard
function initializeDashboard() {
  const data = window.dashboardData;
  
  if (!data || !data.registrosPorISIN) {
    console.error('No data available');
    return;
  }
  
  window.dashboardIsins = Object.keys(data.registrosPorISIN);
  
  // Initialize color scales
  Object.assign(COLOR_SCALES, initializeColorScales(window.dashboardIsins));
  
  // Prepare data
  prepareData(data.registrosPorISIN, window.dashboardIsins);
  initializeWeights(window.dashboardIsins, data.pesosCartera || {});
  recalculatePortfolio(window.dashboardIsins);
  
  // Setup date inputs
  setupDateFilters();
  
  // Setup table sorting
  setupTableSorting();
  
  // Render all charts
  renderAllCharts();
  
  // Setup event listeners
  setupEventListeners();
}

function setupDateFilters() {
  const startDateInput = document.getElementById('start-date');
  const endDateInput = document.getElementById('end-date');
  
  if (startDateInput && endDateInput) {
    const minDateStr = minDate.toISOString().split('T')[0];
    const maxDateStr = maxDate.toISOString().split('T')[0];
    
    startDateInput.value = minDateStr;
    endDateInput.value = maxDateStr;
    startDateInput.min = minDateStr;
    startDateInput.max = maxDateStr;
    endDateInput.min = minDateStr;
    endDateInput.max = maxDateStr;
    
    startDateInput.addEventListener('change', applyDateFilter);
    endDateInput.addEventListener('change', applyDateFilter);
  }
  
  const riskFreeRateInput = document.getElementById('risk-free-rate');
  if (riskFreeRateInput) {
    riskFreeRateInput.addEventListener('change', () => {
      updateSummaryTable(window.dashboardIsins);
      createSharpeScatterPlot('#sharpe-plot');
    });
  }
}

function applyDateFilter() {
  const startDate = new Date(document.getElementById('start-date').value);
  const endDate = new Date(document.getElementById('end-date').value);
  
  if (startDate > endDate) {
    alert('Start date must be before end date');
    return;
  }
  
  filterByDateRange(startDate, endDate, window.dashboardIsins);
  renderAllCharts();
}

function renderAllCharts() {
  // Calculate cumulative data
  window.dashboardCumulativeData = calculateCumulativeReturns(filteredData);
  
  // Update summary table
  updateSummaryTable(window.dashboardIsins);
  
  // Render line charts
  drawLineChart('#chart-content-1', filteredData, false, window.dashboardIsins);
  drawLineChart('#chart-content-2', window.dashboardCumulativeData, true, window.dashboardIsins);
  
  // Render scatter plots
  createVolatilityScatterPlot('#scatter-plot');
  createSharpeScatterPlot('#sharpe-plot');
  
  // Render correlation matrix
  createCorrelationMatrix('#correlation-plot');
}

function setupEventListeners() {
  // Listen for ISIN selection changes
  window.addEventListener('isinSelected', (event) => {
    APP_STATE.selectedIsin = event.detail.isin;
    renderAllCharts();
  });
  
  // Listen for data updates (weight/visibility changes)
  window.addEventListener('dataUpdated', () => {
    renderAllCharts();
  });
  
  // Reset button
  const resetBtn = document.querySelector('.reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetFilters);
  }
  
  // Window resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      renderAllCharts();
    }, 150);
  });
}

function resetFilters() {
  // Reset dates
  document.getElementById('start-date').value = minDate.toISOString().split('T')[0];
  document.getElementById('end-date').value = maxDate.toISOString().split('T')[0];
  
  // Reset risk-free rate
  const riskFreeRateInput = document.getElementById('risk-free-rate');
  if (riskFreeRateInput) {
    riskFreeRateInput.value = 2;
  }
  
  // Reset weights
  const data = window.dashboardData;
  initializeWeights(window.dashboardIsins, data.pesosCartera || {});
  
  // Reset sort
  APP_STATE.currentSort = { column: null, direction: null };
  
  // Reset filters
  filterByDateRange(minDate, maxDate, window.dashboardIsins);
  
  // Re-render
  renderAllCharts();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDashboard);
} else {
  initializeDashboard();
}
