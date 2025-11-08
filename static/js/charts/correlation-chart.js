import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { CHART_CONFIG, COLOR_SCALES } from '../config.js';
import { positionTooltip, calculateLinearRegression, calculateUniformDimensions } from '../utils/helpers.js';
import { getVisibleIsins, filteredData, validateWeightSum } from '../utils/data-processor.js';

let pairplotModal = null;

export function createCorrelationMatrix(containerId) {
  const container = d3.select(containerId);
  container.selectAll("*").remove();
  
  if (!validateWeightSum()) {
    container.append("div")
      .attr("class", "error-message")
      .html("⚠️ Weights do not sum to 100%.<br>Adjust weights or uncheck Portfolio checkbox to view charts.");
    return;
  }
  
  const isins = getVisibleIsins(window.dashboardIsins);
  
  if (isins.length < 2) {
    container.append("div")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "center")
      .style("height", "100%")
      .style("color", "#6c757d")
      .text("Need at least 2 visible ISINs for correlation");
    return;
  }
  
  // Calculate correlation matrix
  const correlationMatrix = calculateCorrelationMatrix(isins);
  
  // Dimensions
  const cellSize = 60;
  const margin = { top: 100, right: 20, bottom: 20, left: 100 };
  const width = cellSize * isins.length;
  const height = cellSize * isins.length;
  
  const svg = container.append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  
  // Add expand button
  container.append("div")
    .attr("class", "expand-btn")
    .text("⛶")
    .style("cursor", "pointer")
    .on("click", () => showPairplot(isins, correlationMatrix));
  
  // Create cells
  isins.forEach((isin1, i) => {
    isins.forEach((isin2, j) => {
      const correlation = correlationMatrix[isin1][isin2];
      
      svg.append("rect")
        .attr("x", j * cellSize)
        .attr("y", i * cellSize)
        .attr("width", cellSize)
        .attr("height", cellSize)
        .style("fill", COLOR_SCALES.correlation(correlation))
        .style("stroke", "#fff")
        .style("stroke-width", 2)
        .style("cursor", "pointer")
        .on("mouseover", function() {
          d3.select(this).style("stroke", "#000").style("stroke-width", 3);
        })
        .on("mouseout", function() {
          d3.select(this).style("stroke", "#fff").style("stroke-width", 2);
        })
        .on("click", () => {
          if (isin1 !== isin2) {
            showScatterModal(isin1, isin2, correlation);
          }
        });
      
      svg.append("text")
        .attr("x", j * cellSize + cellSize / 2)
        .attr("y", i * cellSize + cellSize / 2)
        .attr("dy", ".35em")
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", "600")
        .style("fill", Math.abs(correlation) > 0.5 ? "#fff" : "#000")
        .style("pointer-events", "none")
        .text(correlation.toFixed(2));
    });
  });
  
  // Column labels (top)
  svg.selectAll(".col-label")
    .data(isins)
    .enter()
    .append("text")
    .attr("class", "col-label")
    .attr("x", (d, i) => i * cellSize + cellSize / 2)
    .attr("y", -10)
    .attr("text-anchor", "middle")
    .style("font-size", "11px")
    .style("font-weight", "500")
    .text(d => d);
  
  // Row labels (left)
  svg.selectAll(".row-label")
    .data(isins)
    .enter()
    .append("text")
    .attr("class", "row-label")
    .attr("x", -10)
    .attr("y", (d, i) => i * cellSize + cellSize / 2)
    .attr("dy", ".35em")
    .attr("text-anchor", "end")
    .style("font-size", "11px")
    .style("font-weight", "500")
    .text(d => d);
}

function calculateCorrelationMatrix(isins) {
  const matrix = {};
  
  isins.forEach(isin1 => {
    matrix[isin1] = {};
    isins.forEach(isin2 => {
      matrix[isin1][isin2] = 0;
    });
  });
  
  isins.forEach(isin1 => {
    isins.forEach(isin2 => {
      const data1 = filteredData[isin1];
      const data2 = filteredData[isin2];
      
      if (data1 && data2 && data1.length > 0 && data2.length > 0) {
        const commonDates = new Map();
        data1.forEach(d => commonDates.set(d.date.getTime(), d.value));
        
        const pairs = [];
        data2.forEach(d => {
          const dateKey = d.date.getTime();
          if (commonDates.has(dateKey)) {
            pairs.push([commonDates.get(dateKey), d.value]);
          }
        });
        
        if (pairs.length > 1) {
          matrix[isin1][isin2] = calculatePearsonCorrelation(pairs);
        }
      }
    });
  });
  
  return matrix;
}

function calculatePearsonCorrelation(pairs) {
  const n = pairs.length;
  if (n === 0) return 0;
  
  const x = pairs.map(p => p[0]);
  const y = pairs.map(p => p[1]);
  
  const meanX = d3.mean(x);
  const meanY = d3.mean(y);
  
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  
  const denominator = Math.sqrt(denomX * denomY);
  return denominator === 0 ? 0 : numerator / denominator;
}

function showPairplot(isins, correlationMatrix) {
  if (!pairplotModal) {
    pairplotModal = d3.select("body").append("div")
      .attr("class", "modal")
      .style("display", "none");
    
    const modalContent = pairplotModal.append("div")
      .attr("class", "modal-content");
    
    modalContent.append("span")
      .attr("class", "modal-close")
      .html("&times;")
      .on("click", () => pairplotModal.style("display", "none"));
    
    modalContent.append("h2")
      .style("text-align", "center")
      .style("margin-bottom", "20px")
      .text("Correlation Pairplot");
    
    modalContent.append("div")
      .attr("id", "pairplot-container")
      .attr("class", "pairplot-grid");
  }
  
  pairplotModal.style("display", "flex");
  
  const pairplotContainer = d3.select("#pairplot-container");
  pairplotContainer.selectAll("*").remove();
  
  const n = isins.length;
  const cellSize = Math.min(180, Math.floor((window.innerWidth * 0.9) / n));
  
  const gridContainer = pairplotContainer.append("div")
    .attr("class", "pairplot-container")
    .style("grid-template-columns", `repeat(${n}, ${cellSize}px)`)
    .style("grid-template-rows", `repeat(${n}, ${cellSize}px)`);
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cell = gridContainer.append("div")
        .attr("class", "plot-cell")
        .style("width", `${cellSize}px`)
        .style("height", `${cellSize}px`);
      
      if (i === j) {
        // Diagonal: histogram
        createHistogram(cell, isins[i], cellSize);
      } else {
        // Off-diagonal: scatter plot
        const correlation = correlationMatrix[isins[i]][isins[j]];
        createMiniScatter(cell, isins[j], isins[i], correlation, cellSize);
      }
      
      // Add expand button
      cell.append("div")
        .attr("class", "cell-expand-btn")
        .text("⛶")
        .on("click", () => {
          if (i === j) {
            showHistogramModal(isins[i]);
          } else {
            showScatterModal(isins[j], isins[i], correlation);
          }
        });
    }
  }
}

function createHistogram(container, isin, size) {
  const data = filteredData[isin];
  if (!data || data.length === 0) return;
  
  const values = data.map(d => d.value);
  const margin = { top: 5, right: 5, bottom: 15, left: 5 };
  const width = size - margin.left - margin.right;
  const height = size - margin.top - margin.bottom;
  
  const svg = container.append("svg")
    .attr("width", size)
    .attr("height", size)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  
  const bins = d3.bin().thresholds(15)(values);
  
  const xScale = d3.scaleLinear()
    .domain([d3.min(values), d3.max(values)])
    .range([0, width]);
  
  const yScale = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)])
    .range([height, 0]);
  
  const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0, d3.max(bins, d => d.length)]);
  
  svg.selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x", d => xScale(d.x0))
    .attr("y", d => yScale(d.length))
    .attr("width", d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 1))
    .attr("height", d => height - yScale(d.length))
    .style("fill", d => colorScale(d.length))
    .style("stroke", "#fff")
    .style("stroke-width", 0.5);
  
  container.append("div")
    .attr("class", "diagonal-label")
    .style("font-size", "10px")
    .text(isin);
}

function createMiniScatter(container, isinX, isinY, correlation, size) {
  const dataX = filteredData[isinX];
  const dataY = filteredData[isinY];
  
  if (!dataX || !dataY || dataX.length === 0 || dataY.length === 0) return;
  
  const commonDates = new Map();
  dataX.forEach(d => commonDates.set(d.date.getTime(), d.value));
  
  const points = [];
  dataY.forEach(d => {
    const dateKey = d.date.getTime();
    if (commonDates.has(dateKey)) {
      points.push({ x: commonDates.get(dateKey), y: d.value });
    }
  });
  
  if (points.length === 0) return;
  
  const margin = { top: 5, right: 5, bottom: 5, left: 5 };
  const width = size - margin.left - margin.right;
  const height = size - margin.top - margin.bottom;
  
  const svg = container.append("svg")
    .attr("width", size)
    .attr("height", size)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  
  const xScale = d3.scaleLinear()
    .domain(d3.extent(points, d => d.x))
    .range([0, width]);
  
  const yScale = d3.scaleLinear()
    .domain(d3.extent(points, d => d.y))
    .range([height, 0]);
  
  // Regression line
  const regression = calculateLinearRegression(points);
  const xMin = d3.min(points, d => d.x);
  const xMax = d3.max(points, d => d.x);
  
  svg.append("line")
    .attr("x1", xScale(xMin))
    .attr("y1", yScale(regression.slope * xMin + regression.intercept))
    .attr("x2", xScale(xMax))
    .attr("y2", yScale(regression.slope * xMax + regression.intercept))
    .style("stroke", "#dc3545")
    .style("stroke-width", 1)
    .style("opacity", 0.6);
  
  // Points
  svg.selectAll("circle")
    .data(points)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.x))
    .attr("cy", d => yScale(d.y))
    .attr("r", 2)
    .style("fill", COLOR_SCALES.scatter(isinX))
    .style("opacity", 0.6);
  
  // Correlation text
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", 10)
    .attr("text-anchor", "middle")
    .style("font-size", "9px")
    .style("font-weight", "600")
    .style("fill", "#495057")
    .text(`r=${correlation.toFixed(2)}`);
}

function showScatterModal(isinX, isinY, correlation) {
  alert(`Detailed scatter plot for ${isinX} vs ${isinY} (r=${correlation.toFixed(2)}) - Feature coming soon!`);
}

function showHistogramModal(isin) {
  alert(`Detailed histogram for ${isin} - Feature coming soon!`);
}
