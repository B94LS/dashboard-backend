import { APP_STATE } from './config.js';
import { 
  calculateSummaryStatistics, 
  isinWeights, 
  isinVisibility,
  recalculatePortfolio,
  validateWeightSum
} from './utils/data-processor.js';

export function updateWeight(isin, newWeight, isins) {
  isinWeights[isin] = newWeight / 100;
  recalculatePortfolio(isins);
  validateWeightSum();
  
  // Trigger full refresh
  window.dispatchEvent(new CustomEvent('dataUpdated'));
}

export function toggleVisibility(isin, isins) {
  isinVisibility[isin] = !isinVisibility[isin];
  recalculatePortfolio(isins);
  validateWeightSum();
  
  // Trigger full refresh
  window.dispatchEvent(new CustomEvent('dataUpdated'));
}

export function sortTable(column) {
  if (APP_STATE.currentSort.column === column) {
    if (APP_STATE.currentSort.direction === 'desc') {
      APP_STATE.currentSort.direction = 'asc';
    } else {
      APP_STATE.currentSort.column = null;
      APP_STATE.currentSort.direction = null;
    }
  } else {
    APP_STATE.currentSort.column = column;
    APP_STATE.currentSort.direction = 'desc';
  }
  
  updateSummaryTable(window.dashboardIsins);
}

export function updateSummaryTable(isins) {
  const tbody = document.getElementById('summary-tbody');
  tbody.innerHTML = '';
  
  let statistics = calculateSummaryStatistics(isins);
  
  // Apply sorting
  if (APP_STATE.currentSort.column) {
    statistics.sort((a, b) => {
      const valA = a[APP_STATE.currentSort.column];
      const valB = b[APP_STATE.currentSort.column];
      return APP_STATE.currentSort.direction === 'desc' ? valB - valA : valA - valB;
    });
  } else {
    // Default: non-portfolio first, then portfolio
    statistics = statistics.filter(s => s.isin !== 'Portfolio')
      .concat(statistics.filter(s => s.isin === 'Portfolio'));
  }
  
  // Update header sort indicators
  document.querySelectorAll('.summary-table th').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.column === APP_STATE.currentSort.column) {
      th.classList.add(APP_STATE.currentSort.direction === 'desc' ? 'sorted-desc' : 'sorted-asc');
    }
  });
  
  // Render rows
  statistics.forEach(stat => {
    const tr = document.createElement('tr');
    if (stat.isin === 'Portfolio') tr.className = 'cartera-row';
    if (!stat.visible) tr.className += ' hidden-row';
    
    const isPortfolio = stat.isin === 'Portfolio';
    
    tr.innerHTML = `
      <td>
        <input type="checkbox" 
               class="visibility-checkbox" 
               data-isin="${stat.isin}" 
               ${stat.visible ? 'checked' : ''}>
        ${stat.isin}
      </td>
      <td>
        ${isPortfolio 
          ? '<span style="font-weight: 600;">100.00</span>' 
          : `<input type="number" 
                    class="peso-input" 
                    value="${stat.weight.toFixed(2)}" 
                    min="0" 
                    max="100" 
                    step="0.01" 
                    data-isin="${stat.isin}">`
        }
      </td>
      <td class="${stat.cumulativeReturn >= 0 ? 'value-positive' : 'value-negative'}">
        ${stat.cumulativeReturn.toFixed(2)}
      </td>
      <td>${stat.volatility.toFixed(2)}</td>
      <td class="${stat.sharpeRatio >= 0 ? 'value-positive' : 'value-negative'}">
        ${stat.sharpeRatio.toFixed(3)}
      </td>
      <td class="value-negative">-${stat.maxDrawdown.toFixed(2)}</td>
      <td class="${stat.mean >= 0 ? 'value-positive' : 'value-negative'}">
        ${stat.mean.toFixed(3)}
      </td>
      <td class="${stat.median >= 0 ? 'value-positive' : 'value-negative'}">
        ${stat.median.toFixed(3)}
      </td>
    `;
    
    tbody.appendChild(tr);
  });
  
  // Attach event listeners
  document.querySelectorAll('.visibility-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      toggleVisibility(this.getAttribute('data-isin'), isins);
    });
  });
  
  document.querySelectorAll('.peso-input').forEach(input => {
    input.addEventListener('change', function() {
      const isin = this.getAttribute('data-isin');
      const newWeight = parseFloat(this.value);
      if (!isNaN(newWeight) && newWeight >= 0 && newWeight <= 100) {
        updateWeight(isin, newWeight, isins);
      } else {
        this.value = (isinWeights[isin] * 100).toFixed(2);
      }
    });
  });
  
  validateWeightSum();
}

export function setupTableSorting() {
  document.querySelectorAll('.summary-table th.sortable').forEach(th => {
    th.addEventListener('click', function() {
      sortTable(this.getAttribute('data-column'));
    });
  });
}
