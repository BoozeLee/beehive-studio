"""
Mubert API Wrapper
Provides Flask API for Mubert music generation
"""

from flask import Flask, request, jsonify, Response
import requests
import json
import os
from datetime import datetime
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
MUBERT_API_KEY = os.getenv('MUBERT_API_KEY', '')
MUBERT_BASE_URL = os.getenv('MUBERT_BASE_URL', 'https://api.mubert.com')

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'mubert-api',
        'timestamp': datetime.utcnow().isoformat(),
        'api_key_configured': bool(MUBERT_API_KEY)
    })

@app.route('/generate', methods=['POST'])
def generate_music():
    """Generate music using Mubert API"""
    if not MUBERT_API_KEY:
        return jsonify({'error': 'Mubert API key not configured'}), 500
    
    try:
        data = request.get_json()
        
        # Extract parameters
        prompt = data.get('prompt', 'calm ambient music')
        duration = data.get('duration', 30)
        genre = data.get('genre', 'ambient')
        format_type = data.get('format', 'mp3')
        
        # Prepare API request
        api_url = f"{MUBERT_BASE_URL}/v2/generation"
        
        payload = {
            "token": MUBERT_API_KEY,
            "duration": duration,
            "mood": prompt,
            "genre": genre,
            "format": format_type
        }
        
        headers = {
            "Authorization": f"Bearer {MUBERT_API_KEY}",
            "Content-Type": "application/json"
        }
        
        logger.info(f"Generating music with Mubert: {prompt}")
        
        # Call Mubert API
        response = requests.post(api_url, json=payload, headers=headers, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            
            return jsonify({
                'success': True,
                'audio_url': result.get('track_url'),
                'metadata': {
                    'prompt': prompt,
                    'duration': duration,
                    'genre': genre,
                    'format': format_type,
                    'provider': 'mubert',
                    'timestamp': datetime.utcnow().isoformat()
                }
            })
        else:
            error_msg = response.text
            logger.error(f"Mubert API error: {error_msg}")
            return jsonify({'error': f'Mubert API error: {error_msg}'}), response.status_code
            
    except Exception as e:
        logger.error(f"Error generating music: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/providers', methods=['GET'])
def get_providers():
    """Get available providers"""
    return jsonify({
        'providers': [
            {
                'name': 'mubert',
                'description': 'Royalty-free AI music generation',
                'commercial_use': 'Allowed',
                'features': [
                    'Royalty-free music',
                    'Customizable to brand',
                    'Infinite audio material',
                    'Professional quality'
                ]
            }
        ]
    })

@app.route('/usage', methods=['GET'])
def get_usage_info():
    """Get usage information"""
    return jsonify({
        'usage': {
            'rate_limit': 'Not publicly specified',
            'free_tier': 'API access required',
            'commercial_use': 'Allowed',
            'pricing': 'Contact Mubert for enterprise pricing'
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)