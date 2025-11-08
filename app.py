from flask import Flask, render_template, request, jsonify
import pandas as pd
import numpy as np
from datetime import datetime
import json

app = Flask(__name__)

@app.route('/')
def index():
    """Main dashboard route"""
    return render_template('dashboard.html')

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})

@app.route('/api/process-data', methods=['POST'])
def process_data():
    """Process portfolio data and return statistics"""
    try:
        data = request.get_json()
        
        if not data or 'registrosPorISIN' not in data:
            return jsonify({'error': 'Invalid data format'}), 400
        
        # Process data
        processed = process_portfolio_data(
            data['registrosPorISIN'],
            data.get('pesosCartera', {})
        )
        
        return jsonify(processed)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def process_portfolio_data(records_by_isin, portfolio_weights):
    """Process portfolio data using pandas"""
    
    results = {}
    isins = list(records_by_isin.keys())
    
    # Process each ISIN
    for isin, records in records_by_isin.items():
        if not records:
            continue
        
        # Convert to DataFrame
        df = pd.DataFrame(records)
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date')
        
        # Calculate statistics
        values = df['valueNumerico'].values
        
        # Cumulative return
        cumulative = 0
        for val in values:
            cumulative = ((1 + cumulative/100) * (1 + val/100) - 1) * 100
        
        stats = {
            'cumulativeReturn': float(cumulative),
            'volatility': float(np.std(values)),
            'mean': float(np.mean(values)),
            'median': float(np.median(values)),
            'min': float(np.min(values)),
            'max': float(np.max(values)),
            'skewness': float(pd.Series(values).skew()),
            'kurtosis': float(pd.Series(values).kurtosis())
        }
        
        results[isin] = {
            'stats': stats,
            'data': records
        }
    
    return {
        'isins': isins,
        'results': results,
        'weights': portfolio_weights
    }

if __name__ == '__main__':
    # Development server
    app.run(host='0.0.0.0', port=5000, debug=True)
