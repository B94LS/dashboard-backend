from flask import Flask, render_template, request, jsonify
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json

app = Flask(__name__)

def generate_sample_data():
    """Generate sample portfolio data for testing"""
    isins = ['ISIN001', 'ISIN002', 'ISIN003']
    start_date = datetime(2023, 1, 1)
    periods = 24  # 24 months
    
    data = {
        'registrosPorISIN': {},
        'pesosCartera': {
            'ISIN001': 0.40,
            'ISIN002': 0.35,
            'ISIN003': 0.25
        }
    }
    
    for isin in isins:
        records = []
        for i in range(periods):
            date = start_date + timedelta(days=30*i)
            # Generate random monthly returns
            value = np.random.normal(0.5, 2.0)
            records.append({
                'date': date.isoformat(),
                'value': f"{value:.2f}%",
                'valueNumerico': value,
                'ISIN': isin
            })
        data['registrosPorISIN'][isin] = records
    
    return data

@app.route('/')
def index():
    """Main dashboard route"""
    # Check if data is provided via query params (from N8N)
    data_param = request.args.get('data')
    
    if data_param:
        try:
            data = json.loads(data_param)
        except:
            data = generate_sample_data()
    else:
        # Use sample data for testing
        data = generate_sample_data()
    
    return render_template('dashboard.html', data=data)

@app.route('/dashboard', methods=['GET', 'POST'])
def dashboard():
    """Dashboard route that accepts POST data from N8N"""
    if request.method == 'POST':
        data = request.get_json()
        if not data:
            data = generate_sample_data()
    else:
        data = generate_sample_data()
    
    return render_template('dashboard.html', data=data)

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'service': 'dashboard-backend'
    })

@app.route('/api/process-data', methods=['POST'])
def process_data():
    """API endpoint to process portfolio data"""
    try:
        data = request.get_json()
        
        if not data or 'registrosPorISIN' not in data:
            return jsonify({'error': 'Invalid data format'}), 400
        
        # Process data with pandas
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
