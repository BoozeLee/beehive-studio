"""
Gemini AI Integration Service
Provides Flask API for Gemini AI music and content generation
"""

from flask import Flask, request, jsonify, Response
import requests
import json
import os
from datetime import datetime
import logging
from typing import Dict, Any, Optional

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
GEMINI_BASE_URL = os.getenv('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')

# Gemini models
GEMINI_MODELS = {
    'gemini-pro': 'models/gemini-pro',
    'gemini-pro-vision': 'models/gemini-pro-vision',
    'gemini-ultra': 'models/gemini-ultra'
}

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'gemini-api',
        'timestamp': datetime.utcnow().isoformat(),
        'api_key_configured': bool(GEMINI_API_KEY),
        'models_available': list(GEMINI_MODELS.keys())
    })

@app.route('/generate/music', methods=['POST'])
def generate_music():
    """Generate music using Gemini AI"""
    if not GEMINI_API_KEY:
        return jsonify({'error': 'Gemini API key not configured'}), 500
    
    try:
        data = request.get_json()
        
        # Extract parameters
        prompt = data.get('prompt', 'create a calm ambient music track')
        duration = data.get('duration', 30)
        genre = data.get('genre', 'ambient')
        style = data.get('style', 'modern')
        model = data.get('model', 'gemini-pro')
        temperature = data.get('temperature', 0.7)
        
        # Validate model
        if model not in GEMINI_MODELS:
            return jsonify({'error': f'Invalid model. Available: {list(GEMINI_MODELS.keys())}'}), 400
        
        # Prepare API request
        api_url = f"{GEMINI_BASE_URL}/{GEMINI_MODELS[model]}:generateContent"
        
        # Create music generation prompt
        music_prompt = f"""
        Create a music generation prompt for: {prompt}
        Genre: {genre}
        Style: {style}
        Duration: {duration} seconds
        
        Please provide a detailed description of the music including:
        - Tempo and rhythm patterns
        - Instrumentation and timbre
        - Mood and atmosphere
        - Structure and arrangement
        - Special effects or techniques
        
        Format the response as JSON with the following structure:
        {{
            "title": "music_title",
            "description": "detailed_description",
            "tempo": bpm,
            "instruments": ["list", "of", "instruments"],
            "structure": ["verse", "chorus", "verse", "chorus", "outro"],
            "mood": "mood_description",
            "technical_specs": {{
                "duration": {duration},
                "sample_rate": 44100,
                "bit_depth": 16,
                "channels": 2
            }}
        }}
        """
        
        payload = {
            "contents": [{
                "parts": [{"text": music_prompt}]
            }],
            "generationConfig": {
                "temperature": temperature,
                "topK": 40,
                "topP": 0.95,
                "maxOutputTokens": 2048
            }
        }
        
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY
        }
        
        logger.info(f"Generating music with Gemini: {prompt}")
        
        # Call Gemini API
        response = requests.post(api_url, json=payload, headers=headers, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            
            # Extract the generated content
            generated_text = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
            
            try:
                # Try to parse as JSON
                music_data = json.loads(generated_text)
                
                return jsonify({
                    'success': True,
                    'generated_content': music_data,
                    'raw_response': result,
                    'metadata': {
                        'prompt': prompt,
                        'duration': duration,
                        'genre': genre,
                        'style': style,
                        'model': model,
                        'temperature': temperature,
                        'provider': 'gemini',
                        'timestamp': datetime.utcnow().isoformat(),
                        'commercial_use': 'Allowed with API terms'
                    }
                })
            except json.JSONDecodeError:
                # Return as text if not JSON
                return jsonify({
                    'success': True,
                    'generated_content': generated_text,
                    'raw_response': result,
                    'metadata': {
                        'prompt': prompt,
                        'duration': duration,
                        'genre': genre,
                        'style': style,
                        'model': model,
                        'temperature': temperature,
                        'provider': 'gemini',
                        'timestamp': datetime.utcnow().isoformat(),
                        'commercial_use': 'Allowed with API terms'
                    }
                })
        else:
            error_msg = response.text
            logger.error(f"Gemini API error: {error_msg}")
            return jsonify({'error': f'Gemini API error: {error_msg}'}), response.status_code
            
    except Exception as e:
        logger.error(f"Error generating music: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/generate/content', methods=['POST'])
def generate_content():
    """Generate general content using Gemini AI"""
    if not GEMINI_API_KEY:
        return jsonify({'error': 'Gemini API key not configured'}), 500
    
    try:
        data = request.get_json()
        
        # Extract parameters
        prompt = data.get('prompt', '')
        model = data.get('model', 'gemini-pro')
        temperature = data.get('temperature', 0.7)
        max_tokens = data.get('max_tokens', 2048)
        
        # Validate model
        if model not in GEMINI_MODELS:
            return jsonify({'error': f'Invalid model. Available: {list(GEMINI_MODELS.keys())}'}), 400
        
        # Prepare API request
        api_url = f"{GEMINI_BASE_URL}/{GEMINI_MODELS[model]}:generateContent"
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": temperature,
                "topK": 40,
                "topP": 0.95,
                "maxOutputTokens": max_tokens
            }
        }
        
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY
        }
        
        logger.info(f"Generating content with Gemini: {prompt[:100]}...")
        
        # Call Gemini API
        response = requests.post(api_url, json=payload, headers=headers, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            
            # Extract the generated content
            generated_text = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
            
            return jsonify({
                'success': True,
                'generated_content': generated_text,
                'raw_response': result,
                'metadata': {
                    'prompt': prompt,
                    'model': model,
                    'temperature': temperature,
                    'max_tokens': max_tokens,
                    'provider': 'gemini',
                    'timestamp': datetime.utcnow().isoformat(),
                    'commercial_use': 'Allowed with API terms'
                }
            })
        else:
            error_msg = response.text
            logger.error(f"Gemini API error: {error_msg}")
            return jsonify({'error': f'Gemini API error: {error_msg}'}), response.status_code
            
    except Exception as e:
        logger.error(f"Error generating content: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/models', methods=['GET'])
def get_models():
    """Get available Gemini models"""
    return jsonify({
        'models': GEMINI_MODELS,
        'default': 'gemini-pro',
        'descriptions': {
            'gemini-pro': 'Optimized for text generation',
            'gemini-pro-vision': 'Multimodal text and image generation',
            'gemini-ultra': 'Most capable model for complex tasks'
        }
    })

@app.route('/providers', methods=['GET'])
def get_providers():
    """Get available providers"""
    return jsonify({
        'providers': [
            {
                'name': 'gemini',
                'description': 'Google Gemini AI for music and content generation',
                'commercial_use': 'Allowed with API terms',
                'features': [
                    'Multimodal generation',
                    'Music and content creation',
                    'Multiple model variants',
                    'Temperature control',
                    'Customizable output'
                ]
            }
        ]
    })

@app.route('/usage', methods=['GET'])
def get_usage_info():
    """Get usage information"""
    return jsonify({
        'usage': {
            'rate_limit': 'See Google AI Studio for details',
            'free_tier': 'Available with API key',
            'commercial_use': 'Allowed with API terms',
            'pricing': 'Pay-as-you-go pricing based on usage'
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)