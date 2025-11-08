import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { COLOR_SCALES } from '../config.js';
import { positionTooltip, calculateLinearRegression, calculateSkewness, calculateKurtosis } from '../utils/helpers.js';
import { getVisibleIsins, filteredData, validateWeightSum } from '../utils/data-processor.js';

let pairplotModal = null;
let jointplotModal = null;

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
  
  // Add expand button to show full pairplot
  container.append("div")
    .attr("class", "expand-btn")
    .text("⛶")
    .style("cursor", "pointer")
    .on("click", () => showPairplot(isins));
  
  // Show simplified correlation matrix
  createSimpleCorrelationMatrix(container, isins);
}

function createSimpleCorrelationMatrix(container, isins) {
  const correlationMatrix = calculateCorrelationMatrix(isins);
  
  const cellSize = 60;
  const margin = { top: 100, right: 20, bottom: 20, left: 100 };
  const width = cellSize * isins.length;
  const height = cellSize * isins.length;
  
  const svg = container.append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  
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
            showJointplot(isin1, isin2, correlation);
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
  
  // Labels
  svg.selectAll(".col-label")
    .data(isins)
    .enter()
    .append("text")
    .attr("x", (d, i) => i * cellSize + cellSize / 2)
    .attr("y", -10)
    .attr("text-anchor", "middle")
    .style("font-size", "11px")
    .style("font-weight", "500")
    .text(d => d);
  
  svg.selectAll(".row-label")
    .data(isins)
    .enter()
    .append("text")
    .attr("x", -10)
    .attr("y", (d, i) => i * cellSize + cellSize / 2)
    .attr("dy", ".35em")
    .attr("text-anchor", "end")
    .style("font-size", "11px")
    .style("font-weight", "500")
    .text(d => d);
}

function showPairplot(isins) {
  if (!pairplotModal) {
    pairplotModal = d3.select("body").append("div")
      .attr("class", "modal");
    
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
  const cellSize = Math.min(180, Math.floor((window.innerWidth * 0.85) / n));
  const correlationMatrix = calculateCorrelationMatrix(isins);
  
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
        createHistogram(cell, isins[i], cellSize);
      } else {
        const correlation = correlationMatrix[isins[i]][isins[j]];
        createMiniScatter(cell, isins[j], isins[i], correlation, cellSize);
      }
      
      cell.append("div")
        .attr("class", "cell-expand-btn")
        .text("⛶")
        .on("click", () => {
          if (i !== j) {
            const correlation = correlationMatrix[isins[i]][isins[j]];
            showJointplot(isins[i], isins[j], correlation);
          }
        });
    }
  }
}

function showJointplot(isinY, isinX, correlation) {
  if (!jointplotModal) {
    jointplotModal = d3.select("body").append("div")
      .attr("class", "modal");
    
    const modalContent = jointplotModal.append("div")
      .attr("class", "modal-content");
    
    modalContent.append("span")
      .attr("class", "modal-close")
      .html("&times;")
      .on("click", () => jointplotModal.style("display", "none"));
    
    modalContent.append("div")
      .attr("id", "jointplot-container");
  }
  
  jointplotModal.style("display", "flex");
  
  const container = d3.select("#jointplot-container");
  container.selectAll("*").remove();
  
  // Get data
  const dataX = filteredData[isinX];
  const dataY = filteredData[isinY];
  
  const commonDates = new Map();
  dataX.forEach(d => commonDates.set(d.date.getTime(), d.value));
  
  const points = [];
  dataY.forEach(d => {
    const dateKey = d.date.getTime();
    if (commonDates.has(dateKey)) {
      points.push({ x: commonDates.get(dateKey), y: d.value });
    }
  });
  
  // Calculate statistics
  const xValues = points.map(p => p.x);
  const yValues = points.map(p => p.y);
  
  const stats = {
    correlation: correlation,
    xMean: d3.mean(xValues),
    yMean: d3.mean(yValues),
    xStd: d3.deviation(xValues),
    yStd: d3.deviation(yValues),
    xSkew: calculateSkewness(xValues),
    ySkew: calculateSkewness(yValues),
    xKurt: calculateKurtosis(xValues),
    yKurt: calculateKurtosis(yValues),
    nPoints: points.length
  };
  
  // Create title
  container.append("h2")
    .style("text-align", "center")
    .style("margin-bottom", "30px")
    .html(`<strong>${isinY}</strong> vs <strong>${isinX}</strong>`);
  
  // Create container for jointplot
  const jointplotDiv = container.append("div")
    .style("display", "flex")
    .style("gap", "40px")
    .style("align-items", "flex-start")
    .style("justify-content", "center")
    .style("flex-wrap", "wrap");
  
  // Left: Jointplot
  const plotContainer = jointplotDiv.append("div");
  createFullJointplot(plotContainer, points, isinX, isinY, stats);
  
  // Right: Statistics table
  const statsContainer = jointplotDiv.append("div");
  createStatsTable(statsContainer, stats, isinX, isinY);
}

function createFullJointplot(container, points, isinX, isinY, stats) {
  const margin = { top: 60, right: 60, bottom: 60, left: 60 };
  const plotSize = 400;
  const histSize = 50;
  
  const svg = container.append("svg")
    .attr("width", plotSize + margin.left + margin.right + histSize)
    .attr("height", plotSize + margin.top + margin.bottom + histSize);
  
  // Scales
  const xScale = d3.scaleLinear()
    .domain(d3.extent(points, d => d.x))
    .nice()
    .range([0, plotSize]);
  
  const yScale = d3.scaleLinear()
    .domain(d3.extent(points, d => d.y))
    .nice()
    .range([plotSize, 0]);
  
  // Main scatter plot
  const scatterG = svg.append("g")
    .attr("transform", `translate(${margin.left + histSize},${margin.top})`);
  
  // Grid
  scatterG.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${plotSize})`)
    .call(d3.axisBottom(xScale).tickSize(-plotSize).tickFormat(""))
    .style("stroke-opacity", 0.1);
  
  scatterG.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScale).tickSize(-plotSize).tickFormat(""))
    .style("stroke-opacity", 0.1);
  
  // Regression line
  const regression = calculateLinearRegression(points);
  const xMin = d3.min(points, d => d.x);
  const xMax = d3.max(points, d => d.x);
  
  scatterG.append("line")
    .attr("x1", xScale(xMin))
    .attr("y1", yScale(regression.slope * xMin + regression.intercept))
    .attr("x2", xScale(xMax))
    .attr("y2", yScale(regression.slope * xMax + regression.intercept))
    .style("stroke", "#dc3545")
    .style("stroke-width", 2)
    .style("opacity", 0.6);
  
  // Points
  scatterG.selectAll("circle")
    .data(points)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.x))
    .attr("cy", d => yScale(d.y))
    .attr("r", 4)
    .style("fill", COLOR_SCALES.scatter(isinX))
    .style("opacity", 0.6)
    .style("stroke", "#fff")
    .style("stroke-width", 1);
  
  // Axes
  scatterG.append("g")
    .attr("transform", `translate(0,${plotSize})`)
    .call(d3.axisBottom(xScale));
  
  scatterG.append("g")
    .call(d3.axisLeft(yScale));
  
  // Axis labels
  scatterG.append("text")
    .attr("x", plotSize / 2)
    .attr("y", plotSize + 40)
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "500")
    .text(isinX);
  
  scatterG.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -plotSize / 2)
    .attr("y", -45)
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "500")
    .text(isinY);
  
  // Top histogram (X)
  createTopHistogram(svg, points.map(p => p.x), xScale, margin.left + histSize, 10, plotSize, histSize - 10);
  
  // Right histogram (Y)
  createRightHistogram(svg, points.map(p => p.y), yScale, margin.left + histSize + plotSize + 10, margin.top, histSize - 10, plotSize);
}

function createTopHistogram(svg, values, xScale, offsetX, offsetY, width, height) {
  const g = svg.append("g")
    .attr("transform", `translate(${offsetX},${offsetY})`);
  
  const bins = d3.bin()
    .domain(xScale.domain())
    .thresholds(20)(values);
  
  const yScale = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)])
    .range([height, 0]);
  
  g.selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x", d => xScale(d.x0))
    .attr("y", d => yScale(d.length))
    .attr("width", d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 1))
    .attr("height", d => height - yScale(d.length))
    .style("fill", "#3b82f6")
    .style("opacity", 0.7);
}

function createRightHistogram(svg, values, yScale, offsetX, offsetY, width, height) {
  const g = svg.append("g")
    .attr("transform", `translate(${offsetX},${offsetY})`);
  
  const bins = d3.bin()
    .domain(yScale.domain())
    .thresholds(20)(values);
  
  const xScale = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)])
    .range([0, width]);
  
  g.selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x", 0)
    .attr("y", d => yScale(d.x1))
    .attr("width", d => xScale(d.length))
    .attr("height", d => Math.max(0, yScale(d.x0) - yScale(d.x1) - 1))
    .style("fill", "#3b82f6")
    .style("opacity", 0.7);
}

function createStatsTable(container, stats, isinX, isinY) {
  container.append("h3")
    .style("margin-bottom", "15px")
    .text("Statistics");
  
  const table = container.append("table")
    .style("border-collapse", "collapse")
    .style("font-size", "13px")
    .style("min-width", "300px");
  
  const data = [
    { metric: "Correlation", value: stats.correlation.toFixed(4) },
    { metric: "Sample size", value: stats.nPoints },
    { metric: "", value: "" },
    { metric: `${isinX} - Mean`, value: stats.xMean.toFixed(4) },
    { metric: `${isinX} - Std Dev`, value: stats.xStd.toFixed(4) },
    { metric: `${isinX} - Skewness`, value: stats.xSkew.toFixed(4) },
    { metric: `${isinX} - Kurtosis`, value: stats.xKurt.toFixed(4) },
    { metric: "", value: "" },
    { metric: `${isinY} - Mean`, value: stats.yMean.toFixed(4) },
    { metric: `${isinY} - Std Dev`, value: stats.yStd.toFixed(4) },
    { metric: `${isinY} - Skewness`, value: stats.ySkew.toFixed(4) },
    { metric: `${isinY} - Kurtosis`, value: stats.yKurt.toFixed(4) }
  ];
  
  const tbody = table.append("tbody");
  
  data.forEach(row => {
    const tr = tbody.append("tr");
    tr.append("td")
      .style("padding", "8px 16px")
      .style("border-bottom", "1px solid #e9ecef")
      .style("font-weight", row.metric === "Correlation" || row.metric === "Sample size" ? "600" : "normal")
      .text(row.metric);
    tr.append("td")
      .style("padding", "8px 16px")
      .style("border-bottom", "1px solid #e9ecef")
      .style("text-align", "right")
      .style("font-family", "'Courier New', monospace")
      .style("font-weight", row.metric === "Correlation" || row.metric === "Sample size" ? "600" : "normal")
      .text(row.value);
  });
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
  
  svg.selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x", d => xScale(d.x0))
    .attr("y", d => yScale(d.length))
    .attr("width", d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 1))
    .attr("height", d => height - yScale(d.length))
    .style("fill", "#3b82f6")
    .style("opacity", 0.7)
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

function calculateCorrelationMatrix(isins) {
  const matrix = {};
  
  isins.forEach(isin1 => {
    matrix[isin1] = {};
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
        } else {
          matrix[isin1][isin2] = 0;
        }
      } else {
        matrix[isin1][isin2] = 0;
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
