import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { CHART_CONFIG, COLOR_SCALES } from '../config.js';
import { positionTooltip, calculateUniformDimensions } from '../utils/helpers.js';
import { getVisibleIsins, filteredData, isinWeights, validateWeightSum } from '../utils/data-processor.js';

export function calculateScatterStatistics() {
  const data = [];
  const isins = window.dashboardIsins;
  
  getVisibleIsins(isins).forEach(isin => {
    const isinData = filteredData[isin];
    if (isinData && isinData.length > 1) {
      const values = isinData.map(d => d.value);
      
      // Cumulative return
      let cumulativeReturn = 0;
      for (let i = 0; i < values.length; i++) {
        cumulativeReturn = ((1 + cumulativeReturn / 100) * (1 + values[i] / 100) - 1) * 100;
      }
      
      const volatility = d3.deviation(values) || 0;
      const weight = isin === 'Portfolio' ? 1.0 : (isinWeights[isin] || 0);
      
      data.push({
        name: isin,
        return: cumulativeReturn,
        volatility: volatility,
        weight: weight
      });
    }
  });
  
  return data;
}

export function createVolatilityScatterPlot(containerId) {
  const container = d3.select(containerId);
  container.selectAll("*").remove();
  
  if (!validateWeightSum()) {
    container.append("div")
      .attr("class", "error-message")
      .html("⚠️ Weights do not sum to 100%.<br>Adjust weights or uncheck Portfolio checkbox to view charts.");
    return;
  }
  
  const scatterData = calculateScatterStatistics();
  
  if (scatterData.length === 0) {
    container.append("div")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "center")
      .style("height", "100%")
      .style("color", "#6c757d")
      .text("No visible data");
    return;
  }
  
  const scatterWidth = calculateUniformDimensions() - CHART_CONFIG.scatterMargin.left - CHART_CONFIG.scatterMargin.right + 40;
  const scatterHeight = CHART_CONFIG.height - CHART_CONFIG.scatterMargin.top - CHART_CONFIG.scatterMargin.bottom;
  
  const svg = container.append("svg")
    .attr("width", scatterWidth + CHART_CONFIG.scatterMargin.left + CHART_CONFIG.scatterMargin.right)
    .attr("height", scatterHeight + CHART_CONFIG.scatterMargin.top + CHART_CONFIG.scatterMargin.bottom)
    .append("g")
    .attr("transform", `translate(${CHART_CONFIG.scatterMargin.left},${CHART_CONFIG.scatterMargin.top})`);
  
  const xScale = d3.scaleLinear()
    .domain(d3.extent(scatterData, d => d.volatility))
    .nice()
    .range([0, scatterWidth]);
  
  const yScale = d3.scaleLinear()
    .domain(d3.extent(scatterData, d => d.return))
    .nice()
    .range([scatterHeight, 0]);
  
  // Grid
  svg.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${scatterHeight})`)
    .call(d3.axisBottom(xScale).tickSize(-scatterHeight).tickFormat(""));
  
  svg.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScale).tickSize(-scatterWidth).tickFormat(""));
  
  // Axes
  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${scatterHeight})`)
    .call(d3.axisBottom(xScale).tickFormat(d => d.toFixed(1) + "%"));
  
  svg.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(yScale).tickFormat(d => d.toFixed(1) + "%"));
  
  // Axis labels
  svg.append("text")
    .attr("class", "axis-label")
    .attr("text-anchor", "middle")
    .attr("x", scatterWidth / 2)
    .attr("y", scatterHeight + 50)
    .text("Volatility");
  
  svg.append("text")
    .attr("class", "axis-label")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("y", -60)
    .attr("x", -scatterHeight / 2)
    .text("Cumulative Return");
  
  const sizeScale = d3.scaleLinear()
    .domain([0, d3.max(scatterData, d => d.weight)])
    .range([8, 25]);
  
  const scatterTooltip = d3.select("#scatter-tooltip");
  
  // Draw circles
  svg.selectAll("circle")
    .data(scatterData)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.volatility))
    .attr("cy", d => yScale(d.return))
    .attr("r", d => sizeScale(d.weight))
    .style("fill", d => COLOR_SCALES.scatter(d.name))
    .style("opacity", 0.7)
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      scatterTooltip.style("opacity", 1);
      d3.select(this).style("stroke", "#000").style("stroke-width", 2).style("opacity", 1);
    })
    .on("mousemove", function(event, d) {
      const content = `<strong>${d.name}</strong><br>Return: ${d.return.toFixed(2)}%<br>Volatility: ${d.volatility.toFixed(2)}%<br>Weight: ${(d.weight * 100).toFixed(2)}%`;
      scatterTooltip.html(content);
      const pos = positionTooltip(event, scatterTooltip);
      scatterTooltip.style("left", pos.left + "px").style("top", pos.top + "px");
    })
    .on("mouseleave", function() {
      scatterTooltip.style("opacity", 0);
      d3.select(this).style("stroke", "none").style("opacity", 0.7);
    });
}

export function calculateSharpeStatistics() {
  const data = [];
  const isins = window.dashboardIsins;
  const riskFreeRate = parseFloat(document.getElementById('risk-free-rate')?.value || 2) / 100;
  
  getVisibleIsins(isins).forEach(isin => {
    const isinData = filteredData[isin];
    if (isinData && isinData.length > 1) {
      const values = isinData.map(d => d.value);
      
      // Cumulative return
      let cumulativeReturn = 0;
      for (let i = 0; i < values.length; i++) {
        cumulativeReturn = ((1 + cumulativeReturn / 100) * (1 + values[i] / 100) - 1) * 100;
      }
      
      const volatility = d3.deviation(values) || 0;
      const meanReturn = d3.mean(values);
      const annualizedReturn = meanReturn * 12;
      const sharpeRatio = volatility > 0 
        ? (annualizedReturn - riskFreeRate) / (volatility * Math.sqrt(12)) 
        : 0;
      
      const weight = isin === 'Portfolio' ? 1.0 : (isinWeights[isin] || 0);
      
      data.push({
        name: isin,
        return: cumulativeReturn,
        sharpeRatio: sharpeRatio,
        weight: weight
      });
    }
  });
  
  return data;
}

export function createSharpeScatterPlot(containerId) {
  const container = d3.select(containerId);
  container.selectAll("*").remove();
  
  if (!validateWeightSum()) {
    container.append("div")
      .attr("class", "error-message")
      .html("⚠️ Weights do not sum to 100%.<br>Adjust weights or uncheck Portfolio checkbox to view charts.");
    return;
  }
  
  const sharpeData = calculateSharpeStatistics();
  
  if (sharpeData.length === 0) {
    container.append("div")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "center")
      .style("height", "100%")
      .style("color", "#6c757d")
      .text("No visible data");
    return;
  }
  
  const scatterWidth = calculateUniformDimensions() - CHART_CONFIG.scatterMargin.left - CHART_CONFIG.scatterMargin.right + 40;
  const scatterHeight = CHART_CONFIG.height - CHART_CONFIG.scatterMargin.top - CHART_CONFIG.scatterMargin.bottom;
  
  const svg = container.append("svg")
    .attr("width", scatterWidth + CHART_CONFIG.scatterMargin.left + CHART_CONFIG.scatterMargin.right)
    .attr("height", scatterHeight + CHART_CONFIG.scatterMargin.top + CHART_CONFIG.scatterMargin.bottom)
    .append("g")
    .attr("transform", `translate(${CHART_CONFIG.scatterMargin.left},${CHART_CONFIG.scatterMargin.top})`);
  
  const xScale = d3.scaleLinear()
    .domain(d3.extent(sharpeData, d => d.sharpeRatio))
    .nice()
    .range([0, scatterWidth]);
  
  const yScale = d3.scaleLinear()
    .domain(d3.extent(sharpeData, d => d.return))
    .nice()
    .range([scatterHeight, 0]);
  
  // Grid
  svg.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${scatterHeight})`)
    .call(d3.axisBottom(xScale).tickSize(-scatterHeight).tickFormat(""));
  
  svg.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScale).tickSize(-scatterWidth).tickFormat(""));
  
  // Zero lines
  if (xScale.domain()[0] <= 0 && xScale.domain()[1] >= 0) {
    svg.append("line")
      .attr("class", "zero-line")
      .attr("x1", xScale(0))
      .attr("x2", xScale(0))
      .attr("y1", 0)
      .attr("y2", scatterHeight);
  }
  
  if (yScale.domain()[0] <= 0 && yScale.domain()[1] >= 0) {
    svg.append("line")
      .attr("class", "zero-line")
      .attr("x1", 0)
      .attr("x2", scatterWidth)
      .attr("y1", yScale(0))
      .attr("y2", yScale(0));
  }
  
  // Axes
  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${scatterHeight})`)
    .call(d3.axisBottom(xScale).tickFormat(d => d.toFixed(2)));
  
  svg.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(yScale).tickFormat(d => d.toFixed(1) + "%"));
  
  // Axis labels
  svg.append("text")
    .attr("class", "axis-label")
    .attr("text-anchor", "middle")
    .attr("x", scatterWidth / 2)
    .attr("y", scatterHeight + 50)
    .text("Sharpe Ratio");
  
  svg.append("text")
    .attr("class", "axis-label")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("y", -60)
    .attr("x", -scatterHeight / 2)
    .text("Cumulative Return");
  
  const sizeScale = d3.scaleLinear()
    .domain([0, d3.max(sharpeData, d => d.weight)])
    .range([8, 25]);
  
  const sharpeTooltip = d3.select("#scatter-tooltip");
  
  // Draw circles
  svg.selectAll("circle")
    .data(sharpeData)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.sharpeRatio))
    .attr("cy", d => yScale(d.return))
    .attr("r", d => sizeScale(d.weight))
    .style("fill", d => COLOR_SCALES.scatter(d.name))
    .style("opacity", 0.7)
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      sharpeTooltip.style("opacity", 1);
      d3.select(this).style("stroke", "#000").style("stroke-width", 2).style("opacity", 1);
    })
    .on("mousemove", function(event, d) {
      const content = `<strong>${d.name}</strong><br>Return: ${d.return.toFixed(2)}%<br>Sharpe Ratio: ${d.sharpeRatio.toFixed(3)}<br>Weight: ${(d.weight * 100).toFixed(2)}%`;
      sharpeTooltip.html(content);
      const pos = positionTooltip(event, sharpeTooltip);
      sharpeTooltip.style("left", pos.left + "px").style("top", pos.top + "px");
    })
    .on("mouseleave", function() {
      sharpeTooltip.style("opacity", 0);
      d3.select(this).style("stroke", "none").style("opacity", 0.7);
    });
}
