import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { calculateMedian, calculateMaxDrawdown } from './helpers.js';

// Global data stores
export let originalData = {};
export let filteredData = {};
export let isinWeights = {};
export let isinVisibility = {};
export let minDate, maxDate;

// Get visible ISINs
export function getVisibleIsins(isins) {
  return isins.filter(isin => isinVisibility[isin]);
}

// Initialize weights
export function initializeWeights(isins, initialWeights) {
  isins.forEach(isin => {
    if (isin !== 'Portfolio') {
      isinWeights[isin] = initialWeights[isin] || (1 / (isins.length - 1));
    }
    isinVisibility[isin] = true;
  });
}

// Validate weight sum
export function validateWeightSum() {
  const portfolioVisible = isinVisibility['Portfolio'];
  const nonPortfolioIsins = Object.keys(isinWeights).filter(isin => isin !== 'Portfolio');
  const weightSum = nonPortfolioIsins.reduce((sum, isin) => sum + (isinWeights[isin] || 0), 0);
  
  const warning = document.getElementById('weight-warning');
  const inputs = document.querySelectorAll('.peso-input');
  
  if (portfolioVisible) {
    const difference = Math.abs(weightSum - 1.0);
    if (difference > 0.001) {
      warning.textContent = weightSum > 1.0
        ? `⚠️ Weight sum exceeds 100% (${(weightSum * 100).toFixed(2)}%). Adjust weights or uncheck Portfolio to view charts.`
        : `⚠️ Weight sum is less than 100% (${(weightSum * 100).toFixed(2)}%). Adjust weights or uncheck Portfolio to view charts.`;
      warning.classList.add('show');
      inputs.forEach(input => { if (!input.disabled) input.classList.add('error'); });
      return false;
    } else {
      warning.classList.remove('show');
      inputs.forEach(input => input.classList.remove('error'));
      return true;
    }
  } else {
    warning.classList.remove('show');
    inputs.forEach(input => input.classList.remove('error'));
    return true;
  }
}

// Recalculate portfolio data
export function recalculatePortfolio(isins) {
  const visibleIsins = getVisibleIsins(isins).filter(isin => isin !== 'Portfolio');
  
  if (visibleIsins.length === 0) {
    filteredData['Portfolio'] = [];
    originalData['Portfolio'] = [];
    return;
  }
  
  const allDates = new Set();
  visibleIsins.forEach(isin => {
    filteredData[isin].forEach(d => allDates.add(d.date.getTime()));
  });
  
  const dateArray = Array.from(allDates).sort((a, b) => a - b);
  
  const portfolioData = dateArray.map(dateTime => {
    const date = new Date(dateTime);
    let portfolioValue = 0;
    let totalWeight = 0;
    
    visibleIsins.forEach(isin => {
      const weight = isinWeights[isin] || 0;
      const isinPoint = filteredData[isin].find(d => d.date.getTime() === dateTime);
      if (isinPoint) {
        portfolioValue += isinPoint.value * weight;
        totalWeight += weight;
      }
    });
    
    return {
      date: date,
      value: totalWeight > 0 ? portfolioValue / totalWeight : 0,
      isin: 'Portfolio'
    };
  });
  
  filteredData['Portfolio'] = portfolioData;
  originalData['Portfolio'] = portfolioData;
}

// Calculate cumulative returns
export function calculateCumulativeReturns(data) {
  const cumulativeData = {};
  
  Object.keys(data).forEach(isin => {
    const isinData = data[isin];
    if (isinData && isinData.length > 0) {
      let cumulative = 0;
      cumulativeData[isin] = isinData.map(d => {
        cumulative = ((1 + cumulative / 100) * (1 + d.value / 100) - 1) * 100;
        return {
          date: d.date,
          value: cumulative,
          isin: isin
        };
      });
    }
  });
  
  return cumulativeData;
}

// Calculate summary statistics
export function calculateSummaryStatistics(isins, riskFreeRate = 0.02) {
  const statistics = [];
  
  isins.forEach(isin => {
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
      
      // Calculate max drawdown
      const cumulativeData = [];
      let accum = 0;
      isinData.forEach(d => {
        accum = ((1 + accum / 100) * (1 + d.value / 100) - 1) * 100;
        cumulativeData.push({ date: d.date, value: accum });
      });
      
      const drawdownData = calculateMaxDrawdown(cumulativeData);
      const maxDrawdown = drawdownData ? Math.abs(drawdownData.depth) : 0;
      
      const mean = d3.mean(values);
      const median = calculateMedian(values);
      const weight = isin === 'Portfolio' ? 100 : (isinWeights[isin] || 0) * 100;
      
      statistics.push({
        isin: isin,
        weight: weight,
        cumulativeReturn: cumulativeReturn,
        volatility: volatility,
        sharpeRatio: sharpeRatio,
        maxDrawdown: maxDrawdown,
        mean: mean,
        median: median,
        visible: isinVisibility[isin]
      });
    }
  });
  
  return statistics;
}

// Prepare initial data
export function prepareData(dataByIsin, isins) {
  isins.forEach(isin => {
    if (isin === 'Portfolio') return;
    
    const data = dataByIsin[isin].map(d => ({
      date: new Date(d.date),
      value: d.valueNumerico,
      isin: isin
    })).sort((a, b) => a.date - b.date);
    
    originalData[isin] = data;
  });
  
  const allDates = Object.values(originalData).reduce((acc, data) => {
    return acc.concat(data.map(d => d.date));
  }, []);
  
  minDate = d3.min(allDates);
  maxDate = d3.max(allDates);
  
  filteredData = { ...originalData };
}

// Filter by date range
export function filterByDateRange(startDate, endDate, isins) {
  isins.forEach(isin => {
    if (isin === 'Portfolio') return;
    filteredData[isin] = originalData[isin].filter(d => {
      return d.date >= startDate && d.date <= endDate;
    });
  });
  
  recalculatePortfolio(isins);
}
