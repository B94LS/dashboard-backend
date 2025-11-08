import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { CHART_CONFIG, APP_STATE } from '../config.js';
import { positionTooltip, calculateMaxDrawdown, calculateUniformDimensions } from '../utils/helpers.js';
import { getVisibleIsins, filteredData, validateWeightSum } from '../utils/data-processor.js';

let xScale, yScale, line;

export function setupScales(data, width, height) {
  const allData = Object.values(data).reduce((acc, isinData) => {
    return acc.concat(isinData);
  }, []);
  
  xScale = d3.scaleTime()
    .domain(d3.extent(allData, d => d.date))
    .range([0, width]);
  
  const extent = d3.extent(allData, d => d.value);
  const minValue = extent[0];
  const maxValue = extent[1];
  const padding = Math.max(0.1, (maxValue - minValue) * 0.05);
  
  yScale = d3.scaleLinear()
    .domain([minValue - padding, maxValue + padding])
    .nice()
    .range([height, 0]);
  
  line = d3.line()
    .x(d => xScale(d.date))
    .y(d => yScale(d.value))
    .curve(d3.curveCatmullRom.alpha(0.5));
}

export function drawLineChart(containerId, data, isAccumulated, isins) {
  const container = d3.select(containerId);
  container.selectAll("*").remove();
  
  if (!validateWeightSum()) {
    container.append("div")
      .attr("class", "error-message")
      .html("⚠️ Weights do not sum to 100%.<br>Adjust weights or uncheck Portfolio checkbox to view charts.");
    return;
  }
  
  const visibleData = {};
  getVisibleIsins(isins).forEach(isin => {
    if (data[isin]) visibleData[isin] = data[isin];
  });
  
  if (Object.keys(visibleData).length === 0) {
    container.append("div")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "center")
      .style("height", "100%")
      .style("color", "#6c757d")
      .text("No visible data");
    return;
  }
  
  CHART_CONFIG.width = calculateUniformDimensions();
  setupScales(visibleData, CHART_CONFIG.width, CHART_CONFIG.height);
  
  const svg = container.append("svg")
    .attr("width", CHART_CONFIG.width + CHART_CONFIG.margin.left + CHART_CONFIG.margin.right)
    .attr("height", CHART_CONFIG.height + CHART_CONFIG.margin.top + CHART_CONFIG.margin.bottom);
  
  const g = svg.append("g")
    .attr("transform", `translate(${CHART_CONFIG.margin.left},${CHART_CONFIG.margin.top})`);
  
  // Grid
  g.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${CHART_CONFIG.height})`)
    .call(d3.axisBottom(xScale).tickSize(-CHART_CONFIG.height).tickFormat(""));
  
  g.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScale).tickSize(-CHART_CONFIG.width).tickFormat(""));
  
  // Zero line
  if (yScale.domain()[0] <= 0 && yScale.domain()[1] >= 0) {
    g.append("line")
      .attr("class", "zero-line")
      .attr("x1", 0)
      .attr("x2", CHART_CONFIG.width)
      .attr("y1", yScale(0))
      .attr("y2", yScale(0));
  }
  
  // Drawdown area for accumulated chart
  if (isAccumulated && visibleData[APP_STATE.selectedIsin] && visibleData[APP_STATE.selectedIsin].length > 0) {
    const maxDrawdown = calculateMaxDrawdown(visibleData[APP_STATE.selectedIsin]);
    if (maxDrawdown) {
      g.append("rect")
        .attr("class", "drawdown-area")
        .attr("x", xScale(maxDrawdown.peakStart.date))
        .attr("y", 0)
        .attr("width", xScale(maxDrawdown.trough.date) - xScale(maxDrawdown.peakStart.date))
        .attr("height", CHART_CONFIG.height)
        .style("fill", "rgba(220, 53, 69, 0.1)")
        .style("stroke", "rgba(220, 53, 69, 0.3)")
        .style("stroke-width", "1px")
        .style("stroke-dasharray", "3,3");
      
      const xMid = (xScale(maxDrawdown.peakStart.date) + xScale(maxDrawdown.trough.date)) / 2;
      const yLabel = Math.min(
        yScale(maxDrawdown.peakStart.value),
        yScale(maxDrawdown.trough.value)
      ) - 10;
      
      g.append("text")
        .attr("class", "drawdown-label")
        .attr("x", xMid)
        .attr("y", yLabel)
        .attr("text-anchor", "middle")
        .style("font-size", "11px")
        .style("font-weight", "500")
        .style("fill", "#dc3545")
        .text(`Max DD: ${Math.abs(maxDrawdown.depth).toFixed(1)}pp`);
    }
  }
  
  // Draw lines
  const visibleIsins = getVisibleIsins(isins);
  const separated = {
    unselected: visibleIsins.filter(isin => isin !== APP_STATE.selectedIsin),
    selected: [APP_STATE.selectedIsin].filter(isin => visibleData[isin])
  };
  
  separated.unselected.forEach(isin => {
    const isinData = visibleData[isin];
    if (isinData && isinData.length > 0) {
      drawIndividualLine(g, isinData, isin, false, isAccumulated);
    }
  });
  
  separated.selected.forEach(isin => {
    const isinData = visibleData[isin];
    if (isinData && isinData.length > 0) {
      drawIndividualLine(g, isinData, isin, true, isAccumulated);
    }
  });
  
  drawIsinLabels(g, visibleData);
  
  // Axes
  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${CHART_CONFIG.height})`)
    .call(d3.axisBottom(xScale).ticks(8).tickFormat(d3.timeFormat("%b %Y")))
    .selectAll("text")
    .style("text-anchor", "end")
    .attr("dx", "-.8em")
    .attr("dy", ".15em")
    .attr("transform", "rotate(-45)");
  
  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(yScale).ticks(8).tickFormat(d => d.toFixed(1) + "%"));
}

function drawIndividualLine(g, data, isin, isSelected, isAccumulated) {
  const cssClass = isSelected ? 'seleccionado' : 'no-seleccionado';
  const tooltip = d3.select("#tooltip");
  
  g.append("path")
    .datum(data)
    .attr("class", `line-path ${cssClass}`)
    .attr("d", line)
    .attr("data-isin", isin)
    .style("cursor", "pointer")
    .on("click", function(event) {
      event.stopPropagation();
      APP_STATE.selectedIsin = isin;
      window.dispatchEvent(new CustomEvent('isinSelected', { detail: { isin } }));
    })
    .on("mouseover", function(event) {
      const mouseX = d3.pointer(event, g.node())[0];
      const mouseDate = xScale.invert(mouseX);
      const closest = data.reduce((prev, curr) => {
        return Math.abs(curr.date - mouseDate) < Math.abs(prev.date - mouseDate) ? curr : prev;
      });
      showTooltip(event, closest, isAccumulated);
    })
    .on("mousemove", function(event) {
      const mouseX = d3.pointer(event, g.node())[0];
      const mouseDate = xScale.invert(mouseX);
      const closest = data.reduce((prev, curr) => {
        return Math.abs(curr.date - mouseDate) < Math.abs(prev.date - mouseDate) ? curr : prev;
      });
      showTooltip(event, closest, isAccumulated);
    })
    .on("mouseout", () => tooltip.style("opacity", 0));
}

function drawIsinLabels(g, data) {
  const sorted = [];
  Object.keys(data).forEach(isin => {
    const isinData = data[isin];
    if (isinData && isinData.length > 0) {
      const lastPoint = isinData[isinData.length - 1];
      sorted.push({
        isin: isin,
        value: lastPoint.value,
        date: lastPoint.date,
        class: isin === APP_STATE.selectedIsin ? 'seleccionado' : 'no-seleccionado'
      });
    }
  });
  
  sorted.sort((a, b) => b.value - a.value);
  
  const minSpacing = 18;
  sorted.forEach((label, index) => {
    const yOriginal = yScale(label.value);
    let yAdjusted = yOriginal;
    
    for (let i = 0; i < index; i++) {
      const prevLabel = sorted[i];
      const yPrev = prevLabel.yFinal || yScale(prevLabel.value);
      if (Math.abs(yAdjusted - yPrev) < minSpacing) {
        yAdjusted = yPrev + minSpacing;
      }
    }
    
    yAdjusted = Math.max(10, Math.min(CHART_CONFIG.height - 10, yAdjusted));
    label.yFinal = yAdjusted;
    
    g.append("text")
      .attr("class", `line-label ${label.class}`)
      .attr("x", CHART_CONFIG.width + 10)
      .attr("y", yAdjusted + 5)
      .attr("text-anchor", "start")
      .style("cursor", "pointer")
      .text(label.isin)
      .on("click", function(event) {
        event.stopPropagation();
        APP_STATE.selectedIsin = label.isin;
        window.dispatchEvent(new CustomEvent('isinSelected', { detail: { isin: label.isin } }));
      });
  });
}

function showTooltip(event, d, isAccumulated) {
  const tooltip = d3.select("#tooltip");
  const date = d.date.toLocaleDateString('es-ES', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  });
  const chartType = isAccumulated ? 'Accumulated' : 'Periodic';
  
  let content = `<div style="margin-bottom: 8px; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 4px;">${date} - ${chartType}</div>`;
  
  const dataToUse = isAccumulated 
    ? window.dashboardCumulativeData 
    : filteredData;
  
  getVisibleIsins(window.dashboardIsins).forEach(isin => {
    const isinData = dataToUse[isin];
    if (isinData && isinData.length > 0) {
      const closest = isinData.reduce((prev, curr) => {
        return Math.abs(curr.date - d.date) < Math.abs(prev.date - d.date) ? curr : prev;
      });
      const valueFormatted = closest.value.toFixed(4);
      const isSelected = isin === APP_STATE.selectedIsin;
      const style = isSelected ? 'font-weight: bold; color: #ffffff;' : 'color: #cccccc;';
      content += `<div style="${style}">${isin}: ${valueFormatted}%</div>`;
    }
  });
  
  tooltip.html(content).style("opacity", 1);
  const pos = positionTooltip(event, tooltip);
  tooltip.style("left", pos.left + "px").style("top", pos.top + "px");
}
