import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { COLOR_SCALES, APP_STATE } from '../config.js';
import { positionTooltip } from '../utils/helpers.js';
import { getVisibleIsins, filteredData, validateWeightSum } from '../utils/data-processor.js';

// ============================================================================
// STATISTICAL HELPER FUNCTIONS
// ============================================================================

function calculateMedian(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 
    ? (sorted[mid - 1] + sorted[mid]) / 2 
    : sorted[mid];
}

function calculateSkewness(values) {
  const n = values.length;
  const mean = d3.mean(values);
  const std = d3.deviation(values);
  if (std === 0) return 0;
  const skewness = d3.sum(values, d => Math.pow((d - mean) / std, 3)) / n;
  return skewness;
}

function calculateKurtosis(values) {
  const n = values.length;
  const mean = d3.mean(values);
  const std = d3.deviation(values);
  if (std === 0) return 0;
  const kurtosis = d3.sum(values, d => Math.pow((d - mean) / std, 4)) / n - 3;
  return kurtosis;
}

function calculateLinearRegression(points) {
  const n = points.length;
  const sumX = d3.sum(points, d => d.x);
  const sumY = d3.sum(points, d => d.y);
  const sumXY = d3.sum(points, d => d.x * d.y);
  const sumXX = d3.sum(points, d => d.x * d.x);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function calculateCorrelation(dataX, dataY) {
  const mapY = Object.fromEntries(
    dataY.map(d => [d.date.toISOString().split('T')[0], d.value])
  );
  
  const pairs = dataX
    .filter(d => mapY[d.date.toISOString().split('T')[0]] !== undefined)
    .map(d => ({
      x: d.value,
      y: mapY[d.date.toISOString().split('T')[0]]
    }));
  
  if (pairs.length < 2) return 0;
  
  const meanX = d3.mean(pairs, d => d.x);
  const meanY = d3.mean(pairs, d => d.y);
  const numerator = d3.sum(pairs, d => (d.x - meanX) * (d.y - meanY));
  const denomX = Math.sqrt(d3.sum(pairs, d => Math.pow(d.x - meanX, 2)));
  const denomY = Math.sqrt(d3.sum(pairs, d => Math.pow(d.y - meanY, 2)));
  
  return denomX && denomY ? numerator / (denomX * denomY) : 0;
}

// ============================================================================
// CELL SIZE CALCULATION
// ============================================================================

function calculateCellSize() {
  const visibleIsins = getVisibleIsins(window.dashboardIsins);
  const numIsins = visibleIsins.length;
  
  if (numIsins === 0) return 100;
  
  const dashboardElement = document.querySelector('.dashboard');
  let availableWidth = dashboardElement 
    ? dashboardElement.clientWidth - 80 
    : window.innerWidth - 120;
  
  availableWidth = Math.min(availableWidth, 1400);
  
  let cellSize = Math.floor(availableWidth / numIsins);
  
  const minCellSize = 80;
  const maxCellSize = 180;
  cellSize = Math.max(minCellSize, Math.min(maxCellSize, cellSize));
  
  if (cellSize < 100 && numIsins > 8) {
    cellSize = Math.max(70, Math.floor(availableWidth / numIsins));
  }
  
  return cellSize;
}

// ============================================================================
// MODAL SETUP
// ============================================================================

function setupModal() {
  let modal = d3.select("#pairplot-modal");
  
  if (modal.empty()) {
    modal = d3.select("body")
      .append("div")
      .attr("id", "pairplot-modal")
      .attr("class", "modal")
      .style("position", "fixed")
      .style("top", "0")
      .style("left", "0")
      .style("width", "100%")
      .style("height", "100%")
      .style("background", "rgba(0,0,0,0.7)")
      .style("display", "none")
      .style("align-items", "center")
      .style("justify-content", "center")
      .style("z-index", "10000");
    
    const modalContent = modal.append("div")
      .attr("class", "modal-content")
      .style("background", "white")
      .style("padding", "30px")
      .style("width", "95%")
      .style("height", "95%")
      .style("max-width", "1800px")
      .style("border-radius", "8px")
      .style("overflow", "auto")
      .style("box-shadow", "0 10px 30px rgba(0,0,0,0.3)")
      .style("position", "relative")
      .style("display", "flex")
      .style("flex-direction", "column");
    
    const closeBtn = modalContent.append("span")
      .attr("class", "modal-close")
      .style("position", "absolute")
      .style("top", "15px")
      .style("right", "20px")
      .style("cursor", "pointer")
      .style("font-weight", "bold")
      .style("font-size", "24px")
      .style("color", "#6c757d")
      .style("transition", "color 0.3s ease")
      .style("z-index", "10")
      .html("&times;")
      .on("click", () => {
        modal.style("display", "none");
        modalContent.select("#modal-content-inner").selectAll("*").remove();
      })
      .on("mouseover", function() {
        d3.select(this).style("color", "#495057");
      })
      .on("mouseout", function() {
        d3.select(this).style("color", "#6c757d");
      });
    
    modalContent.append("div")
      .attr("id", "modal-content-inner");
    
    // Close on background click
    modal.on("click", function(event) {
      if (event.target === modal.node()) {
        modal.style("display", "none");
        modalContent.select("#modal-content-inner").selectAll("*").remove();
      }
    });
    
    // Close on Escape key
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        modal.style("display", "none");
        modalContent.select("#modal-content-inner").selectAll("*").remove();
      }
    });
  }
  
  return modal;
}

// ============================================================================
// MAIN PAIRPLOT RENDERING
// ============================================================================

export function createCorrelationMatrix(containerId) {
  const container = d3.select(containerId);
  container.selectAll("*").remove();
  
  // Validate weights
  if (!validateWeightSum()) {
    container.style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "center")
      .style("min-height", "300px")
      .style("grid-template-columns", "none");
    
    container.append("div")
      .attr("class", "error-message")
      .html("⚠️ Weights do not sum to 100%.<br>Adjust weights or uncheck Portfolio checkbox to view charts.");
    return;
  }
  
  const visibleIsins = getVisibleIsins(window.dashboardIsins);
  
  if (visibleIsins.length === 0) {
    container.style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "center")
      .style("min-height", "300px")
      .style("grid-template-columns", "none");
    
    container.append("div")
      .style("color", "#6c757d")
      .text("No visible data");
    return;
  }
  
  // Restore grid layout
  container.style("display", "grid")
    .style("grid-template-columns", null)
    .style("min-height", null);
  
  const cellSize = calculateCellSize();
  const numIsins = visibleIsins.length;
  
  container.style("grid-template-columns", `repeat(${numIsins}, ${cellSize}px)`);
  
  // Render all cells
  for (let row = 0; row < numIsins; row++) {
    for (let col = 0; col < numIsins; col++) {
      renderPairCell(container, row, col, cellSize, visibleIsins);
    }
  }
}

// ============================================================================
// CELL RENDERING DISPATCHER
// ============================================================================

function renderPairCell(container, row, col, cellSize, visibleIsins) {
  const cell = container.append("div")
    .attr("class", "plot-cell")
    .style("width", `${cellSize}px`)
    .style("height", `${cellSize}px`)
    .style("position", "relative")
    .style("background", "white")
    .style("border-radius", "4px")
    .style("overflow", "visible")
    .style("transition", "transform 0.2s ease")
    .style("box-shadow", "0 1px 3px rgba(0,0,0,0.1)")
    .on("mouseover", function() {
      d3.select(this)
        .style("transform", "translateY(-1px)")
        .style("box-shadow", "0 2px 6px rgba(0,0,0,0.15)");
    })
    .on("mouseout", function() {
      d3.select(this)
        .style("transform", "translateY(0)")
        .style("box-shadow", "0 1px 3px rgba(0,0,0,0.1)");
    });
  
  const isinX = visibleIsins[col];
  const isinY = visibleIsins[row];
  
  if (row === col) {
    renderHistogram(cell, isinX, cellSize);
  } else if (row < col) {
    renderCorrelationCell(cell, isinX, isinY, cellSize);
  } else {
    renderScatterPlot(cell, isinX, isinY, cellSize);
  }
}

// ============================================================================
// HISTOGRAM RENDERING (DIAGONAL)
// ============================================================================

function renderHistogram(cell, isin, cellSize) {
  const data = filteredData[isin];
  if (!data || data.length === 0) return;
  
  const values = data.map(d => d.value);
  
  const svg = cell.append("svg")
    .attr("width", cellSize)
    .attr("height", cellSize);
  
  const margin = {
    top: Math.max(20, 30 * cellSize / 150),
    right: Math.max(15, 20 * cellSize / 150),
    bottom: Math.max(25, 40 * cellSize / 150),
    left: Math.max(25, 40 * cellSize / 150)
  };
  
  const width = cellSize - margin.left - margin.right;
  const height = cellSize - margin.top - margin.bottom;
  
  const x = d3.scaleLinear()
    .domain(d3.extent(values))
    .nice()
    .range([0, width]);
  
  const bins = d3.bin()
    .domain(x.domain())
    .thresholds(Math.min(15, Math.ceil(Math.sqrt(values.length))))
    (values);
  
  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)])
    .nice()
    .range([height, 0]);
  
  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  
  // Zero line (vertical)
  if (x.domain()[0] <= 0 && x.domain()[1] >= 0) {
    g.append("line")
      .attr("class", "zero-line")
      .attr("x1", x(0))
      .attr("x2", x(0))
      .attr("y1", 0)
      .attr("y2", height)
      .style("stroke", "#adb5bd")
      .style("stroke-width", 1)
      .style("stroke-dasharray", "2,2");
  }
  
  // Zero line (horizontal)
  g.append("line")
    .attr("class", "zero-line")
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", y(0))
    .attr("y2", y(0))
    .style("stroke", "#adb5bd")
    .style("stroke-width", 1)
    .style("stroke-dasharray", "2,2");
  
  const tooltip = d3.select("#tooltip");
  
  // Histogram bars
  g.selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x", d => x(d.x0) + 1)
    .attr("y", d => y(d.length))
    .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 2))
    .attr("height", d => height - y(d.length))
    .attr("fill", d => COLOR_SCALES.histogram(d.length / d3.max(bins, b => b.length)))
    .attr("stroke", "white")
    .attr("stroke-width", 0.5)
    .attr("opacity", 0.8)
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      d3.select(this).attr("opacity", 1);
      const content = `Range: ${d.x0.toFixed(2)} - ${d.x1.toFixed(2)}<br>Frequency: ${d.length}`;
      tooltip.html(content).style("opacity", 1);
      const pos = positionTooltip(event, tooltip);
      tooltip.style("left", `${pos.left}px`).style("top", `${pos.top}px`);
    })
    .on("mouseout", function() {
      d3.select(this).attr("opacity", 0.8);
      tooltip.style("opacity", 0);
    });
  
  // Axes
  const tickSize = Math.max(3, Math.min(5, cellSize / 30));
  
  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(tickSize))
    .selectAll("text")
    .style("font-size", `${Math.max(8, cellSize / 20)}px`);
  
  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(tickSize))
    .selectAll("text")
    .style("font-size", `${Math.max(8, cellSize / 20)}px`);
  
  // Diagonal label
  const labelSize = Math.max(8, Math.min(12, cellSize / 15));
  
  cell.append("div")
    .attr("class", "diagonal-label")
    .style("position", "absolute")
    .style("bottom", "4px")
    .style("left", "50%")
    .style("transform", "translateX(-50%)")
    .style("font-weight", "500")
    .style("color", "#495057")
    .style("background", "rgba(255,255,255,0.9)")
    .style("padding", "2px 6px")
    .style("border-radius", "3px")
    .style("white-space", "nowrap")
    .style("overflow", "hidden")
    .style("text-overflow", "ellipsis")
    .style("max-width", "90%")
    .style("z-index", "10")
    .style("font-size", `${labelSize}px`)
    .text(isin);
}

// ============================================================================
// CORRELATION CELL RENDERING (UPPER TRIANGLE)
// ============================================================================

function renderCorrelationCell(cell, isinX, isinY, cellSize) {
  const dataX = filteredData[isinX];
  const dataY = filteredData[isinY];
  
  if (!dataX || !dataY) return;
  
  const correlation = calculateCorrelation(dataX, dataY);
  const absCorr = Math.abs(correlation);
  const correlationColor = COLOR_SCALES.correlation(correlation);
  const fontSize = Math.max(10, Math.min(18, cellSize / 10));
  
  const tooltip = d3.select("#tooltip");
  
  cell.append("div")
    .attr("class", "correlation-cell")
    .style("display", "flex")
    .style("align-items", "center")
    .style("justify-content", "center")
    .style("height", "100%")
    .style("font-size", `${fontSize}px`)
    .style("font-weight", absCorr > 0.5 ? "600" : "500")
    .style("text-align", "center")
    .style("padding", "10px")
    .style("color", absCorr > 0.5 ? "white" : "#495057")
    .style("background", correlationColor)
    .style("border", `2px solid ${absCorr > 0.7 ? "#2c3e50" : "#dee2e6"}`)
    .style("cursor", "pointer")
    .text(`r = ${correlation.toFixed(3)}`)
    .on("mouseover", function(event) {
      const strength = absCorr > 0.7 ? "Strong" : 
                       absCorr > 0.4 ? "Moderate" : 
                       absCorr > 0.2 ? "Weak" : "Very weak";
      const direction = correlation > 0 ? "positive" : "negative";
      const content = `${strength} ${direction} correlation<br>${isinY} vs ${isinX}<br>r = ${correlation.toFixed(4)}`;
      tooltip.html(content).style("opacity", 1);
      const pos = positionTooltip(event, tooltip);
      tooltip.style("left", `${pos.left}px`).style("top", `${pos.top}px`);
    })
    .on("mouseout", () => tooltip.style("opacity", 0));
}

// ============================================================================
// SCATTER PLOT RENDERING (LOWER TRIANGLE)
// ============================================================================

function renderScatterPlot(cell, isinX, isinY, cellSize) {
  const dataX = filteredData[isinX];
  const dataY = filteredData[isinY];
  
  if (!dataX || !dataY) return;
  
  const mapY = Object.fromEntries(
    dataY.map(d => [d.date.toISOString().split('T')[0], d.value])
  );
  
  const points = dataX
    .filter(d => mapY[d.date.toISOString().split('T')[0]] !== undefined)
    .map(d => ({
      x: d.value,
      y: mapY[d.date.toISOString().split('T')[0]],
      date: d.date
    }));
  
  if (points.length === 0) return;
  
  const svg = cell.append("svg")
    .attr("width", cellSize)
    .attr("height", cellSize);
  
  const margin = {
    top: Math.max(15, 20 * cellSize / 150),
    right: Math.max(15, 20 * cellSize / 150),
    bottom: Math.max(25, 40 * cellSize / 150),
    left: Math.max(25, 40 * cellSize / 150)
  };
  
  const width = cellSize - margin.left - margin.right;
  const height = cellSize - margin.top - margin.bottom;
  
  const x = d3.scaleLinear()
    .domain(d3.extent(points, d => d.x))
    .nice()
    .range([0, width]);
  
  const y = d3.scaleLinear()
    .domain(d3.extent(points, d => d.y))
    .nice()
    .range([height, 0]);
  
  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  
  // Zero lines
  if (x.domain()[0] <= 0 && x.domain()[1] >= 0) {
    g.append("line")
      .attr("class", "zero-line")
      .attr("x1", x(0))
      .attr("x2", x(0))
      .attr("y1", 0)
      .attr("y2", height)
      .style("stroke", "#adb5bd")
      .style("stroke-width", 1)
      .style("stroke-dasharray", "2,2");
  }
  
  if (y.domain()[0] <= 0 && y.domain()[1] >= 0) {
    g.append("line")
      .attr("class", "zero-line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .style("stroke", "#adb5bd")
      .style("stroke-width", 1)
      .style("stroke-dasharray", "2,2");
  }
  
  const circleRadius = Math.max(1.5, Math.min(3.5, cellSize / 60));
  const tooltip = d3.select("#tooltip");
  
  // Scatter points
  g.selectAll("circle")
    .data(points)
    .enter()
    .append("circle")
    .attr("cx", d => x(d.x))
    .attr("cy", d => y(d.y))
    .attr("r", circleRadius)
    .attr("fill", COLOR_SCALES.isin(isinX))
    .attr("opacity", 0.7)
    .attr("stroke", "white")
    .attr("stroke-width", 0.5)
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      d3.select(this)
        .attr("r", circleRadius * 1.5)
        .attr("opacity", 1)
        .attr("stroke-width", 1);
      
      const content = `${isinX}: ${d.x.toFixed(2)}<br>${isinY}: ${d.y.toFixed(2)}<br>Date: ${d.date.toLocaleDateString('en-US')}`;
      tooltip.html(content).style("opacity", 1);
      const pos = positionTooltip(event, tooltip);
      tooltip.style("left", `${pos.left}px`).style("top", `${pos.top}px`);
    })
    .on("mouseout", function() {
      d3.select(this)
        .attr("r", circleRadius)
        .attr("opacity", 0.7)
        .attr("stroke-width", 0.5);
      tooltip.style("opacity", 0);
    });
  
  // Axes
  const tickSize = Math.max(2, Math.min(4, cellSize / 40));
  
  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(tickSize))
    .selectAll("text")
    .style("font-size", `${Math.max(7, cellSize / 25)}px`);
  
  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(tickSize))
    .selectAll("text")
    .style("font-size", `${Math.max(7, cellSize / 25)}px`);
  
  // Expand button
  const btnSize = Math.max(18, Math.min(26, cellSize / 7));
  const btnFontSize = Math.max(10, Math.min(14, cellSize / 12));
  
  cell.append("div")
    .attr("class", "cell-expand-btn")
    .style("position", "absolute")
    .style("top", "6px")
    .style("right", "6px")
    .style("cursor", "pointer")
    .style("background", "#6c757d")
    .style("border-radius", "3px")
    .style("width", `${btnSize}px`)
    .style("height", `${btnSize}px`)
    .style("display", "flex")
    .style("align-items", "center")
    .style("justify-content", "center")
    .style("color", "white")
    .style("font-size", `${btnFontSize}px`)
    .style("transition", "all 0.3s ease")
    .style("opacity", "0")
    .style("z-index", "100")
    .html("⤢")
    .on("click", function(event) {
      event.stopPropagation();
      showDetailedJoinplot(isinX, isinY, points);
    })
    .on("mouseover", function() {
      d3.select(this).style("background", "#495057");
    })
    .on("mouseout", function() {
      d3.select(this).style("background", "#6c757d");
    });
  
  // Show expand button on cell hover
  cell.on("mouseover", function() {
    d3.select(this).select(".cell-expand-btn").style("opacity", "1");
  }).on("mouseout", function() {
    d3.select(this).select(".cell-expand-btn").style("opacity", "0");
  });
}

// ============================================================================
// DETAILED JOINPLOT MODAL
// ============================================================================

function showDetailedJoinplot(isinX, isinY, data) {
  const modal = setupModal();
  const content = d3.select("#modal-content-inner");
  content.selectAll("*").remove();
  
  // Title
  content.append("h2")
    .style("text-align", "center")
    .style("margin-bottom", "20px")
    .style("color", "#2c3e50")
    .text(`Detailed Analysis: ${isinX} vs ${isinY}`);
  
  // Main container
  const mainContainer = content.append("div")
    .style("display", "flex")
    .style("justify-content", "center")
    .style("align-items", "flex-start")
    .style("gap", "30px")
    .style("width", "100%")
    .style("padding", "0 20px");
  
  // Chart dimensions
  const margin = { top: 100, right: 60, bottom: 60, left: 60 };
  const scatterSize = 350;
  const histSize = 70;
  const totalWidth = scatterSize + margin.left + margin.right + histSize;
  const totalHeight = scatterSize + margin.top + margin.bottom + histSize;
  
  // SVG container
  const svg = mainContainer.append("svg")
    .attr("width", totalWidth)
    .attr("height", totalHeight)
    .style("background", "#f8f9fa")
    .style("border-radius", "6px")
    .style("flex-shrink", "0");
  
  // Scales
  const x = d3.scaleLinear()
    .domain(d3.extent(data, d => d.x))
    .nice()
    .range([margin.left, margin.left + scatterSize]);
  
  const y = d3.scaleLinear()
    .domain(d3.extent(data, d => d.y))
    .nice()
    .range([margin.top + scatterSize, margin.top]);
  
  // Histograms
  const binsX = d3.bin()
    .domain(x.domain())
    .thresholds(15)
    (data.map(d => d.x));
  
  const binsY = d3.bin()
    .domain(y.domain())
    .thresholds(15)
    (data.map(d => d.y));
  
  const yHistX = d3.scaleLinear()
    .domain([0, d3.max(binsX, d => d.length)])
    .range([histSize, 0]);
  
  const xHistY = d3.scaleLinear()
    .domain([0, d3.max(binsY, d => d.length)])
    .range([0, histSize]);
  
  // Tooltip for joinplot
  const joinplotTooltip = content.append("div")
    .style("position", "fixed")
    .style("background", "rgba(33, 37, 41, 0.95)")
    .style("color", "white")
    .style("padding", "8px 10px")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("opacity", "0")
    .style("z-index", "10000")
    .style("box-shadow", "0 2px 8px rgba(0,0,0,0.2)")
    .style("transition", "opacity 0.15s ease");
  
  // Find max bins for highlighting
  const maxBinX = binsX.find(d => d.length === d3.max(binsX, b => b.length));
  const maxBinY = binsY.find(d => d.length === d3.max(binsY, b => b.length));
  
  // Highlight regions
  svg.append("rect")
    .attr("x", x(maxBinX.x0))
    .attr("y", margin.top)
    .attr("width", x(maxBinX.x1) - x(maxBinX.x0))
    .attr("height", scatterSize)
    .attr("fill", COLOR_SCALES.isin(isinX))
    .attr("opacity", 0.15);
  
  svg.append("rect")
    .attr("x", margin.left)
    .attr("y", y(maxBinY.x1))
    .attr("width", scatterSize)
    .attr("height", y(maxBinY.x0) - y(maxBinY.x1))
    .attr("fill", COLOR_SCALES.isin(isinY))
    .attr("opacity", 0.15);
  
  // Zero lines
  if (x.domain()[0] <= 0 && x.domain()[1] >= 0) {
    svg.append("line")
      .attr("class", "zero-line")
      .attr("x1", x(0))
      .attr("x2", x(0))
      .attr("y1", margin.top)
      .attr("y2", margin.top + scatterSize)
      .style("stroke", "#adb5bd")
      .style("stroke-width", 1)
      .style("stroke-dasharray", "2,2");
  }
  
  if (y.domain()[0] <= 0 && y.domain()[1] >= 0) {
    svg.append("line")
      .attr("class", "zero-line")
      .attr("x1", margin.left)
      .attr("x2", margin.left + scatterSize)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .style("stroke", "#adb5bd")
      .style("stroke-width", 1)
      .style("stroke-dasharray", "2,2");
  }
  
  // Top histogram (X)
  const histTopBars = svg.append("g")
    .selectAll("rect")
    .data(binsX)
    .enter()
    .append("rect")
    .attr("x", d => x(d.x0))
    .attr("y", d => margin.top - histSize + yHistX(d.length))
    .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 2))
    .attr("height", d => histSize - yHistX(d.length))
    .attr("fill", COLOR_SCALES.isin(isinX))
    .attr("opacity", 0.7)
    .attr("stroke", "white")
    .attr("stroke-width", 0.5)
    .style("cursor", "pointer");
  
  // Side histogram (Y)
  const histSideBars = svg.append("g")
    .selectAll("rect")
    .data(binsY)
    .enter()
    .append("rect")
    .attr("x", margin.left + scatterSize)
    .attr("y", d => y(d.x1))
    .attr("width", d => xHistY(d.length))
    .attr("height", d => Math.max(0, y(d.x0) - y(d.x1) - 2))
    .attr("fill", COLOR_SCALES.isin(isinY))
    .attr("opacity", 0.7)
    .attr("stroke", "white")
    .attr("stroke-width", 0.5)
    .style("cursor", "pointer");
  
  // Scatter points
  const scatterPoints = svg.append("g")
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => x(d.x))
    .attr("cy", d => y(d.y))
    .attr("r", 3)
    .attr("fill", COLOR_SCALES.isin(isinX))
    .attr("opacity", 0.7)
    .attr("stroke", "white")
    .attr("stroke-width", 0.5)
    .style("cursor", "pointer");
  
  // Regression line
  if (data.length > 2) {
    const regression = calculateLinearRegression(data);
    const line = d3.line()
      .x(d => x(d.x))
      .y(d => y(d.y));
    
    const lineData = [
      { x: d3.min(data, d => d.x), y: regression.slope * d3.min(data, d => d.x) + regression.intercept },
      { x: d3.max(data, d => d.x), y: regression.slope * d3.max(data, d => d.x) + regression.intercept }
    ];
    
    svg.append("path")
      .datum(lineData)
      .attr("d", line)
      .attr("stroke", COLOR_SCALES.isin(isinY))
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "5,3")
      .attr("fill", "none")
      .attr("opacity", 0.8);
  }
  
  // Interactivity: Top histogram
  histTopBars
    .on("mouseover", function(event, d) {
      d3.select(this).attr("opacity", 1).attr("stroke-width", 1);
      scatterPoints
        .attr("opacity", p => (p.x >= d.x0 && p.x < d.x1) ? 1 : 0.2)
        .attr("r", p => (p.x >= d.x0 && p.x < d.x1) ? 4 : 3);
      
      const content = `Range ${isinX}: [${d.x0.toFixed(2)}, ${d.x1.toFixed(2)}]<br>Frequency: ${d.length}`;
      joinplotTooltip.html(content).style("opacity", 1);
      const pos = positionTooltip(event, joinplotTooltip);
      joinplotTooltip.style("left", `${pos.left}px`).style("top", `${pos.top}px`);
    })
    .on("mouseout", function() {
      d3.select(this).attr("opacity", 0.7).attr("stroke-width", 0.5);
      scatterPoints.attr("opacity", 0.7).attr("r", 3);
      joinplotTooltip.style("opacity", 0);
    });
  
  // Interactivity: Side histogram
  histSideBars
    .on("mouseover", function(event, d) {
      d3.select(this).attr("opacity", 1).attr("stroke-width", 1);
      scatterPoints
        .attr("opacity", p => (p.y >= d.x0 && p.y < d.x1) ? 1 : 0.2)
        .attr("r", p => (p.y >= d.x0 && p.y < d.x1) ? 4 : 3);
      
      const content = `Range ${isinY}: [${d.x0.toFixed(2)}, ${d.x1.toFixed(2)}]<br>Frequency: ${d.length}`;
      joinplotTooltip.html(content).style("opacity", 1);
      const pos = positionTooltip(event, joinplotTooltip);
      joinplotTooltip.style("left", `${pos.left}px`).style("top", `${pos.top}px`);
    })
    .on("mouseout", function() {
      d3.select(this).attr("opacity", 0.7).attr("stroke-width", 0.5);
      scatterPoints.attr("opacity", 0.7).attr("r", 3);
      joinplotTooltip.style("opacity", 0);
    });
  
  // Interactivity: Scatter points
  scatterPoints
    .on("mouseover", function(event, d) {
      d3.select(this).attr("r", 5).attr("opacity", 1).attr("stroke-width", 2);
      
      const content = `${isinX}: ${d.x.toFixed(3)}<br>${isinY}: ${d.y.toFixed(3)}<br>Date: ${d.date.toLocaleDateString('en-US')}`;
      joinplotTooltip.html(content).style("opacity", 1);
      const pos = positionTooltip(event, joinplotTooltip);
      joinplotTooltip.style("left", `${pos.left}px`).style("top", `${pos.top}px`);
    })
    .on("mouseout", function() {
      d3.select(this).attr("r", 3).attr("opacity", 0.7).attr("stroke-width", 0.5);
      joinplotTooltip.style("opacity", 0);
    });
  
  // Axes
  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0, ${margin.top + scatterSize})`)
    .call(d3.axisBottom(x))
    .append("text")
    .attr("x", margin.left + (scatterSize / 2))
    .attr("y", 40)
    .attr("fill", "black")
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .text(isinX);
  
  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(y))
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -40)
    .attr("x", -(margin.top + (scatterSize / 2)))
    .attr("fill", "black")
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .text(isinY);
  
  // Statistics table
  const correlation = calculateCorrelation(filteredData[isinX], filteredData[isinY]);
  const valuesX = data.map(d => d.x);
  const valuesY = data.map(d => d.y);
  
  const statsDiv = mainContainer.append('div')
    .style('width', '280px')
    .style('max-height', `${totalHeight}px`)
    .style('overflow-y', 'auto')
    .style('padding', '15px')
    .style('background', 'white')
    .style('border', '1px solid #dee2e6')
    .style('border-radius', '6px')
    .style('font-size', '11px')
    .style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)')
    .style('flex-shrink', '0');
  
  statsDiv.append('h4')
    .style('margin', '0 0 12px 0')
    .style('color', '#2c3e50')
    .style('font-size', '14px')
    .text('Comparative Statistics');
  
  statsDiv.append('div')
    .style('margin-bottom', '15px')
    .style('padding', '8px')
    .style('background', '#f8f9fa')
    .style('border-radius', '4px')
    .style('text-align', 'center')
    .html(`<strong>Correlation: ${correlation.toFixed(4)}</strong>`);
  
  const table = statsDiv.append('table')
    .style('width', '100%')
    .style('border-collapse', 'collapse')
    .style('font-size', '10px');
  
  const headerRow = table.append('thead').append('tr');
  headerRow.append('th')
    .style('text-align', 'left')
    .style('padding', '6px 4px')
    .style('border-bottom', '2px solid #dee2e6')
    .style('background', '#f8f9fa')
    .text('Metric');
  
  headerRow.append('th')
    .style('text-align', 'center')
    .style('padding', '6px 4px')
    .style('border-bottom', '2px solid #dee2e6')
    .style('background', '#f8f9fa')
    .text(isinX);
  
  headerRow.append('th')
    .style('text-align', 'center')
    .style('padding', '6px 4px')
    .style('border-bottom', '2px solid #dee2e6')
    .style('background', '#f8f9fa')
    .text(isinY);
  
  const tbody = table.append('tbody');
  
  const statsData = [
    { metric: 'Mean', x: d3.mean(valuesX).toFixed(3), y: d3.mean(valuesY).toFixed(3) },
    { metric: 'Median', x: calculateMedian(valuesX).toFixed(3), y: calculateMedian(valuesY).toFixed(3) },
    { metric: 'Std Dev', x: d3.deviation(valuesX).toFixed(3), y: d3.deviation(valuesY).toFixed(3) },
    { metric: 'Skewness', x: calculateSkewness(valuesX).toFixed(3), y: calculateSkewness(valuesY).toFixed(3) },
    { metric: 'Kurtosis', x: calculateKurtosis(valuesX).toFixed(3), y: calculateKurtosis(valuesY).toFixed(3) },
    { metric: 'Min', x: d3.min(valuesX).toFixed(3), y: d3.min(valuesY).toFixed(3) },
    { metric: 'Max', x: d3.max(valuesX).toFixed(3), y: d3.max(valuesY).toFixed(3) }
  ];
  
  statsData.forEach((row, i) => {
    const tr = tbody.append('tr')
      .style('background', i % 2 === 0 ? '#f8f9fa' : 'white');
    
    tr.append('td')
      .style('padding', '4px')
      .style('font-weight', '500')
      .text(row.metric);
    
    tr.append('td')
      .style('padding', '4px')
      .style('text-align', 'center')
      .text(row.x);
    
    tr.append('td')
      .style('padding', '4px')
      .style('text-align', 'center')
      .text(row.y);
  });
  
  const infoDiv = statsDiv.append('div')
    .style('margin-top', '15px')
    .style('padding', '8px')
    .style('background', '#f8f9fa')
    .style('border-radius', '4px')
    .style('font-size', '10px');
  
  infoDiv.append('div')
    .style('margin-bottom', '4px')
    .html(`<strong>Common points:</strong> ${data.length}`);
  
  infoDiv.append('div')
    .style('margin-bottom', '4px')
    .html(`<strong>Most frequent bin X:</strong><br>[${maxBinX.x0.toFixed(2)}, ${maxBinX.x1.toFixed(2)}] (${maxBinX.length})`);
  
  infoDiv.append('div')
    .html(`<strong>Most frequent bin Y:</strong><br>[${maxBinY.x0.toFixed(2)}, ${maxBinY.x1.toFixed(2)}] (${maxBinY.length})`);
  
  // Show modal
  modal.style("display", "flex");
}
