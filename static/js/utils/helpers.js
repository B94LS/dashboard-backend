import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

// Statistical helper functions
export function calculateMedian(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 
    ? (sorted[mid - 1] + sorted[mid]) / 2 
    : sorted[mid];
}

export function calculateSkewness(values) {
  const n = values.length;
  const mean = d3.mean(values);
  const std = d3.deviation(values);
  if (std === 0) return 0;
  const skewness = d3.sum(values, d => Math.pow((d - mean) / std, 3)) / n;
  return skewness;
}

export function calculateKurtosis(values) {
  const n = values.length;
  const mean = d3.mean(values);
  const std = d3.deviation(values);
  if (std === 0) return 0;
  const kurtosis = d3.sum(values, d => Math.pow((d - mean) / std, 4)) / n - 3;
  return kurtosis;
}

export function calculateLinearRegression(points) {
  const n = points.length;
  const sumX = d3.sum(points, d => d.x);
  const sumY = d3.sum(points, d => d.y);
  const sumXY = d3.sum(points, d => d.x * d.y);
  const sumXX = d3.sum(points, d => d.x * d.x);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// Tooltip positioning helper
export function positionTooltip(event, tooltipElement) {
  const tooltip = tooltipElement.node();
  const tooltipRect = tooltip.getBoundingClientRect();
  const tooltipWidth = tooltipRect.width || 250;
  const tooltipHeight = tooltipRect.height || 100;
  const mouseX = event.clientX;
  const mouseY = event.clientY;
  const offsetX = 15;
  const offsetY = 15;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  let left = mouseX + offsetX;
  let top = mouseY + offsetY;
  
  if (left + tooltipWidth > viewportWidth - 20) {
    left = mouseX - tooltipWidth - offsetX;
  }
  if (top + tooltipHeight > viewportHeight - 20) {
    top = mouseY - tooltipHeight - offsetY;
  }
  if (left < 20) left = 20;
  if (top < 20) top = 20;
  
  return { left: left, top: top };
}

// Calculate maximum drawdown
export function calculateMaxDrawdown(data) {
  if (!data || data.length === 0) return null;
  
  let maxDrawdown = null;
  let largestDrop = 0;
  
  for (let i = 0; i < data.length; i++) {
    const peak = data[i];
    for (let j = i + 1; j < data.length; j++) {
      const trough = data[j];
      if (trough.value < peak.value) {
        const absoluteDrop = peak.value - trough.value;
        if (absoluteDrop > largestDrop) {
          largestDrop = absoluteDrop;
          maxDrawdown = {
            peakStart: peak,
            trough: trough,
            depth: -absoluteDrop
          };
        }
      }
    }
  }
  
  return maxDrawdown;
}

// Initialize color scales
export function initializeColorScales(isins) {
  const scatterColorScale = d3.scaleOrdinal()
    .domain(isins)
    .range(['#1e40af', '#0891b2', '#2563eb', '#0ea5e9', '#3b82f6', 
            '#06b6d4', '#1d4ed8', '#0284c7', '#60a5fa', '#22d3ee']);
  
  const correlationColorScale = d3.scaleSequential(d3.interpolateRdBu)
    .domain([1, -1]);
  
  const histogramColorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0, 1]);
  
  const isinColorScale = d3.scaleOrdinal()
    .domain(isins)
    .range(['#1e40af', '#0891b2', '#2563eb', '#0ea5e9', '#3b82f6', 
            '#06b6d4', '#1d4ed8', '#0284c7', '#60a5fa', '#22d3ee']);
  
  return {
    scatter: scatterColorScale,
    correlation: correlationColorScale,
    histogram: histogramColorScale,
    isin: isinColorScale
  };
}

// Calculate uniform dimensions for charts
export function calculateUniformDimensions() {
  const container = document.querySelector('.chart-container');
  if (!container) return 600;
  const containerWidth = container.clientWidth;
  return Math.max(400, containerWidth - 160);
}
