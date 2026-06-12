"""
Soundraw API Wrapper
Provides Flask API for Soundraw music generation
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
SOUNDRAW_API_KEY = os.getenv('SOUNDRAW_API_KEY', '')
SOUNDRAW_BASE_URL = os.getenv('SOUNDRAW_BASE_URL', 'https://api.soundraw.io')

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'soundraw-api',
        'timestamp': datetime.utcnow().isoformat(),
        'api_key_configured': bool(SOUNDRAW_API_KEY)
    })

@app.route('/generate', methods=['POST'])
def generate_music():
    """Generate music using Soundraw API"""
    if not SOUNDRAW_API_KEY:
        return jsonify({'error': 'Soundraw API key not configured'}), 500
    
    try:
        data = request.get_json()
        
        # Extract parameters
        prompt = data.get('prompt', 'calm ambient music')
        duration = data.get('duration', 30)
        genre = data.get('genre', 'ambient')
        style = data.get('style', 'modern')
        quality = data.get('quality', 'high')
        
        # Prepare API request
        api_url = f"{SOUNDRAW_BASE_URL}/generate"
        
        payload = {
            "api_key": SOUNDRAW_API_KEY,
            "prompt": prompt,
            "duration": duration,
            "genre": genre,
            "style": style,
            "quality": quality
        }
        
        headers = {
            "Authorization": f"Bearer {SOUNDRAW_API_KEY}",
            "Content-Type": "application/json"
        }
        
        logger.info(f"Generating music with Soundraw: {prompt}")
        
        # Call Soundraw API
        response = requests.post(api_url, json=payload, headers=headers, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            
            return jsonify({
                'success': True,
                'audio_url': result.get('audio_url'),
                'metadata': {
                    'prompt': prompt,
                    'duration': duration,
                    'genre': genre,
                    'style': style,
                    'quality': quality,
                    'provider': 'soundraw',
                    'timestamp': datetime.utcnow().isoformat()
                }
            })
        else:
            error_msg = response.text
            logger.error(f"Soundraw API error: {error_msg}")
            return jsonify({'error': f'Soundraw API error: {error_msg}'}), response.status_code
            
    except Exception as e:
        logger.error(f"Error generating music: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/providers', methods=['GET'])
def get_providers():
    """Get available providers"""
    return jsonify({
        'providers': [
            {
                'name': 'soundraw',
                'description': 'Premium AI music generation',
                'commercial_use': 'Allowed on all plans',
                'features': [
                    'AI music generation with genre blending',
                    'Bar-level editing capabilities',
                    'Multiple download formats',
                    '30+ genres available',
                    'Real-time track regeneration'
                ]
            }
        ]
    })

@app.route('/usage', methods=['GET'])
def get_usage_info():
    """Get usage information"""
    return jsonify({
        'usage': {
            'free_tier': 'Not available (paid service)',
            'pricing': 'Starts at €5.83/month',
            'commercial_use': 'Allowed on all plans',
            'features': {
                'basic': 'Limited downloads',
                'standard': 'Unlimited downloads',
                'enterprise': 'Custom features and support'
            }
        }
    })

@app.route('/plans', methods=['GET'])
def get_plans():
    """Get available pricing plans"""
    return jsonify({
        'plans': [
            {
                'name': 'Basic',
                'price': '€5.83/month',
                'downloads': 'Limited',
                'features': ['Basic AI generation', 'MP3 downloads']
            },
            {
                'name': 'Standard',
                'price': '€16.66/month',
                'downloads': 'Unlimited',
                'features': ['All genres', 'Multiple formats', 'Stem separation']
            },
            {
                'name': 'Enterprise',
                'price': 'Custom',
                'downloads': 'Unlimited',
                'features': ['Custom models', 'API access', 'Priority support']
            }
        ]
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)