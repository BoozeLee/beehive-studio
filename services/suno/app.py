"""
Suno AI API Wrapper
Provides Flask API for Suno AI music generation
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
SUNO_BASE_URL = os.getenv('SUNO_BASE_URL', 'https://api.suno.ai')

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'suno-api',
        'timestamp': datetime.utcnow().isoformat(),
        'note': 'Free tier available but no commercial rights'
    })

@app.route('/generate', methods=['POST'])
def generate_music():
    """Generate music using Suno AI"""
    try:
        data = request.get_json()
        
        # Extract parameters
        prompt = data.get('prompt', 'calm ambient music')
        duration = data.get('duration', 30)
        genre = data.get('genre', 'ambient')
        style = data.get('style', 'modern')
        make_instrumental = data.get('make_instrumental', False)
        
        # Prepare API request
        api_url = f"{SUNO_BASE_URL}/v1/generate"
        
        payload = {
            "prompt": prompt,
            "duration": duration,
            "genre": genre,
            "style": style,
            "make_instrumental": make_instrumental
        }
        
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "BeehiveStudio/1.0"
        }
        
        logger.info(f"Generating music with Suno AI: {prompt}")
        
        # Call Suno AI API
        response = requests.post(api_url, json=payload, headers=headers, timeout=60)
        
        if response.status_code == 200:
            result = response.json()
            
            return jsonify({
                'success': True,
                'audio_url': result.get('audio_url'),
                'video_url': result.get('video_url'),
                'metadata': {
                    'prompt': prompt,
                    'duration': duration,
                    'genre': genre,
                    'style': style,
                    'make_instrumental': make_instrumental,
                    'provider': 'suno',
                    'timestamp': datetime.utcnow().isoformat(),
                    'commercial_use': 'Not allowed on free tier'
                }
            })
        else:
            error_msg = response.text
            logger.error(f"Suno AI API error: {error_msg}")
            return jsonify({'error': f'Suno AI API error: {error_msg}'}), response.status_code
            
    except Exception as e:
        logger.error(f"Error generating music: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/providers', methods=['GET'])
def get_providers():
    """Get available providers"""
    return jsonify({
        'providers': [
            {
                'name': 'suno',
                'description': 'AI music generation with vocals',
                'commercial_use': 'Free tier: No commercial rights',
                'features': [
                    'Complete songs with vocals',
                    'Lyric generation',
                    'Multi-genre support',
                    '12 WAV stem separation',
                    'Song regeneration'
                ],
                'limitations': {
                    'free_tier_songs_per_day': 10,
                    'commercial_rights': 'No',
                    'requires_upgrade': 'Yes for commercial use'
                }
            }
        ]
    })

@app.route('/usage', methods=['GET'])
def get_usage_info():
    """Get usage information"""
    return jsonify({
        'usage': {
            'free_tier': '10 songs/day',
            'commercial_use': 'Not allowed on free tier',
            'upgrade_required': 'Yes for commercial use',
            'pricing': 'Pro/Premier plans available for commercial use'
        }
    })

@app.route('/limits', methods=['GET'])
def get_limits():
    """Get current usage limits"""
    return jsonify({
        'limits': {
            'free_tier': {
                'songs_per_day': 10,
                'commercial_rights': False,
                'features': [
                    'Text-to-music generation',
                    'Complete songs',
                    'Basic editing',
                    'MP3 downloads'
                ]
            },
            'pro_tier': {
                'songs_per_day': 1000,
                'commercial_rights': True,
                'features': [
                    'All free tier features',
                    'Unlimited downloads',
                    'Commercial rights',
                    'Priority processing',
                    'API access'
                ]
            }
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)